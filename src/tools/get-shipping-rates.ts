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
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { RateCostSummary } from '../types/carriers-api.js';
import { countrySchema, requiredApiKeySchema } from '../utils/schemas.js';
import { resolveAddress } from '../utils/address-resolver.js';
import { textResponse } from '../utils/mcp-response.js';
import { buildRateAddress } from '../builders/address.js';
import { buildManualPackage, validateInsuranceExclusivity } from '../builders/package.js';
import { buildAdditionalServices } from '../builders/additional-service.js';
import { fetchAvailableCarriers, type CarrierInfo } from '../services/carrier.js';

/** A single rate option returned by the carriers API. */
interface RateEntry {
    carrier: string;
    service: string;
    serviceDescription?: string;
    deliveryEstimate?: string;
    basePrice: number;
    totalPrice: string;
    currency?: string;
    insurance: number;
    additionalServices: number;
    additionalCharges: number;
    taxes: number;
    cashOnDeliveryCommission: number;
    cashOnDeliveryAmount: number;
    costSummary?: RateCostSummary[];
}

/** Maximum number of individual carrier requests when not using "all". */
const MAX_CARRIERS = 10;

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
                api_key: requiredApiKeySchema,
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

                additional_services: z.array(z.object({
                    service: z.string().describe('Service name (e.g. "adult_signature_required", "proof_of_delivery").'),
                    amount: z.number().min(0).optional().describe(
                        'Monetary amount when the service requires it (e.g. insurance value, COD amount).',
                    ),
                })).optional().describe(
                    'Optional additional services for the shipment. ' +
                    'Use list_additional_services to discover available services for a route. ' +
                    'Example: [{ "service": "adult_signature_required" }]',
                ),
                insurance_type: z.enum(['envia_insurance', 'insurance', 'high_value_protection']).optional().describe(
                    'Shortcut to add an insurance service. Sets additionalServices with the declared_value as amount. ' +
                    'Only one insurance type allowed. "insurance" is carrier-native (CO/BR). ' +
                    '"envia_insurance" is Envia platform insurance. "high_value_protection" for high-value packages.',
                ),
                cash_on_delivery_amount: z.number().positive().optional().describe(
                    'Cash on delivery amount to collect from recipient. ' +
                    'Adds a cash_on_delivery additional service automatically.',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            if (!args.origin_postal_code && !args.origin_city) {
                return textResponse(
                    'Error: Provide either origin_postal_code or origin_city. ' +
                    'Use postal code for MX, US, CA, BR, etc. Use city for CO, CL, GT, PA, HN, PE, BO.',
                );
            }
            if (!args.destination_postal_code && !args.destination_city) {
                return textResponse(
                    'Error: Provide either destination_postal_code or destination_city. ' +
                    'Use postal code for MX, US, CA, BR, etc. Use city for CO, CL, GT, PA, HN, PE, BO.',
                );
            }

            const [origin, destination] = await Promise.all([
                resolveAddress(
                    {
                        postalCode: args.origin_postal_code,
                        country: args.origin_country,
                        city: args.origin_city,
                        state: args.origin_state,
                    },
                    activeClient,
                    config,
                ),
                resolveAddress(
                    {
                        postalCode: args.destination_postal_code,
                        country: args.destination_country,
                        city: args.destination_city,
                        state: args.destination_state,
                    },
                    activeClient,
                    config,
                ),
            ]);

            const originAddress = buildRateAddress(origin);
            const destinationAddress = buildRateAddress(destination);

            const additionalServices = buildAdditionalServices(
                args.additional_services,
                args.insurance_type,
                args.declared_value,
                args.cash_on_delivery_amount,
            );

            if (additionalServices.length > 0) {
                const validationError = validateInsuranceExclusivity(additionalServices);
                if (validationError) {
                    return textResponse(`Error: ${validationError}`);
                }
            }

            const requestedServiceNames = additionalServices.map((s) => s.service);

            const packages = [
                buildManualPackage({
                    weight: args.weight,
                    length: args.length,
                    width: args.width,
                    height: args.height,
                    content: args.content,
                    declaredValue: args.declared_value,
                    additionalServices: additionalServices.length > 0 ? additionalServices : undefined,
                }),
            ];

            const settings: Record<string, unknown> = {};
            if (args.currency) {
                settings.currency = args.currency.trim();
            }

            const rateUrl = `${config.shippingBase}/ship/rate/`;
            const carrierInput = args.carriers.trim().toLowerCase();

            const allRates: RateEntry[] = [];
            const errors: string[] = [];

            let carrierList: CarrierInfo[];

            if (carrierInput === 'all') {
                const originCountry = args.origin_country.toUpperCase();
                const destinationCountry = args.destination_country.toUpperCase();
                const isInternational = originCountry !== destinationCountry;

                carrierList = await fetchAvailableCarriers(
                    originCountry,
                    isInternational,
                    activeClient,
                    config,
                    isInternational ? destinationCountry : undefined,
                );

                if (carrierList.length === 0) {
                    return textResponse(
                        'No carriers available for this country and shipment type. ' +
                        'Use envia_list_carriers to verify available carriers.',
                    );
                }

                carrierList = carrierList.slice(0, MAX_CARRIERS);
            } else {
                // Manual carrier list: no routing flags available, default to standard export.
                carrierList = carrierInput
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean)
                    .slice(0, MAX_CARRIERS)
                    .map((name) => ({ name, import: 0, third_party: 0 }));

                if (carrierList.length === 0) {
                    return textResponse(
                        'Error: Provide at least one carrier code (e.g. "dhl") or "all". ' +
                        'Use envia_list_carriers to find available carriers.',
                    );
                }
            }

            const promises = carrierList.map((carrier) =>
                activeClient
                    .post<{ data: RateEntry[] }>(rateUrl, {
                        origin: originAddress,
                        destination: destinationAddress,
                        packages,
                        shipment: {
                            type: 1,
                            reverse_pickup: 0,
                            import: carrier.import,
                            third_party: carrier.third_party,
                            carrier: carrier.name,
                        },
                        ...(Object.keys(settings).length > 0 && { settings }),
                    })
                    .then((res) => ({ carrier: carrier.name, res })),
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
                            : `unexpected response shape: ${JSON.stringify(body).slice(0, 300)}`;
                    errors.push(`${carrier}: ${detail}`);
                }
            }

            if (allRates.length === 0) {
                const msg = errors.length
                    ? `No rates found. Errors:\n${errors.map((e) => `  • ${e}`).join('\n')}`
                    : 'No rates returned for the given route and carriers.';
                return textResponse(msg);
            }

            allRates.sort(
                (a, b) => parseFloat(a.totalPrice || '0') - parseFloat(b.totalPrice || '0'),
            );

            const lines: string[] = [
                `Found ${allRates.length} rate(s) — sorted cheapest first:`,
                '',
            ];

            for (const r of allRates) {
                const cur = r.currency ?? 'MXN';
                const delivery = r.deliveryEstimate ? ` | ${r.deliveryEstimate}` : '';
                const desc = r.serviceDescription ? ` (${r.serviceDescription})` : '';
                lines.push(`• ${r.carrier} / ${r.service}${desc}: $${r.totalPrice} ${cur}${delivery}`);

                const summary = r.costSummary?.[0];
                if (summary) {
                    lines.push(`    Base: $${summary.basePrice} | Taxes: $${summary.taxes}`);

                    if (summary.costAdditionalServices && summary.costAdditionalServices.length > 0) {
                        for (const svc of summary.costAdditionalServices) {
                            lines.push(`    + ${svc.additionalService}: $${svc.cost}`);
                        }
                    }

                    if (summary.costAdditionalCharges && summary.costAdditionalCharges.length > 0) {
                        for (const charge of summary.costAdditionalCharges) {
                            lines.push(`    + ${charge.additionalService} (carrier charge): $${charge.cost}`);
                        }
                    }

                    if (r.insurance > 0) {
                        lines.push(`    Insurance: $${r.insurance}`);
                    }
                    if (r.cashOnDeliveryAmount > 0) {
                        lines.push(`    COD amount: $${r.cashOnDeliveryAmount} (commission: $${r.cashOnDeliveryCommission})`);
                    }
                }

                if (requestedServiceNames.length > 0) {
                    const appliedNames = extractAppliedServiceNames(r);
                    const missing = requestedServiceNames.filter((name) => !appliedNames.has(name));
                    if (missing.length > 0) {
                        lines.push(`    ⚠ Requested service(s) not applied: ${missing.join(', ')}`);
                    }
                }
            }

            if (errors.length) {
                lines.push('', 'Carrier errors:', ...errors.map((e) => `  ⚠ ${e}`));
            }

            lines.push(
                '',
                'Next step: use create_shipment with the chosen carrier and service to purchase the label.',
            );

            return textResponse(lines.join('\n'));
        },
    );
}

/**
 * Collect the set of additional service names that appear in the rate
 * response — from `costAdditionalServices` plus the dedicated insurance
 * and COD fields.
 *
 * @param rate - A single rate entry from the carriers API
 * @returns Set of applied service name strings
 */
function extractAppliedServiceNames(rate: RateEntry): Set<string> {
    const names = new Set<string>();

    const summary = rate.costSummary?.[0];
    if (summary?.costAdditionalServices) {
        for (const svc of summary.costAdditionalServices) {
            names.add(svc.additionalService);
        }
    }

    if (rate.insurance > 0) {
        names.add('envia_insurance');
        names.add('insurance');
        names.add('high_value_protection');
    }

    if (rate.cashOnDeliveryCommission > 0 || rate.cashOnDeliveryAmount > 0) {
        names.add('cash_on_delivery');
    }

    return names;
}
