/**
 * Tool: envia_rate_ticket
 *
 * Submits a CSAT rating (1-5) for a resolved support ticket.
 * Rating is ONE-TIME — cannot be changed after submission.
 * Returns a clear message when the ticket has already been rated (422).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateTicketApi } from '../../services/tickets.js';
import type { RateTicketResponse } from '../../types/tickets.js';

/**
 * Register the envia_rate_ticket tool on the MCP server.
 */
export function registerRateTicket(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_rate_ticket',
        {
            description:
                'Rate a support ticket (CSAT). Score 1-5 with optional comment. ' +
                'Rating is ONE-TIME — cannot be changed after submission.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                ticket_id: z.number().int().min(1).describe('Ticket ID to rate'),
                rating: z.number().int().min(1).max(5)
                    .describe('CSAT rating: 1 (worst) to 5 (best)'),
                comment: z.string().optional()
                    .describe('Optional comment explaining the rating'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                rating: args.rating,
            };
            if (args.comment !== undefined) body.comment = args.comment;

            const res = await mutateTicketApi<RateTicketResponse>(
                activeClient, config, `/tickets/ratings/${args.ticket_id}`, body,
            );

            if (!res.ok) {
                if (res.status === 422) {
                    return textResponse(
                        `Cannot rate ticket #${args.ticket_id}: this ticket has already been evaluated. ` +
                        'Ratings are one-time and cannot be changed after submission.',
                    );
                }
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to rate ticket #${args.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Ticket #${args.ticket_id} rated successfully: ${args.rating}/5.` +
                (args.comment ? `\nComment: "${args.comment}"` : ''),
            );
        },
    );
}
