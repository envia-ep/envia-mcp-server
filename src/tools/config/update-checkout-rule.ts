/**
 * Tool: envia_update_checkout_rule
 *
 * Updates an existing checkout rule by ID.
 * All fields are optional — only provided fields are sent.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { updateConfigApi } from '../../services/config.js';
import type { BooleanResultResponse } from '../../types/config.js';

/**
 * Register the envia_update_checkout_rule tool on the MCP server.
 */
export function registerUpdateCheckoutRule(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_checkout_rule',
        {
            description:
                'Update an existing checkout discount rule. ' +
                'Use envia_list_checkout_rules to find rule IDs. All fields are optional.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                id: z.number().int().describe('Checkout rule ID to update'),
                type: z.enum(['Money', 'Weight']).optional().describe('Rule type'),
                measurement: z.string().optional().describe('Unit: MXN for Money, KG for Weight'),
                min: z.number().optional().describe('Minimum threshold'),
                max: z.number().optional().describe('Maximum threshold'),
                amount: z.number().optional().describe('Discount amount'),
                amount_type: z.string().optional().describe('Discount type: DISCOUNT'),
                active: z.number().int().min(0).max(1).optional().describe('1=active, 0=inactive'),
                operation_id: z.number().int().optional().describe('Operation: 1=Flat Value'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {};
            if (args.type !== undefined) body.type = args.type;
            if (args.measurement !== undefined) body.measurement = args.measurement;
            if (args.min !== undefined) body.min = args.min;
            if (args.max !== undefined) body.max = args.max;
            if (args.amount !== undefined) body.amount = args.amount;
            if (args.amount_type !== undefined) body.amount_type = args.amount_type;
            if (args.active !== undefined) body.active = args.active;
            if (args.operation_id !== undefined) body.operation_id = args.operation_id;

            const res = await updateConfigApi<BooleanResultResponse>(
                activeClient, config, `/checkout-rules/${args.id}`, body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to update checkout rule #${args.id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(`Checkout rule #${args.id} updated successfully.`);
        },
    );
}
