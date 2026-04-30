/**
 * Tool: envia_list_addresses
 *
 * Lists saved addresses for the authenticated user/company.
 * Supports filtering by type (origin/destination), search, sorting, and pagination.
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
import type { AddressListResponse } from '../../types/addresses.js';

/**
 * Register the envia_list_addresses tool on the MCP server.
 */
export function registerListAddresses(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_addresses',
        {
            description:
                'List saved addresses (the company address book). Use whenever the user asks ' +
                '"show my saved addresses", "list my origin/destination addresses", ' +
                '"what is my default origin?" (the default flag is surfaced with a ★ marker), ' +
                'or "find my address in <city>". Filter by type_id (1=origin, 2=destination), ' +
                'free-text search across name/street/city, sort, and paginate. ' +
                'When NOT to use: ' +
                '(a) creating, editing, or deleting an address → use envia_create_address / ' +
                'envia_update_address / envia_delete_address; ' +
                '(b) live address validation against postal-code databases → use ' +
                'envia_validate_address; ' +
                '(c) one-shot address parsing from a free-text string → use envia_ai_parse_address.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type: z.enum(['origin', 'destination']).describe('Address type to list'),
                search: z.string().optional().describe('Search by name, street, city, or full address'),
                sort_by: z.enum(['name', 'street', 'city', 'full_address']).optional().describe('Sort field'),
                sort_direction: z.enum(['asc', 'desc']).default('asc').describe('Sort direction'),
                country: z.string().max(2).optional().describe('Filter by country code (ISO 2)'),
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
            if (args.sort_by) params.sort_by = args.sort_by;
            if (args.sort_direction) params.sort_direction = args.sort_direction;
            if (args.country) params.country = args.country;

            const res = await queryAddressesApi<AddressListResponse>(
                activeClient, config, `/all-addresses/${args.type}`, params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list addresses: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const addresses = Array.isArray(res.data?.data) ? res.data.data : [];
            if (addresses.length === 0) {
                return textResponse(`No ${args.type} addresses found matching the specified filters.`);
            }

            const lines: string[] = [
                `Found ${res.data.total ?? addresses.length} ${args.type} address(es) (page ${args.page}):`,
                '',
            ];

            for (const addr of addresses) {
                const flags = [
                    addr.is_default ? '★ default' : '',
                    addr.is_favorite ? '♥ favorite' : '',
                ].filter(Boolean).join(' ');

                lines.push(
                    `• [${addr.address_id}] ${addr.name ?? '—'}${flags ? ` (${flags})` : ''}`,
                );
                lines.push(`  ${formatAddressLine(addr)}`);
                if (addr.email || addr.phone) {
                    lines.push(`  Contact: ${[addr.email, addr.phone].filter(Boolean).join(' · ')}`);
                }
                lines.push('');
            }

            lines.push('Use envia_create_address to add a new address, or envia_update_address to modify one.');

            return textResponse(lines.join('\n'));
        },
    );
}
