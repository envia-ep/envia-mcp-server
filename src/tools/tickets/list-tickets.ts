/**
 * Tool: envia_list_tickets
 *
 * Lists support tickets for the company with optional filters.
 *
 * Known issue: GET /company/tickets has been observed to return 422 in BOTH
 * sandbox and production (last verified 2026-04-29 against queries.envia.com).
 * The backend service wraps internal errors as Boom.badData (HTTP 422), so a
 * 422 here does NOT necessarily mean the request payload is invalid — it can
 * also mask a server-side SQL/Joi failure with no actionable detail surfaced
 * to the caller. See services/queries/services/tickets.service.js
 * (`catch (err) { throw Boom.badData(err); }`).
 *
 * The auth strategy `token_user` accepts access_tokens with type_id IN (1, 2, 7)
 * and requires a company assignment for type 2 tokens. If that constraint
 * fails, auth raises 401 instead of 422, so 422 is not an auth signal.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryTicketsApi, formatTicketSummary } from '../../services/tickets.js';
import type { TicketListResponse } from '../../types/tickets.js';
import type { EnviaEnvironment } from '../../config.js';

const BACKEND_BODY_SNIPPET_MAX = 200;

/**
 * Build the user-facing message for an HTTP 422 response from /company/tickets.
 *
 * Surfaces the actual backend error (status, friendly summary, raw body snippet)
 * instead of asserting "this only happens in sandbox". The 422 has been
 * confirmed to occur in production too, often masking a server-side error
 * wrapped as Boom.badData. This helper keeps the message honest: it reports
 * what was observed and suggests next steps without making claims the caller
 * cannot verify.
 *
 * @param friendlyError - Sanitised error string from the API client (`res.error`)
 * @param rawBody       - Raw JSON body returned by the backend (`res.data`)
 * @param environment   - "sandbox" | "production", used to tag the message
 * @returns Multi-line string suitable for textResponse
 */
export function format422Error(
    friendlyError: string | undefined,
    rawBody: unknown,
    environment: EnviaEnvironment,
): string {
    const bodySnippet = extractBodySnippet(rawBody);
    const lines: string[] = [
        `Failed to list tickets (HTTP 422) in ${environment}.`,
        '',
        `Backend message: ${friendlyError ?? 'No friendly error available.'}`,
    ];
    if (bodySnippet) {
        lines.push(`Raw body snippet: ${bodySnippet}`);
    }
    lines.push(
        '',
        'Note: /company/tickets has returned 422 in both sandbox and production. ' +
        'The backend wraps internal errors as Boom.badData, so a 422 here may not be ' +
        'caused by the request payload.',
        '',
        'Suggestions:',
        '  • Try envia_get_ticket_detail with a known ticket_id to bypass the list endpoint.',
        '  • Retry without optional filters (carrier_id, ticket_status_id, date_from/to, tracking_number).',
        '  • If the issue persists, share the raw body snippet above with the queries-service team.',
    );
    return lines.join('\n');
}

/**
 * Extract a short, safe snippet of the backend response body for diagnostics.
 *
 * Prefers known fields (`message`, `error`) and falls back to a truncated JSON
 * stringification. Returns an empty string when the body has nothing useful.
 */
function extractBodySnippet(rawBody: unknown): string {
    if (!rawBody || typeof rawBody !== 'object') {
        return '';
    }
    const body = rawBody as Record<string, unknown>;
    if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message.slice(0, BACKEND_BODY_SNIPPET_MAX);
    }
    if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error.slice(0, BACKEND_BODY_SNIPPET_MAX);
    }
    try {
        const serialized = JSON.stringify(body);
        if (serialized && serialized !== '{}') {
            return serialized.slice(0, BACKEND_BODY_SNIPPET_MAX);
        }
    } catch {
        // Ignore circular structures — return empty snippet
    }
    return '';
}

/**
 * Register the envia_list_tickets tool on the MCP server.
 */
export function registerListTickets(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_tickets',
        {
            description:
                'List support tickets for your company. Filter by status (1=Pending, 2=Accepted, 3=Declined, ' +
                '5=Follow-up, 6=In Review), ticket type, carrier, tracking number, or date range. ' +
                'Returns ticket ID, type, status, carrier, and creation date. ' +
                'KNOWN ISSUE: /company/tickets has returned HTTP 422 in both sandbox and production ' +
                '(last seen 2026-04-29). The backend wraps internal errors as Boom.badData, so a 422 here ' +
                'is not necessarily an input-validation failure. If you hit 422, try envia_get_ticket_detail ' +
                'with a known ticket_id, or contact support with the surfaced error body.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(100).default(20).describe('Results per page (max 100)'),
                page: z.number().int().min(1).default(1).describe('Page number (1-based)'),
                carrier_id: z.number().int().min(1).optional().describe('Filter by carrier ID'),
                ticket_status_id: z.number().int().min(1).optional()
                    .describe('Filter by status: 1=Pending, 2=Accepted, 3=Declined, 4=Incomplete, 5=Follow-up, 6=In Review'),
                ticket_type_id: z.number().int().min(1).optional()
                    .describe('Filter by ticket type ID (use envia_get_ticket_types to see all types)'),
                date_from: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
                date_to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
                tracking_number: z.string().optional().describe('Filter by shipment tracking number'),
                getComments: z.boolean().optional().describe('Include the comment thread for each ticket'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                limit: args.limit,
                page: args.page,
            };
            if (args.carrier_id !== undefined) params.carrier_id = args.carrier_id;
            if (args.ticket_status_id !== undefined) params.ticket_status_id = args.ticket_status_id;
            if (args.ticket_type_id !== undefined) params.ticket_type_id = args.ticket_type_id;
            if (args.date_from) params.date_from = args.date_from;
            if (args.date_to) params.date_to = args.date_to;
            if (args.tracking_number) params.tracking_number = args.tracking_number;
            if (args.getComments !== undefined) params.getComments = args.getComments;

            const res = await queryTicketsApi<TicketListResponse>(
                activeClient, config, '/company/tickets', params,
            );

            if (!res.ok) {
                if (res.status === 422) {
                    return textResponse(format422Error(res.error, res.data, config.environment));
                }
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list tickets: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const tickets = Array.isArray(res.data?.data) ? res.data.data : [];
            const total = res.data?.total_rows ?? tickets.length;

            if (tickets.length === 0) {
                return textResponse('No tickets found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${total} ticket(s) — showing ${tickets.length} (page ${args.page}):`,
                '',
            ];

            for (const ticket of tickets) {
                lines.push(formatTicketSummary(ticket));
            }

            lines.push('');
            lines.push('Use envia_get_ticket_detail to view full details, or envia_add_ticket_comment to reply.');

            return textResponse(lines.join('\n'));
        },
    );
}
