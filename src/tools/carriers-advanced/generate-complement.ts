/**
 * Tool: envia_generate_complement
 *
 * Adds SAT Carta Porte complement data to one or more shipments for Mexico.
 * Required by the SAT (Mexico's tax authority) for domestic road freight.
 * Only supported by carriers that have SAT Carta Porte integration (DHL MX, FedEx MX, etc.).
 *
 * CRITICAL: The request body sent to the API is a TOP-LEVEL ARRAY, not a wrapped object.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';
import { generateComplement } from '../../services/carriers-advanced.js';
import type { ComplementEntry } from '../../types/carriers-advanced.js';

/**
 * Register the envia_generate_complement tool on the MCP server.
 */
export function registerGenerateComplement(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_generate_complement',
        {
            description:
                'Add SAT Carta Porte complement data to shipments for Mexico. ' +
                'Required by the SAT (tax authority) for domestic road freight. ' +
                'Only supported by carriers with Carta Porte integration (DHL MX, FedEx MX). ' +
                'Provide SAT product codes, weight units, and packaging types per item.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                shipments: z.array(z.object({
                    shipment_id: z.number().int().positive().describe('Numeric shipment ID'),
                    items: z.array(z.object({
                        product_description: z.string().nullable().optional().describe('Product description'),
                        product_code: z.string().nullable().optional()
                            .describe("SAT catalog code (e.g. '10191510' for electronics)"),
                        weight_unit: z.string().nullable().optional()
                            .describe("SAT unit code (e.g. 'XBX' for box, 'KGM' for kg)"),
                        packaging_type: z.string().nullable().optional()
                            .describe("SAT packaging code (e.g. '1A' steel drum, '4G' fibreboard box)"),
                        quantity: z.number().int().min(0).nullable().optional().describe('Quantity of units'),
                        unit_price: z.number().min(0).nullable().optional().describe('Price per unit'),
                    })).min(1).describe('Items in this shipment'),
                })).min(1).describe('One or more shipments to add SAT complement data to'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key as string, config);

            type RawShipment = {
                shipment_id: number;
                items: Array<{
                    product_description?: string | null;
                    product_code?: string | null;
                    weight_unit?: string | null;
                    packaging_type?: string | null;
                    quantity?: number | null;
                    unit_price?: number | null;
                }>;
            };

            const entries: ComplementEntry[] = (args.shipments as RawShipment[]).map((s) => ({
                shipmentId: s.shipment_id,
                bolComplement: s.items.map((item) => ({
                    productDescription: item.product_description ?? null,
                    productCode: item.product_code ?? null,
                    weightUnit: item.weight_unit ?? null,
                    packagingType: item.packaging_type ?? null,
                    quantity: item.quantity ?? null,
                    unitPrice: item.unit_price ?? null,
                })),
            }));

            const res = await generateComplement(activeClient, config, entries);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Complement generation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const lines: string[] = [
                'SAT Carta Porte complement submitted successfully.',
                '',
                `  Shipments updated: ${entries.length}`,
                `  Total items:       ${entries.reduce((sum, e) => sum + e.bolComplement.length, 0)}`,
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
