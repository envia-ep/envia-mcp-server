/**
 * Tool: envia_get_monthly_analytics
 *
 * Retrieves monthly shipment volume and revenue breakdown by carrier.
 * Useful for spotting trends, seasonal patterns, and carrier mix changes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryAnalyticsApi, formatMonthlyAnalytics } from '../../services/analytics.js';
import type { MonthlyAnalyticsResponse } from '../../types/analytics.js';

/**
 * Register the envia_get_monthly_analytics tool on the MCP server.
 */
export function registerGetMonthlyAnalytics(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_monthly_analytics',
        {
            description:
                'Get monthly shipment volume and revenue breakdown by carrier. ' +
                'Shows total shipments, total revenue, and per-carrier contribution ' +
                'for the specified date range.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                start_date: z.string().describe('Start date (YYYY-MM-DD)'),
                end_date: z.string().describe('End date (YYYY-MM-DD)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryAnalyticsApi<MonthlyAnalyticsResponse>(
                activeClient,
                config,
                '/analytics/get-monthly-analytics-data',
                { sDate: args.start_date, eDate: args.end_date },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get monthly analytics: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatMonthlyAnalytics(res.data as MonthlyAnalyticsResponse));
        },
    );
}
