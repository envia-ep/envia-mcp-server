/**
 * Tool: envia_set_default_address
 *
 * Sets an address as the default origin or destination for the user.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateAddressApi } from '../../services/addresses.js';

/**
 * Register the envia_set_default_address tool on the MCP server.
 */
export function registerSetDefaultAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_set_default_address',
        {
            description:
                'Set an address as the default origin or destination. ' +
                'Each user can have one default origin and one default destination.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                address_id: z.number().int().describe('ID of the address to set as default'),
                address_type: z.number().int().min(1).max(2).describe('1=Origin, 2=Destination'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await mutateAddressApi(
                activeClient, config, '/default-user-address', {
                    address_id: args.address_id,
                    address_type: args.address_type,
                },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to set default address: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const typeName = args.address_type === 1 ? 'origin' : 'destination';
            return textResponse(
                `Address ${args.address_id} set as default ${typeName} successfully.`,
            );
        },
    );
}
