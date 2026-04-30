/**
 * Tool: envia_list_clients
 *
 * Lists clients for the authenticated company with search, type filter,
 * sorting, and pagination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryClientsApi, formatClientAddress, formatClientContact } from '../../services/clients.js';
import type { ClientListResponse } from '../../types/clients.js';

/**
 * Register the envia_list_clients tool on the MCP server.
 */
export function registerListClients(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_clients',
        {
            description:
                'List the company client book. Use whenever the user asks "show my clients", ' +
                '"list customers", "find my client named X", "filter clients by business/distributor", ' +
                'or needs the client_id required to create a shipment for a saved client. Filter by ' +
                'client_type (independent / business / distributor), search by name / email / phone / ' +
                'external_ref, sort, and paginate. Returns contact and address summaries per client. ' +
                'When NOT to use: ' +
                '(a) creating, editing, or deleting a client → use envia_create_client / ' +
                'envia_update_client / envia_delete_client; ' +
                '(b) ecommerce orders linked to a client (different concept — an order is a purchase, ' +
                'a client is a saved person/company) → use envia_list_orders.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                search: z.string().optional().describe('Search by name, company, contact email/phone, or external ref'),
                client_type: z.enum(['independent', 'business', 'distributor']).optional()
                    .describe('Filter by client type'),
                sort_by: z.enum(['name', 'external_ref', 'created_at', 'client_type', 'contact_email']).optional()
                    .describe('Sort field'),
                sort_direction: z.enum(['ASC', 'DESC']).optional().describe('Sort direction'),
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
            if (args.client_type) params.client_type = args.client_type;
            if (args.sort_by) params.sort_by = args.sort_by;
            if (args.sort_direction) params.sort_direction = args.sort_direction;

            const res = await queryClientsApi<ClientListResponse>(
                activeClient, config, '/clients', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list clients: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const clients = Array.isArray(res.data?.data) ? res.data.data : [];
            if (clients.length === 0) {
                return textResponse('No clients found matching the specified filters.');
            }

            const lines: string[] = [
                `Found ${res.data.total ?? clients.length} client(s) (page ${args.page}):`,
                '',
            ];

            for (const c of clients) {
                lines.push(
                    `• [${c.id}] ${c.name ?? '—'} — ${c.client_type ?? 'independent'}${c.company_name ? ` (${c.company_name})` : ''}`,
                );
                lines.push(`  Contact: ${formatClientContact(c.contact)}`);
                lines.push(`  Billing: ${formatClientAddress(c.billing_address)}`);
                if (c.external_ref) lines.push(`  External ref: ${c.external_ref}`);
                lines.push('');
            }

            lines.push('Use envia_get_client_detail with a client ID for full details.');

            return textResponse(lines.join('\n'));
        },
    );
}
