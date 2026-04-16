/**
 * Tool: envia_delete_package
 *
 * Deletes a saved package preset (soft delete).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { deletePackageApi } from '../../services/packages.js';
import type { PackageMutationResponse } from '../../types/packages.js';

/**
 * Register the envia_delete_package tool on the MCP server.
 */
export function registerDeletePackage(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_delete_package',
        {
            description: 'Delete a saved package preset by ID (soft delete).',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                package_id: z.number().int().describe('ID of the package to delete'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await deletePackageApi<PackageMutationResponse>(
                activeClient, config, `/packages/${args.package_id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to delete package ${args.package_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(`Package ${args.package_id} deleted successfully.`);
        },
    );
}
