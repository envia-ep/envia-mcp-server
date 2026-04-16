/**
 * Tool: envia_update_order_address
 *
 * Updates the shipping or billing address on an ecommerce order.
 * Many fields that appear optional actually require at least an empty string
 * per the Joi validation on the backend. The schema reflects this accurately.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { updateOrderApi } from '../../services/orders.js';
import { validateAddressForCountry } from '../../services/generic-form.js';

/**
 * Register the envia_update_order_address tool on the MCP server.
 */
export function registerUpdateOrderAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_update_order_address',
        {
            description:
                'Update the shipping or billing address on an ecommerce order. ' +
                'Requires shop_id and order_id (get them from envia_list_orders). ' +
                'address_type_id: 1=Billing, 2=Shipping (most common), 3=Origin. ' +
                'Fields address2, address3, phone_code, identification_number, and references ' +
                'are required by the backend but accept an empty string.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                shop_id: z.number().int().min(1).describe('Store ID (from envia_list_shops)'),
                order_id: z.number().int().min(1).describe('Order ID (from envia_list_orders)'),
                address_type_id: z.number().int().min(1).max(3)
                    .describe('Address type: 1=Billing, 2=Shipping, 3=Origin'),
                first_name: z.string().min(1).describe('First name'),
                last_name: z.string().default('').describe('Last name (accepts empty string)'),
                address1: z.string().min(1).describe('Street address line 1'),
                address2: z.string().default('').describe('Address line 2 (accepts empty string)'),
                address3: z.string().default('').describe('Address line 3 / street number (accepts empty string)'),
                country_code: z.string().max(2).describe('Country ISO code (e.g. "MX")'),
                state_code: z.string().max(4).describe('State/province code (e.g. "CX")'),
                city: z.string().min(1).describe('City'),
                postal_code: z.string().default('').describe('Postal/ZIP code (accepts empty string)'),
                phone: z.string().min(1).describe('Phone number'),
                phone_code: z.string().default('').describe('Phone country code (e.g. "MX", accepts empty string)'),
                identification_number: z.string().default('')
                    .describe('National ID / tax ID (e.g. CPF, RFC — accepts empty string)'),
                references: z.string().default('')
                    .describe('Delivery reference notes (accepts empty string)'),
                package_id: z.number().int().min(1).optional()
                    .describe('Package ID — required only when address_type_id=3 (Origin)'),
                company: z.string().optional().describe('Company name (optional)'),
                interior_number: z.string().optional().describe('Interior/apartment number (optional)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: Record<string, unknown> = {
                address_type_id: args.address_type_id,
                first_name: args.first_name,
                last_name: args.last_name,
                address1: args.address1,
                address2: args.address2,
                address3: args.address3,
                country_code: args.country_code,
                state_code: args.state_code,
                city: args.city,
                postal_code: args.postal_code,
                phone: args.phone,
                phone_code: args.phone_code,
                identification_number: args.identification_number,
                references: args.references,
            };
            if (args.package_id !== undefined) body.package_id = args.package_id;
            if (args.company !== undefined) body.company = args.company;
            if (args.interior_number !== undefined) body.interior_number = args.interior_number;

            // Plan V1 §A.2 — translate the order-specific field names
            // (`address1`, `state_code`, ...) into the tool-param vocabulary
            // the generic-form validator expects, then check completeness.
            const addressForValidation: Record<string, unknown> = {
                street: args.address1,
                number: args.address2,
                interior_number: args.address3,
                city: args.city,
                state: args.state_code,
                postal_code: args.postal_code,
                identification_number: args.identification_number,
                reference: args.references,
            };
            const validation = await validateAddressForCountry(
                args.country_code, addressForValidation, activeClient, config,
            );
            if (!validation.ok) {
                return textResponse(`Failed to update order address: ${validation.errorMessage}`);
            }

            const path = `/orders/${args.shop_id}/${args.order_id}/address`;
            const res = await updateOrderApi(activeClient, config, path, body);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to update order address: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const typeLabel = args.address_type_id === 1
                ? 'Billing'
                : args.address_type_id === 2
                    ? 'Shipping'
                    : 'Origin';

            return textResponse(
                `${typeLabel} address updated successfully for order ${args.order_id} (shop ${args.shop_id}).\n` +
                `  Name: ${args.first_name} ${args.last_name}\n` +
                `  Address: ${args.address1}, ${args.city}, ${args.state_code} ${args.postal_code}, ${args.country_code}`,
            );
        },
    );
}
