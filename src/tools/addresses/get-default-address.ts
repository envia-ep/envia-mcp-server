/**
 * Tool: envia_get_default_address
 *
 * Retrieves the user's default origin or destination address.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryAddressesApi, formatAddressLine } from '../../services/addresses.js';
import type { DefaultAddressResponse } from '../../types/addresses.js';

/**
 * Register the envia_get_default_address tool on the MCP server.
 */
export function registerGetDefaultAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_default_address',
        {
            description:
                'Get the default origin or destination address for the current user. ' +
                'Returns the full address details if a default is set, or indicates none is configured.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type_id: z.number().int().min(1).max(2).describe('1=Origin, 2=Destination'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryAddressesApi<DefaultAddressResponse>(
                activeClient, config, `/default-user-address/${args.type_id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get default address: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const addr = res.data;
            const typeName = args.type_id === 1 ? 'origin' : 'destination';

            if (!addr || !('address_id' in addr)) {
                return textResponse(
                    `No default ${typeName} address is configured. ` +
                    `Use envia_set_default_address to set one.`,
                );
            }

            const lines = [
                `Default ${typeName} address:`,
                `  ID: ${addr.address_id}`,
                `  Name: ${addr.name ?? '—'}`,
                `  Address: ${formatAddressLine(addr)}`,
            ];

            if (addr.email) lines.push(`  Email: ${addr.email}`);
            if (addr.phone) lines.push(`  Phone: ${addr.phone_code ? `+${addr.phone_code} ` : ''}${addr.phone}`);
            if (addr.identification_number) lines.push(`  ID Number: ${addr.identification_number}`);
            if (addr.reference) lines.push(`  Reference: ${addr.reference}`);

            return textResponse(lines.join('\n'));
        },
    );
}
