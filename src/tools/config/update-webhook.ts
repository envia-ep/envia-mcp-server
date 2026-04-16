/**
 * Tool: envia_update_webhook
 *
 * Updates a webhook's URL and/or active status.
 *
 * CRITICAL: Only { url?, active? } accepted in PUT body.
 * - Including `type` or `auth_token` causes 400.
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
 * Register the envia_update_webhook tool on the MCP server.
 */
export function registerUpdateWebhook(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_webhook',
        {
            description:
                'Update a webhook URL or toggle its active status. ' +
                'Use envia_list_webhooks to find webhook IDs.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                id: z.number().int().describe('Webhook ID to update'),
                url: z.string().url().optional().describe('New webhook URL'),
                active: z.number().int().min(0).max(1).optional().describe('1=active, 0=inactive'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // Only url and active are accepted — type/auth_token cause 400
            const body: Record<string, unknown> = {};
            if (args.url !== undefined) body.url = args.url;
            if (args.active !== undefined) body.active = args.active;

            const res = await updateConfigApi<BooleanResultResponse>(
                activeClient, config, `/webhooks/${args.id}`, body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to update webhook #${args.id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(`Webhook #${args.id} updated successfully.`);
        },
    );
}
