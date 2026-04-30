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
                'List the company notification inbox grouped by category (payments, returns, ' +
                'shipment events, system alerts, etc.). Returns unread counters per category and ' +
                'overall, plus the most recent N entries per category with parsed details ' +
                '(tracking number, carrier, amount, etc.) extracted from each event payload. ' +
                'Use whenever the user asks "what notifications do I have", "any new alerts", ' +
                '"what happened with my shipments today", or "show me my COD payments". ' +
                'Use the limit parameter to control how many notifications are returned per category. ' +
                'When NOT to use: ' +
                '(a) "are my email/WhatsApp notifications enabled?" → use envia_get_notification_settings; ' +
                '(b) "is there a problem with a specific tracking number?" → use envia_track_package ' +
                'or envia_get_shipments_ndr (non-delivery reports); ' +
                '(c) per-channel notification pricing → admin/billing territory, not exposed in chat.',
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
