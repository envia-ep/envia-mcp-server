/**
 * Tool: envia_get_notification_config
 *
 * Retrieves raw notification config entries grouped by category.
 * Each entry's body is a JSON-stringified object — the service layer
 * parses it to extract tracking number, carrier, amount, and currency.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryNotificationConfig, formatNotificationConfig } from '../../services/notifications.js';
import type { NotificationConfigResponse } from '../../types/notifications.js';

/**
 * Register the envia_get_notification_config tool on the MCP server.
 */
export function registerGetNotificationConfig(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_notification_config',
        {
            description:
                'Get detailed notification config entries grouped by category. ' +
                'Each entry includes the notification type, date, and parsed details ' +
                '(tracking number, carrier, amount) extracted from the event payload.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(100).optional().describe('Max entries to return (default: server-defined)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;

            const res = await queryNotificationConfig(activeClient, config, params);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get notification config: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatNotificationConfig(res.data as NotificationConfigResponse));
        },
    );
}
