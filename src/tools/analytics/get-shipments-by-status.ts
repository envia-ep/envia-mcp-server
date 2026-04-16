/**
 * Tool: envia_get_shipments_by_status
 *
 * Returns shipment counts grouped by status (Created, Shipped, Delivered,
 * Canceled, Lost, Damaged, etc.) for a given date range.
 *
 * NOTE: This endpoint uses PATH parameters — dates are embedded in the URL,
 * not passed as query parameters.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryGuidesPerStatus, formatGuidesPerStatus } from '../../services/analytics.js';

/**
 * Register the envia_get_shipments_by_status tool on the MCP server.
 */
export function registerGetShipmentsByStatus(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipments_by_status',
        {
            description:
                'Get a count of shipments grouped by status (Created, Shipped, Delivered, ' +
                'Canceled, Lost, Damaged, etc.) for a date range. ' +
                'Only statuses with at least one shipment are shown, sorted by volume.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                start_date: z.string().describe('Start date (YYYY-MM-DD)'),
                end_date: z.string().describe('End date (YYYY-MM-DD)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryGuidesPerStatus(activeClient, config, args.start_date, args.end_date);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get shipments by status: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatGuidesPerStatus(res.data ?? { data: [] }));
        },
    );
}
