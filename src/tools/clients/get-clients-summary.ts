/**
 * Tool: envia_get_clients_summary
 *
 * Returns client counts grouped by type (independent, business, distributor).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryClientsApi } from '../../services/clients.js';
import type { ClientSummaryResponse } from '../../types/clients.js';

/**
 * Register the envia_get_clients_summary tool on the MCP server.
 */
export function registerGetClientsSummary(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_clients_summary',
        {
            description:
                'Get client counts by type. Returns totals for independent, business, ' +
                'and distributor clients plus the grand total.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryClientsApi<ClientSummaryResponse>(
                activeClient, config, '/clients/summary',
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get clients summary: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const d = res.data?.data;
            if (!d) {
                return textResponse('No client data available.');
            }

            return textResponse(
                `Client summary:\n` +
                `  Independent: ${d.independent ?? 0}\n` +
                `  Business: ${d.business ?? 0}\n` +
                `  Distributor: ${d.distributor ?? 0}\n` +
                `  Total: ${d.total ?? 0}`,
            );
        },
    );
}
