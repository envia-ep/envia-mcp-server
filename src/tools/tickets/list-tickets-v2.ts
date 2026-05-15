/**
 * Tool: envia_list_tickets_v2
 *
 * Unified tool for listing and retrieving support tickets.
 * Always calls GET /company/tickets — the same backend handler covers both cases:
 *
 * DETAIL MODE — Pass ticket_id:
 *   Sends filter={ticket_id}&limit=1&page=1&getComments=true as query params.
 *   The backend applies `AND ct.id = filter` in the WHERE clause, identical to
 *   calling /company/tickets/{ticket_id}. Returns a full structured view:
 *   status, shipment, consignee, files, comment thread, CSAT rating, and
 *   additional services. Comments are always included in this mode.
 *
 * LIST MODE — No ticket_id:
 *   Sends optional filters and pagination. Pass getComments:true to include the
 *   full comment thread inline for each ticket.
 *   Accepts any valid ticket_status_id — no enum restriction, the backend applies
 *   the filter directly to the catalog_ticket_statuses table.
 *
 * Replaces envia_list_tickets and envia_get_ticket_detail (both deprecated).
 *
 * Known issue: GET /company/tickets has been observed to return 422 in both
 * sandbox and production (last verified 2026-04-29). The backend wraps internal
 * errors as Boom.badData (HTTP 422) so this may not indicate an input error.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig, EnviaEnvironment } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryTicketsApi, TICKET_STATUS_NAMES, formatTicketComment } from '../../services/tickets.js';
import type { TicketRecord, TicketListResponse } from '../../types/tickets.js';

const BACKEND_BODY_SNIPPET_MAX = 200;

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
    api_key: requiredApiKeySchema,
    ticket_id: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Retrieve a specific ticket by ID. Returns full detail (status, shipment, consignee, ' +
            'files, complete comment thread, CSAT rating). When provided, all other filters are ignored.',
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Results per page (max 100). Only used in list mode.'),
    page: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe('Page number (1-based). Only used in list mode.'),
    ticket_status_id: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Filter by status ID. Any valid status is accepted. ' +
            'Common values: 1=Pending, 2=Accepted, 3=Declined, 4=Incomplete, ' +
            '5=Follow-up, 6=In Review, 7=Complete, 8=Rejected, 9=In Analysis, 10=Claim In Review.',
        ),
    ticket_type_id: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            'Filter by ticket type ID. Use envia_get_ticket_types_v2 without arguments to see all available types.',
        ),
    carrier_id: z.number().int().min(1).optional().describe('Filter by carrier ID.'),
    date_from: z
        .string()
        .optional()
        .describe('Start date filter inclusive (YYYY-MM-DD). Filters by ticket created_at.'),
    date_to: z
        .string()
        .optional()
        .describe('End date filter inclusive (YYYY-MM-DD). The backend adds +1 day so the full day is included.'),
    tracking_number: z
        .string()
        .min(1)
        .optional()
        .describe('Filter by shipment tracking number (exact match).'),
    getComments: z
        .boolean()
        .default(false)
        .describe(
            'Include the full comment thread for each ticket. ' +
            'Only relevant in list mode — detail mode (ticket_id) always includes comments.',
        ),
});

export type ListTicketsV2Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// 422 error formatter (kept honest: 422 can occur in production too)
// ---------------------------------------------------------------------------

/**
 * Extract a short, safe snippet of the backend response body for diagnostics.
 */
function extractBodySnippet(rawBody: unknown): string {
    if (!rawBody || typeof rawBody !== 'object') return '';
    const body = rawBody as Record<string, unknown>;
    if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message.slice(0, BACKEND_BODY_SNIPPET_MAX);
    }
    if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error.slice(0, BACKEND_BODY_SNIPPET_MAX);
    }
    try {
        const s = JSON.stringify(body);
        if (s && s !== '{}') return s.slice(0, BACKEND_BODY_SNIPPET_MAX);
    } catch {
        // Ignore circular structures
    }
    return '';
}

/**
 * Build the user-facing message for an HTTP 422 from /company/tickets.
 * Does not claim the issue is environment-specific because it has been
 * reproduced in both sandbox and production.
 */
export function format422Error(
    friendlyError: string | undefined,
    rawBody: unknown,
    environment: EnviaEnvironment,
): string {
    const snippet = extractBodySnippet(rawBody);
    const lines = [
        `Failed to list tickets (HTTP 422) in ${environment}.`,
        '',
        `Backend message: ${friendlyError ?? 'No friendly error available.'}`,
    ];
    if (snippet) lines.push(`Raw body snippet: ${snippet}`);
    lines.push(
        '',
        'Note: /company/tickets has returned 422 in both sandbox and production. ' +
        'The backend wraps internal errors as Boom.badData, so this may not be an input-validation failure.',
        '',
        'Suggestions:',
        '  • Retry without optional filters (carrier_id, ticket_status_id, date_from/to, tracking_number).',
        '  • Use ticket_id directly to bypass the list endpoint.',
        '  • If the issue persists, share the raw body snippet above with the queries-service team.',
    );
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Render a full structured view of a single ticket (detail mode).
 * Always includes the comment thread when allComments is populated.
 */
export function renderTicketDetail(t: TicketRecord): string {
    const status = TICKET_STATUS_NAMES.get(t.ticket_status_id) ?? t.ticket_status_name;
    const cons = t.consignee;

    const lines: string[] = [
        `Ticket #${t.id} — ${t.ticket_type_name}`,
        `Status: ${status} (ID ${t.ticket_status_id})`,
        `Created: ${t.created_at} | Updated: ${t.updated_at}`,
        '',
    ];

    if (t.shipment_id || t.tracking_number || t.carrier) {
        lines.push('--- Shipment ---');
        if (t.shipment_id) lines.push(`  Shipment ID:     ${t.shipment_id}`);
        if (t.tracking_number) lines.push(`  Tracking:        ${t.tracking_number}`);
        if (t.carrier) lines.push(`  Carrier:         ${t.carrier}`);
        if (t.service) lines.push(`  Service:         ${t.service.trim()}`);
        lines.push('');
    }

    const consigneeName = cons?.consignee_name ?? t.name;
    if (consigneeName) {
        lines.push('--- Consignee ---');
        lines.push(`  Name:            ${consigneeName}`);
        const email = cons?.consignee_email ?? t.email;
        const phone = cons?.consignee_phone ?? t.phone;
        if (email) lines.push(`  Email:           ${email}`);
        if (phone) lines.push(`  Phone:           ${phone}`);
        const city = cons?.consignee_city ?? t.city;
        const state = cons?.consignee_state ?? t.state;
        const country = cons?.consignee_country ?? t.country;
        if (city || state || country) {
            lines.push(`  Location:        ${[city, state, country].filter(Boolean).join(', ')}`);
        }
        lines.push('');
    }

    if (t.comments) {
        lines.push('--- Description ---');
        lines.push(`  ${t.comments}`);
        lines.push('');
    }

    if (t.file_quantity > 0) {
        lines.push(`--- Files (${t.file_quantity}) ---`);
        for (const f of t.files) {
            lines.push(`  ${f.name} — ${f.url}`);
        }
        lines.push('');
    }

    if (Array.isArray(t.allComments) && t.allComments.length > 0) {
        lines.push(`--- Comments (${t.allComments.length}) ---`);
        for (const c of t.allComments) {
            lines.push(`  ${formatTicketComment(c)}`);
        }
        lines.push('');
    }

    if (t.rating?.evaluated === 1) {
        lines.push('--- Rating ---');
        const score = t.rating.rating !== null ? `${t.rating.rating}/5` : 'Not rated yet';
        lines.push(`  Score:           ${score}`);
        if (t.rating.comment) lines.push(`  Comment:         ${t.rating.comment}`);
        lines.push('');
    } else if (t.ticket_status_id === 2 || t.ticket_status_id === 3) {
        lines.push('--- Rating ---');
        lines.push('  Not yet rated. Use envia_rate_ticket to submit your CSAT score.');
        lines.push('');
    }

    if (Array.isArray(t.additional_services) && t.additional_services.length > 0) {
        lines.push('--- Additional Services ---');
        for (const svc of t.additional_services) {
            lines.push(`  ${svc.additionalService}: $${svc.value} (cost: $${svc.cost})`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Render a one-line summary for a ticket in list mode.
 * When showComments is true, appends the comment thread below the summary line.
 */
export function renderTicketListItem(t: TicketRecord, showComments: boolean): string {
    const status = TICKET_STATUS_NAMES.get(t.ticket_status_id) ?? t.ticket_status_name;
    const carrier = t.carrier ?? '—';
    const tracking = t.tracking_number ?? '—';
    const lines = [
        `#${t.id} — ${t.ticket_type_name} (${status}) | Carrier: ${carrier} | Tracking: ${tracking} | Created: ${t.created_at}`,
    ];

    if (showComments && Array.isArray(t.allComments) && t.allComments.length > 0) {
        for (const c of t.allComments) {
            lines.push(`  ${formatTicketComment(c)}`);
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core logic for envia_list_tickets_v2.
 * Separated from registration for testability.
 *
 * @param input  - Validated input from the MCP tool call
 * @param client - Authenticated API client
 * @param config - Environment configuration
 * @returns Formatted text response
 */
export async function handleListTicketsV2(
    input: ListTicketsV2Input,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<string> {
    const activeClient = resolveClient(client, input.api_key, config);

    // Build params — always call /company/tickets with filter for detail mode
    const isDetailMode = input.ticket_id !== undefined;

    const params: Record<string, unknown> = {
        limit: isDetailMode ? 1 : input.limit,
        page: isDetailMode ? 1 : input.page,
        getComments: isDetailMode ? true : input.getComments,
    };

    if (isDetailMode) {
        params.filter = input.ticket_id;
    } else {
        if (input.ticket_status_id !== undefined) params.ticket_status_id = input.ticket_status_id;
        if (input.ticket_type_id !== undefined) params.ticket_type_id = input.ticket_type_id;
        if (input.carrier_id !== undefined) params.carrier_id = input.carrier_id;
        if (input.date_from) params.date_from = input.date_from;
        if (input.date_to) params.date_to = input.date_to;
        if (input.tracking_number) params.tracking_number = input.tracking_number;
    }

    const res = await queryTicketsApi<TicketListResponse>(
        activeClient,
        config,
        '/company/tickets',
        params,
    );

    if (!res.ok) {
        if (isDetailMode) {
            const mapped = mapCarrierError(res.status, res.error ?? '');
            return `Failed to get ticket #${input.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
        }
        if (res.status === 422) {
            return format422Error(res.error, res.data, config.environment);
        }
        const mapped = mapCarrierError(res.status, res.error ?? '');
        return `Failed to list tickets: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
    }

    const tickets = Array.isArray(res.data?.data) ? res.data.data : [];

    // DETAIL MODE — render full structured view
    if (isDetailMode) {
        if (tickets.length === 0) {
            return `Ticket #${input.ticket_id} not found or does not belong to your account.`;
        }
        return renderTicketDetail(tickets[0]);
    }

    // LIST MODE — render paginated summary
    const total = res.data?.total_rows ?? tickets.length;

    if (tickets.length === 0) {
        return 'No tickets found matching the specified filters.';
    }

    const lines: string[] = [
        `Found ${total} ticket(s) — showing ${tickets.length} (page ${input.page}):`,
        '',
    ];

    for (const ticket of tickets) {
        lines.push(renderTicketListItem(ticket, input.getComments));
    }

    lines.push('');
    lines.push(
        'Use envia_list_tickets_v2 with ticket_id to view full details, ' +
        'or envia_add_ticket_comment to reply.',
    );

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_list_tickets_v2 tool on the MCP server.
 *
 * @param server - MCP server instance
 * @param client - Authenticated API client
 * @param config - Environment configuration
 */
export function registerListTicketsV2(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_tickets_v2',
        {
            description:
                'List and retrieve support tickets. ' +
                'DETAIL MODE: pass ticket_id to get full details for a specific ticket — ' +
                'includes status, linked shipment and carrier, consignee, files, ' +
                'complete comment thread, CSAT rating, and additional services. ' +
                'LIST MODE: without ticket_id, lists tickets with optional filters: ' +
                'ticket_status_id (any status, e.g. 2=Accepted, 3=Declined, 7=Complete), ' +
                'ticket_type_id (use envia_get_ticket_types_v2 for available types), ' +
                'carrier_id, date_from/date_to (YYYY-MM-DD), tracking_number. ' +
                'Add getComments:true to include the comment thread per ticket in list mode. ' +
                'KNOWN ISSUE: /company/tickets may return HTTP 422 in both sandbox and production ' +
                '(Boom.badData from backend). If that happens retry without filters or use ticket_id.',
            inputSchema,
        },
        async (args) => {
            const result = await handleListTicketsV2(args, client, config);
            return textResponse(result);
        },
    );
}
