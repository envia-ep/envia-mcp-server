/**
 * Tool: envia_find_drop_off
 *
 * Finds carrier branches (drop-off points, warehouses, lockers, and third-party
 * pickup locations) using the carriers-service branch lookup. Supports filtering
 * by capacity type, shipment type, and package dimensions — more powerful than
 * envia_search_branches which only filters by carrier + country.
 *
 * Data source: POST /ship/branches (carriers service).
 * Verified 2026-04-27 via Ship.php:89 + Branch.php + branches.v1.schema.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';

/** A single branch record from POST /ship/branches. */
interface BranchResult {
    name?: string;
    code?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
    capacity?: number;
    branchType?: number;
    distance?: number | string;
    phone?: string;
    schedule?: unknown;
    [key: string]: unknown;
}

/** Capacity option labels. */
const CAPACITY_LABELS: Record<number, string> = {
    1: 'Receiving',
    2: 'Delivering',
    3: 'Receiving & Delivering',
};

/**
 * Format a single branch result for display.
 *
 * @param branch - Branch object from the API
 * @param index  - 1-based display index
 * @returns Formatted text block
 */
function formatBranch(branch: BranchResult, index: number): string {
    const name = branch.name ?? '—';
    const code = branch.code ? ` [${branch.code}]` : '';
    const address = [branch.address, branch.city, branch.state, branch.zipCode]
        .filter(Boolean)
        .join(', ');
    const dist = branch.distance != null ? ` (${branch.distance} km)` : '';
    const cap = branch.capacity != null ? CAPACITY_LABELS[branch.capacity] ?? `Type ${branch.capacity}` : '';
    const phone = branch.phone ? ` | Phone: ${branch.phone}` : '';

    const lines = [`${index}. ${name}${code}${dist}`];
    if (address) lines.push(`   Address: ${address}`);
    if (cap) lines.push(`   Capacity: ${cap}`);
    if (phone) lines.push(`   ${phone.trim()}`);

    return lines.join('\n');
}

/**
 * Register the envia_find_drop_off tool on the MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerFindDropOff(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_find_drop_off',
        {
            description:
                'Find carrier branch locations (drop-off points, lockers, warehouses) for dropping off or '
                + 'picking up shipments. Supports filtering by country, postal code, city, capacity type, '
                + 'and package dimensions. More powerful than envia_search_branches — use this when you need '
                + 'to filter by capacity (receiving vs delivering) or validate package size limits.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier: z.string().min(1).describe(
                    'Carrier slug (e.g. "fedex", "dhl", "estafeta", "ups"). Use envia_list_carriers for slugs.',
                ),
                country_code: z.string().length(2).optional().describe(
                    'ISO 3166-1 alpha-2 country code (e.g. "MX", "CO"). Resolved from locale when omitted.',
                ),
                locale: z.number().int().min(1).optional().describe(
                    'Numeric carrier locale ID. Resolves country code. Use if country_code is not known.',
                ),
                zip_code: z.string().optional().describe('Postal code to search near.'),
                city: z.string().optional().describe('City name to filter branches.'),
                state: z.string().optional().describe('State or province name.'),
                street: z.string().optional().describe('Street address for proximity search.'),
                street_number: z.string().optional().describe('Street number.'),
                service_name: z.string().optional().describe('Filter by specific carrier service name.'),
                capacity: z.enum(['1', '2', '3']).optional().describe(
                    'Branch capacity: "1"=receiving only, "2"=delivering only, "3"=both.',
                ),
                shipment_type: z.number().int().min(1).max(3).optional().describe(
                    'Shipment type: 1=parcel (default), 2=pallet, 3=full truck.',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                carrier: args.carrier.trim().toLowerCase(),
            };
            if (args.country_code) body.countryCodeCoverage = args.country_code.toUpperCase();
            if (args.locale) body.locale = args.locale;
            if (args.zip_code) body.zipCodeCoverage = args.zip_code.trim();
            if (args.city) body.cityCoverage = args.city.trim();
            if (args.state) body.stateCoverage = args.state.trim();
            if (args.street) body.streetCoverage = args.street.trim();
            if (args.street_number) body.numberCoverage = args.street_number.trim();
            if (args.service_name) body.serviceName = args.service_name.trim();
            if (args.capacity) body.capacity = Number(args.capacity);
            if (args.shipment_type) body.shipmentType = args.shipment_type;

            const url = `${config.shippingBase}/ship/branches`;
            const res = await activeClient.post<BranchResult[] | { data?: BranchResult[] }>(url, body);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            const raw = res.data;
            const branches: BranchResult[] = Array.isArray(raw)
                ? raw
                : Array.isArray((raw as { data?: BranchResult[] })?.data)
                    ? (raw as { data: BranchResult[] }).data
                    : [];

            if (branches.length === 0) {
                return textResponse(
                    `No branches found for ${args.carrier.toUpperCase()}` +
                    (args.country_code ? ` in ${args.country_code}` : '') +
                    (args.zip_code ? ` near ${args.zip_code}` : '') +
                    '. Try broadening the search (remove city/state filters).',
                );
            }

            const lines: string[] = [
                `Found ${branches.length} branch(es) for ${args.carrier.toUpperCase()}:`,
                '',
            ];
            for (let i = 0; i < branches.length; i++) {
                lines.push(formatBranch(branches[i], i + 1));
                lines.push('');
            }
            lines.push('Use the branch code in envia_create_shipment as branch_code to route the shipment to this location.');

            return textResponse(lines.join('\n'));
        },
    );
}
