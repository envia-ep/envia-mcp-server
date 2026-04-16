/**
 * Tool: envia_get_notification_prices
 *
 * Returns the price per notification for each channel (SMS, WhatsApp, etc.).
 *
 * NOTE: The /notifications/prices endpoint returns a RAW ARRAY — not wrapped
 * in a { data: [] } object. This is handled in the service layer.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryNotificationPrices, formatNotificationPrices } from '../../services/notifications.js';
import type { NotificationPrice } from '../../types/notifications.js';

/**
 * Register the envia_get_notification_prices tool on the MCP server.
 */
export function registerGetNotificationPrices(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_notification_prices',
        {
            description:
                'Get the current price per notification for each channel (SMS, WhatsApp, etc.). ' +
                'Prices are returned in the company account currency.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryNotificationPrices(activeClient, config);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get notification prices: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            const prices = Array.isArray(res.data) ? (res.data as NotificationPrice[]) : [];
            return textResponse(formatNotificationPrices(prices));
        },
    );
}
