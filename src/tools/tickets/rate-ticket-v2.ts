/**
 * Tool: envia_rate_ticket_v2
 *
 * Submits a CSAT rating (1-5) for a resolved support ticket.
 *
 * Rating is ONE-TIME — the backend blocks re-rating when a record with an
 * existing score is found (422). A record with no score can be updated once.
 *
 * Only meaningful for tickets in status Accepted(2) or Declined(3).
 * The backend does not enforce this at the API level, but rating an open
 * ticket produces a score that cannot be changed when it closes.
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

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
    api_key: requiredApiKeySchema,
    ticket_id: z.number().int().min(1).describe('ID of the ticket to rate'),
    rating: z
        .number()
        .int()
        .min(1)
        .max(5)
        .describe('CSAT score: 1 (very dissatisfied) to 5 (very satisfied)'),
    comment: z
        .string()
        .optional()
        .describe('Optional comment explaining the rating'),
});

export type RateTicketV2Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core logic for envia_rate_ticket_v2.
 * Separated from the registration function for testability.
 *
 * @param input  - Validated tool input
 * @param client - Authenticated API client
 * @param config - Environment configuration
 * @returns Formatted text response
 */
export async function handleRateTicketV2(
    input: RateTicketV2Input,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<string> {
    const activeClient = resolveClient(client, input.api_key, config);

    const body: Record<string, unknown> = { rating: input.rating };
    if (input.comment !== undefined) body.comment = input.comment;

    const res = await mutateTicketApi<RateTicketResponse>(
        activeClient,
        config,
        `/tickets/ratings/${input.ticket_id}`,
        body,
    );

    if (!res.ok) {
        if (res.status === 422) {
            return (
                `Cannot rate ticket #${input.ticket_id}: this ticket has already been evaluated. ` +
                'Ratings are one-time and cannot be changed after submission.'
            );
        }
        const mapped = mapCarrierError(res.status, res.error ?? '');
        return `Failed to rate ticket #${input.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
    }

    return (
        `Ticket #${input.ticket_id} rated successfully: ${input.rating}/5.` +
        (input.comment ? `\nComment: "${input.comment}"` : '')
    );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_rate_ticket_v2 tool on the MCP server.
 *
 * @param server - MCP server instance
 * @param client - Authenticated API client
 * @param config - Environment configuration
 */
export function registerRateTicketV2(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_rate_ticket_v2',
        {
            description:
                'Submit a CSAT rating (1-5) for a resolved support ticket. ' +
                'Only meaningful for tickets in Accepted(2) or Declined(3) status. ' +
                'Rating is ONE-TIME — cannot be changed once a score has been submitted. ' +
                'An optional comment can be included to explain the score.',
            inputSchema,
        },
        async (args) => {
            const result = await handleRateTicketV2(args, client, config);
            return textResponse(result);
        },
    );
}
