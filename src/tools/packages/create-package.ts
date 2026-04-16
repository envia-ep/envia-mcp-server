/**
 * Tool: envia_create_package
 *
 * Creates a new saved package preset for the authenticated user.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutatePackageApi, formatPackageType } from '../../services/packages.js';
import type { CreatePackageResponse } from '../../types/packages.js';

/**
 * Register the envia_create_package tool on the MCP server.
 */
export function registerCreatePackage(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_package',
        {
            description:
                'Create a new saved package preset with dimensions, weight, and content description. ' +
                'Package types: 1=Box, 2=Envelope, 3=Pallet, 4=Tube. ' +
                'Saved packages can be reused when creating shipments.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                name: z.string().min(1).max(255).describe('Package preset name'),
                content: z.string().min(1).max(255).describe('Content description (e.g. "Electronics", "Clothing")'),
                package_type: z.number().int().min(1).max(4).describe('1=Box, 2=Envelope, 3=Pallet, 4=Tube'),
                weight: z.number().positive().describe('Weight value'),
                weight_unit: z.enum(['KG', 'LB']).describe('Weight unit'),
                length_unit: z.enum(['CM', 'IN']).describe('Dimension unit'),
                height: z.number().positive().describe('Height'),
                length: z.number().positive().describe('Length'),
                width: z.number().positive().describe('Width'),
                declared_value: z.number().min(0).optional().describe('Declared value for insurance'),
                insurance: z.number().min(0).optional().describe('Insurance amount'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                name: args.name,
                content: args.content,
                package_type: args.package_type,
                weight: args.weight,
                weight_unit: args.weight_unit,
                length_unit: args.length_unit,
                height: args.height,
                length: args.length,
                width: args.width,
            };

            if (args.declared_value !== undefined) body.declared_value = args.declared_value;
            if (args.insurance !== undefined) body.insurance = args.insurance;

            const res = await mutatePackageApi<CreatePackageResponse>(
                activeClient, config, '/packages', body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to create package: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Package created successfully.\n` +
                `  ID: ${res.data.id}\n` +
                `  Name: ${args.name}\n` +
                `  Type: ${formatPackageType(args.package_type)}\n` +
                `  Dimensions: ${args.length}×${args.width}×${args.height} ${args.length_unit}\n` +
                `  Weight: ${args.weight} ${args.weight_unit}`,
            );
        },
    );
}
