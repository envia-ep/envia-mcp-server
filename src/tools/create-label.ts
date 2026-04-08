/**
 * Tool: envia_create_label
 *
 * Purchases a shipping label from a carrier. Returns the tracking number
 * and a PDF label URL.
 *
 * Dual-mode operation:
 *  - **Manual mode** — provide addresses, package details, and carrier
 *    directly. City/state are auto-resolved from postal codes and Colombia
 *    DANE codes are translated automatically (same as quote_shipment).
 *  - **Ecommerce mode** — provide an `order_identifier` and the tool
 *    fetches the order, extracts addresses/packages/carrier, fetches
 *    print settings, and generates the label in a single step.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { countrySchema } from '../utils/schemas.js';
import { resolveAddress } from '../utils/address-resolver.js';
import { fetchPrintSettings } from '../utils/print-settings.js';
import { textResponse, type McpTextResponse } from '../utils/mcp-response.js';
import { buildGenerateAddress, buildGenerateAddressFromLocation, buildGenerateAddressFromShippingAddress } from '../builders/address.js';
import { buildManualPackage } from '../builders/package.js';
import { buildPackagesFromV4 } from '../builders/package.js';
import { buildEcommerceSection } from '../builders/ecommerce.js';
import { EcommerceOrderService } from '../services/ecommerce-order.js';
import type { V4Order } from '../types/ecommerce-order.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed label data from the generate API response. */
interface LabelData {
    carrier: string;
    service: string;
    shipmentId?: number;
    trackingNumber: string;
    trackingNumbers?: string[];
    trackUrl?: string;
    label: string;
    totalPrice?: number;
    currency?: string;
}

// ---------------------------------------------------------------------------
// Tool-specific formatting
// ---------------------------------------------------------------------------

/**
 * Format successful label creation output text.
 *
 * @param shipment - Parsed label response data
 * @returns Formatted multi-line output string
 */
function formatLabelOutput(shipment: LabelData): string {
    const lines: string[] = [
        'Label created successfully!',
        '',
        `  Carrier:          ${shipment.carrier}`,
        `  Service:          ${shipment.service}`,
        `  Tracking number:  ${shipment.trackingNumber}`,
    ];

    if (shipment.trackingNumbers && shipment.trackingNumbers.length > 1) {
        lines.push(`  All tracking #s:  ${shipment.trackingNumbers.join(', ')}`);
    }
    if (shipment.label) {
        lines.push(`  Label PDF:        ${shipment.label}`);
    }
    if (shipment.trackUrl) {
        lines.push(`  Tracking page:    ${shipment.trackUrl}`);
    }
    if (shipment.totalPrice) {
        lines.push(`  Price charged:    $${shipment.totalPrice} ${shipment.currency ?? 'MXN'}`);
    }

    lines.push(
        '',
        'Next steps:',
        '  - Download and print the label PDF',
        '  - Use envia_track_package to monitor delivery status',
        '  - Use envia_schedule_pickup if you need carrier pickup',
    );

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_create_label tool on the given MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerCreateLabel(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    const orderService = new EcommerceOrderService(client, config);

    server.registerTool(
        'envia_create_label',
        {
            description:
                'Purchase a shipping label. This charges your Envia account balance. ' +
                'Two modes: (1) pass order_identifier to auto-create from an ecommerce order, ' +
                'or (2) provide addresses and package details manually. ' +
                'City and state are resolved automatically from postal codes. ' +
                'Returns: tracking number, label PDF URL, and tracking URL.',
            inputSchema: z.object({
                // Ecommerce shortcut
                order_identifier: z.string().optional().describe(
                    'Ecommerce order identifier for one-step label creation. ' +
                    'When set, origin/destination/packages are auto-populated from the order. ' +
                    'Carrier is taken from the order quote unless overridden.',
                ),
                location_index: z.number().int().min(0).default(0).describe(
                    'Which origin location to ship from (0-based). Default: 0 (first location). ' +
                    'Only relevant when using order_identifier with multi-location orders.',
                ),

                // Origin (required in manual mode)
                origin_name: z.string().optional().describe('Sender full name'),
                origin_phone: z.string().optional().describe('Sender phone number'),
                origin_street: z.string().optional().describe('Sender street address'),
                origin_number: z.string().optional().describe(
                    'Sender exterior house/building number. Important for MX addresses.',
                ),
                origin_district: z.string().optional().describe(
                    'Sender neighborhood / colonia. Important for MX addresses.',
                ),
                origin_city: z.string().optional().describe(
                    'Sender city. Auto-resolved from postal code for most countries. ' +
                    'Required for CO, CL, GT, PA, HN, PE, BO.',
                ),
                origin_state: z.string().optional().describe(
                    'Sender state / province code. Auto-resolved from postal code for most countries.',
                ),
                origin_country: countrySchema.optional().describe(
                    'Sender country (ISO 3166-1 alpha-2, e.g. MX). Required in manual mode.',
                ),
                origin_postal_code: z.string().optional().describe('Sender postal / ZIP code'),
                origin_company: z.string().optional().describe('Sender company name'),
                origin_email: z.string().optional().describe('Sender email address'),
                origin_reference: z.string().optional().describe('Origin address reference / landmark'),
                origin_identification_number: z.string().optional().describe(
                    'Sender tax/national ID (e.g. RFC for MX, CNPJ/CPF for BR, NIT for CO)',
                ),

                // Destination (required in manual mode)
                destination_name: z.string().optional().describe('Recipient full name'),
                destination_phone: z.string().optional().describe('Recipient phone number'),
                destination_street: z.string().optional().describe('Recipient street address'),
                destination_number: z.string().optional().describe(
                    'Recipient exterior house/building number. Important for MX addresses.',
                ),
                destination_district: z.string().optional().describe(
                    'Recipient neighborhood / colonia. Important for MX addresses.',
                ),
                destination_city: z.string().optional().describe(
                    'Recipient city. Auto-resolved from postal code for most countries. ' +
                    'Required for CO, CL, GT, PA, HN, PE, BO.',
                ),
                destination_state: z.string().optional().describe(
                    'Recipient state / province code. Auto-resolved from postal code.',
                ),
                destination_country: countrySchema.optional().describe(
                    'Recipient country (ISO 3166-1 alpha-2). Required in manual mode.',
                ),
                destination_postal_code: z.string().optional().describe('Recipient postal / ZIP code'),
                destination_company: z.string().optional().describe('Recipient company name'),
                destination_email: z.string().optional().describe('Recipient email address'),
                destination_reference: z.string().optional().describe('Destination address reference / landmark'),
                destination_identification_number: z.string().optional().describe(
                    'Recipient tax/national ID (e.g. RFC for MX, CNPJ/CPF for BR, NIT for CO)',
                ),

                // Package (required in manual mode)
                package_weight: z.number().positive().optional().describe('Package weight in KG'),
                package_length: z.number().positive().optional().describe('Package length in CM'),
                package_width: z.number().positive().optional().describe('Package width in CM'),
                package_height: z.number().positive().optional().describe('Package height in CM'),
                package_content: z.string().default('General merchandise').describe('Description of contents'),
                package_declared_value: z.number().default(0).describe('Declared value for insurance'),

                // Shipment
                carrier: z.string().optional().describe(
                    'Carrier code (e.g. "dhl", "fedex"). Required in manual mode. ' +
                    'In ecommerce mode: overrides the order\'s pre-selected carrier.',
                ),
                service: z.string().optional().describe(
                    'Service code from quote_shipment (e.g. "express"). Required in manual mode. ' +
                    'In ecommerce mode: overrides the order\'s pre-selected service.',
                ),
                shipment_type: z.number().default(1).describe('1 = parcel (default), 2 = LTL, 3 = FTL'),
                order_reference: z.string().optional().describe(
                    'Customer order number or reference to print on the label',
                ),

                // Settings
                print_format: z.string().optional().describe(
                    'Label format: PDF, ZPL, ZPLII, PNG, EPL. Auto-fetched from carrier if not provided.',
                ),
                print_size: z.string().optional().describe(
                    'Label size (e.g. STOCK_4X6, PAPER_4X6). Auto-fetched from carrier if not provided.',
                ),
                currency: z.string().optional().describe(
                    'ISO 4217 currency code for declared values (e.g. "MXN", "USD"). Optional.',
                ),
            }),
        },
        async (args) => {
            if (args.order_identifier) {
                return handleEcommerceMode(args, orderService, client, config);
            }
            return handleManualMode(args, client, config);
        },
    );
}

// ---------------------------------------------------------------------------
// Ecommerce mode handler
// ---------------------------------------------------------------------------

/**
 * Handle label creation from an ecommerce order.
 *
 * @param args         - Tool input arguments
 * @param orderService - Ecommerce order service instance
 * @param client       - Envia API client
 * @param config       - Server configuration
 * @returns MCP tool response
 */
async function handleEcommerceMode(
    args: Record<string, unknown>,
    orderService: EcommerceOrderService,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<McpTextResponse> {
    const identifier = args.order_identifier as string;
    const locIndex = (args.location_index as number) ?? 0;

    let order: V4Order | null;
    try {
        order = await orderService.fetchOrder(identifier);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return textResponse(
            `Failed to fetch order "${identifier}": ${message}\n\n` +
            'Verify the order identifier is correct and that your API key has access.',
        );
    }

    if (!order) {
        return textResponse(
            `No order found with identifier "${identifier}".\n\n` +
            'Tips:\n' +
            '  - Check the identifier matches exactly (case-sensitive)\n' +
            '  - Ensure the order exists in the connected ecommerce platform\n' +
            '  - Verify your API key has access to the store that owns this order',
        );
    }

    const locationResult = orderService.resolveLocation(order, locIndex);
    if ('error' in locationResult) {
        return textResponse(`Cannot create label: ${locationResult.error}`);
    }

    const { location, activePackages } = locationResult;

    const carrierResult = orderService.resolveCarrier(
        activePackages,
        args.carrier as string | undefined,
        args.service as string | undefined,
    );
    if ('error' in carrierResult) {
        return textResponse(`Cannot create label: ${carrierResult.error}`);
    }

    const { carrier, service, carrierId } = carrierResult;

    const isInternational = location.country_code !== order.shipment_data.shipping_address.country_code;
    const packages = buildPackagesFromV4(activePackages, isInternational);

    const printOverrides = {
        printFormat: args.print_format as string | undefined,
        printSize: args.print_size as string | undefined,
    };
    const printSettings = await resolvePrintSettings(
        carrier, service, location.country_code, carrierId, printOverrides, client, config,
    );

    const body: Record<string, unknown> = {
        origin: buildGenerateAddressFromLocation(location),
        destination: buildGenerateAddressFromShippingAddress(order.shipment_data.shipping_address),
        packages,
        shipment: {
            type: (args.shipment_type as number) ?? 1,
            carrier,
            service,
            orderReference: (args.order_reference as string) || order.order.number,
        },
        settings: {
            ...printSettings,
            currency: (args.currency as string)?.trim() || order.order.currency || 'MXN',
            shopId: order.shop.id,
        },
        ecommerce: buildEcommerceSection(order),
    };

    return postGenerateAndFormat(body, client, config);
}

// ---------------------------------------------------------------------------
// Manual mode handler
// ---------------------------------------------------------------------------

/**
 * Handle label creation from manually provided addresses and package details.
 *
 * @param args   - Tool input arguments
 * @param client - Envia API client
 * @param config - Server configuration
 * @returns MCP tool response
 */
async function handleManualMode(
    args: Record<string, unknown>,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<McpTextResponse> {
    const originCountry = args.origin_country as string | undefined;
    const destCountry = args.destination_country as string | undefined;
    const carrier = args.carrier as string | undefined;
    const service = args.service as string | undefined;

    if (!originCountry || (!args.origin_postal_code && !args.origin_city)) {
        return textResponse(
            'Error: In manual mode, provide origin_country and either origin_postal_code or origin_city.\n' +
            'Use postal code for MX, US, CA, BR, etc. Use city for CO, CL, GT, PA, HN, PE, BO.',
        );
    }
    if (!destCountry || (!args.destination_postal_code && !args.destination_city)) {
        return textResponse(
            'Error: In manual mode, provide destination_country and either destination_postal_code or destination_city.\n' +
            'Use postal code for MX, US, CA, BR, etc. Use city for CO, CL, GT, PA, HN, PE, BO.',
        );
    }
    if (!carrier || !service) {
        return textResponse(
            'Error: carrier and service are required in manual mode.\n' +
            'Use quote_shipment first to compare rates and get carrier/service codes.',
        );
    }
    if (!args.origin_name || !args.origin_street || !args.destination_name || !args.destination_street) {
        return textResponse(
            'Error: origin_name, origin_street, destination_name, and destination_street are required in manual mode.',
        );
    }
    if (!args.package_weight || !args.package_length || !args.package_width || !args.package_height) {
        return textResponse(
            'Error: package_weight, package_length, package_width, and package_height are required in manual mode.',
        );
    }

    const [originResolved, destResolved] = await Promise.all([
        resolveAddress(
            {
                postalCode: args.origin_postal_code as string | undefined,
                country: originCountry,
                city: args.origin_city as string | undefined,
                state: args.origin_state as string | undefined,
            },
            client,
            config,
        ),
        resolveAddress(
            {
                postalCode: args.destination_postal_code as string | undefined,
                country: destCountry,
                city: args.destination_city as string | undefined,
                state: args.destination_state as string | undefined,
            },
            client,
            config,
        ),
    ]);

    const originCity = originResolved.city ?? (args.origin_city as string | undefined) ?? '';
    const originState = originResolved.state ?? (args.origin_state as string | undefined) ?? '';
    const destCity = destResolved.city ?? (args.destination_city as string | undefined) ?? '';
    const destState = destResolved.state ?? (args.destination_state as string | undefined) ?? '';

    if (!originCity || !originState) {
        return textResponse(
            'Error: Could not resolve origin city and state. ' +
            'Provide origin_city and origin_state explicitly, or ensure origin_postal_code is valid.',
        );
    }
    if (!destCity || !destState) {
        return textResponse(
            'Error: Could not resolve destination city and state. ' +
            'Provide destination_city and destination_state explicitly, or ensure destination_postal_code is valid.',
        );
    }

    const origin = buildGenerateAddress({
        name: args.origin_name as string,
        street: args.origin_street as string,
        city: originCity,
        state: originState,
        country: originResolved.country,
        postalCode: originResolved.postalCode ?? (args.origin_postal_code as string) ?? '',
        phone: args.origin_phone as string | undefined,
        number: args.origin_number as string | undefined,
        district: args.origin_district as string | undefined,
        company: args.origin_company as string | undefined,
        email: args.origin_email as string | undefined,
        reference: args.origin_reference as string | undefined,
        identificationNumber: args.origin_identification_number as string | undefined,
    });

    const destination = buildGenerateAddress({
        name: args.destination_name as string,
        street: args.destination_street as string,
        city: destCity,
        state: destState,
        country: destResolved.country,
        postalCode: destResolved.postalCode ?? (args.destination_postal_code as string) ?? '',
        phone: args.destination_phone as string | undefined,
        number: args.destination_number as string | undefined,
        district: args.destination_district as string | undefined,
        company: args.destination_company as string | undefined,
        email: args.destination_email as string | undefined,
        reference: args.destination_reference as string | undefined,
        identificationNumber: args.destination_identification_number as string | undefined,
    });

    const trimmedCarrier = carrier.trim().toLowerCase();
    const trimmedService = service.trim();

    const printOverrides = {
        printFormat: args.print_format as string | undefined,
        printSize: args.print_size as string | undefined,
    };
    const printSettings = await resolvePrintSettings(
        trimmedCarrier, trimmedService, originCountry, null, printOverrides, client, config,
    );

    const settings: Record<string, unknown> = { ...printSettings };
    const trimmedCurrency = (args.currency as string | undefined)?.trim();
    if (trimmedCurrency) {
        settings.currency = trimmedCurrency;
    }

    const body: Record<string, unknown> = {
        origin,
        destination,
        packages: [
            buildManualPackage({
                weight: args.package_weight as number,
                length: args.package_length as number,
                width: args.package_width as number,
                height: args.package_height as number,
                content: args.package_content as string,
                declaredValue: args.package_declared_value as number,
            }),
        ],
        shipment: {
            type: (args.shipment_type as number) ?? 1,
            carrier: trimmedCarrier,
            service: trimmedService,
            ...(args.order_reference ? { orderReference: args.order_reference as string } : {}),
        },
        settings,
    };

    return postGenerateAndFormat(body, client, config);
}

// ---------------------------------------------------------------------------
// Label-specific helpers
// ---------------------------------------------------------------------------

/**
 * Resolve print settings: prefer explicit overrides, then API fetch, then defaults.
 *
 * @param carrier   - Carrier slug
 * @param service   - Service code
 * @param country   - Origin country code
 * @param carrierId - Numeric carrier ID (null in manual mode)
 * @param overrides - User-provided overrides
 * @param client    - API client
 * @param config    - Server config
 * @returns Resolved printFormat and printSize
 */
async function resolvePrintSettings(
    carrier: string,
    service: string,
    country: string,
    carrierId: number | null,
    overrides: { printFormat?: string; printSize?: string },
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<{ printFormat: string; printSize: string }> {
    if (overrides.printFormat && overrides.printSize) {
        return { printFormat: overrides.printFormat, printSize: overrides.printSize };
    }

    const fetched = await fetchPrintSettings(carrier, service, country, carrierId, client, config);
    return {
        printFormat: overrides.printFormat || fetched.printFormat,
        printSize: overrides.printSize || fetched.printSize,
    };
}

/**
 * POST to /ship/generate/ and format the response.
 *
 * @param body   - Generate payload
 * @param client - API client
 * @param config - Server config
 * @returns MCP tool response
 */
async function postGenerateAndFormat(
    body: Record<string, unknown>,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<McpTextResponse> {
    const url = `${config.shippingBase}/ship/generate/`;
    const res = await client.post<{ data: LabelData[] }>(url, body);

    if (!res.ok) {
        return textResponse(
            `Label creation failed: ${res.error}\n\n` +
            'Tip: Verify addresses with envia_validate_address, or check your Envia account balance.',
        );
    }

    const shipment = res.data?.data?.[0];
    if (!shipment?.trackingNumber) {
        return textResponse('Label creation returned an unexpected response. No tracking number found.');
    }

    return textResponse(formatLabelOutput(shipment));
}
