/**
 * Tool: envia_get_shipment_detail
 *
 * Retrieves complete details for a single shipment by tracking number.
 * Includes addresses, packages, costs, events, files, and ticket info.
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
import type { ShipmentRecord } from '../../types/shipments.js';

/**
 * Register the envia_get_shipment_detail tool on the MCP server.
 */
export function registerGetShipmentDetail(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipment_detail',
        {
            description:
                'Get complete details for a single shipment by tracking number. ' +
                'Returns addresses, packages, costs, tracking events, label URL, and ticket info.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                tracking_number: z.string().min(1).describe('The tracking number of the shipment to retrieve'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const tracking = encodeURIComponent(args.tracking_number.trim());

            const res = await queryShipmentsApi<{ data: ShipmentRecord }>(
                activeClient, config, `/guide/${tracking}`, {},
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get shipment detail: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const s = res.data?.data;
            if (!s) {
                return textResponse(
                    `No shipment found for tracking number "${args.tracking_number}". Verify the number is correct.`,
                );
            }

            const lines: string[] = [
                `Shipment Detail: ${s.tracking_number}`,
                '═'.repeat(50),
                '',
                `Status:    ${s.status ?? 'Unknown'} (ID: ${s.status_id})`,
                `Carrier:   ${s.carrier_name ?? '—'} / ${s.service_name ?? '—'}`,
                `Folio:     ${s.folio ?? '—'}`,
                '',
                '— Origin —',
                `  Name:    ${s.origin?.name ?? '—'}`,
                `  Address: ${s.origin?.street ?? '—'} ${s.origin?.number ?? ''}`.trim(),
                `  City:    ${s.origin?.city ?? '—'}, ${s.origin?.state ?? '—'} ${s.origin?.postal_code ?? ''}`.trim(),
                `  Country: ${s.origin?.country ?? '—'}`,
                `  Phone:   ${s.origin?.phone ?? '—'}`,
                `  Email:   ${s.origin?.email ?? '—'}`,
                '',
                '— Destination —',
                `  Name:    ${s.destination?.name ?? '—'}`,
                `  Address: ${s.destination?.street ?? '—'} ${s.destination?.number ?? ''}`.trim(),
                `  City:    ${s.destination?.city ?? '—'}, ${s.destination?.state ?? '—'} ${s.destination?.postal_code ?? ''}`.trim(),
                `  Country: ${s.destination?.country ?? '—'}`,
                `  Phone:   ${s.destination?.phone ?? '—'}`,
                `  Email:   ${s.destination?.email ?? '—'}`,
                '',
                '— Costs —',
                `  Shipping:   ${formatCurrency(s.total, s.currency)}`,
                `  Insurance:  ${formatCurrency(s.insurance_cost, s.currency)}`,
                `  Additional: ${formatCurrency(s.additional_services_cost, s.currency)}`,
                `  Grand Total: ${formatCurrency(s.grand_total, s.currency)}`,
                '',
                '— Dates —',
                `  Created:   ${s.created_at ?? '—'}`,
                `  Shipped:   ${s.shipped_at ?? '—'}`,
                `  Delivered: ${s.delivered_at ?? '—'}`,
            ];

            if (s.packages && s.packages.length > 0) {
                lines.push('', '— Packages —');
                for (const pkg of s.packages) {
                    const dims = pkg.dimensions
                        ? `${pkg.dimensions.length}x${pkg.dimensions.width}x${pkg.dimensions.height} cm`
                        : '—';
                    lines.push(
                        `  • ${pkg.tracking_number ?? '—'} | ${pkg.content ?? '—'} | ${pkg.weight ?? '?'} kg | ${dims}`,
                    );
                }
            }

            if (s.last_event) {
                lines.push('', '— Last Event —');
                lines.push(`  ${s.last_event.description ?? '—'}`);
                if (s.last_event.location) lines.push(`  Location: ${s.last_event.location}`);
                if (s.last_event.datetime) lines.push(`  Date: ${s.last_event.datetime}`);
            }

            if (s.label_file) {
                lines.push('', `Label: ${s.label_file}`);
            }

            if (s.ticket?.id) {
                lines.push('', `Ticket: #${s.ticket.id} (type: ${s.ticket.type_id ?? '—'}, status: ${s.ticket.status_id ?? '—'})`);
            }

            if (s.created_by?.name) {
                lines.push('', `Created by: ${s.created_by.name} (${s.created_by.email ?? '—'})`);
            }

            lines.push('', 'Use envia_track_package to get full tracking event history.');

            return textResponse(lines.join('\n'));
        },
    );
}
