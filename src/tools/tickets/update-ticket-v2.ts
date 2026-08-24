/**
 * Tool: envia_update_ticket_v2
 *
 * Unified tool for updating an existing support ticket. Handles three
 * independent actions in a single call — any combination is valid:
 *
 *   1. STATUS CHANGE (ticket_status_id)
 *      Changes the ticket status. Only three transitions are allowed for
 *      company users:
 *        - 1  = Pending      (reopen)
 *        - 5  = Follow-up    (request follow-up from support)
 *        - 10 = Claim In Review (escalate)
 *      When combined with a comment, the comment is stored alongside the
 *      status transition record.
 *      Blocked on closed tickets (Accepted=2, Declined=3).
 *
 *   2. COMMENT (comment)
 *      Adds a text comment to the ticket thread.
 *      When provided without a status change → POST /company/tickets/:id/comments.
 *      When provided with a status change → sent inline in the PUT payload.
 *      Side effect: In Review(6) auto-transitions to Follow-up(5) on comment.
 *
 *   3. FILE UPLOAD (files)
 *      Attaches one or more base64-encoded files to the ticket.
 *      Uploads are performed after the comment/status step.
 *      Requires fetching company_id from /user-information.
 *
 * Replaces: envia_add_ticket_comment_v2 (deprecated).
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateTicketApi, updateTicketApi } from '../../services/tickets.js';
import { UploadTicketFileResponseSchema } from '../../schemas/tickets.js';
import { parseToolResponse } from '../../utils/response-validator.js';
import { fetchUserInfo } from '../../services/user-info.js';

// ---------------------------------------------------------------------------
// Allowed status IDs for company-user transitions
// ---------------------------------------------------------------------------

const ALLOWED_STATUS_IDS = [1, 5, 10] as const;

const ALLOWED_STATUS_LABELS: Record<number, string> = {
    1: 'Pending',
    5: 'Follow-up',
    10: 'Claim In Review',
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const fileSchema = z.object({
    name: z.string().min(1).describe('File name including extension, e.g. "evidence.jpg".'),
    content_base64: z.string().min(1).describe('File content encoded as a base64 string.'),
    content_type: z
        .enum(['image/jpeg', 'image/png', 'application/pdf'])
        .describe('MIME type. Allowed: image/jpeg, image/png, application/pdf.'),
    description: z.string().optional().describe('Optional description of the file purpose.'),
});

const inputSchema = z.object({
    api_key: requiredApiKeySchema,
    ticket_id: z.number().int().min(1).describe('ID of the ticket to update.'),
    comment: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Text comment to add to the ticket thread. ' +
            'Required when changing status to Claim In Review(10). ' +
            'Side effect: if the ticket is In Review(6) and only a comment is added, ' +
            'the backend automatically transitions it to Follow-up(5).',
        ),
    ticket_status_id: z
        .union([z.literal(1), z.literal(5), z.literal(10)])
        .optional()
        .describe(
            'New status for the ticket. Allowed values for company users: ' +
            '1 = Pending (reopen), 5 = Follow-up (request follow-up from support), ' +
            '10 = Claim In Review (escalate). ' +
            'Omit to keep the current status. ' +
            'Blocked on Accepted(2) and Declined(3) tickets.',
        ),
    files: z
        .array(fileSchema)
        .optional()
        .describe(
            'New files to attach to the ticket (e.g. additional evidence). ' +
            'Do NOT re-send files already uploaded at creation — they are already stored. ' +
            'The tool uploads them automatically after applying the comment/status change.',
        ),
});

export type UpdateTicketV2Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core logic for envia_update_ticket_v2.
 * Separated from the registration function for testability.
 *
 * Execution order:
 *   1. Validate that at least one action is requested.
 *   2. Status change (PUT) — if ticket_status_id is provided.
 *   3. Comment only (POST /comments) — if comment is provided without status change.
 *   4. File uploads — if files are provided.
 *
 * @param input   - Validated tool input
 * @param client  - Authenticated API client
 * @param config  - Environment configuration
 * @returns Formatted text response
 */
export async function handleUpdateTicketV2(
    input: UpdateTicketV2Input,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<string> {
    if (!input.comment && !input.ticket_status_id && (!input.files || input.files.length === 0)) {
        throw new McpError(
            ErrorCode.InvalidParams,
            'At least one of comment, ticket_status_id, or files must be provided.',
        );
    }

    const activeClient = resolveClient(client, input.api_key, config);
    const lines: string[] = [];

    // -------------------------------------------------------------------------
    // Step 1: Status change (PUT) — also embeds the comment when both are given
    // -------------------------------------------------------------------------

    if (input.ticket_status_id !== undefined) {
        const statusLabel = ALLOWED_STATUS_LABELS[input.ticket_status_id];

        const putBody: Record<string, unknown> = {
            ticket_status_id: input.ticket_status_id,
        };
        if (input.comment) putBody.comments = input.comment;

        const putRes = await updateTicketApi<unknown>(
            activeClient,
            config,
            `/company/tickets/${input.ticket_id}`,
            putBody,
        );

        if (!putRes.ok) {
            if (putRes.status === 422) {
                return (
                    `Cannot update ticket #${input.ticket_id}: ` +
                    'This ticket is closed and cannot be updated. ' +
                    'Accepted(2) and Declined(3) tickets do not accept further changes.'
                );
            }
            const mapped = mapCarrierError(putRes.status, putRes.error ?? '');
            return `Failed to update ticket #${input.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
        }

        lines.push(
            input.comment
                ? `Status changed to ${statusLabel}(${input.ticket_status_id}) and comment added to ticket #${input.ticket_id}.`
                : `Status changed to ${statusLabel}(${input.ticket_status_id}) on ticket #${input.ticket_id}.`,
        );
    }

    // -------------------------------------------------------------------------
    // Step 2: Comment only (POST /comments) — only when no status change
    // -------------------------------------------------------------------------

    if (input.comment && input.ticket_status_id === undefined) {
        const commentRes = await mutateTicketApi<unknown>(
            activeClient,
            config,
            `/company/tickets/${input.ticket_id}/comments`,
            { comment: input.comment },
        );

        if (!commentRes.ok) {
            if (commentRes.status === 422) {
                return (
                    `Cannot add comment to ticket #${input.ticket_id}: ` +
                    'This ticket is closed for new comments. ' +
                    'Comments are only allowed on tickets with status: ' +
                    'Pending(1), Incomplete(4), Follow-up(5), or In Review(6).'
                );
            }
            const mapped = mapCarrierError(commentRes.status, commentRes.error ?? '');
            return `Failed to add comment to ticket #${input.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
        }

        lines.push(
            `Comment added to ticket #${input.ticket_id}. ` +
            'Note: if the ticket was In Review(6), it has been automatically moved to Follow-up(5).',
        );
    }

    // -------------------------------------------------------------------------
    // Step 3: File uploads
    // -------------------------------------------------------------------------

    if (input.files && input.files.length > 0) {
        const userInfo = await fetchUserInfo(activeClient, config);
        const companyId = userInfo.ok ? userInfo.payload?.company_id : undefined;

        if (!companyId) {
            lines.push('Files were NOT uploaded: could not resolve company_id from user-information.');
        } else {
            const uploads = await Promise.allSettled(
                input.files.map((file) =>
                    mutateTicketApi<unknown>(activeClient, config, `/company/tickets/${input.ticket_id}/files`, {
                        company_id: companyId,
                        name: file.name,
                        content_base64: file.content_base64,
                        content_type: file.content_type,
                        ...(file.description ? { description: file.description } : {}),
                    }),
                ),
            );

            lines.push('', 'File uploads:');
            for (let i = 0; i < uploads.length; i++) {
                const result = uploads[i];
                const fileName = input.files[i].name;
                if (result.status === 'fulfilled' && result.value.ok) {
                    const fileData = parseToolResponse(UploadTicketFileResponseSchema, result.value.data, 'envia_update_ticket_v2');
                    lines.push(`  ✓ ${fileName} — ${fileData.data.url}`);
                } else {
                    const errMsg = result.status === 'rejected'
                        ? String(result.reason)
                        : (result.value.error ?? 'Upload failed');
                    lines.push(`  ✗ ${fileName} — ${errMsg}`);
                }
            }
        }
    }

    lines.push('', 'Use envia_list_tickets_v2 with ticket_id to view the updated ticket and full comment thread.');

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_update_ticket_v2 tool on the MCP server.
 *
 * @param server - MCP server instance
 * @param client - Authenticated API client
 * @param config - Environment configuration
 */
export function registerUpdateTicketV2(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_ticket_v2',
        {
            description:
                'Update an existing support ticket. Handles comment, status change, and file uploads — any combination in a single call. ' +
                'At least one of comment, ticket_status_id, or files must be provided. ' +
                'Status changes: only Pending(1), Follow-up(5), and Claim In Review(10) are allowed for company users. ' +
                'For adding files to a ticket that requested more evidence (Incomplete status): ' +
                'pass files + comment explaining the new evidence. ' +
                'Replaces envia_add_ticket_comment_v2 — use this tool for ALL ticket updates.',
            inputSchema,
        },
        async (args) => {
            const result = await handleUpdateTicketV2(args, client, config);
            return textResponse(result);
        },
    );
}
