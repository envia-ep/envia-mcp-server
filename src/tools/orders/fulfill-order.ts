/**
 * Tool: envia_fulfill_order
 *
 * Creates fulfillment records for an ecommerce order package.
 * Links a shipment (by shipment_id or tracking_number) to the order package.
 *
 * ⚠️ IRREVERSIBLE: When ALL packages in an order receive fulfillment,
 * the order is automatically marked as COMPLETED and cannot be undone.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateOrderApi } from '../../services/orders.js';
import type { FulfillOrderResponse } from '../../types/orders.js';

/**
 * Register the envia_fulfill_order tool on the MCP server.
 */
export function registerFulfillOrder(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_fulfill_order',
        {
            description:
                'Create fulfillment for an ecommerce order package by linking a shipment. ' +
                'Requires either shipment_id (from envia_create_label) or tracking_number. ' +
                '⚠️ When all packages in the order receive fulfillment, the order is automatically ' +
                'marked as COMPLETED. This cannot be undone. ' +
                'fulfillment_method: normal=standard carrier, manual=manual tracking, automatic=auto-detect.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                shop_id: z.number().int().min(1).describe('Store ID (from envia_list_shops)'),
                order_id: z.number().int().min(1).describe('Order ID (from envia_list_orders)'),
                package_id: z.number().int().min(1).describe('Package ID to fulfill'),
                shipment_id: z.number().int().optional()
                    .describe('Envia shipment ID (from envia_create_label). At least one of shipment_id or tracking_number is required.'),
                tracking_number: z.string().optional()
                    .describe('Carrier tracking number. At least one of shipment_id or tracking_number is required.'),
                fulfillment_id: z.string().optional().nullable()
                    .describe('External fulfillment ID from the ecommerce platform (optional)'),
                fulfillment_status_id: z.number().int().min(1).default(4)
                    .describe('Fulfillment status: 1=Fulfilled, 2=Partial, 3=Unfulfilled, 4=Other (default), 5=On Hold'),
                fulfillment_method: z.enum(['normal', 'manual', 'automatic']).optional()
                    .describe('How the shipment was created: normal=carrier API, manual=manual entry, automatic=auto-detect'),
                shipment_method: z.enum(['normal', 'manual', 'automatic']).optional()
                    .describe('Shipment method type (optional, mirrors fulfillment_method)'),
            }).refine(
                (data) => data.shipment_id !== undefined || data.tracking_number !== undefined,
                { message: 'At least one of shipment_id or tracking_number is required.' },
            ),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                package_id: args.package_id,
                fulfillment_status_id: args.fulfillment_status_id,
            };
            if (args.shipment_id !== undefined) body.shipment_id = args.shipment_id;
            if (args.tracking_number !== undefined) body.tracking_number = args.tracking_number;
            if (args.fulfillment_id !== undefined) body.fulfillment_id = args.fulfillment_id;
            if (args.fulfillment_method !== undefined) body.fulfillment_method = args.fulfillment_method;
            if (args.shipment_method !== undefined) body.shipment_method = args.shipment_method;

            const path = `/orders/${args.shop_id}/${args.order_id}/fulfillment/order-shipments`;
            const res = await mutateOrderApi<FulfillOrderResponse>(
                activeClient, config, path, body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to fulfill order: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const completed = res.data?.completed ?? false;
            const lines = [
                `Fulfillment created successfully for package ${args.package_id}.`,
                `  Order: ${args.order_id} | Shop: ${args.shop_id}`,
                `  Tracking: ${args.tracking_number ?? '—'} | Shipment ID: ${args.shipment_id ?? '—'}`,
            ];

            if (completed) {
                lines.push('');
                lines.push('⚠️ All packages fulfilled — order has been automatically marked as COMPLETED.');
            }

            return textResponse(lines.join('\n'));
        },
    );
}
