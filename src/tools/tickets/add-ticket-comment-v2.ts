/**
 * Tool: envia_add_ticket_comment_v2
 *
 * Adds a comment to an existing support ticket.
 *
 * Allowed statuses: Pending(1), Incomplete(4), Follow-up(5), In Review(6).
 * Closed tickets — Accepted(2) and Declined(3) — reject new comments (422).
 *
 * Side effect: when the ticket is in status In Review(6) and a user adds
 * a comment, the backend automatically transitions the ticket to Follow-up(5).
 * This is expected behavior and is reflected in the success message.
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

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
    api_key: requiredApiKeySchema,
    ticket_id: z.number().int().min(1).describe('ID of the ticket to comment on'),
    comment: z.string().min(1).describe('Comment text to add to the ticket'),
});

export type AddTicketCommentV2Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core logic for envia_add_ticket_comment_v2.
 * Separated from the registration function for testability.
 *
 * @param input   - Validated tool input
 * @param client  - Authenticated API client
 * @param config  - Environment configuration
 * @returns Formatted text response
 */
export async function handleAddTicketCommentV2(
    input: AddTicketCommentV2Input,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<string> {
    const activeClient = resolveClient(client, input.api_key, config);

    const res = await mutateTicketApi<AddCommentResponse>(
        activeClient,
        config,
        `/company/tickets/${input.ticket_id}/comments`,
        { comment: input.comment },
    );

    if (!res.ok) {
        if (res.status === 422) {
            return (
                `Cannot add comment to ticket #${input.ticket_id}: ` +
                'This ticket is closed for new comments. ' +
                'Comments are only allowed on tickets with status: ' +
                'Pending(1), Incomplete(4), Follow-up(5), or In Review(6). ' +
                'Accepted(2) and Declined(3) tickets do not accept further comments.'
            );
        }
        const mapped = mapCarrierError(res.status, res.error ?? '');
        return `Failed to add comment to ticket #${input.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
    }

    return (
        `Comment added successfully to ticket #${input.ticket_id}.\n` +
        'Note: if the ticket was In Review(6), it has been automatically moved to Follow-up(5).\n' +
        'Use envia_list_tickets_v2 with ticket_id to view the updated ticket and full comment thread.'
    );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_add_ticket_comment_v2 tool on the MCP server.
 *
 * @param server - MCP server instance
 * @param client - Authenticated API client
 * @param config - Environment configuration
 */
export function registerAddTicketCommentV2(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_add_ticket_comment_v2',
        {
            description:
                'Add a comment to an existing support ticket. ' +
                'Only works on open tickets: Pending(1), Incomplete(4), Follow-up(5), or In Review(6). ' +
                'Closed tickets — Accepted(2) and Declined(3) — do not accept new comments. ' +
                'Side effect: if the ticket is In Review(6), the backend automatically ' +
                'transitions it to Follow-up(5) when a user comment is added.',
            inputSchema,
        },
        async (args) => {
            const result = await handleAddTicketCommentV2(args, client, config);
            return textResponse(result);
        },
    );
}
