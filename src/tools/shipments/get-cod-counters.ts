/**
 * Tool: envia_get_cod_counters
 *
 * Retrieves aggregated Cash on Delivery counters and statistics.
 * Shows total COD amounts, paid vs pending, and delivery counts.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryShipmentsApi } from '../../services/shipments.js';
import type { CodCountersResponse } from '../../types/shipments.js';

/**
 * Register the envia_get_cod_counters tool on the MCP server.
 */
export function registerGetCodCounters(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_cod_counters',
        {
            description:
                'Get aggregated Cash on Delivery (COD) statistics. ' +
                'Returns total COD amounts, delivered count, paid vs pending amounts, ' +
                'and reported shipments. Useful for financial reconciliation.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type: z.enum(['counters', 'tabs']).default('counters').describe(
                    'Response type: "counters" for totals, "tabs" for tab-level breakdown',
                ),
                startDate: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
                endDate: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                type: args.type,
            };
            if (args.startDate) params.startDate = args.startDate;
            if (args.endDate) params.endDate = args.endDate;

            const res = await queryShipmentsApi<CodCountersResponse>(
                activeClient, config, '/shipments/cod/count', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get COD counters: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const counters = res.data?.data;
            if (!counters) {
                return textResponse('No COD counter data available for the specified period.');
            }

            const dateRange = args.startDate && args.endDate
                ? `${args.startDate} to ${args.endDate}`
                : 'all time';

            const lines: string[] = [
                `COD Counters (${dateRange}):`,
                '═'.repeat(40),
                '',
                `Total COD shipments: ${counters.total ?? 0}`,
                `Delivered:           ${counters.delivered ?? 0}`,
                `Paid amount:         $${Number(counters.payed_amount ?? 0).toFixed(2)}`,
                `Not paid:            ${counters.not_payed ?? 0}`,
                `Paid:                ${counters.paid ?? 0}`,
                `Pending:             ${counters.pending ?? 0}`,
                `Reported:            ${counters.reported ?? 0}`,
                '',
                'Use envia_get_shipments_cod for individual COD shipment details.',
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
