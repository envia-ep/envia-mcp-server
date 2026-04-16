/**
 * Tool: envia_create_checkout_rule
 *
 * Creates a checkout discount rule for a company shop.
 *
 * SANDBOX NOTE: Returns 422 in sandbox ("Invalid data."). Works in production.
 * The tool implements the correct body and returns a friendly message on 422.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { createConfigApi } from '../../services/config.js';

/**
 * Register the envia_create_checkout_rule tool on the MCP server.
 */
export function registerCreateCheckoutRule(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_checkout_rule',
        {
            description:
                'Create a checkout discount rule for a shop. ' +
                'Rules apply discounts based on order value (Money) or package weight (Weight). ' +
                'Use envia_list_company_shops to get valid shop IDs.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                shop_id: z.number().int().describe('ID of the shop (must have checkout enabled — use envia_list_company_shops)'),
                type: z.enum(['Money', 'Weight']).describe('Rule type: Money (order value) or Weight'),
                measurement: z.string().describe('Unit: MXN for Money, KG for Weight'),
                min: z.number().optional().describe('Minimum threshold to activate the rule (e.g. 500 MXN)'),
                max: z.number().optional().describe('Maximum threshold — omit for no upper limit'),
                amount: z.number().describe('Discount amount to apply'),
                amount_type: z.string().default('DISCOUNT').describe('Discount type: DISCOUNT'),
                active: z.number().int().min(0).max(1).default(1).describe('1=active, 0=inactive'),
                operation_id: z.number().int().default(1).describe('Operation: 1=Flat Value'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                shop_id: args.shop_id,
                type: args.type,
                measurement: args.measurement,
                amount: args.amount,
                amount_type: args.amount_type,
                active: args.active,
                operation_id: args.operation_id,
            };
            if (args.min !== undefined) body.min = args.min;
            if (args.max !== undefined) body.max = args.max;

            const res = await createConfigApi(activeClient, config, '/checkout-rules', body);

            if (!res.ok) {
                if (res.status === 422) {
                    return textResponse(
                        'Failed to create checkout rule: The endpoint returned a validation error (422). ' +
                        'Verify that the shop_id belongs to a checkout-enabled shop (checkout=1). ' +
                        'This may also be a sandbox limitation — the endpoint works in production.',
                    );
                }
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to create checkout rule: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(
                `Checkout rule created successfully.\n` +
                `  Shop: ${args.shop_id}  Type: ${args.type}  Amount: ${args.amount_type} ${args.amount} ${args.measurement}`,
            );
        },
    );
}
