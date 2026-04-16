/**
 * Tool: envia_list_notifications
 *
 * Lists company notifications grouped by category (all, payments, returns, etc.)
 * with unread counters per category and overall.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryCompanyNotifications, formatCompanyNotifications } from '../../services/notifications.js';
import type { CompanyNotificationsResponse } from '../../types/notifications.js';

/**
 * Register the envia_list_notifications tool on the MCP server.
 */
export function registerListNotifications(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_notifications',
        {
            description:
                'List company notifications grouped by category (payments, returns, etc.). ' +
                'Shows unread counters per category and overall. ' +
                'Use the limit parameter to control how many notifications are returned.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(100).optional().describe('Max notifications to return per category (default: 5)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;

            const res = await queryCompanyNotifications(activeClient, config, params);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list notifications: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatCompanyNotifications(res.data as CompanyNotificationsResponse));
        },
    );
}
