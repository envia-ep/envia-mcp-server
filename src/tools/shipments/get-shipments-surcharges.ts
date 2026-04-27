/**
 * Tool: envia_get_shipments_surcharges
 *
 * Lists shipments with surcharges (overweight/oversize adjustments).
 * Shows declared vs revised weight, surcharge cost, and ticket status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryShipmentsApi, formatCurrency } from '../../services/shipments.js';
import type { SurchargeRecord } from '../../types/shipments.js';

/**
 * Register the envia_get_shipments_surcharges tool on the MCP server.
 */
export function registerGetShipmentsSurcharges(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipments_surcharges',
        {
            description:
                'List shipments with surcharges (overweight/oversize). ' +
                'Shows declared vs revised weight, extra cost, and dispute ticket status. ' +
                'Filter by tracking number, dates, or ticket status.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                tracking_number: z.string().optional().describe('Filter by tracking number'),
                date_from: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
                date_to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
                ticket_status_id: z.number().int().optional().describe(
                    'Filter by ticket status ID (e.g. 1=Open, 2=In progress, 3=Resolved)',
                ),
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
            if (args.tracking_number) params.tracking_number = args.tracking_number;
            if (args.date_from) params.date_from = args.date_from;
            if (args.date_to) params.date_to = args.date_to;
            if (args.ticket_status_id !== undefined) params.ticket_status_id = args.ticket_status_id;

            const res = await queryShipmentsApi<{ data: SurchargeRecord[]; total?: number }>(
                activeClient, config, '/shipments/surcharges', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list surcharges: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const records = Array.isArray(res.data?.data) ? res.data.data : [];
            if (records.length === 0) {
                return textResponse('No surcharge records found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${res.data.total ?? records.length} surcharge record(s) (page ${args.page}):`,
                '',
            ];

            for (const r of records) {
                // Defensive fallback chain: shape on this endpoint was not verifiable in
                // sandbox (no rows). Cover both /shipments-style (carrier_description / name,
                // service_description / service) and /shipments-cod-style (carrier_name,
                // service_name) without breaking either.
                const carrierLabel = r.carrier_name ?? r.carrier_description ?? r.name ?? '?';
                const serviceLabel = r.service_name ?? r.service_description ?? r.service ?? '?';
                lines.push(
                    `• ${r.tracking_number} — ${carrierLabel} / ${serviceLabel}`,
                );
                lines.push(
                    `  Declared: ${r.declared_weight ?? '?'} kg  →  Revised: ${r.revised_weight ?? '?'} kg  ` +
                    `(+${r.overweight ?? '?'} kg)`,
                );
                lines.push(
                    `  Surcharge: ${formatCurrency(r.overcharge_cost)}  |  ` +
                    `Total after: ${formatCurrency(r.cost_after_overcharge)}`,
                );
                if (r.ticket_id) {
                    lines.push(`  Ticket: #${r.ticket_id} (${r.ticket_status ?? '—'})`);
                }
                lines.push(`  Created: ${r.created_at ?? '—'}`);
                lines.push('');
            }

            lines.push('Use envia_get_shipment_detail for full shipment info on any surcharge.');

            return textResponse(lines.join('\n'));
        },
    );
}
