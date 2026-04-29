/**
 * Tool: envia_list_shipments
 *
 * Lists shipments for the authenticated company with advanced filters.
 * Supports filtering by status, carrier, dates, tracking number, and more.
 * Returns paginated results sorted by most recent first.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryShipmentsApi, formatAddressSummary, formatCurrency } from '../../services/shipments.js';
import { parseToolResponse } from '../../utils/response-validator.js';
import { ShipmentListResponseSchema } from '../../schemas/shipments.js';

/**
 * Register the envia_list_shipments tool on the MCP server.
 */
export function registerListShipments(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_shipments',
        {
            description:
                'List shipments for your company with filters. ' +
                'Filter by status (1=Created, 2=Transit, 3=Delivered, 4=Cancelled, 5=Incident, 6=Returned, 10=Delivery attempt, 14=Lost, 15=Damaged), ' +
                'carrier name, tracking number, date range, and more. ' +
                'Returns paginated results sorted newest first.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                status_id: z.number().int().optional().describe(
                    'Filter by status ID: 1=Created, 2=In transit, 3=Delivered, 4=Cancelled, 5=Incident, 6=Returned, 10=Delivery attempt, 14=Lost, 15=Damaged',
                ),
                carrier_name: z.string().optional().describe('Filter by carrier name (e.g. "dhl", "fedex")'),
                tracking_number: z.string().optional().describe('Search by tracking number (partial match)'),
                date_from: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
                date_to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
                international: z.number().int().min(0).max(2).optional().describe('0=Domestic, 1=International, 2=Cross-border'),
                shipment_type_id: z.number().int().optional().describe('1=Parcel, 2=LTL, 3=FTL'),
                include_archived: z.boolean().default(false).describe('Include archived shipments'),
                count_only: z.boolean().default(false).describe('Return only the total count, no shipment data'),
                limit: z.number().int().min(1).max(100).default(20).describe('Results per page (max 100)'),
                page: z.number().int().min(1).default(1).describe('Page number'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                limit: args.limit,
                page: args.page,
            };
            if (args.status_id !== undefined) params.status_id = args.status_id;
            if (args.carrier_name) params.carrier_name = args.carrier_name;
            if (args.tracking_number) params.tracking_number = args.tracking_number;
            if (args.date_from) params.date_from = args.date_from;
            if (args.date_to) params.date_to = args.date_to;
            if (args.international !== undefined) params.international = args.international;
            if (args.shipment_type_id !== undefined) params.shipment_type_id = args.shipment_type_id;
            if (args.include_archived) params.include_archived = true;
            if (args.count_only) params.count_only = true;

            const res = await queryShipmentsApi<unknown>(
                activeClient, config, '/shipments', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list shipments: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = parseToolResponse(ShipmentListResponseSchema, res.data, 'envia_list_shipments');

            if (args.count_only) {
                return textResponse(`Total shipments matching filters: ${data.total ?? 0}`);
            }

            const shipments = Array.isArray(data?.data) ? data.data : [];
            if (shipments.length === 0) {
                return textResponse('No shipments found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${data.total ?? shipments.length} shipment(s) (showing page ${args.page}):`,
                '',
            ];

            for (const s of shipments) {
                // /shipments uses `name` + `service_description` + `service`, not carrier_name + service_name
                // (verified 2026-04-27). Other endpoints (e.g. /shipments/cod) use carrier_name + service_name.
                // Fallback chain covers both shapes without breaking either.
                const carrierLabel = s.carrier_name ?? s.carrier_description ?? s.name ?? '?';
                const serviceLabel = s.service_name ?? s.service_description ?? s.service ?? '?';

                // /shipments returns flat sender_*/consignee_* fields rather than nested
                // origin/destination. Build address-summary inputs from whichever form is present.
                const senderAddr = s.origin ?? {
                    name: s.sender_name,
                    city: s.sender_city,
                    state: s.sender_state,
                    country: s.sender_country,
                };
                const consigneeAddr = s.destination ?? {
                    name: s.consignee_name,
                    city: s.consignee_city,
                    state: s.consignee_state,
                    country: s.consignee_country,
                };

                lines.push(
                    `• ${s.tracking_number} — ${s.status ?? 'Unknown'} (${carrierLabel} / ${serviceLabel})`,
                );
                lines.push(
                    `  From: ${formatAddressSummary(senderAddr as Parameters<typeof formatAddressSummary>[0])}  →  To: ${formatAddressSummary(consigneeAddr as Parameters<typeof formatAddressSummary>[0])}`,
                );
                lines.push(
                    `  Cost: ${formatCurrency(s.grand_total as number | undefined ?? s.total as number | undefined, s.currency)}  |  Created: ${s.created_at ?? '—'}`,
                );
                if (s.last_event_description) {
                    lines.push(
                        `  Last event: ${s.last_event_description}${s.last_event_location ? ` [${s.last_event_location}]` : ''}`,
                    );
                }
                lines.push('');
            }

            if (data.total_incidents) {
                lines.push(`Incidents: ${data.total_incidents} | Reported: ${data.total_reported ?? 0}`);
            }

            lines.push('Use envia_get_shipment_detail with a tracking number for full details.');

            return textResponse(lines.join('\n'));
        },
    );
}
