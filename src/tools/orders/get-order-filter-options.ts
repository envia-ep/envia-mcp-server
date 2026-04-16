/**
 * Tool: envia_get_order_filter_options
 *
 * Returns available filter options for order list filters.
 * Currently provides destination country codes present in the company's orders.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryOrdersApi } from '../../services/orders.js';
import type { OrderFilterOptionsResponse } from '../../types/orders.js';

/**
 * Register the envia_get_order_filter_options tool on the MCP server.
 */
export function registerGetOrderFilterOptions(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_order_filter_options',
        {
            description:
                'Get available filter options for order lists. ' +
                'Returns destination countries present in the company\'s orders, ' +
                'which can be passed to envia_list_orders as destination_country_code.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryOrdersApi<OrderFilterOptionsResponse>(
                activeClient, config, '/orders/filter-options', {},
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get filter options: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const countries = Array.isArray(res.data?.destinations_country_code)
                ? res.data.destinations_country_code
                : [];

            if (countries.length === 0) {
                return textResponse('No destination country options found.');
            }

            const lines = ['Available destination countries for order filters:', ''];
            for (const country of countries) {
                lines.push(`  ${country.country_code} — ${country.country_name}`);
            }
            lines.push('');
            lines.push('Pass country_code to envia_list_orders as destination_country_code.');

            return textResponse(lines.join('\n'));
        },
    );
}
