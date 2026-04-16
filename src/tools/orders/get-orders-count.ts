/**
 * Tool: envia_get_orders_count
 *
 * Returns order counters across 7 status categories: payment_pending,
 * label_pending, pickup_pending, shipped, canceled, other, completed.
 * Use this to get a quick dashboard overview of order state.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryOrdersApi, formatOrderCounts } from '../../services/orders.js';
import type { OrderCountsResponse } from '../../types/orders.js';

/**
 * Register the envia_get_orders_count tool on the MCP server.
 */
export function registerGetOrdersCount(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_orders_count',
        {
            description:
                'Get order counters across 7 status categories: ' +
                'Payment Pending, Label Pending, Pickup Pending, Shipped, Canceled, Other, and Completed. ' +
                'Use this to get a dashboard overview before diving into specific order lists. ' +
                'The "other" category includes orders en route, with incidents, or returned.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryOrdersApi<OrderCountsResponse>(
                activeClient, config, '/v2/orders-count', {},
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get order counts: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data?.data;
            if (!data) {
                return textResponse('No order count data returned from the API.');
            }

            return textResponse(formatOrderCounts(data));
        },
    );
}
