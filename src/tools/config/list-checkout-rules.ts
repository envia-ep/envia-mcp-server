/**
 * Tool: envia_list_checkout_rules
 *
 * Lists checkout discount/surcharge rules configured for the company's shops.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatCheckoutRules } from '../../services/config.js';
import type { CheckoutRulesResponse } from '../../types/config.js';

/**
 * Register the envia_list_checkout_rules tool on the MCP server.
 */
export function registerListCheckoutRules(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_checkout_rules',
        {
            description:
                'List checkout discount rules for the company. ' +
                'Rules apply discounts based on order value (Money) or weight (Weight) ' +
                'in the shipping checkout widget. Shows rule type, threshold range, discount amount.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(100).optional().describe('Max rules to return'),
                page: z.number().int().min(1).optional().describe('Page number (1-based)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;
            if (args.page !== undefined) params.page = args.page;

            const res = await queryConfigApi<CheckoutRulesResponse>(
                activeClient, config, '/checkout-rules', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list checkout rules: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatCheckoutRules(res.data as CheckoutRulesResponse));
        },
    );
}
