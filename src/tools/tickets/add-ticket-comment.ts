/**
 * Tool: envia_add_ticket_comment
 *
 * Adds a comment to an existing support ticket.
 * Only works on tickets with status: Pending(1), Incomplete(4), Follow-up(5), or In Review(6).
 * Cannot comment on Accepted(2) or Declined(3) tickets.
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
import type { AddCommentResponse } from '../../types/tickets.js';

/**
 * Register the envia_add_ticket_comment tool on the MCP server.
 */
export function registerAddTicketComment(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_add_ticket_comment',
        {
            description:
                'Add a comment to an existing ticket. Only works on tickets with status ' +
                'Pending(1), Incomplete(4), Follow-up(5), or In Review(6). ' +
                'Cannot comment on Accepted or Declined tickets.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                ticket_id: z.number().int().min(1).describe('Ticket ID to comment on'),
                comment: z.string().describe('Comment text to add to the ticket'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await mutateTicketApi<AddCommentResponse>(
                activeClient, config, `/company/tickets/${args.ticket_id}/comments`,
                { comment: args.comment },
            );

            if (!res.ok) {
                if (res.status === 422) {
                    return textResponse(
                        `Cannot add comment to ticket #${args.ticket_id}: ` +
                        'This ticket may be in a status that does not allow new comments. ' +
                        'Comments are only allowed on tickets with status: ' +
                        'Pending(1), Incomplete(4), Follow-up(5), or In Review(6). ' +
                        'Accepted(2) and Declined(3) tickets are closed for comments.',
                    );
                }
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to add comment to ticket #${args.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Comment added successfully to ticket #${args.ticket_id}.\n` +
                'Use envia_get_ticket_comments to view the full thread.',
            );
        },
    );
}
