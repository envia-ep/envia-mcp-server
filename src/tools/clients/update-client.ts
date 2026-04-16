/**
 * Tool: envia_update_client
 *
 * Updates an existing client's information, contact, and addresses.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { updateClientApi } from '../../services/clients.js';
import { validateAddressForCountry } from '../../services/generic-form.js';
import type { ClientMutationResponse } from '../../types/clients.js';

/**
 * Register the envia_update_client tool on the MCP server.
 */
export function registerUpdateClient(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_client',
        {
            description:
                'Update an existing client. Name is always required (API constraint). ' +
                'To update the existing contact, include contact.id. ' +
                'To update addresses, include billing_address.config_address_id. ' +
                'Setting use_billing_as_shipping=true deletes the shipping address.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                client_id: z.number().int().describe('Client ID to update'),
                name: z.string().min(1).max(255).describe('Client name (always required by API)'),
                client_type: z.enum(['independent', 'business', 'distributor']).optional(),
                external_ref: z.string().max(100).optional(),
                company_name: z.string().max(255).optional(),
                rfc: z.string().max(20).optional(),
                notes: z.string().optional(),
                contact: z.object({
                    id: z.number().int().optional().describe('Existing contact ID (to update instead of create)'),
                    full_name: z.string().min(1).max(255),
                    role: z.string().max(255).optional(),
                    email: z.string().email().optional(),
                    phone_code: z.string().max(10).optional(),
                    phone: z.string().max(50).optional(),
                }).optional().describe('Contact info (include id to update existing)'),
                billing_address: z.object({
                    config_address_id: z.number().int().optional().describe('Existing address ID (to update)'),
                    client_address_id: z.number().int().optional().describe('Link table ID (for update)'),
                    name: z.string().max(255).optional(),
                    company: z.string().max(255).optional(),
                    email: z.string().email().optional(),
                    phone_code: z.string().max(10).optional(),
                    phone: z.string().max(50).optional(),
                    street: z.string().max(255).optional(),
                    number: z.string().max(50).optional(),
                    district: z.string().max(255).optional(),
                    city: z.string().max(255).optional(),
                    state: z.string().max(100).optional(),
                    country: z.string().max(2).optional(),
                    postal_code: z.string().max(20).optional(),
                }).optional(),
                use_billing_as_shipping: z.boolean().optional()
                    .describe('True = delete shipping address and use billing'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const { api_key: _key, client_id, ...fields } = args;
            const body: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fields)) {
                if (value !== undefined) body[key] = value;
            }

            // Plan V1 §A.2 — validate the billing_address when present.
            // Note: this tool only exposes billing_address; shipping_address
            // is managed separately via use_billing_as_shipping flag.
            if (args.billing_address && typeof args.billing_address.country === 'string') {
                const validation = await validateAddressForCountry(
                    args.billing_address.country, args.billing_address, activeClient, config,
                );
                if (!validation.ok) {
                    return textResponse(`Failed to update client ${client_id}: billing_address — ${validation.errorMessage}`);
                }
            }

            const res = await updateClientApi<ClientMutationResponse>(
                activeClient, config, `/clients/${client_id}`, body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to update client ${client_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(`Client ${client_id} updated successfully.`);
        },
    );
}
