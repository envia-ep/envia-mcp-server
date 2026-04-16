/**
 * Tool: envia_delete_webhook
 *
 * Deletes a webhook endpoint by ID. This action is irreversible.
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
 * Register the envia_delete_webhook tool on the MCP server.
 */
export function registerDeleteWebhook(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_delete_webhook',
        {
            description:
                'Delete a webhook endpoint permanently. ' +
                'Use envia_list_webhooks to find webhook IDs. This action cannot be undone.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                id: z.number().int().describe('Webhook ID to delete'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await deleteConfigApi<BooleanResultResponse>(
                activeClient, config, `/webhooks/${args.id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to delete webhook #${args.id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(`Webhook #${args.id} deleted successfully.`);
        },
    );
}
