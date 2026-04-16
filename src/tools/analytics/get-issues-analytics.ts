/**
 * Tool: envia_get_issues_analytics
 *
 * Retrieves issue analytics: types ranked by frequency, per-carrier monthly
 * issue counts, and month-over-month issue rate vs shipped.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryAnalyticsApi, formatIssuesModule } from '../../services/analytics.js';
import type { IssuesModuleResponse } from '../../types/analytics.js';

/**
 * Register the envia_get_issues_analytics tool on the MCP server.
 */
export function registerGetIssuesAnalytics(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_issues_analytics',
        {
            description:
                'Analyze shipment issues: issue types ranked by frequency (damaged, lost, delay, etc.), ' +
                'per-carrier monthly issue breakdown, and monthly issue rate trend. ' +
                'Useful for identifying quality problems with specific carriers.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                start_date: z.string().describe('Start date (YYYY-MM-DD)'),
                end_date: z.string().describe('End date (YYYY-MM-DD)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryAnalyticsApi<IssuesModuleResponse>(
                activeClient,
                config,
                '/analytics/issues-module',
                { sDate: args.start_date, eDate: args.end_date },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get issues analytics: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatIssuesModule(res.data as IssuesModuleResponse));
        },
    );
}
