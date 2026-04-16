/**
 * Tool: envia_delete_address
 *
 * Deletes a saved address. Cascading: removes from defaults, favorites, and carrier relations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { deleteAddressApi } from '../../services/addresses.js';
import type { AddressMutationResponse } from '../../types/addresses.js';

/**
 * Register the envia_delete_address tool on the MCP server.
 */
export function registerDeleteAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_delete_address',
        {
            description:
                'Delete a saved address by ID. ' +
                'This also removes the address from defaults, favorites, and carrier branch relations. ' +
                'Cannot delete addresses that are set as a shop favorite.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                address_id: z.number().int().describe('ID of the address to delete'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await deleteAddressApi<AddressMutationResponse>(
                activeClient, config, `/user-address/${args.address_id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to delete address ${args.address_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(`Address ${args.address_id} deleted successfully.`);
        },
    );
}
