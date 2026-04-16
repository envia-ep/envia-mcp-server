/**
 * Tool: envia_get_notification_settings
 *
 * Returns the company's notification channel settings: which channels
 * (email, SMS, WhatsApp) and events (COD, POD) are enabled.
 *
 * NOTE: /config/notification returns a RAW ARRAY, not { data: [] }.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatNotificationSettings } from '../../services/config.js';
import type { NotificationSettings } from '../../types/config.js';

/**
 * Register the envia_get_notification_settings tool on the MCP server.
 */
export function registerGetNotificationSettings(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_notification_settings',
        {
            description:
                'Get the company notification channel settings. ' +
                'Shows which channels are enabled: email (general + label), SMS, WhatsApp, ' +
                'and event notifications (COD payment, POD confirmation, fulfillment).',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // Response is a RAW ARRAY — not { data: [] }
            const res = await queryConfigApi<NotificationSettings[]>(
                activeClient, config, '/config/notification',
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get notification settings: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            const settings = Array.isArray(res.data) ? (res.data as NotificationSettings[]) : [];
            return textResponse(formatNotificationSettings(settings));
        },
    );
}
