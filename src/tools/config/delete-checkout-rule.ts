/**
 * Tool: envia_delete_checkout_rule
 *
 * Deletes a checkout rule by ID. This action is irreversible.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { deleteConfigApi } from '../../services/config.js';
import type { BooleanResultResponse } from '../../types/config.js';

/**
 * Register the envia_delete_checkout_rule tool on the MCP server.
 */
export function registerDeleteCheckoutRule(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_delete_checkout_rule',
        {
            description:
                'Delete a checkout discount rule permanently. ' +
                'Use envia_list_checkout_rules to find rule IDs. This action cannot be undone.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                id: z.number().int().describe('Checkout rule ID to delete'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await deleteConfigApi<BooleanResultResponse>(
                activeClient, config, `/checkout-rules/${args.id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to delete checkout rule #${args.id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(`Checkout rule #${args.id} deleted successfully.`);
        },
    );
}
