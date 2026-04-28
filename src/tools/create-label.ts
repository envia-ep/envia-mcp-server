/**
 * Tool: envia_create_shipment
 *
 * Purchases a shipping label from a carrier. Returns the tracking number
 * and a PDF label URL.
 *
 * Dual-mode operation:
 *  - **Manual mode** — provide addresses, package details, and carrier
 *    directly. City/state are auto-resolved from postal codes and Colombia
 *    DANE codes are translated automatically (same as envia_quote_shipment).
 *  - **Ecommerce mode** — provide an `order_identifier` and the tool
 *    fetches the order, extracts addresses/packages/carrier, fetches
 *    print settings, and generates the label in a single step.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { countrySchema, requiredApiKeySchema } from '../utils/schemas.js';
import { resolveAddress } from '../utils/address-resolver.js';
import { fetchPrintSettings } from '../utils/print-settings.js';
import { textResponse, type McpTextResponse } from '../utils/mcp-response.js';
import { buildGenerateAddress, buildGenerateAddressFromLocation, buildGenerateAddressFromShippingAddress } from '../builders/address.js';
import { buildManualPackage, validateInsuranceExclusivity } from '../builders/package.js';
import { buildPackagesFromV4 } from '../builders/package.js';
import { buildAdditionalServices } from '../builders/additional-service.js';
import type { GenerateAddress, PackageItem, InsuranceServiceType, XmlDataEntry } from '../types/carriers-api.js';
import { buildEcommerceSection } from '../builders/ecommerce.js';
import { EcommerceOrderService } from '../services/ecommerce-order.js';
import type { V4Order } from '../types/ecommerce-order.js';
import { buildDcePayload, authorizeDce, buildXmlDataFromResponse } from '../services/dce.js';
import {
    fetchGenericForm,
    getRequiredFields,
    validateAddressCompleteness,
    type RequiredFieldDescriptor,
} from '../services/generic-form.js';
import { shouldApplyTaxes } from '../services/tax-rules.js';
import { DOMESTIC_AS_INTERNATIONAL } from '../services/country-rules.js';
import { validateCPF, validateCNPJ, validateNIT, isIdentificationRequired } from '../services/identification-validator.js';
import { detectBrazilianDocumentType } from '../services/country-rules.js';
import { parseToolResponse } from '../utils/response-validator.js';
import { CreateShipmentResponseSchema } from '../schemas/shipping.js';
import { mapCarrierError } from '../utils/error-mapper.js';
import { syncFulfillment } from '../services/ecommerce-sync.js';

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
 * Register the envia_create_shipment tool on the given MCP server.
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
    server.registerTool(
        'envia_create_shipment',
        {
            description:
                'Purchase a shipping label. This charges your Envia account balance. ' +
                'Two modes: (1) pass order_identifier to auto-create from an ecommerce order, ' +
                'or (2) provide addresses and package details manually. ' +
                'City and state are resolved automatically from postal codes. ' +
                'Addresses are validated against country-specific required fields before generation. ' +
                'For BR-to-BR shipments, DCe (Declaracao de Conteudo Eletronica) authorization with SEFAZ ' +
                'is performed automatically — items with productCode (NCM) and identificationNumber (CPF/CNPJ) ' +
                'on both addresses are required. Pass xml_data to skip auto-authorization if you already have it. ' +
                'Returns: tracking number, label PDF URL, and tracking URL.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
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
                origin_street: z.string().optional().describe(
                    'Sender street name (e.g. "Av. Constitución" for MX, "Rua Paracatu" for BR). ' +
                    'For MX and BR, put only the street name here and use origin_number for the exterior number.',
                ),
                origin_number: z.string().optional().describe(
                    'Sender exterior house/building number. Required for MX and BR addresses (e.g. "123", "60"). ' +
                    'For other countries the number is already part of origin_street and this field is ignored.',
                ),
                origin_interior_number: z.string().optional().describe(
                    'Sender interior number / suite / apartment (e.g. "4B", "Piso 2"). ' +
                    'Required when the country\'s address form marks interior number as mandatory.',
                ),
                origin_district: z.string().optional().describe(
                    'Sender neighborhood (colonia for MX, bairro for BR). Auto-resolved from postal code for MX. ' +
                    'Provide explicitly to override the auto-resolved value.',
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
                    'Sender tax/national ID (e.g. RFC for MX, CNPJ/CPF for BR, NIT for CO). ' +
                    'Required for BR shipments (DCe authorization).',
                ),

                // Destination (required in manual mode)
                destination_name: z.string().optional().describe('Recipient full name'),
                destination_phone: z.string().optional().describe('Recipient phone number'),
                destination_street: z.string().optional().describe(
                    'Recipient street name (e.g. "Calle Reforma" for MX, "Rua Célio Nascimento" for BR). ' +
                    'For MX and BR, put only the street name here and use destination_number for the exterior number.',
                ),
                destination_number: z.string().optional().describe(
                    'Recipient exterior house/building number. Required for MX and BR addresses (e.g. "456", "196"). ' +
                    'For other countries the number is already part of destination_street and this field is ignored.',
                ),
                destination_interior_number: z.string().optional().describe(
                    'Recipient interior number / suite / apartment (e.g. "4B", "Piso 2"). ' +
                    'Required when the country\'s address form marks interior number as mandatory.',
                ),
                destination_district: z.string().optional().describe(
                    'Recipient neighborhood (colonia for MX, bairro for BR). Auto-resolved from postal code for MX. ' +
                    'Provide explicitly to override the auto-resolved value.',
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
                    'Recipient tax/national ID (e.g. RFC for MX, CNPJ/CPF for BR, NIT for CO). ' +
                    'Required for BR shipments (DCe authorization).',
                ),

                // Package (required in manual mode)
                package_weight: z.number().positive().optional().describe('Package weight in KG'),
                package_length: z.number().positive().optional().describe('Package length in CM'),
                package_width: z.number().positive().optional().describe('Package width in CM'),
                package_height: z.number().positive().optional().describe('Package height in CM'),
                package_content: z.string().default('General merchandise').describe('Description of contents'),
                package_declared_value: z.number().default(0).describe('Declared value for insurance'),

                // Package items (REQUIRED for international and BR-to-BR shipments)
                items: z.array(z.object({
                    description: z.string().optional().describe(
                        'Item description for customs (use English to avoid delays). ' +
                        'Defaults to package_content when omitted.',
                    ),
                    quantity: z.number().int().positive().default(1).describe('Number of units of this item.'),
                    price: z.number().min(0).describe(
                        'Unit price of the item — carriers need this for customs declarations and landed cost.',
                    ),
                    weight: z.number().min(0).optional().describe('Weight per unit in KG.'),
                    sku: z.string().optional().describe('Stock keeping unit identifier.'),
                    productCode: z.string().optional().describe(
                        'HS / tariff code, also known as NCM code in Brazil (e.g. "4202.21.6000", "8528.72.00"). ' +
                        'Required for international shipments and BR-to-BR domestic shipments. ' +
                        'Use envia_classify_hscode to look up the correct code for a product.',
                    ),
                    countryOfManufacture: z.string().optional().describe(
                        'ISO 2-letter country where manufactured (e.g. "MX", "CN").',
                    ),
                    currency: z.string().optional().describe(
                        'ISO 4217 currency of the price (e.g. "USD", "MXN").',
                    ),
                })).optional().describe(
                    'REQUIRED for international shipments and BR-to-BR domestic shipments. ' +
                    'Array of items in the package for customs documentation and DCe authorization. ' +
                    'Each item needs at least quantity and price. For BR, productCode (NCM) is also required.',
                ),

                // Pre-authorized DCe data (skips auto-authorization for BR shipments)
                xml_data: z.array(z.object({
                    documentType: z.string().describe('Document type (e.g. "dce").'),
                    dceNumber: z.string().optional().describe('DCe document number.'),
                    dceSerie: z.string().optional().describe('DCe series.'),
                    dceDate: z.string().optional().describe('DCe emission date (ISO 8601).'),
                    dceKey: z.string().optional().describe('DCe access key (44-digit SEFAZ key).'),
                    dceValue: z.string().optional().describe('Total DCe declared value.'),
                })).optional().describe(
                    'Pre-authorized DCe (Declaracao de Conteudo Eletronica) data for BR shipments. ' +
                    'When provided, auto-authorization with SEFAZ is skipped. ' +
                    'Obtain this via a prior call to the /dce/autorizar endpoint.',
                ),

                // Shipment
                carrier: z.string().optional().describe(
                    'Carrier code (e.g. "dhl", "fedex"). Required in manual mode. ' +
                    'In ecommerce mode: overrides the order\'s pre-selected carrier.',
                ),
                service: z.string().optional().describe(
                    'Service code from envia_quote_shipment (e.g. "express"). Required in manual mode. ' +
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

                additional_services: z.array(z.object({
                    service: z.string().describe('Service name (e.g. "adult_signature_required", "proof_of_delivery").'),
                    amount: z.number().min(0).optional().describe(
                        'Monetary amount when the service requires it (e.g. insurance value, COD amount).',
                    ),
                    data: z.record(z.string(), z.unknown()).optional().describe(
                        'Advanced: arbitrary data payload for multi-field services (ETD, hazmat, LTL appointment). ' +
                        'Takes precedence over amount when both are provided.',
                    ),
                })).optional().describe(
                    'Optional additional services for the shipment. ' +
                    'Use envia_list_additional_services to discover available services for a route. ' +
                    'Example: [{ "service": "adult_signature_required" }]',
                ),
                insurance_type: z.enum(['envia_insurance', 'insurance', 'high_value_protection']).optional().describe(
                    'Shortcut to add an insurance service. Uses package_declared_value as amount. ' +
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

            if (args.order_identifier) {
                return handleEcommerceMode(args, activeClient, config);
            }
            return handleManualMode(args, activeClient, config);
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
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<McpTextResponse> {
    const orderService = new EcommerceOrderService(client, config);
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

    const originAddr = buildGenerateAddressFromLocation(location);
    const destAddr = buildGenerateAddressFromShippingAddress(order.shipment_data.shipping_address);

    const originCountryCode = location.country_code?.toUpperCase() || '';
    const destCountryCode = order.shipment_data.shipping_address.country_code?.toUpperCase() || '';

    // --- Generic-form address validation (all countries) ---
    const formValidationError = await validateAddressesViaGenericForm(
        originAddr, destAddr, originCountryCode, destCountryCode, client, config,
    );
    if (formValidationError) return formValidationError;

    const isInternational = originCountryCode !== destCountryCode;
    const isBrDomestic = originCountryCode === 'BR' && destCountryCode === 'BR';
    const isInDomestic = originCountryCode === 'IN' && destCountryCode === 'IN';
    const packages = buildPackagesFromV4(activePackages, isInternational || isBrDomestic || isInDomestic);

    // --- BR-to-BR DCe authorization ---
    const userXmlData = args.xml_data as XmlDataEntry[] | undefined;

    if (isBrDomestic) {
        const hasExistingXmlData = packages.some((pkg) => pkg.xmlData && pkg.xmlData.length > 0);

        if (!hasExistingXmlData) {
            if (userXmlData && userXmlData.length > 0) {
                for (const pkg of packages) {
                    pkg.xmlData = userXmlData;
                }
            } else {
                if (!originAddr.identificationNumber) {
                    return textResponse(
                        'Error: origin identification number (CPF/CNPJ) is required for BR-to-BR shipments.\n' +
                        'Provide origin_identification_number or ensure the origin location has an identification number.',
                    );
                }

                const itemsForDce: PackageItem[] = packages.flatMap((pkg) => pkg.items || []);
                if (itemsForDce.length === 0) {
                    return textResponse(
                        'Error: items are required for BR-to-BR shipments (DCe authorization).\n' +
                        'The ecommerce order packages must include products with descriptions and prices.',
                    );
                }

                const itemsMissingNcm = itemsForDce.filter((it) => !it.productCode);
                if (itemsMissingNcm.length > 0) {
                    const missing = itemsMissingNcm
                        .map((it) => `  - "${it.description || 'unnamed'}"`)
                        .join('\n');
                    return textResponse(
                        'Error: productCode (NCM) is required for every item in BR-to-BR shipments (DCe authorization).\n' +
                        'Ecommerce order products do not include NCM codes, so auto-authorization cannot proceed.\n\n' +
                        `Items missing NCM:\n${missing}\n\n` +
                        'Options:\n' +
                        '  1. Pre-authorize the DCe manually and pass the result as xml_data.\n' +
                        '  2. Use manual mode (omit order_identifier) and supply items with productCode (NCM) for each product.\n' +
                        '     Use envia_classify_hscode to look up the correct NCM code for each item.\n' +
                        '     Example: items: [{ description: "T-shirt", quantity: 1, price: 50, productCode: "6109.10.00" }]',
                    );
                }

                const dceResult = await authorizeDce(
                    buildDcePayload(originAddr, destAddr, itemsForDce, carrier),
                    client,
                    config,
                );
                if (!dceResult.success) {
                    return textResponse(
                        `DCe authorization failed: ${dceResult.xMotivo || 'Unknown SEFAZ error'}\n` +
                        (dceResult.cStat ? `SEFAZ code: ${dceResult.cStat}\n` : '') +
                        '\nCheck that addresses have valid CPF/CNPJ, items have correct NCM codes, ' +
                        'and the carrier is registered for DCe.',
                    );
                }

                const xmlData = buildXmlDataFromResponse(dceResult);
                for (const pkg of packages) {
                    pkg.xmlData = xmlData;
                }
            }
        }
    }

    const printOverrides = {
        printFormat: args.print_format as string | undefined,
        printSize: args.print_size as string | undefined,
    };
    const printSettings = await resolvePrintSettings(
        carrier, service, location.country_code, carrierId, printOverrides, client, config,
    );

    const body: Record<string, unknown> = {
        origin: originAddr,
        destination: destAddr,
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

    // --- Generate label ---
    const generateUrl = `${config.shippingBase}/ship/generate/`;
    const generateRes = await client.post<unknown>(generateUrl, body);

    if (!generateRes.ok) {
        const mapped = mapCarrierError(generateRes.status, generateRes.error ?? '');
        return textResponse(
            `Label creation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
        );
    }

    const validatedGenerate = parseToolResponse(
        CreateShipmentResponseSchema,
        generateRes.data,
        'envia_create_shipment',
    );
    const shipment = validatedGenerate.data?.[0] as LabelData | undefined;
    if (!shipment?.trackingNumber) {
        const raw = validatedGenerate as Record<string, unknown> | undefined;
        const detail = typeof raw?.message === 'string'
            ? raw.message
            : typeof raw?.error === 'string'
                ? raw.error
                : typeof (raw?.error as Record<string, unknown> | undefined)?.message === 'string'
                    ? (raw?.error as Record<string, unknown>).message as string
                    : '[no detail available]';
        return textResponse(
            `Label creation returned an unexpected response. No tracking number found.\n\n` +
            `API response: ${detail}\n\n` +
            'This usually means the carrier rejected the request. Check that all required address fields ' +
            'are present (name, street, number, district/colonia for MX, city, state, country, postalCode).',
        );
    }

    // --- Fulfillment sync (silent side-effect) ---
    const fulfillmentItems = activePackages
        .flatMap((pkg) => (pkg.products ?? []))
        .filter((p) => p.quantity > 0)
        .map((p) => ({ id: p.identifier ?? null, quantity: `${p.quantity}` }));

    const syncResult = await syncFulfillment(
        {
            shopId: order.shop.id,
            orderIdentifier: identifier,
            trackingNumber: shipment.trackingNumber,
            carrier: shipment.carrier,
            service: shipment.service,
            trackUrl: shipment.trackUrl,
            items: fulfillmentItems,
        },
        client,
        config,
    );

    const labelText = formatLabelOutput(shipment);
    if (!syncResult.ok) {
        const platformName = order.ecommerce.name || 'ecommerce platform';
        return textResponse(
            `${labelText}\n\n[warning] Label created but fulfillment sync to ${platformName} failed: ${syncResult.error}`,
        );
    }

    return textResponse(labelText);
}

// ---------------------------------------------------------------------------
// Identification validation
// ---------------------------------------------------------------------------

/**
 * Validate identification numbers based on country requirements.
 * Returns an error message string if validation fails, undefined if OK.
 *
 * @param originCountry - ISO 3166-1 alpha-2 origin country code
 * @param destCountry - ISO 3166-1 alpha-2 destination country code
 * @param originId - Origin identification number (CPF/CNPJ/NIT/etc.)
 * @param destId - Destination identification number
 * @returns Error message if validation fails, undefined if OK
 */
function validateIdentificationNumbers(
    originCountry: string,
    destCountry: string,
    originId: string | undefined,
    destId: string | undefined,
): string | undefined {
    const req = isIdentificationRequired(originCountry, destCountry, 'generate');
    if (!req.required) return undefined;

    const errors: string[] = [];

    if (req.fields.includes('origin')) {
        if (!originId || originId.trim() === '') {
            errors.push(`Origin identification number is required for ${originCountry} shipments.`);
        } else if (originCountry === 'BR') {
            const docType = detectBrazilianDocumentType(originId);
            if (docType === 'CPF' && !validateCPF(originId)) {
                errors.push('Origin CPF is invalid (checksum failed). Expected format: 11 digits (e.g. 529.982.247-25).');
            } else if (docType === 'CNPJ' && !validateCNPJ(originId)) {
                errors.push('Origin CNPJ is invalid (checksum failed). Expected format: 14 digits (e.g. 11.222.333/0001-81).');
            }
        } else if (originCountry === 'CO' && !validateNIT(originId)) {
            errors.push('Origin NIT is invalid. Must be 7-10 numeric digits.');
        }
    }

    if (req.fields.includes('destination')) {
        if (!destId || destId.trim() === '') {
            errors.push(`Destination identification number is required for shipments from ${originCountry}.`);
        } else if (destCountry === 'BR') {
            const docType = detectBrazilianDocumentType(destId);
            if (docType === 'CPF' && !validateCPF(destId)) {
                errors.push('Destination CPF is invalid (checksum failed). Expected format: 11 digits.');
            } else if (docType === 'CNPJ' && !validateCNPJ(destId)) {
                errors.push('Destination CNPJ is invalid (checksum failed). Expected format: 14 digits.');
            }
        } else if (destCountry === 'CO' && !validateNIT(destId)) {
            errors.push('Destination NIT is invalid. Must be 7-10 numeric digits.');
        }
    }

    return errors.length > 0 ? errors.join('\n') : undefined;
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
            'Use envia_quote_shipment first to compare rates and get carrier/service codes.',
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
        interior_number: args.origin_interior_number as string | undefined,
        district: (args.origin_district as string | undefined) || originResolved.district,
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
        interior_number: args.destination_interior_number as string | undefined,
        district: (args.destination_district as string | undefined) || destResolved.district,
        company: args.destination_company as string | undefined,
        email: args.destination_email as string | undefined,
        reference: args.destination_reference as string | undefined,
        identificationNumber: args.destination_identification_number as string | undefined,
    });

    // --- Generic-form address validation (all countries) ---
    const formValidationError = await validateAddressesViaGenericForm(
        origin, destination, originResolved.country, destResolved.country, client, config,
    );
    if (formValidationError) return formValidationError;

    // --- Identification validation ---
    const originCC = (originCountry ?? 'MX').toUpperCase();
    const destCC = (destCountry ?? 'MX').toUpperCase();

    const idError = validateIdentificationNumbers(
        originCC,
        destCC,
        args.origin_identification_number as string | undefined,
        args.destination_identification_number as string | undefined,
    );
    if (idError) {
        return textResponse(`Identification validation failed:\n${idError}`);
    }

    // --- Items requirement check ---
    const originSt = originResolved.state ?? (args.origin_state as string | undefined) ?? '';
    const destSt = destResolved.state ?? (args.destination_state as string | undefined) ?? '';
    const taxesApply = shouldApplyTaxes(originCC, originSt, destCC, destSt);
    const domesticButIntl = originCC === destCC && DOMESTIC_AS_INTERNATIONAL.has(originCC);
    const needsItems = !taxesApply || domesticButIntl;

    if (needsItems) {
        const hasItems = args.items && Array.isArray(args.items) && (args.items as unknown[]).length > 0;
        if (!hasItems) {
            return textResponse(
                `This route (${originCC}\u2192${destCC}) requires items in each package for customs/fiscal declarations.\n\n` +
                'Each item needs: description, quantity, price, and productCode (HS/NCM code).\n' +
                'Use envia_classify_hscode to look up the correct code for each product.\n\n' +
                'Example: items: [{ "description": "Cotton T-shirt", "quantity": 2, "price": 25.00, "productCode": "6109.10.00" }]',
            );
        }
    }

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

    const isInternational = originResolved.country.toUpperCase() !== destResolved.country.toUpperCase();
    const isBrDomestic = originResolved.country.toUpperCase() === 'BR' && destResolved.country.toUpperCase() === 'BR';

    let items: PackageItem[] | undefined;
    const rawItems = args.items as Array<Record<string, unknown>> | undefined;

    if (isInternational || isBrDomestic) {
        if (!rawItems || rawItems.length === 0) {
            const reason = isBrDomestic
                ? 'BR-to-BR shipments require items for DCe (Declaracao de Conteudo Eletronica) authorization.'
                : 'Carriers need package items with at least quantity and price for customs documentation.';
            return textResponse(
                `Error: items array is required.\n${reason}\n\n` +
                'Provide items: [{ quantity, price, description?, productCode? (NCM for BR), currency? }]',
            );
        }

        items = parseRawItems(rawItems, args.package_content as string);

        if (isBrDomestic) {
            const missingNcm = items.some((it) => !it.productCode);
            if (missingNcm) {
                return textResponse(
                    'Error: productCode (NCM) is required for every item in BR-to-BR shipments.\n' +
                    'The NCM code is needed for DCe authorization with SEFAZ.\n\n' +
                    'Example: items: [{ description: "T-shirt", quantity: 1, price: 50, productCode: "6109.10.00" }]',
                );
            }
        }
    } else if (rawItems && rawItems.length > 0) {
        items = parseRawItems(rawItems, args.package_content as string);
    }

    // --- BR-to-BR DCe authorization ---
    let xmlData: XmlDataEntry[] | undefined;
    const userXmlData = args.xml_data as XmlDataEntry[] | undefined;

    if (isBrDomestic) {
        if (userXmlData && userXmlData.length > 0) {
            xmlData = userXmlData;
        } else {
            const dceResult = await authorizeDce(
                buildDcePayload(origin, destination, items!, trimmedCarrier),
                client,
                config,
            );
            if (!dceResult.success) {
                return textResponse(
                    `DCe authorization failed: ${dceResult.xMotivo || 'Unknown SEFAZ error'}\n` +
                    (dceResult.cStat ? `SEFAZ code: ${dceResult.cStat}\n` : '') +
                    '\nCheck that addresses have valid CPF/CNPJ, items have correct NCM codes, ' +
                    'and the carrier is registered for DCe.',
                );
            }
            xmlData = buildXmlDataFromResponse(dceResult);
        }
    }

    const additionalServices = buildAdditionalServices(
        args.additional_services as Array<{ service: string; amount?: number }> | undefined,
        args.insurance_type as InsuranceServiceType | undefined,
        args.package_declared_value as number | undefined,
        args.cash_on_delivery_amount as number | undefined,
    );

    if (additionalServices.length > 0) {
        const validationError = validateInsuranceExclusivity(additionalServices);
        if (validationError) {
            return textResponse(`Error: ${validationError}`);
        }
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
                items,
                additionalServices: additionalServices.length > 0 ? additionalServices : undefined,
                xmlData,
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
// Shared validation and parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse raw item objects from tool input into typed PackageItem array.
 *
 * @param rawItems - Untyped item objects from tool arguments
 * @param fallbackDescription - Default description when item omits it
 * @returns Array of typed PackageItem objects
 */
function parseRawItems(rawItems: Array<Record<string, unknown>>, fallbackDescription?: string): PackageItem[] {
    return rawItems.map((raw) => {
        const item: PackageItem = {
            quantity: (raw.quantity as number) ?? 1,
            price: raw.price as number,
        };

        const desc = (raw.description as string | undefined) || fallbackDescription;
        if (desc) item.description = desc;
        if (raw.weight != null) item.weight = raw.weight as number;
        if (raw.sku) item.sku = raw.sku as string;
        if (raw.productCode) item.productCode = raw.productCode as string;
        if (raw.countryOfManufacture) {
            item.countryOfManufacture = (raw.countryOfManufacture as string).trim().toUpperCase();
        }
        if (raw.currency) item.currency = (raw.currency as string).trim().toUpperCase();

        return item;
    });
}

/**
 * Validate both origin and destination addresses against their country's
 * generic-form required fields.
 *
 * Returns an error response when validation fails, or null when both
 * addresses are complete. On API failure, logs a warning and returns null
 * (graceful degradation).
 *
 * @param origin - Origin generate address
 * @param destination - Destination generate address
 * @param originCountry - Origin ISO country code
 * @param destCountry - Destination ISO country code
 * @param client - Envia API client
 * @param config - Server configuration
 * @returns Error response or null when valid
 */
async function validateAddressesViaGenericForm(
    origin: GenerateAddress,
    destination: GenerateAddress,
    originCountry: string,
    destCountry: string,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<McpTextResponse | null> {
    const isSameCountry = originCountry.toUpperCase() === destCountry.toUpperCase();
    const [originForm, destForm] = isSameCountry
        ? await fetchGenericForm(originCountry, client, config).then((form) => [form, form] as const)
        : await Promise.all([
              fetchGenericForm(originCountry, client, config),
              fetchGenericForm(destCountry, client, config),
          ]);

    const originRequired = getRequiredFields(originForm);
    const destRequired = getRequiredFields(destForm);

    const originMissing = validateAddressCompleteness(origin as unknown as Record<string, unknown>, originRequired);
    const destMissing = validateAddressCompleteness(destination as unknown as Record<string, unknown>, destRequired);

    if (originMissing.length > 0 || destMissing.length > 0) {
        return textResponse(formatMissingFieldsError(originMissing, destMissing, originCountry, destCountry));
    }

    return null;
}

/**
 * Format a user-friendly error message listing missing required address fields.
 *
 * @param originMissing - Missing fields for origin address
 * @param destMissing - Missing fields for destination address
 * @param originCountry - Origin country code
 * @param destCountry - Destination country code
 * @returns Formatted error message
 */
function formatMissingFieldsError(
    originMissing: RequiredFieldDescriptor[],
    destMissing: RequiredFieldDescriptor[],
    originCountry: string,
    destCountry: string,
): string {
    const lines: string[] = ['Error: Required address fields are missing.', ''];

    if (originMissing.length > 0) {
        lines.push(`Origin (${originCountry.toUpperCase()}) is missing:`);
        for (const f of originMissing) {
            lines.push(`  - ${f.fieldLabel} (use origin_${f.toolParam})`);
        }
        lines.push('');
    }

    if (destMissing.length > 0) {
        lines.push(`Destination (${destCountry.toUpperCase()}) is missing:`);
        for (const f of destMissing) {
            lines.push(`  - ${f.fieldLabel} (use destination_${f.toolParam})`);
        }
        lines.push('');
    }

    lines.push('Provide the missing fields and try again.');
    return lines.join('\n');
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
    const res = await client.post<unknown>(url, body);

    if (!res.ok) {
        const mapped = mapCarrierError(res.status, res.error ?? '');
        return textResponse(
            `Label creation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
        );
    }

    const validatedRes = parseToolResponse(CreateShipmentResponseSchema, res.data, 'envia_create_shipment');
    const shipment = validatedRes.data?.[0] as LabelData | undefined;
    if (!shipment?.trackingNumber) {
        const raw = validatedRes as Record<string, unknown> | undefined;
        const detail = typeof raw?.message === 'string'
            ? raw.message
            : typeof raw?.error === 'string'
                ? raw.error
                : JSON.stringify(raw ?? {}).slice(0, 500);
        return textResponse(
            `Label creation returned an unexpected response. No tracking number found.\n\n` +
            `API response: ${detail}\n\n` +
            'This usually means the carrier rejected the request. Check that all required address fields ' +
            'are present (name, street, number, district/colonia for MX, city, state, country, postalCode).',
        );
    }

    return textResponse(formatLabelOutput(shipment));
}
