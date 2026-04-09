/**
 * Tool: envia_create_commercial_invoice
 *
 * Generates a commercial invoice PDF for international shipments.
 * Required by customs for cross-border shipments.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { countrySchema, carrierSchema, requiredApiKeySchema } from '../utils/schemas.js';
import { buildGenerateAddress } from '../builders/address.js';

interface InvoiceData {
    invoiceId?: string;
    invoiceUrl?: string;
    invoiceNumber?: string;
}

export function registerCreateCommercialInvoice(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        "envia_create_commercial_invoice",
        {
            description:
                "Generate a commercial invoice PDF for an international shipment. " +
                "Customs authorities require this document for cross-border shipments. " +
                "Provide origin/destination, item details (description, HS code, quantity, price), and export reason.",
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                // Origin
                origin_name: z.string().describe("Shipper / exporter full name"),
                origin_phone: z.string().describe("Shipper phone number"),
                origin_street: z.string().describe("Shipper street address"),
                origin_city: z.string().describe("Shipper city"),
                origin_state: z.string().describe("Shipper state / province code"),
                origin_country: countrySchema.describe("Shipper country (ISO 3166-1 alpha-2, e.g. MX)"),
                origin_postal_code: z.string().describe("Shipper postal / ZIP code"),

                // Destination
                destination_name: z.string().describe("Recipient / importer full name"),
                destination_phone: z.string().describe("Recipient phone number"),
                destination_street: z.string().describe("Recipient street address"),
                destination_city: z.string().describe("Recipient city"),
                destination_state: z.string().describe("Recipient state / province code"),
                destination_country: countrySchema.describe("Recipient country (ISO 3166-1 alpha-2)"),
                destination_postal_code: z.string().describe("Recipient postal / ZIP code"),

                // Carrier
                carrier: carrierSchema.describe("Carrier code (e.g. 'dhl', 'fedex')"),

                // Items — flat for simplicity; the tool wraps them into the API structure
                item_description: z.string().describe("Item description (e.g. 'Cotton T-shirts')"),
                item_hs_code: z.string().describe("HS code for the item (use envia_classify_hscode to find it)"),
                item_quantity: z.number().int().positive().describe("Number of units"),
                item_unit_price: z.number().positive().describe("Price per unit in origin currency"),
                item_country_of_manufacture: countrySchema.describe("Country where the item was manufactured (ISO code)"),

                // Customs
                export_reason: z
                    .string()
                    .default("sale")
                    .describe("Reason for export: 'sale' (default), 'gift', 'sample', 'return', 'repair'"),
                duties_payment: z
                    .string()
                    .default("sender")
                    .describe("Who pays duties: 'sender' (default), 'recipient', 'envia_guaranteed'"),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const body = {
                origin: buildGenerateAddress({
                    name: args.origin_name,
                    street: args.origin_street,
                    city: args.origin_city,
                    state: args.origin_state,
                    country: args.origin_country,
                    postalCode: args.origin_postal_code,
                    phone: args.origin_phone,
                }),
                destination: buildGenerateAddress({
                    name: args.destination_name,
                    street: args.destination_street,
                    city: args.destination_city,
                    state: args.destination_state,
                    country: args.destination_country,
                    postalCode: args.destination_postal_code,
                    phone: args.destination_phone,
                }),
                shipment: {
                    type: 1,
                    carrier: args.carrier.trim().toLowerCase(),
                },
                packages: [
                    {
                        type: "box",
                        content: args.item_description,
                        amount: 1,
                        weight: 1,
                        weightUnit: "KG",
                        lengthUnit: "CM",
                        dimensions: { length: 10, width: 10, height: 10 },
                        items: [
                            {
                                description: args.item_description,
                                hsCode: args.item_hs_code,
                                quantity: args.item_quantity,
                                price: args.item_unit_price,
                                countryOfManufacture: args.item_country_of_manufacture.trim().toUpperCase(),
                            },
                        ],
                    },
                ],
                customsSettings: {
                    dutiesPaymentEntity: args.duties_payment,
                    exportReason: args.export_reason,
                },
            };

            const url = `${config.shippingBase}/ship/commercial-invoice`;
            const res = await activeClient.post<{ data: InvoiceData }>(url, body);

            if (!res.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Commercial invoice creation failed: ${res.error}\n\nTip: Verify the HS code with envia_classify_hscode, and ensure all address fields are complete.`,
                        },
                    ],
                };
            }

            const data = res.data?.data;
            const lines: string[] = ["Commercial invoice created successfully!", ""];

            if (data) {
                if (data.invoiceNumber) lines.push(`  Invoice #:    ${data.invoiceNumber}`);
                if (data.invoiceUrl) lines.push(`  Invoice PDF:  ${data.invoiceUrl}`);
                if (data.invoiceId) lines.push(`  Invoice ID:   ${data.invoiceId}`);
            }

            lines.push(
                "",
                "Next steps:",
                "  • Download and print the invoice PDF",
                "  • Attach it to the outside of the package (with the shipping label)",
                "  • Use create_shipment to generate the shipping label",
            );

            return { content: [{ type: "text", text: lines.join("\n") }] };
        },
    );
}
