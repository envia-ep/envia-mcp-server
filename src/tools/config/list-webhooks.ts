/**
 * Tool: envia_list_webhooks
 *
 * Lists configured webhook endpoints for the company.
 * Auth tokens are truncated for security.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatWebhooks } from '../../services/config.js';
import type { WebhooksResponse } from '../../types/config.js';

/**
 * Register the envia_list_webhooks tool on the MCP server.
 */
export function registerListWebhooks(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_webhooks',
        {
            description:
                'List configured webhook endpoints for the company. ' +
                'Shows webhook type (onShipmentStatusUpdate), URL, and active status. ' +
                'Auth tokens are truncated for security.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(100).optional().describe('Max webhooks to return'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;

            const res = await queryConfigApi<WebhooksResponse>(
                activeClient, config, '/webhooks', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list webhooks: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatWebhooks(res.data as WebhooksResponse));
        },
    );
}
