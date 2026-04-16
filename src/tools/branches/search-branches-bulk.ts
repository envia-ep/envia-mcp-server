/**
 * Tool: envia_search_branches_bulk
 *
 * Optimised bulk search for pickup/dropoff branches. Accepts package dimensions
 * to filter out branches that cannot handle the shipment's weight or size.
 *
 * API: GET /branches-bulk/{carrier}/{country_code} (Queries service, public endpoint)
 * Response: Raw JSON array — NOT wrapped in { data: [...] }
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryBranchesApi, formatBranchSummary } from '../../services/branches.js';

/**
 * Register the envia_search_branches_bulk tool on the MCP server.
 */
export function registerSearchBranchesBulk(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_search_branches_bulk',
        {
            description:
                'Bulk search for carrier branches optimised for large result sets. ' +
                'Returns branch code, name, address, and distance in a compact format. ' +
                'Useful when you need a quick list of many branches without full detail. ' +
                'Use envia_search_branches for detailed results on a smaller set.',
            inputSchema: z.object({
                api_key: z.string().optional().describe(
                    'Envia API key. Optional — branches is a public endpoint. Uses server key if omitted.',
                ),
                carrier: z.string().min(1).describe(
                    'Carrier slug (e.g. "fedex", "dhl", "estafeta"). Use envia_list_carriers to see slugs.',
                ),
                country_code: z.string().length(2).describe(
                    'ISO 3166-1 alpha-2 country code (e.g. "MX", "CO", "BR").',
                ),
                zipcode: z.string().optional().describe('Postal/ZIP code to search near.'),
                locality: z.string().optional().describe('City or locality name to filter by.'),
                state: z.string().optional().describe('State code (2 characters).'),
                type: z.number().int().min(1).max(3).default(1).describe(
                    'Branch type: 1=pickup (default), 2=dropoff, 3=both.',
                ),
                limit: z.number().int().min(1).max(200).optional().describe('Maximum number of results.'),
                allBranch: z.boolean().optional().describe('Return all branches regardless of location filter.'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                type: args.type,
            };
            if (args.zipcode) params.zipcode = args.zipcode;
            if (args.locality) params.locality = args.locality;
            if (args.state) params.state = args.state;
            if (args.limit !== undefined) params.limit = args.limit;
            if (args.allBranch !== undefined) params.allBranch = args.allBranch;

            const path = `/branches-bulk/${encodeURIComponent(args.carrier)}/${encodeURIComponent(args.country_code)}`;
            const res = await queryBranchesApi(activeClient, config, path, params);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to bulk-search branches for ${args.carrier} in ${args.country_code}: ${mapped.userMessage}\n\n` +
                    `Suggestion: ${mapped.suggestion}`,
                );
            }

            // Response is a raw array
            const branches = Array.isArray(res.data) ? res.data : [];

            if (branches.length === 0) {
                return textResponse(
                    `No branches found for carrier "${args.carrier}" in ${args.country_code}. ` +
                    'Try adjusting the search area or use envia_get_branches_catalog to see coverage.',
                );
            }

            const lines: string[] = [
                `Found ${branches.length} branch(es) for ${args.carrier.toUpperCase()} in ${args.country_code}:`,
                '',
            ];

            for (const branch of branches) {
                lines.push(formatBranchSummary(branch));
            }

            lines.push('');
            lines.push('Use envia_search_branches for full address detail on a specific branch.');

            return textResponse(lines.join('\n'));
        },
    );
}
