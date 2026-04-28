/**
 * Tool: envia_get_shipment_detail
 *
 * Retrieves complete details for a single shipment by tracking number.
 * Includes addresses, costs, dates, files, and creator info.
 *
 * Backend: GET /guide/{tracking_number} on the queries service. The endpoint
 * wraps a SINGLE record inside a one-element array (`data: [record]`) and
 * uses flat sender and consignee fields rather than nested origin/destination
 * objects (verified against live sandbox 2026-04-27 — see
 * src/types/shipments.ts ShipmentDetailRecord).
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
import { parseToolResponse } from '../../utils/response-validator.js';
import { ShipmentDetailResponseSchema } from '../../schemas/shipments.js';

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
                'Returns sender/consignee addresses, costs, dates, label URL, and creator info.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                tracking_number: z.string().min(1).describe('The tracking number of the shipment to retrieve'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const tracking = encodeURIComponent(args.tracking_number.trim());

            const res = await queryShipmentsApi<unknown>(
                activeClient, config, `/guide/${tracking}`, {},
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get shipment detail: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const validated = parseToolResponse(
                ShipmentDetailResponseSchema,
                res.data,
                'envia_get_shipment_detail',
            );

            // Backend wraps the record in a one-element array. Take [0].
            const s = validated.data?.[0];
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
                `Carrier:   ${s.name ?? '—'} / ${s.service ?? '—'}`,
                `Folio:     ${s.folio ?? '—'}`,
                '',
                '— Origin —',
                `  Name:    ${s.sender_name ?? '—'}`,
                `  Address: ${`${s.sender_street ?? '—'} ${s.sender_number ?? ''}`.trim()}`,
                `  City:    ${`${s.sender_city ?? '—'}, ${s.sender_state ?? '—'} ${s.sender_postalcode ?? ''}`.trim()}`,
                `  Country: ${s.sender_country ?? '—'}`,
                `  Phone:   ${s.sender_phone ?? '—'}`,
                `  Email:   ${s.sender_email ?? '—'}`,
                '',
                '— Destination —',
                `  Name:    ${s.consignee_name ?? '—'}`,
                `  Address: ${`${s.consignee_street ?? '—'} ${s.consignee_number ?? ''}`.trim()}`,
                `  City:    ${`${s.consignee_city ?? '—'}, ${s.consignee_state ?? '—'} ${s.consignee_postalcode ?? ''}`.trim()}`,
                `  Country: ${s.consignee_country ?? '—'}`,
                `  Phone:   ${s.consignee_phone ?? '—'}`,
                `  Email:   ${s.consignee_email ?? '—'}`,
                '',
                '— Costs —',
                `  Shipping:    ${formatCurrency(s.total as number | undefined, s.currency)}`,
                `  Insurance:   ${formatCurrency(s.insurance_cost as number | undefined, s.currency)}`,
                `  Additional:  ${formatCurrency(s.additional_services_cost as number | undefined, s.currency)}`,
                `  Grand Total: ${formatCurrency(s.grand_total as number | undefined, s.currency)}`,
                '',
                '— Dates —',
                `  Created:   ${s.created_at ?? '—'}`,
                `  Shipped:   ${s.shipped_at ?? '—'}`,
                `  Delivered: ${s.delivered_at ?? '—'}`,
            ];

            if (s.label_file) {
                lines.push('', `Label: ${s.label_file}`);
            }

            if (s.created_by_name) {
                lines.push('', `Created by: ${s.created_by_name} (${s.created_by_email ?? '—'})`);
            }

            lines.push('', 'Use envia_track_package to get full tracking event history.');

            return textResponse(lines.join('\n'));
        },
    );
}
