/**
 * Tool: envia_get_packages_module
 *
 * Retrieves per-carrier performance metrics: shipped, delivered, in-transit,
 * issues, delivery rate, average delivery time, and average cost.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryAnalyticsApi, formatPackagesModule } from '../../services/analytics.js';
import type { PackagesModuleResponse } from '../../types/analytics.js';

/**
 * Register the envia_get_packages_module tool on the MCP server.
 */
export function registerGetPackagesModule(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_packages_module',
        {
            description:
                'Get package performance metrics per carrier: shipped, delivered, in-transit, ' +
                'issues, return-to-origin counts, delivery rate, average delivery time (days), ' +
                'and average cost. Includes global totals.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                start_date: z.string().describe('Start date (YYYY-MM-DD)'),
                end_date: z.string().describe('End date (YYYY-MM-DD)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryAnalyticsApi<PackagesModuleResponse>(
                activeClient,
                config,
                '/analytics/packages-module',
                { sDate: args.start_date, eDate: args.end_date },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get packages module: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatPackagesModule(res.data as PackagesModuleResponse));
        },
    );
}
