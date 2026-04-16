/**
 * Tool: envia_generate_bill_of_lading
 *
 * Generates a Bill of Lading PDF for a shipment. Required by some carriers
 * (e.g. Paquetexpress) as proof of receipt. Includes origin/destination
 * addresses, shipment reference, and package contents.
 *
 * IMPORTANT: packages[].declaredValue is required by the PHP runtime
 * (BOLPackage.php:25) even though it is not listed in the API schema.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';
import { generateBillOfLading } from '../../services/carriers-advanced.js';

/**
 * Register the envia_generate_bill_of_lading tool on the MCP server.
 */
export function registerGenerateBillOfLading(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_generate_bill_of_lading',
        {
            description:
                'Generate a Bill of Lading PDF for a shipment. Required by some carriers as proof of receipt. ' +
                'Provide origin/destination addresses, carrier, tracking number, and package details. ' +
                'Returns a PDF URL for the bill of lading document.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier: z.string().describe("Carrier code (e.g. 'dhl', 'fedex', 'paquetexpress')"),
                tracking_number: z.string().describe('Tracking number of the shipment'),
                // Origin address
                origin_name: z.string().describe('Sender name or company'),
                origin_street: z.string().describe('Sender street address'),
                origin_number: z.string().default('').describe('Sender exterior number'),
                origin_city: z.string().describe('Sender city'),
                origin_state: z.string().describe('Sender state code (e.g. NL, CX)'),
                origin_country: z.string().length(2).describe('Sender country code (ISO 3166-1 alpha-2)'),
                origin_postal_code: z.string().describe('Sender postal code'),
                // Destination address
                destination_name: z.string().describe('Recipient name or company'),
                destination_street: z.string().describe('Recipient street address'),
                destination_number: z.string().default('').describe('Recipient exterior number'),
                destination_city: z.string().describe('Recipient city'),
                destination_state: z.string().describe('Recipient state code'),
                destination_country: z.string().length(2).describe('Recipient country code (ISO 3166-1 alpha-2)'),
                destination_postal_code: z.string().describe('Recipient postal code'),
                // Package
                package_amount: z.number().int().min(1).default(1).describe('Number of packages'),
                package_cost: z.number().positive().describe('Shipping cost'),
                package_declared_value: z.number().positive()
                    .describe('Declared value for customs/insurance — required by carrier'),
                package_currency: z.string().length(3).default('MXN').describe('Currency code (e.g. MXN, USD)'),
                package_weight: z.number().positive().describe('Total weight in kg'),
                package_cubic_meters: z.number().positive().describe('Volume in cubic meters'),
                // Items
                items: z.array(z.object({
                    description: z.string().describe('Product description'),
                    quantity: z.number().int().min(1).describe('Quantity'),
                    price: z.number().positive().describe('Unit price'),
                })).min(1).describe('Contents of the shipment'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key as string, config);

            const body = {
                origin: {
                    name: args.origin_name,
                    street: args.origin_street,
                    number: args.origin_number,
                    city: args.origin_city,
                    state: args.origin_state,
                    country: args.origin_country,
                    postalCode: args.origin_postal_code,
                },
                destination: {
                    name: args.destination_name,
                    street: args.destination_street,
                    number: args.destination_number,
                    city: args.destination_city,
                    state: args.destination_state,
                    country: args.destination_country,
                    postalCode: args.destination_postal_code,
                },
                shipment: {
                    carrier: args.carrier,
                    trackingNumber: args.tracking_number,
                },
                packages: [
                    {
                        amount: args.package_amount,
                        cost: args.package_cost,
                        declaredValue: args.package_declared_value,
                        currency: args.package_currency,
                        cubicMeters: args.package_cubic_meters,
                        totalWeight: args.package_weight,
                        items: (args.items as Array<{ description: string; quantity: number; price: number }>).map((item) => ({
                            description: item.description,
                            quantity: item.quantity,
                            price: item.price,
                        })),
                    },
                ],
            };

            const res = await generateBillOfLading(activeClient, config, body);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Bill of lading generation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data?.data;
            if (!data) {
                return textResponse('Bill of lading generated but response contained no data.');
            }

            const lines: string[] = [
                'Bill of lading generated successfully.',
                '',
                `  Carrier:         ${data.carrier}`,
                `  Tracking number: ${data.trackingNumber}`,
                `  PDF URL:         ${data.billOfLading}`,
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
