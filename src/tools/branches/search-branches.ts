/**
 * Tool: envia_search_branches
 *
 * Search pickup/dropoff branches for a specific carrier and country.
 * Returns branches sorted by distance from the given postal code or GPS coordinates.
 *
 * API: GET /branches/{carrier}/{country_code} (Queries service, public endpoint)
 * Response: Raw JSON array — NOT wrapped in { data: [...] }
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryBranchesApi, formatBranchDetail } from '../../services/branches.js';

/**
 * Register the envia_search_branches tool on the MCP server.
 */
export function registerSearchBranches(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_search_branches',
        {
            description:
                'Search pickup and dropoff branches for a specific carrier in a country. ' +
                'Filter by postal code, city, state, or GPS coordinates to find nearby branches. ' +
                'Returns branch name, code, address, distance, and whether it supports delivery or admission. ' +
                'Use the branch_code when creating a shipment that requires a pickup point.',
            inputSchema: z.object({
                api_key: z.string().optional().describe(
                    'Envia API key. Optional — branches is a public endpoint. Uses server key if omitted.',
                ),
                carrier: z.string().min(1).describe(
                    'Carrier slug (e.g. "fedex", "dhl", "estafeta", "ups"). Use envia_list_carriers to see slugs.',
                ),
                country_code: z.string().length(2).describe(
                    'ISO 3166-1 alpha-2 country code (e.g. "MX", "CO", "BR").',
                ),
                zipcode: z.string().optional().describe(
                    'Postal/ZIP code to search near. Results are sorted by distance from this code.',
                ),
                locality: z.string().optional().describe('City or locality name to filter by.'),
                state: z.string().optional().describe('State code (2 characters, e.g. "NL", "CDMX").'),
                type: z.number().int().min(1).max(3).default(1).describe(
                    'Branch type: 1=pickup only (default), 2=dropoff only, 3=both.',
                ),
                latitude: z.number().optional().describe('GPS latitude for proximity search.'),
                longitude: z.number().optional().describe('GPS longitude for proximity search.'),
                limitBranches: z.number().int().min(1).max(100).optional().describe('Maximum number of results.'),
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
            if (args.latitude !== undefined) params.latitude = args.latitude;
            if (args.longitude !== undefined) params.longitude = args.longitude;
            if (args.limitBranches !== undefined) params.limitBranches = args.limitBranches;
            if (args.allBranch !== undefined) params.allBranch = args.allBranch;

            const path = `/branches/${encodeURIComponent(args.carrier)}/${encodeURIComponent(args.country_code)}`;
            const res = await queryBranchesApi(activeClient, config, path, params);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to search branches for ${args.carrier} in ${args.country_code}: ${mapped.userMessage}\n\n` +
                    `Suggestion: ${mapped.suggestion}`,
                );
            }

            // Response is a raw array
            const branches = Array.isArray(res.data) ? res.data : [];

            if (branches.length === 0) {
                return textResponse(
                    `No branches found for carrier "${args.carrier}" in ${args.country_code}. ` +
                    'Try adjusting the search area, changing the branch type, or use envia_get_branches_catalog ' +
                    'to see all available states and localities.',
                );
            }

            const lines: string[] = [
                `Found ${branches.length} branch(es) for ${args.carrier.toUpperCase()} in ${args.country_code}:`,
                '',
            ];

            for (const branch of branches) {
                lines.push(formatBranchDetail(branch));
                lines.push('');
            }

            lines.push(
                'Use the branch_code when creating a shipment pickup. ' +
                'Call envia_get_branches_catalog to browse all states and localities.',
            );

            return textResponse(lines.join('\n'));
        },
    );
}
