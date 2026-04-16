/**
 * Tool: envia_get_ticket_comments
 *
 * Retrieves the comment thread for a support ticket.
 * Each comment shows author type (client/admin), text, and timestamp.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryTicketsApi, formatTicketComment } from '../../services/tickets.js';
import type { TicketCommentsResponse } from '../../types/tickets.js';

/**
 * Register the envia_get_ticket_comments tool on the MCP server.
 */
export function registerGetTicketComments(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_ticket_comments',
        {
            description:
                'Get the comment thread for a support ticket. Each comment shows who wrote it ' +
                '(client or admin), the text, and when it was created.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                ticket_id: z.number().int().min(1).describe('Ticket ID whose comments to retrieve'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryTicketsApi<TicketCommentsResponse>(
                activeClient, config, `/company/tickets/comments/${args.ticket_id}`, {},
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get comments for ticket #${args.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const comments = Array.isArray(res.data?.data) ? res.data.data : [];

            if (comments.length === 0) {
                return textResponse(`No comments found for ticket #${args.ticket_id}.`);
            }

            const lines: string[] = [
                `Ticket #${args.ticket_id} — ${comments.length} comment(s):`,
                '',
            ];

            for (const comment of comments) {
                lines.push(formatTicketComment(comment));
            }

            return textResponse(lines.join('\n'));
        },
    );
}
