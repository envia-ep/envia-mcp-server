/**
 * Tool: envia_get_branches_catalog
 *
 * Retrieve the hierarchical state → locality catalog for a carrier's branches.
 * Use this to discover which states and cities have branches before searching.
 *
 * API: GET /branches/{carrier}/{country_code}/catalog (Queries service, public endpoint)
 * Response: { states: string[], localities: Record<string, string[]> }
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryBranchCatalogApi } from '../../services/branches.js';

/**
 * Register the envia_get_branches_catalog tool on the MCP server.
 */
export function registerGetBranchesCatalog(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_branches_catalog',
        {
            description:
                'Get the full hierarchical catalog of states and localities where a carrier has branches. ' +
                'Returns a map of state → [localities] so you can discover coverage before searching. ' +
                'Use this before envia_search_branches to find the exact locality/state names.',
            inputSchema: z.object({
                api_key: z.string().optional().describe(
                    'Envia API key. Optional — branches catalog is a public endpoint. Uses server key if omitted.',
                ),
                carrier: z.string().min(1).describe(
                    'Carrier slug (e.g. "fedex", "dhl", "estafeta"). Use envia_list_carriers to see slugs.',
                ),
                country_code: z.string().length(2).describe(
                    'ISO 3166-1 alpha-2 country code (e.g. "MX", "CO", "BR").',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const path = `/branches/${encodeURIComponent(args.carrier)}/${encodeURIComponent(args.country_code)}/catalog`;
            const res = await queryBranchCatalogApi(activeClient, config, path);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get branch catalog for ${args.carrier} in ${args.country_code}: ${mapped.userMessage}\n\n` +
                    `Suggestion: ${mapped.suggestion}`,
                );
            }

            const catalog = res.data;
            const states = Array.isArray(catalog?.states) ? catalog.states : [];

            if (states.length === 0) {
                return textResponse(
                    `No branch catalog found for carrier "${args.carrier}" in ${args.country_code}. ` +
                    'The carrier may not have branches in this country.',
                );
            }

            const lines: string[] = [
                `Branch catalog for ${args.carrier.toUpperCase()} in ${args.country_code} (${states.length} state(s)):`,
                '',
            ];

            for (const state of states) {
                const localities = catalog.localities?.[state] ?? [];
                if (localities.length > 0) {
                    lines.push(`  ${state}: ${localities.join(', ')}`);
                } else {
                    lines.push(`  ${state}`);
                }
            }

            lines.push('');
            lines.push('Use envia_search_branches with locality or state to find specific branches.');

            return textResponse(lines.join('\n'));
        },
    );
}
