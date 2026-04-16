/**
 * Tool: envia_list_tickets
 *
 * Lists support tickets for the company with optional filters.
 * NOTE: The /company/tickets endpoint has a known bug in sandbox (returns 422).
 * The tool is implemented anyway as it works correctly in production.
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
                'Returns ticket ID, type, status, carrier, and creation date.',
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
                    return textResponse(
                        'Failed to list tickets: The ticket list endpoint returned a validation error (422). ' +
                        'This is a known sandbox issue — the endpoint works correctly in production. ' +
                        'Try using envia_get_ticket_detail with a specific ticket_id instead.',
                    );
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
