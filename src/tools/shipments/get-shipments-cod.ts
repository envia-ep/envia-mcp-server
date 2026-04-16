/**
 * Tool: envia_get_shipments_cod
 *
 * Lists Cash on Delivery (COD) shipments with filters for payment status,
 * shipment status, and date range. Returns paginated results with COD
 * amounts, payment info, and ticket references.
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
import type { CodShipmentRecord } from '../../types/shipments.js';

/**
 * Register the envia_get_shipments_cod tool on the MCP server.
 */
export function registerGetShipmentsCod(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipments_cod',
        {
            description:
                'List Cash on Delivery (COD) shipments. ' +
                'Filter by shipment status, payment status, and date range. ' +
                'Returns COD amounts, payment info, and delivery details.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                startDate: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
                endDate: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
                shipmentStatus: z.string().optional().describe('Filter by shipment status (e.g. "delivered", "in_transit")'),
                paymentStatus: z.string().optional().describe('Filter by payment status (e.g. "paid", "pending")'),
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
            if (args.startDate) params.startDate = args.startDate;
            if (args.endDate) params.endDate = args.endDate;
            if (args.shipmentStatus) params.shipmentStatus = args.shipmentStatus;
            if (args.paymentStatus) params.paymentStatus = args.paymentStatus;

            const res = await queryShipmentsApi<{ data: CodShipmentRecord[]; total?: number }>(
                activeClient, config, '/shipments/cod', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list COD shipments: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const records = Array.isArray(res.data?.data) ? res.data.data : [];
            if (records.length === 0) {
                return textResponse('No COD shipments found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${res.data.total ?? records.length} COD shipment(s) (page ${args.page}):`,
                '',
            ];

            for (const r of records) {
                lines.push(
                    `• ${r.tracking_number} — ${r.status ?? 'Unknown'} (${r.carrier_name ?? '?'} / ${r.service_name ?? '?'})`,
                );
                lines.push(
                    `  COD Amount: ${formatCurrency(r.cash_on_delivery_amount, r.currency)}  |  ` +
                    `COD Cost: ${formatCurrency(r.cash_on_delivery_cost, r.currency)}`,
                );
                if (r.payed_amount !== undefined && r.payed_amount !== null) {
                    lines.push(
                        `  Paid: ${formatCurrency(r.payed_amount, r.currency)}  |  ` +
                        `Paid at: ${r.payed_at ?? '—'}  |  Ref: ${r.payment_reference ?? '—'}`,
                    );
                }
                lines.push(
                    `  Recipient: ${r.destination_name ?? '—'}  |  Phone: ${r.destination_phone ?? '—'}  |  Created: ${r.created_at ?? '—'}`,
                );
                if (r.ticket_id) lines.push(`  Ticket: #${r.ticket_id}`);
                lines.push('');
            }

            lines.push('Use envia_get_cod_counters for aggregated COD payment statistics.');

            return textResponse(lines.join('\n'));
        },
    );
}
