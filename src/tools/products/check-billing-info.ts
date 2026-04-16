/**
 * Tool: envia_check_billing_info
 *
 * Checks whether the company has billing information configured.
 * Lightweight alternative to envia_get_billing_info when only
 * presence/absence needs to be determined.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryBillingInfoCheck, formatBillingInfoCheck } from '../../services/products.js';
import type { BillingInfoCheck } from '../../types/products.js';

/**
 * Register the envia_check_billing_info tool on the MCP server.
 */
export function registerCheckBillingInfo(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_check_billing_info',
        {
            description:
                'Check whether the company has billing information configured. ' +
                'Returns a simple yes/no answer. Use envia_get_billing_info ' +
                'to retrieve the actual billing details.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryBillingInfoCheck(activeClient, config);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to check billing information: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatBillingInfoCheck(res.data as BillingInfoCheck));
        },
    );
}
