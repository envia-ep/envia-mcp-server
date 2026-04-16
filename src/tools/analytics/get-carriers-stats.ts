/**
 * Tool: envia_get_carriers_stats
 *
 * Retrieves carrier and service comparison statistics including volume,
 * average delivery time, top origins/destinations, and weight distribution.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryAnalyticsApi, formatCarriersStats } from '../../services/analytics.js';
import type { CarriersStatsResponse } from '../../types/analytics.js';

/**
 * Register the envia_get_carriers_stats tool on the MCP server.
 */
export function registerGetCarriersStats(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_carriers_stats',
        {
            description:
                'Compare carriers and services by shipment volume, average delivery time, ' +
                'top origin and destination regions, and package weight distribution. ' +
                'Useful for carrier selection and route optimization.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                start_date: z.string().describe('Start date (YYYY-MM-DD)'),
                end_date: z.string().describe('End date (YYYY-MM-DD)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryAnalyticsApi<CarriersStatsResponse>(
                activeClient,
                config,
                '/analytics/carriers-stats',
                { sDate: args.start_date, eDate: args.end_date },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get carriers stats: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatCarriersStats(res.data as CarriersStatsResponse));
        },
    );
}
