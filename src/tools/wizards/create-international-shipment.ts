/**
 * Tool: envia_create_international_shipment
 *
 * Pre-flight wizard for international (cross-border) shipments. Composes the
 * three-step orchestration that the LLM repeatedly fails to assemble on its
 * own (observed in chat logs as 6+ turn loops on MX→US flows):
 *
 *   1. Fetch the destination country's authoritative address requirements
 *      (which fields are mandatory vs optional, country-specific quirks).
 *   2. Auto-classify HS / NCM codes for any item that ships without a
 *      productCode set — required by every customs broker for cross-border.
 *   3. Validate that the caller has supplied enough sender / recipient data
 *      to satisfy the destination country's rules.
 *
 * The tool does NOT itself create the label — it returns an enriched, ready-
 * to-call payload plus a clear "next step" instruction. The LLM then issues
 * a single envia_create_shipment call with the validated payload, instead of
 * iterating trial-and-error to discover missing fields. This is a Pase 3
 * deliverable from the Tool Consolidation Audit (2026-04-29).
 *
 * Design note: implementing a real one-shot wizard that itself POSTs
 * /ship/generate would require duplicating ~1,000 LOC of envia_create_shipment
 * orchestration (carriers / fulfillment / DCe / tax). Instead we wrap the
 * pre-flight knowledge in a small focused tool and rely on the existing
 * envia_create_shipment for the actual mutation. Future work may collapse
 * the two by extracting a shared service layer (see
 * _docs/TOOL_CONSOLIDATION_BREAKING_CHANGES.md, "Pase 3 — Wizard").
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { countrySchema, requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';

/** Single line item to be classified for customs and shipped internationally. */
interface InputItem {
    description: string;
    quantity: number;
    price: number;
    productCode?: string;
    countryOfOrigin?: string;
    currency?: string;
}

/** Enriched item after HS-code classification step. */
interface EnrichedItem extends InputItem {
    productCode: string;
    hsCodeSource: 'provided' | 'classified' | 'unknown';
    hsCodeConfidence?: number;
}

/** Internal: fetch authoritative address requirements for a destination. */
async function fetchAddressRequirements(
    client: EnviaApiClient,
    config: EnviaConfig,
    country: string,
): Promise<{ ok: boolean; raw?: unknown; error?: string }> {
    const url = `${config.queriesBase}/ai/shipping/address-requirements/${encodeURIComponent(country)}`;
    const res = await client.get<unknown>(url);
    if (!res.ok) {
        const mapped = mapCarrierError(res.status, res.error ?? '');
        return { ok: false, error: mapped.userMessage };
    }
    return { ok: true, raw: res.data };
}

/** Internal: classify a single item description into an HS code. */
async function classifySingleItem(
    client: EnviaApiClient,
    config: EnviaConfig,
    description: string,
    destinationCountry: string,
): Promise<{ hsCode?: string; confidence?: number }> {
    const url = `${config.queriesBase}/ai/shipping/classify-hs-code`;
    const body = { description, country_destination: destinationCountry };
    const res = await client.post<{ data?: { hsCode?: string; confidenceScore?: number } }>(url, body);
    if (!res.ok || !res.data?.data) return {};
    return {
        hsCode: res.data.data.hsCode,
        confidence: res.data.data.confidenceScore,
    };
}

/** Internal: enrich items in parallel, classifying any missing productCode. */
async function enrichItems(
    client: EnviaApiClient,
    config: EnviaConfig,
    items: InputItem[],
    destinationCountry: string,
): Promise<EnrichedItem[]> {
    const tasks = items.map(async (item): Promise<EnrichedItem> => {
        if (item.productCode) {
            return { ...item, productCode: item.productCode, hsCodeSource: 'provided' };
        }
        const result = await classifySingleItem(client, config, item.description, destinationCountry);
        if (result.hsCode) {
            return {
                ...item,
                productCode: result.hsCode,
                hsCodeSource: 'classified',
                hsCodeConfidence: result.confidence,
            };
        }
        return { ...item, productCode: '', hsCodeSource: 'unknown' };
    });
    return Promise.all(tasks);
}

/** Public: register the wizard on the given MCP server. */
export function registerCreateInternationalShipment(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_international_shipment',
        {
            description:
                'Cross-border shipment pre-flight wizard. Use this BEFORE envia_create_shipment ' +
                'whenever the destination country differs from the origin country (MX→US, MX→ES, ' +
                'CO→US, BR→DE, etc.) or when the user says "international", "cross-border", ' +
                '"customs", "envío internacional", "exportación". The tool: ' +
                '(1) fetches the destination country\'s authoritative address requirements, ' +
                '(2) auto-classifies HS / NCM codes for any item that ships without a productCode, ' +
                '(3) returns a single ready-to-call payload plus a list of any still-missing fields. ' +
                'Calling this tool replaces the trial-and-error loop where the LLM iterates 6+ ' +
                'turns asking the user for fields it could have discovered up-front. ' +
                'After this tool succeeds, issue a single envia_create_shipment call with the ' +
                'returned payload. ' +
                'When NOT to use: ' +
                '(a) domestic shipment within one country (no customs needed) → call ' +
                'envia_quote_shipment + envia_create_shipment directly; ' +
                '(b) you only need to compare rates → use envia_quote_shipment; ' +
                '(c) you only need to classify a product description → use envia_classify_hscode; ' +
                '(d) you only need address requirements for a country → use ' +
                'envia_ai_address_requirements.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                origin_country: countrySchema.describe(
                    'Origin ISO country (e.g. MX). Defaults to MX if omitted.',
                ).default('MX'),
                destination_country: countrySchema.describe(
                    'Destination ISO country (e.g. US, ES, DE, BR). Must differ from origin_country.',
                ),
                items: z.array(
                    z.object({
                        description: z.string().min(1).describe(
                            'Plain-language product description, e.g. "Cotton T-shirt".',
                        ),
                        quantity: z.number().int().positive(),
                        price: z.number().positive().describe('Per-unit declared value.'),
                        productCode: z.string().optional().describe(
                            'HS / NCM code if already known. If omitted, will be auto-classified.',
                        ),
                        countryOfOrigin: z.string().length(2).optional().describe(
                            'Manufacturing-origin ISO code (often differs from origin_country).',
                        ),
                        currency: z.string().length(3).optional().describe(
                            'ISO currency code for `price` (e.g. USD, MXN, EUR). ' +
                            'Defaults to the carrier expectation when omitted.',
                        ),
                    }),
                ).min(1).describe(
                    'Items being shipped. Each must include description, quantity, and price; ' +
                    'productCode is auto-classified if missing.',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const origin = args.origin_country.toUpperCase();
            const destination = args.destination_country.toUpperCase();

            if (origin === destination) {
                return textResponse(
                    `Origin and destination are both ${origin}. This wizard is for cross-border ` +
                    'shipments only — for domestic, call envia_quote_shipment + envia_create_shipment ' +
                    'directly.',
                );
            }

            // Step 1 + 2 in parallel: address requirements and HS-code classification.
            const [requirements, enrichedItems] = await Promise.all([
                fetchAddressRequirements(activeClient, config, destination),
                enrichItems(activeClient, config, args.items, destination),
            ]);

            const lines: string[] = [];
            lines.push(`International shipment pre-flight: ${origin} → ${destination}`);
            lines.push('');

            // Section 1 — address requirements summary.
            lines.push('## Address requirements');
            if (!requirements.ok) {
                lines.push(
                    `⚠️  Could not fetch authoritative requirements for ${destination}: ${requirements.error}.`,
                );
                lines.push(
                    'Proceed conservatively — supply street, number, neighbourhood, city, state, ' +
                    'postal code, and recipient phone for both sender and recipient.',
                );
            } else {
                const raw = typeof requirements.raw === 'string'
                    ? requirements.raw
                    : JSON.stringify(requirements.raw, null, 2);
                lines.push(raw);
            }
            lines.push('');

            // Section 2 — items table.
            lines.push('## Items (HS-code enriched)');
            enrichedItems.forEach((item, idx) => {
                const conf = item.hsCodeConfidence != null
                    ? ` confidence=${(item.hsCodeConfidence * 100).toFixed(0)}%`
                    : '';
                const code = item.productCode || '???';
                lines.push(
                    `${idx + 1}. ${item.description} — qty ${item.quantity} @ ${item.price} ` +
                    `[productCode=${code} via ${item.hsCodeSource}${conf}]`,
                );
            });
            lines.push('');

            // Section 3 — pending tasks for the LLM.
            const unknown = enrichedItems.filter((i) => i.hsCodeSource === 'unknown');
            const stepHints: string[] = [];
            if (unknown.length > 0) {
                stepHints.push(
                    `${unknown.length} item(s) still need a manual HS code — re-run with ` +
                    'productCode supplied, or call envia_classify_hscode with a more specific description.',
                );
            }
            stepHints.push(
                'Once the address fields and HS codes above are confirmed, call ' +
                'envia_create_shipment with the validated payload to actually purchase the label.',
            );
            lines.push('## Next steps');
            stepHints.forEach((s) => lines.push(`- ${s}`));

            return textResponse(lines.join('\n'));
        },
    );
}
