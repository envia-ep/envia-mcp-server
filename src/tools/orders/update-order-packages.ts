/**
 * Tool: envia_update_order_packages
 *
 * Updates package dimensions, weight, and content on an ecommerce order.
 * insurance and declared_value are required (minimum 0) — include them even
 * when there is no insurance, passing 0.
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

const dimensionsSchema = z.object({
    length: z.number().min(0.01).describe('Length (in length_unit)'),
    width: z.number().min(0.01).describe('Width (in length_unit)'),
    height: z.number().min(0.01).describe('Height (in length_unit)'),
});

const packageUpdateSchema = z.object({
    package_id: z.number().int().min(1).describe('Package ID to update (from envia_list_orders)'),
    content: z.string().min(1).describe('Package content description'),
    amount: z.number().int().min(1).max(10).describe('Number of packages of this type'),
    package_type_id: z.number().int().min(1)
        .describe('Package type: 1=Box, 2=Envelope, 3=Pallet, 4=Truck'),
    weight: z.number().min(0.01).max(9999.99).describe('Total weight'),
    weight_unit: z.enum(['KG', 'kg', 'G', 'g', 'LB', 'lb', 'OZ', 'oz']).describe('Weight unit'),
    length_unit: z.enum(['CM', 'cm', 'IN', 'in'])
        .describe('Length unit (required when package_type_id is 1 or 2)'),
    dimensions: dimensionsSchema.describe('Package dimensions (required when package_type_id is 1 or 2)'),
    insurance: z.number().min(0).default(0).describe('Insurance amount (required, use 0 for no insurance)'),
    declared_value: z.number().min(0).default(0).describe('Declared value (required, use 0 if unknown)'),
    box_code: z.string().optional().nullable().describe('Predefined box code (optional)'),
    additional_services: z.array(z.unknown()).default([]).describe('Additional services array'),
});

/**
 * Register the envia_update_order_packages tool on the MCP server.
 */
export function registerUpdateOrderPackages(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_order_packages',
        {
            description:
                'Update package dimensions, weight, content, and insurance on an ecommerce order. ' +
                'Requires shop_id, order_id, and the package_id(s) to update. ' +
                'insurance and declared_value are required (pass 0 when there is no insurance). ' +
                'dimensions and length_unit are required for box and envelope types (package_type_id 1 or 2).',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                shop_id: z.number().int().min(1).describe('Store ID (from envia_list_shops)'),
                order_id: z.number().int().min(1).describe('Order ID (from envia_list_orders)'),
                packages: z.array(packageUpdateSchema).min(1).describe('Packages to update'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const path = `/orders/${args.shop_id}/${args.order_id}/packages`;
            const res = await updateOrderApi(
                activeClient, config, path, { packages: args.packages },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to update order packages: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Packages updated successfully for order ${args.order_id} (shop ${args.shop_id}).\n` +
                `  Updated ${args.packages.length} package(s): ${args.packages.map((p) => `ID ${p.package_id}`).join(', ')}`,
            );
        },
    );
}
