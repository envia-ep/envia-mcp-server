/**
 * Tool: envia_get_orders_analytics
 *
 * Returns analytics data about order shipment statuses.
 * Provides counts and percentages for: unfulfilled, ready to fulfill,
 * ready to ship, pickup/in-transit, out for delivery, delivered,
 * with incidents, returned, and total active orders.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryOrdersApi, formatAnalytics } from '../../services/orders.js';
import type { OrderAnalyticsResponse } from '../../types/orders.js';

/**
 * Register the envia_get_orders_analytics tool on the MCP server.
 */
export function registerGetOrdersAnalytics(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_orders_analytics',
        {
            description:
                'Get analytics about order shipment statuses with counts and percentages. ' +
                'Includes: unfulfilled orders, ready to fulfill, ready to ship, pickup/in-transit, ' +
                'out for delivery, delivered, with incidents, and returned. ' +
                'Optionally filter by date range or store to analyze a specific period or shop.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                date_from: z.string().optional()
                    .describe('Start date filter (UTC, format: "2026-01-01 00:00:00")'),
                date_to: z.string().optional()
                    .describe('End date filter (UTC, format: "2026-01-31 23:59:59")'),
                shop_id: z.number().int().optional()
                    .describe('Filter analytics to a specific store'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.date_from) params.date_from = args.date_from;
            if (args.date_to) params.date_to = args.date_to;
            if (args.shop_id !== undefined) params.shop_id = args.shop_id;

            const res = await queryOrdersApi<OrderAnalyticsResponse>(
                activeClient, config, '/orders/orders-information-by-status', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get orders analytics: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            if (!res.data || res.data.sumOrdersActive === undefined) {
                return textResponse('No analytics data returned from the API.');
            }

            return textResponse(formatAnalytics(res.data));
        },
    );
}
