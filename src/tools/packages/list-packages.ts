/**
 * Tool: envia_list_packages
 *
 * Lists saved packages (presets) for the authenticated user/company.
 * Supports search, sorting, and pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryPackagesApi, formatPackageType, formatDimensions } from '../../services/packages.js';
import type { PackageListResponse } from '../../types/packages.js';

/**
 * Register the envia_list_packages tool on the MCP server.
 */
export function registerListPackages(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_packages',
        {
            description:
                'List saved package presets for your company. ' +
                'Packages are reusable templates with dimensions, weight, and content. ' +
                'Use these when creating shipments to avoid re-entering package details.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                search: z.string().optional().describe('Search by package name or content'),
                limit: z.number().int().min(1).max(300).default(20).describe('Results per page'),
                page: z.number().int().min(1).default(1).describe('Page number'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                limit: args.limit,
                page: args.page,
            };
            if (args.search) params.search = args.search;

            const res = await queryPackagesApi<PackageListResponse>(
                activeClient, config, '/all-packages', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list packages: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const packages = Array.isArray(res.data?.data) ? res.data.data : [];
            if (packages.length === 0) {
                return textResponse('No saved packages found. Use envia_create_package to create one.');
            }

            const lines: string[] = [
                `Found ${res.data.total ?? packages.length} saved package(s) (page ${args.page}):`,
                '',
            ];

            for (const pkg of packages) {
                const flags = [
                    pkg.is_default ? '★ default' : '',
                    pkg.is_favorite ? '♥ favorite' : '',
                ].filter(Boolean).join(' ');

                lines.push(
                    `• [${pkg.id}] ${pkg.name ?? '—'} — ${formatPackageType(pkg.package_type_id)}${flags ? ` (${flags})` : ''}`,
                );
                lines.push(
                    `  Content: ${pkg.content ?? '—'} | Weight: ${pkg.weight ?? '?'} ${pkg.weight_unit ?? 'KG'} | Dimensions: ${formatDimensions(pkg)}`,
                );
                if (pkg.declared_value) {
                    lines.push(`  Declared value: $${pkg.declared_value}`);
                }
                lines.push('');
            }

            return textResponse(lines.join('\n'));
        },
    );
}
