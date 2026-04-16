/**
 * Tool: envia_list_shops
 *
 * Lists connected ecommerce stores for the company.
 * By default filters to active, non-deleted shops only.
 * Returns the shop ID needed for order management operations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryOrdersApi, formatShopSummary } from '../../services/orders.js';
import type { ShopRecord } from '../../types/orders.js';

/**
 * Register the envia_list_shops tool on the MCP server.
 */
export function registerListShops(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_shops',
        {
            description:
                'List connected ecommerce stores (shops) for the company. ' +
                'Returns store IDs needed for order management tools like envia_update_order_address. ' +
                'By default shows only active stores; set include_inactive=true to see all. ' +
                'Supported platforms: Shopify, WooCommerce, MercadoLibre, Tiendanube, and more.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                include_inactive: z.boolean().default(false)
                    .describe('Include inactive or deleted stores (default: active only)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // /company/shops returns a raw top-level array, no query params needed
            const res = await queryOrdersApi<ShopRecord[]>(
                activeClient, config, '/company/shops', {},
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list shops: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const allShops = Array.isArray(res.data) ? res.data : [];
            const shops = args.include_inactive
                ? allShops
                : allShops.filter((s) => s.active === 1 && s.deleted === 0);

            if (shops.length === 0) {
                const hint = args.include_inactive
                    ? 'No shops found.'
                    : 'No active shops found. Use include_inactive=true to see all shops.';
                return textResponse(hint);
            }

            const activeCount = allShops.filter((s) => s.active === 1 && s.deleted === 0).length;
            const lines: string[] = [
                `Found ${shops.length} shop(s) (${activeCount} active out of ${allShops.length} total):`,
                '',
            ];

            for (const shop of shops) {
                lines.push(formatShopSummary(shop));
            }

            lines.push('');
            lines.push('Use the shop ID with envia_list_orders (shop_id) or order management tools.');

            return textResponse(lines.join('\n'));
        },
    );
}
