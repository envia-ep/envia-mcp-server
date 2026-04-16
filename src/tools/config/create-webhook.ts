/**
 * Tool: envia_create_webhook
 *
 * Creates a new webhook endpoint for shipment status notifications.
 *
 * CRITICAL: Only { url } is accepted in the request body.
 * - Including `type` causes 400 "Invalid request payload input"
 * - The server auto-generates the auth_token
 *
 * SANDBOX NOTE: Returns 422 in sandbox. Works in production.
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
 * Register the envia_create_webhook tool on the MCP server.
 */
export function registerCreateWebhook(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_webhook',
        {
            description:
                'Create a new webhook endpoint to receive shipment status update notifications. ' +
                'Envia will POST to this URL when shipment statuses change. ' +
                'The server auto-generates an auth token for verification.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                url: z.string().url().describe('HTTPS URL where Envia will send shipment status updates'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // ONLY url is accepted — adding type/auth_token/active causes 400
            const res = await createConfigApi(activeClient, config, '/webhooks', { url: args.url });

            if (!res.ok) {
                if (res.status === 422) {
                    return textResponse(
                        'Failed to create webhook: The endpoint returned a validation error (422). ' +
                        'Ensure the URL is a valid HTTPS endpoint and accessible from the internet. ' +
                        'This may also be a sandbox limitation — the endpoint works in production.',
                    );
                }
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to create webhook: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(
                `Webhook created successfully.\n` +
                `  URL: ${args.url}\n` +
                `  Use envia_list_webhooks to see the assigned ID and auth token.`,
            );
        },
    );
}
