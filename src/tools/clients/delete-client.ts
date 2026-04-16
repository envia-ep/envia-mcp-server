/**
 * Tool: envia_delete_client
 *
 * Soft-deletes a client. Does not cascade-delete contacts or addresses.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { deleteClientApi } from '../../services/clients.js';
import type { ClientMutationResponse } from '../../types/clients.js';

/**
 * Register the envia_delete_client tool on the MCP server.
 */
export function registerDeleteClient(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_delete_client',
        {
            description:
                'Delete a client by ID (soft delete). ' +
                'The client record is marked as deleted but contacts and addresses are preserved.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                client_id: z.number().int().describe('Client ID to delete'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await deleteClientApi<ClientMutationResponse>(
                activeClient, config, `/clients/${args.client_id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to delete client ${args.client_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(`Client ${args.client_id} deleted successfully.`);
        },
    );
}
