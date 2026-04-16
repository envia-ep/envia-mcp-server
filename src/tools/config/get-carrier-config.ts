/**
 * Tool: envia_get_carrier_config
 *
 * Returns carrier configuration for the company: active carriers,
 * their services, COD support, and blocked status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatCarrierConfig } from '../../services/config.js';
import type { CarrierConfigResponse } from '../../types/config.js';

/**
 * Register the envia_get_carrier_config tool on the MCP server.
 */
export function registerGetCarrierConfig(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_carrier_config',
        {
            description:
                'Get carrier configuration for the company. Shows active carriers, ' +
                'available services per carrier, COD support, and whether any carriers are blocked. ' +
                'Useful for understanding which shipping options are available.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(200).optional().describe('Max carriers to return'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;

            const res = await queryConfigApi<CarrierConfigResponse>(
                activeClient, config, '/carrier-company/config', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get carrier config: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatCarrierConfig(res.data as CarrierConfigResponse));
        },
    );
}
