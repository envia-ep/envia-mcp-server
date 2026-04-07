/**
 * Tool: quote_shipment
 *
 * Compares shipping rates across carriers for a route with minimal input.
 * Only postal codes, country, and package weight are required — city and
 * state are resolved automatically via the Geocodes API. For Colombia,
 * human-readable city names are translated to DANE codes via /locate.
 *
 * Returns prices sorted cheapest-first with delivery estimates.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { countrySchema } from '../utils/schemas.js';
import { buildQuoteAddress } from '../utils/address.js';
import { resolveAddress } from '../utils/address-resolver.js';

interface RateEntry {
    carrier: string;
    service: string;
    serviceDescription?: string;
    deliveryEstimate?: string;
    totalPrice: string;
    currency?: string;
}

interface CarrierEntry {
    name: string;
}

/** Maximum number of individual carrier requests when not using "all". */
const MAX_CARRIERS = 10;

/**
 * Fetch available carrier codes for a country and shipment type.
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param international - Whether the shipment crosses borders
 * @param client - Envia API client
 * @param config - Server configuration
 * @returns Array of carrier code strings (e.g. ["fedex", "dhl", "estafeta"])
 */
async function fetchAvailableCarriers(
    countryCode: string,
    international: boolean,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<string[]> {
    const intl = international ? 1 : 0;
    const url = `${config.queriesBase}/available-carrier/${encodeURIComponent(countryCode)}/${intl}`;
    const res = await client.get<{ data: CarrierEntry[] }>(url);

    if (!res.ok || !Array.isArray(res.data?.data)) {
        return [];
    }

    return res.data.data
        .map((c) => c.name)
        .filter(Boolean);
}

/**
 * Register the quote_shipment tool on the given MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerGetShippingRates(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'quote_shipment',
        {
            description:
                'Get shipping rates for a parcel shipment. ' +
                'For MX, US, CA, BR and most countries: provide postal codes — city and state are resolved automatically. ' +
                'For CO, CL, GT, PA, HN, PE, BO: provide city and state instead (no postal code needed). ' +
                'Colombia example: origin_city="Bogota", origin_state="DC", origin_country="CO" — ' +
                'city names are translated to DANE codes automatically. ' +
                'Returns available services sorted by price (cheapest first).',
            inputSchema: z.object({
                origin_postal_code: z.string().optional().describe(
                    'Origin postal / ZIP code. City and state are resolved automatically. ' +
                    'Required for most countries (MX, US, CA, BR, etc.). ' +
                    'Not needed for CO, CL, GT, PA, HN, PE, BO — use origin_city instead.',
                ),
                destination_postal_code: z.string().optional().describe(
                    'Destination postal / ZIP code. City and state are resolved automatically. ' +
                    'Required for most countries (MX, US, CA, BR, etc.). ' +
                    'Not needed for CO, CL, GT, PA, HN, PE, BO — use destination_city instead.',
                ),
                weight: z.number().positive().describe('Package weight in KG'),

                origin_country: countrySchema.default('MX').describe(
                    'Origin country (ISO 3166-1 alpha-2, e.g. MX, US, CO). Default: MX',
                ),
                destination_country: countrySchema.default('MX').describe(
                    'Destination country (ISO 3166-1 alpha-2). Default: MX',
                ),
                origin_city: z.string().optional().describe(
                    'Origin city name. Required for CO, CL, GT, PA, HN, PE, BO (no postal code needed). ' +
                    'For CO: use the city name (e.g. "Bogota") — it will be translated to the DANE code automatically.',
                ),
                origin_state: z.string().optional().describe(
                    'Origin state / department code. Required for CO (e.g. "DC" for Bogota, "ANT" for Medellin). ' +
                    'For other countries: resolved automatically from postal code.',
                ),
                destination_city: z.string().optional().describe(
                    'Destination city name. Required for CO, CL, GT, PA, HN, PE, BO (no postal code needed). ' +
                    'For CO: use the city name (e.g. "Medellin") — it will be translated to the DANE code automatically.',
                ),
                destination_state: z.string().optional().describe(
                    'Destination state / department code. Required for CO (e.g. "VAC" for Cali, "DC" for Bogota). ' +
                    'For other countries: resolved automatically from postal code.',
                ),

                length: z.number().positive().default(10).describe('Package length in CM (default: 10)'),
                width: z.number().positive().default(10).describe('Package width in CM (default: 10)'),
                height: z.number().positive().default(10).describe('Package height in CM (default: 10)'),
                content: z.string().default('General merchandise').describe('Description of package contents'),
                declared_value: z.number().default(0).describe('Declared value for insurance (in origin currency)'),
                carriers: z.string().default('all').describe(
                    'Carrier code or comma-separated list (e.g. "dhl,fedex,estafeta"). ' +
                    'Use "all" to query every available carrier for the origin country (default). ' +
                    'Use envia_list_carriers to find available codes.',
                ),
                currency: z.string().optional().describe(
                    'ISO 4217 currency code for pricing (e.g. "MXN", "USD"). Optional.',
                ),
            }),
        },
        async (args) => {
            if (!args.origin_postal_code && !args.origin_city) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: 'Error: Provide either origin_postal_code or origin_city. ' +
                            'Use postal code for MX, US, CA, BR, etc. Use city for CO, CL, GT, PA, HN, PE, BO.',
                    }],
                };
            }
            if (!args.destination_postal_code && !args.destination_city) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: 'Error: Provide either destination_postal_code or destination_city. ' +
                            'Use postal code for MX, US, CA, BR, etc. Use city for CO, CL, GT, PA, HN, PE, BO.',
                    }],
                };
            }

            const [origin, destination] = await Promise.all([
                resolveAddress(
                    {
                        postalCode: args.origin_postal_code,
                        country: args.origin_country,
                        city: args.origin_city,
                        state: args.origin_state,
                    },
                    client,
                    config,
                ),
                resolveAddress(
                    {
                        postalCode: args.destination_postal_code,
                        country: args.destination_country,
                        city: args.destination_city,
                        state: args.destination_state,
                    },
                    client,
                    config,
                ),
            ]);

            const originAddress = buildQuoteAddress(origin);
            const destinationAddress = buildQuoteAddress(destination);

            const packages = [
                {
                    type: 'box',
                    content: args.content,
                    amount: 1,
                    declaredValue: args.declared_value,
                    weight: args.weight,
                    weightUnit: 'KG',
                    lengthUnit: 'CM',
                    dimensions: {
                        length: args.length,
                        width: args.width,
                        height: args.height,
                    },
                },
            ];

            const settings: Record<string, unknown> = {};
            if (args.currency) {
                settings.currency = args.currency.trim();
            }

            const rateUrl = `${config.shippingBase}/ship/rate/`;
            const carrierInput = args.carriers.trim().toLowerCase();

            const allRates: RateEntry[] = [];
            const errors: string[] = [];

            let carrierList: string[];

            if (carrierInput === 'all') {
                const isInternational = args.origin_country.toUpperCase() !== args.destination_country.toUpperCase();
                carrierList = await fetchAvailableCarriers(
                    args.origin_country.toUpperCase(),
                    isInternational,
                    client,
                    config,
                );

                if (carrierList.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: 'No carriers available for this country and shipment type. ' +
                                    'Use envia_list_carriers to verify available carriers.',
                            },
                        ],
                    };
                }

                carrierList = carrierList.slice(0, MAX_CARRIERS);
            } else {
                carrierList = carrierInput
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean)
                    .slice(0, MAX_CARRIERS);

                if (carrierList.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: 'Error: Provide at least one carrier code (e.g. "dhl") or "all". ' +
                                    'Use envia_list_carriers to find available carriers.',
                            },
                        ],
                    };
                }
            }

            const promises = carrierList.map((carrier) =>
                client
                    .post<{ data: RateEntry[] }>(rateUrl, {
                        origin: originAddress,
                        destination: destinationAddress,
                        packages,
                        shipment: { type: 1, carrier },
                        ...(Object.keys(settings).length > 0 && { settings }),
                    })
                    .then((res) => ({ carrier, res })),
            );

            const settled = await Promise.allSettled(promises);

            for (const result of settled) {
                if (result.status === 'rejected') {
                    const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error';
                    errors.push(`Carrier request failed: ${reason}`);
                    continue;
                }
                const { carrier, res } = result.value;
                if (!res.ok) {
                    errors.push(`${carrier}: ${res.error}`);
                    continue;
                }
                if (Array.isArray(res.data?.data)) {
                    allRates.push(...res.data.data);
                } else {
                    const body = res.data as Record<string, unknown> | undefined;
                    const detail = typeof body?.message === 'string'
                        ? body.message
                        : typeof body?.error === 'string'
                            ? body.error
                            : 'no rate data in response';
                    errors.push(`${carrier}: ${detail}`);
                }
            }

            if (allRates.length === 0) {
                const msg = errors.length
                    ? `No rates found. Errors:\n${errors.map((e) => `  • ${e}`).join('\n')}`
                    : 'No rates returned for the given route and carriers.';
                return { content: [{ type: 'text' as const, text: msg }] };
            }

            allRates.sort(
                (a, b) => parseFloat(a.totalPrice || '0') - parseFloat(b.totalPrice || '0'),
            );

            const lines: string[] = [
                `Found ${allRates.length} rate(s) — sorted cheapest first:`,
                '',
            ];

            for (const r of allRates) {
                const price = `$${r.totalPrice} ${r.currency ?? 'MXN'}`;
                const delivery = r.deliveryEstimate ? ` | ${r.deliveryEstimate}` : '';
                const desc = r.serviceDescription ? ` (${r.serviceDescription})` : '';
                lines.push(`• ${r.carrier} / ${r.service}${desc}: ${price}${delivery}`);
            }

            if (errors.length) {
                lines.push('', 'Carrier errors:', ...errors.map((e) => `  ⚠ ${e}`));
            }

            lines.push(
                '',
                'Next step: use envia_create_label with the chosen carrier and service to purchase the label.',
            );

            return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        },
    );
}
