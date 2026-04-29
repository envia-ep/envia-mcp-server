/**
 * Tool: envia_list_orders
 *
 * Lists ecommerce orders with advanced filters and pagination.
 * Returns a text summary of each order including all three status dimensions:
 * general status, payment status, and fulfillment/preparation status.
 *
 * NOTE: This tool is for browsing and managing orders.
 * To fetch a single order and transform it into carrier payloads for rate/generate,
 * use envia_get_ecommerce_order instead.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryOrdersApi, formatOrderSummary } from '../../services/orders.js';
import { parseToolResponse } from '../../utils/response-validator.js';
import { OrderListResponseSchema } from '../../schemas/orders.js';

/**
 * Register the envia_list_orders tool on the MCP server.
 */
export function registerListOrders(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_orders',
        {
            description:
                'List ecommerce orders with advanced filters and pagination. ' +
                'Each order shows general status (Label Pending, Shipped, etc.), ' +
                'payment status (Paid, Pending, COD), and fulfillment/preparation status. ' +
                'Use filters like status_id, shop_id, date_from/date_to, destination, or search to narrow results. ' +
                'For shipping a specific order, use envia_get_ecommerce_order instead.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                page: z.number().int().min(1).default(1).describe('Page number (1-based)'),
                limit: z.number().int().min(1).max(200).default(20).describe('Results per page (max 200)'),
                shop_id: z.number().int().optional().describe('Filter by store ID'),
                status_id: z.number().int().min(1).optional()
                    .describe('Filter by general status: 1=Payment Pending, 2=Label Pending, 3=Pickup Pending, 4=Shipped, 5=Canceled, 7=Completed'),
                fulfillment_status_id: z.number().int().min(1).max(5).optional()
                    .describe('Filter by fulfillment/preparation status: 1=Fulfilled, 2=Partial, 3=Unfulfilled, 4=Other, 5=On Hold'),
                status_payment: z.enum(['paid', 'pending', 'cod']).optional()
                    .describe('Filter by payment status'),
                order_name: z.string().optional().describe('Search by order name (e.g. "#2416")'),
                search: z.string().optional().describe('General text search across orders'),
                date_from: z.string().optional().describe('Start date filter (UTC, format: "2026-01-01 00:00:00")'),
                date_to: z.string().optional().describe('End date filter (UTC, format: "2026-01-31 23:59:59")'),
                destination: z.enum(['domestic', 'international']).optional()
                    .describe('Filter by shipment destination type'),
                destination_country_code: z.string().max(2).optional()
                    .describe('Filter by destination country ISO code (e.g. "MX")'),
                order_identifier: z.string().optional()
                    .describe('Fetch a specific order by its marketplace identifier'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                page: args.page,
                limit: args.limit,
            };
            if (args.shop_id !== undefined) params.shop_id = args.shop_id;
            if (args.status_id !== undefined) params.status_id = args.status_id;
            if (args.fulfillment_status_id !== undefined) params.fulfillment_status_id = args.fulfillment_status_id;
            if (args.status_payment) params.status_payment = args.status_payment;
            if (args.order_name) params.order_name = args.order_name;
            if (args.search) params.search = args.search;
            if (args.date_from) params.date_from = args.date_from;
            if (args.date_to) params.date_to = args.date_to;
            if (args.destination) params.destination = args.destination;
            if (args.destination_country_code) params.destination_country_code = args.destination_country_code;
            if (args.order_identifier) params.order_identifier = args.order_identifier;

            const res = await queryOrdersApi<unknown>(
                activeClient, config, '/v4/orders', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list orders: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const validated = parseToolResponse(OrderListResponseSchema, res.data, 'envia_list_orders');
            const orders = Array.isArray(validated.orders_info) ? validated.orders_info : [];
            const total = validated.totals ?? orders.length;

            if (orders.length === 0) {
                return textResponse('No orders found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${total} order(s) — showing ${orders.length} (page ${args.page}):`,
                '',
            ];

            for (const order of orders) {
                lines.push(formatOrderSummary(order as Parameters<typeof formatOrderSummary>[0]));
                lines.push('');
            }

            lines.push(
                'Use envia_get_orders_count for a status summary, or envia_get_ecommerce_order to prepare an order for shipping.',
            );

            return textResponse(lines.join('\n'));
        },
    );
}
