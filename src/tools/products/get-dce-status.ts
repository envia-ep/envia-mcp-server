/**
 * Tool: envia_get_dce_status
 *
 * Retrieves the current DCe (Declaração de Conteúdo Eletrônica) authorization
 * status from SEFAZ for Brazil shipments.
 *
 * DCe is required before generating labels for BR-to-BR shipments with
 * carriers that do not handle electronic declarations internally.
 *
 * NOTE: cStat "999" is the expected response in sandbox. It means the service
 * is reachable but no real SEFAZ connection is available in test environments.
 * In production this will return the actual SEFAZ authorization status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryDceStatus, formatDceStatus } from '../../services/products.js';
import type { DceStatusResponse } from '../../types/products.js';

/**
 * Register the envia_get_dce_status tool on the MCP server.
 */
export function registerGetDceStatus(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_dce_status',
        {
            description:
                'Get the current DCe (Declaração de Conteúdo Eletrônica) authorization ' +
                'status for Brazil shipments. DCe is required for BR-to-BR label generation ' +
                'with certain carriers. ' +
                'Note: cStat "999" is normal in sandbox — not an error.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryDceStatus(activeClient, config);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get DCe status: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatDceStatus(res.data as DceStatusResponse));
        },
    );
}
