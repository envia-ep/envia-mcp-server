/**
 * Tool: envia_select_order_service
 *
 * Selects (or deselects) a carrier service for a specific package within an order.
 * Saves the quoted rate to the package so it can be fulfilled.
 * Pass service_id=null and price=null to deselect a previously assigned service.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { updateOrderApi } from '../../services/orders.js';

interface SelectServiceResponse {
    success: boolean;
    msg?: string;
}

/**
 * Register the envia_select_order_service tool on the MCP server.
 */
export function registerSelectOrderService(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_select_order_service',
        {
            description:
                'Select a carrier service for a package in an ecommerce order. ' +
                'This saves the quoted service/price so the order can proceed to fulfillment. ' +
                'Requires shop_id, order_id, package_id, service_id, and price. ' +
                'To get available services and prices, use envia_get_ecommerce_order + envia_get_shipping_rates. ' +
                'Pass service_id=null and price=null to deselect a previously assigned service.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                shop_id: z.number().int().min(1).describe('Store ID (from envia_list_shops)'),
                order_id: z.number().int().min(1).describe('Order ID (from envia_list_orders)'),
                package_id: z.number().int().min(1).describe('Package ID to assign the service to'),
                service_id: z.number().int().min(1).nullable()
                    .describe('Carrier service ID to assign (null to deselect)'),
                price: z.number().nullable()
                    .describe('Quoted price for the service (null to deselect)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const path = `/orders/${args.shop_id}/${args.order_id}/rate`;
            const res = await updateOrderApi<SelectServiceResponse>(
                activeClient, config, path, {
                    package_id: args.package_id,
                    service_id: args.service_id,
                    price: args.price,
                },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to select order service: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            if (args.service_id === null) {
                return textResponse(
                    `Service deselected for package ${args.package_id} in order ${args.order_id} (shop ${args.shop_id}).`,
                );
            }

            return textResponse(
                `Service selected successfully for package ${args.package_id}.\n` +
                `  Order: ${args.order_id} | Shop: ${args.shop_id}\n` +
                `  Service ID: ${args.service_id} | Price: ${args.price}`,
            );
        },
    );
}
