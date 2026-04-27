/**
 * Tool: envia_get_shipments_ndr
 *
 * Lists Non-Delivery Report (NDR) shipments — packages that failed
 * delivery and require attention (reschedule, redirect, or return).
 * Supports filtering by type, status, and date range.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryShipmentsApi, formatAddressSummary } from '../../services/shipments.js';
import type { NdrListResponse } from '../../types/shipments.js';

/**
 * Register the envia_get_shipments_ndr tool on the MCP server.
 */
export function registerGetShipmentsNdr(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipments_ndr',
        {
            description:
                'List Non-Delivery Report (NDR) shipments — failed deliveries requiring action. ' +
                'Filter by type: "attention" (needs action), "requested" (action already requested), ' +
                '"rto" (returned to origin). Also filter by status_id and date range. ' +
                'KNOWN BACKEND BUG: the "type" filter parameter returns 422 (MySQL 8 HAVING clause issue). ' +
                'Omit "type" to list all NDR shipments and filter the result client-side.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type: z.enum(['attention', 'requested', 'rto']).optional().describe(
                    'NDR type filter: "attention"=needs action, "requested"=action submitted, "rto"=returned to origin',
                ),
                status_id: z.number().int().optional().describe('Filter by shipment status ID'),
                date_from: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
                date_to: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
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
            if (args.type) params.type = args.type;
            if (args.status_id !== undefined) params.status_id = args.status_id;
            if (args.date_from) params.date_from = args.date_from;
            if (args.date_to) params.date_to = args.date_to;

            const res = await queryShipmentsApi<NdrListResponse>(
                activeClient, config, '/get-shipments-ndr', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list NDR shipments: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data;
            const records = Array.isArray(data?.data) ? data.data : [];
            if (records.length === 0) {
                return textResponse('No NDR shipments found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${data.total ?? records.length} NDR shipment(s) (page ${args.page}):`,
                '',
            ];

            if (data.total_required_attention || data.total_requested || data.total_rto_delivered) {
                lines.push('Summary:');
                if (data.total_required_attention) lines.push(`  Needs attention: ${data.total_required_attention}`);
                if (data.total_requested) lines.push(`  Action requested: ${data.total_requested}`);
                if (data.total_rto_delivered) lines.push(`  RTO delivered: ${data.total_rto_delivered}`);
                lines.push('');
            }

            for (const r of records) {
                lines.push(
                    `• ${r.tracking_number} — ${r.carrier_name ?? '?'} / ${r.service_name ?? '?'}`,
                );
                if (r.ndr_action) lines.push(`  Action: ${r.ndr_action}`);
                if (r.request_code) lines.push(`  Request code: ${r.request_code}`);
                lines.push(
                    `  From: ${formatAddressSummary(r.origin)}  →  To: ${formatAddressSummary(r.destination)}`,
                );
                lines.push(
                    `  Shipped: ${r.shipped_at ?? '—'}  |  Created: ${r.created_at ?? '—'}`,
                );

                if (r.options && r.options.length > 0) {
                    const optionsList = r.options
                        .map((o) => `${o.action_translate ?? o.action_code ?? '?'}`)
                        .join(', ');
                    lines.push(`  Available actions: ${optionsList}`);
                }
                lines.push('');
            }

            lines.push('Use envia_get_shipment_detail with a tracking number for full shipment info.');

            return textResponse(lines.join('\n'));
        },
    );
}
