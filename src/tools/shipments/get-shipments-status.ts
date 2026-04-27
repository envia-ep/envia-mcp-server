/**
 * Tool: envia_get_shipments_status
 *
 * Retrieves shipment status statistics for a date range.
 * Shows counts and percentages by delivery status (pickup, transit,
 * out for delivery, delivered, issues, returned).
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
import type { ShipmentStatusStats } from '../../types/shipments.js';

/**
 * Register the envia_get_shipments_status tool on the MCP server.
 */
export function registerGetShipmentsStatus(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipments_status',
        {
            description:
                'Get shipment status statistics for a date range. ' +
                'Returns counts and percentages for each status: pending, pickup, in transit, ' +
                'out for delivery, delivered, issues, and returned. ' +
                'Useful for dashboards and performance monitoring.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                date_from: z.string().describe('Start date (YYYY-MM-DD) — required'),
                date_to: z.string().describe('End date (YYYY-MM-DD) — required'),
                carrier_name: z.string().optional().describe('Filter by carrier name (e.g. "dhl", "fedex")'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                date_from: args.date_from,
                date_to: args.date_to,
            };
            if (args.carrier_name) params.carrier_name = args.carrier_name;

            // Backend returns the stats as a FLAT object at the top level —
            // there is NO `data` wrapper on this endpoint (verified live
            // 2026-04-27). Earlier versions of this tool unwrapped a non-existent
            // `res.data.data` which always yielded undefined, masking real data
            // behind a generic "no statistics" message.
            const res = await queryShipmentsApi<ShipmentStatusStats>(
                activeClient, config, '/shipments/packages-information-by-status', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get shipment status stats: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const stats = res.data;
            if (!stats || Object.keys(stats).length === 0) {
                return textResponse('No status statistics available for the specified date range.');
            }

            const carrierLabel = args.carrier_name ? ` (carrier: ${args.carrier_name})` : '';
            const lines: string[] = [
                `Shipment Status Statistics${carrierLabel}`,
                `Period: ${args.date_from} to ${args.date_to}`,
                '═'.repeat(50),
                '',
                // Backend returns percentages as pre-formatted strings with the
                // trailing `%` already baked in (e.g. "6.40%"). Do NOT append
                // another `%` — that produces "6.40%%". Verified live 2026-04-27.
                `Pending ship:     ${stats.packagesPendingShip ?? 0}`,
                `Pickup:           ${stats.packagesPickup ?? 0} (${stats.percentagePickup ?? '0%'})`,
                `In transit:       ${stats.packagesShipped ?? 0} (${stats.percentageShipped ?? '0%'})`,
                `Out for delivery: ${stats.packagesOutForDelivery ?? 0} (${stats.percentageOutForDelivery ?? '0%'})`,
                `Delivered:        ${stats.packagesDeliveryFilter ?? 0} (${stats.percentagePackagesDeliveryFilter ?? '0%'})`,
                `Issues:           ${stats.packagesIssue ?? 0} (${stats.percentageIssue ?? '0%'})`,
                `Returned:         ${stats.packagesReturned ?? 0} (${stats.percentageReturned ?? '0%'})`,
                '',
                'Use envia_list_shipments with a status_id filter for detailed shipment lists.',
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
