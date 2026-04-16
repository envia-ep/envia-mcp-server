/**
 * Tool: envia_get_client_detail
 *
 * Retrieves full details for a single client including contact,
 * billing address, and shipping address.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryClientsApi, formatClientAddress } from '../../services/clients.js';
import type { ClientDetailResponse } from '../../types/clients.js';

/**
 * Register the envia_get_client_detail tool on the MCP server.
 */
export function registerGetClientDetail(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_client_detail',
        {
            description:
                'Get full details for a client by ID. Includes contact info, billing address, ' +
                'shipping address, external reference, and notes.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                client_id: z.number().int().describe('Client ID'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryClientsApi<ClientDetailResponse>(
                activeClient, config, `/clients/${args.client_id}`,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get client ${args.client_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const c = res.data?.data;
            if (!c) {
                return textResponse(`Client ${args.client_id} not found.`);
            }

            const lines: string[] = [
                `Client #${c.id}: ${c.name ?? '—'}`,
                `  Type: ${c.client_type ?? 'independent'}`,
            ];

            if (c.company_name) lines.push(`  Company: ${c.company_name}`);
            if (c.rfc) lines.push(`  RFC/Tax ID: ${c.rfc}`);
            if (c.external_ref) lines.push(`  External ref: ${c.external_ref}`);
            if (c.notes) lines.push(`  Notes: ${c.notes}`);
            lines.push(`  Created: ${c.created_at ?? '—'}`);

            // Contact
            lines.push('');
            if (c.contact) {
                lines.push('Contact:');
                lines.push(`  Name: ${c.contact.full_name ?? '—'}`);
                if (c.contact.role) lines.push(`  Role: ${c.contact.role}`);
                if (c.contact.email) lines.push(`  Email: ${c.contact.email}`);
                if (c.contact.phone) lines.push(`  Phone: ${c.contact.phone_code ? `+${c.contact.phone_code} ` : ''}${c.contact.phone}`);
                if (c.contact.landline) lines.push(`  Landline: ${c.contact.landline}`);
                if (c.contact.preferred_channel) lines.push(`  Preferred channel: ${c.contact.preferred_channel}`);
            } else {
                lines.push('Contact: none');
            }

            // Addresses
            lines.push('');
            lines.push(`Billing address: ${formatClientAddress(c.billing_address)}`);
            if (c.use_billing_as_shipping) {
                lines.push('Shipping address: same as billing');
            } else {
                lines.push(`Shipping address: ${formatClientAddress(c.shipping_address)}`);
            }

            return textResponse(lines.join('\n'));
        },
    );
}
