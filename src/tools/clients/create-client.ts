/**
 * Tool: envia_create_client
 *
 * Creates a new client with optional contact and address information.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateClientApi } from '../../services/clients.js';
import { validateAddressForCountry } from '../../services/generic-form.js';
import type { CreateClientResponse } from '../../types/clients.js';

const addressSchema = z.object({
    name: z.string().max(255).optional(),
    company: z.string().max(255).optional(),
    email: z.string().email().optional(),
    phone_code: z.string().max(10).optional(),
    phone: z.string().max(50).optional(),
    street: z.string().max(255).optional(),
    number: z.string().max(50).optional(),
    district: z.string().max(255).optional(),
    interior_number: z.string().max(100).optional(),
    city: z.string().max(255).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(2).optional(),
    postal_code: z.string().max(20).optional(),
    identification_number: z.string().max(100).optional(),
    reference: z.string().optional(),
}).optional();

/**
 * Register the envia_create_client tool on the MCP server.
 */
export function registerCreateClient(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_client',
        {
            description:
                'Create a new client. Requires name and contact.full_name. ' +
                'Client types: independent (persona fisica), business (empresa), distributor. ' +
                'Optionally include billing_address, shipping_address, and use_billing_as_shipping.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                name: z.string().min(1).max(255).describe('Client name'),
                client_type: z.enum(['independent', 'business', 'distributor']).default('independent')
                    .describe('Client type'),
                external_ref: z.string().max(100).optional().describe('External reference ID'),
                company_name: z.string().max(255).optional().describe('Company name (for business type)'),
                rfc: z.string().max(20).optional().describe('RFC/Tax ID'),
                notes: z.string().optional().describe('Notes about the client'),
                contact: z.object({
                    full_name: z.string().min(1).max(255).describe('Contact full name'),
                    role: z.string().max(255).optional().describe('Contact role'),
                    email: z.string().email().optional().describe('Contact email'),
                    phone_code: z.string().max(10).optional().describe('Phone country code'),
                    phone: z.string().max(50).optional().describe('Phone number'),
                    landline_code: z.string().max(10).optional().describe('Landline country code'),
                    landline: z.string().max(50).optional().describe('Landline number'),
                }).describe('Primary contact (required)'),
                billing_address: addressSchema.describe('Billing address'),
                shipping_address: addressSchema.describe('Shipping address'),
                use_billing_as_shipping: z.boolean().default(false)
                    .describe('Use billing address as shipping address'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                name: args.name,
                client_type: args.client_type,
                contact: args.contact,
                use_billing_as_shipping: args.use_billing_as_shipping,
            };

            if (args.external_ref) body.external_ref = args.external_ref;
            if (args.company_name) body.company_name = args.company_name;
            if (args.rfc) body.rfc = args.rfc;
            if (args.notes) body.notes = args.notes;
            if (args.billing_address) body.billing_address = args.billing_address;
            if (args.shipping_address) body.shipping_address = args.shipping_address;

            // Plan V1 §A.2 — validate each embedded address against its country.
            // Clients may have billing and shipping addresses in different
            // countries; we validate each independently when country is present.
            for (const [label, addr] of [
                ['billing_address', args.billing_address],
                ['shipping_address', args.shipping_address],
            ] as const) {
                if (!addr || typeof addr.country !== 'string') continue;
                const validation = await validateAddressForCountry(addr.country, addr, activeClient, config);
                if (!validation.ok) {
                    return textResponse(`Failed to create client: ${label} — ${validation.errorMessage}`);
                }
            }

            const res = await mutateClientApi<CreateClientResponse>(
                activeClient, config, '/clients', body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to create client: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Client created successfully.\n` +
                `  ID: ${res.data.id}\n` +
                `  Name: ${args.name}\n` +
                `  Type: ${args.client_type}\n` +
                `  Contact: ${args.contact.full_name}`,
            );
        },
    );
}
