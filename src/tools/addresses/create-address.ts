/**
 * Tool: envia_create_address
 *
 * Creates a new saved address for the authenticated user.
 * Supports origin and destination types with full address fields.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema, countrySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateAddressApi } from '../../services/addresses.js';
import { validateAddressForCountry } from '../../services/generic-form.js';
import type { CreateAddressResponse } from '../../types/addresses.js';

/**
 * Register the envia_create_address tool on the MCP server.
 */
export function registerCreateAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_address',
        {
            description:
                'Create a new saved address. Requires name, phone, street, city, state, country, postal_code, and type. ' +
                'For Brazil: include identification_number (CPF/CNPJ). ' +
                'For Colombia: include identification_number (NIT). ' +
                'State must be max 4 characters (state code, e.g. "CX" for CDMX).',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type: z.number().int().min(1).max(2).describe('1=Origin, 2=Destination'),
                name: z.string().min(1).max(255).describe('Contact name'),
                company: z.string().max(255).optional().describe('Company name'),
                email: z.string().email().optional().describe('Email address'),
                phone: z.string().min(1).max(50).describe('Phone number'),
                phone_code: z.string().max(10).optional().describe('Phone country code (e.g. "MX")'),
                street: z.string().min(1).max(255).describe('Street name'),
                number: z.string().max(50).optional().describe('Street number'),
                district: z.string().max(255).optional().describe('District/neighborhood/colonia'),
                interior_number: z.string().max(100).optional().describe('Interior/apt number'),
                city: z.string().min(1).max(255).describe('City name'),
                state: z.string().min(1).max(4).describe('State code (max 4 chars, e.g. "CX", "NL")'),
                country: countrySchema.describe('Country code (ISO 2, e.g. "MX", "US", "CO")'),
                postal_code: z.string().min(1).max(20).describe('Postal code'),
                identification_number: z.string().max(100).optional()
                    .describe('National ID: CPF/CNPJ (BR), NIT (CO), DNI/NIE (ES)'),
                reference: z.string().optional().describe('Delivery reference/instructions'),
                category_id: z.number().int().optional().describe('1=Office, 2=Residential, 3=Other'),
                alias: z.string().max(20).optional().describe('Short alias for the address (max 20 chars)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                type: args.type,
                name: args.name,
                phone: args.phone,
                street: args.street,
                city: args.city,
                state: args.state,
                country: args.country,
                postal_code: args.postal_code,
            };

            if (args.company) body.company = args.company;
            if (args.email) body.email = args.email;
            if (args.phone_code) body.phone_code = args.phone_code;
            if (args.number) body.number = args.number;
            if (args.district) body.district = args.district;
            if (args.interior_number) body.interior_number = args.interior_number;
            if (args.identification_number) body.identification_number = args.identification_number;
            if (args.reference) body.reference = args.reference;
            if (args.category_id) body.category_id = args.category_id;
            if (args.alias) body.alias = args.alias;

            // Plan V1 §A.2 — validate against country-specific generic-form rules
            // BEFORE persisting. Prevents saving incomplete addresses that would
            // later break rate/generate flows.
            const validation = await validateAddressForCountry(args.country, body, activeClient, config);
            if (!validation.ok) {
                return textResponse(`Failed to create address: ${validation.errorMessage}`);
            }

            const res = await mutateAddressApi<CreateAddressResponse>(
                activeClient, config, '/user-address', body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to create address: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const typeName = args.type === 1 ? 'origin' : 'destination';
            return textResponse(
                `Address created successfully.\n` +
                `  ID: ${res.data.id}\n` +
                `  Type: ${typeName}\n` +
                `  Name: ${args.name}\n` +
                `  Location: ${args.street} ${args.number ?? ''}, ${args.city}, ${args.state}, ${args.country} ${args.postal_code}`,
            );
        },
    );
}
