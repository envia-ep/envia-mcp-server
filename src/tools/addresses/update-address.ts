/**
 * Tool: envia_update_address
 *
 * Updates an existing saved address. All fields are optional except address_id.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { updateAddressApi } from '../../services/addresses.js';
import { validateAddressForCountry } from '../../services/generic-form.js';
import type { AddressMutationResponse } from '../../types/addresses.js';

/**
 * Register the envia_update_address tool on the MCP server.
 */
export function registerUpdateAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_address',
        {
            description:
                'Update an existing saved address. Provide address_id and any fields to change. ' +
                'Only provided fields are updated — omitted fields remain unchanged.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                address_id: z.number().int().describe('ID of the address to update'),
                name: z.string().max(255).optional().describe('Contact name'),
                company: z.string().max(255).optional().describe('Company name'),
                email: z.string().email().optional().describe('Email address'),
                phone: z.string().max(50).optional().describe('Phone number'),
                phone_code: z.string().max(10).optional().describe('Phone country code'),
                street: z.string().max(255).optional().describe('Street name'),
                number: z.string().max(50).optional().describe('Street number'),
                district: z.string().max(255).optional().describe('District/neighborhood'),
                interior_number: z.string().max(100).optional().describe('Interior/apt number'),
                city: z.string().max(255).optional().describe('City name'),
                state: z.string().max(4).optional().describe('State code'),
                country: z.string().length(2).optional().describe('Country code (ISO 2)'),
                postal_code: z.string().max(20).optional().describe('Postal code'),
                identification_number: z.string().max(100).optional().describe('National ID (CPF/NIT/DNI)'),
                reference: z.string().optional().describe('Delivery reference'),
                alias: z.string().max(20).optional().describe('Short alias'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const { api_key: _key, address_id, ...fields } = args;
            const body: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fields)) {
                if (value !== undefined) body[key] = value;
            }

            // Plan V1 §A.2 — validate against country-specific generic-form rules
            // only when the update includes country data (otherwise we cannot
            // fetch the correct form definition).
            if (typeof args.country === 'string') {
                const validation = await validateAddressForCountry(args.country, body, activeClient, config);
                if (!validation.ok) {
                    return textResponse(`Failed to update address ${address_id}: ${validation.errorMessage}`);
                }
            }

            const res = await updateAddressApi<AddressMutationResponse>(
                activeClient, config, `/user-address/${address_id}`, body,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to update address ${address_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const updatedFields = Object.keys(body).join(', ') || 'none';
            return textResponse(
                `Address ${address_id} updated successfully.\nUpdated fields: ${updatedFields}`,
            );
        },
    );
}
