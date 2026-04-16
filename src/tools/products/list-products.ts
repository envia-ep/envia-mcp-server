/**
 * Tool: envia_list_products
 *
 * Lists products from the company catalogue.
 * Supports pagination (limit/page) and filtered lookup by product_identifier.
 *
 * NOTE: /products/envia/{id} is broken in sandbox. To retrieve a specific product,
 * pass product_identifier and the service filters by that field server-side.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryProducts, formatProducts } from '../../services/products.js';
import type { ProductsResponse } from '../../types/products.js';

/**
 * Register the envia_list_products tool on the MCP server.
 */
export function registerListProducts(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_products',
        {
            description:
                'List products from the company catalogue. ' +
                'Supports pagination with limit and page. ' +
                'Pass product_identifier to look up a specific product ' +
                '(the /products/envia/{id} endpoint is unavailable — use this workaround instead).',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe('Number of products to return (default 20, max 100)'),
                page: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe('Page number for pagination (default 1)'),
                product_identifier: z
                    .string()
                    .optional()
                    .describe('Filter by exact product identifier (SKU) to retrieve a specific product'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;
            if (args.page !== undefined) params.page = args.page;
            if (args.product_identifier !== undefined) params.product_identifier = args.product_identifier;

            const res = await queryProducts(activeClient, config, params);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list products: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatProducts(res.data as ProductsResponse));
        },
    );
}
