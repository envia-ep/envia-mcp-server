/**
 * Package Builders
 *
 * Constructs package objects for the Envia carriers API.
 * Used by both rate quoting and label generation endpoints.
 *
 * Two entry points:
 *  - Manual input  — from flat tool parameters (create-label, envia_quote_shipment)
 *  - V4 order data — from ecommerce order packages
 *
 * All package types are defined in src/types/carriers-api.ts.
 */

import type { ShipmentPackage, PackageItem, AdditionalServiceEntry, XmlDataEntry } from '../types/carriers-api.js';
import { INSURANCE_SERVICES } from '../types/carriers-api.js';
import type { V4Package, V4Product } from '../types/ecommerce-order.js';

/** Default package type when the source does not specify one. */
const DEFAULT_PACKAGE_TYPE = 'box';

/** Default weight unit when the source does not specify one. */
const DEFAULT_WEIGHT_UNIT = 'KG';

/** Default length unit when the source does not specify one. */
const DEFAULT_LENGTH_UNIT = 'CM';

// ---------------------------------------------------------------------------
// Manual package builder (from tool parameters)
// ---------------------------------------------------------------------------

/** Input for building a package from flat tool parameters. */
export interface ManualPackageInput {
    weight: number;
    length: number;
    width: number;
    height: number;
    content?: string;
    declaredValue?: number;
    insurance?: number;
    boxCode?: string;
    type?: string;
    amount?: number;
    weightUnit?: string;
    lengthUnit?: string;
    items?: PackageItem[];
    additionalServices?: AdditionalServiceEntry[];
    xmlData?: XmlDataEntry[];
}

/**
 * Build a single package payload from flat tool parameters.
 *
 * Only includes optional fields when the caller provides them —
 * no data is invented.
 *
 * @param input - Package dimensions and metadata from tool args
 * @returns Package ready for the rate or generate API payload
 */
export function buildManualPackage(input: ManualPackageInput): ShipmentPackage {
    const pkg: ShipmentPackage = {
        type: input.type || DEFAULT_PACKAGE_TYPE,
        content: input.content || 'General merchandise',
        amount: input.amount || 1,
        weight: input.weight,
        weightUnit: input.weightUnit || DEFAULT_WEIGHT_UNIT,
        lengthUnit: input.lengthUnit || DEFAULT_LENGTH_UNIT,
        dimensions: {
            length: input.length,
            width: input.width,
            height: input.height,
        },
    };

    if (input.declaredValue != null && input.declaredValue > 0) pkg.declaredValue = input.declaredValue;
    if (input.insurance != null && input.insurance > 0) pkg.insurance = input.insurance;
    if (input.boxCode) pkg.boxCode = input.boxCode;
    if (input.items && input.items.length > 0) pkg.items = input.items;
    if (input.additionalServices && input.additionalServices.length > 0) {
        pkg.additionalServices = input.additionalServices;
    }
    if (input.xmlData && input.xmlData.length > 0) pkg.xmlData = input.xmlData;

    return pkg;
}

/**
 * Validate that at most one insurance-type service is selected.
 *
 * Insurance services are mutually exclusive: only `envia_insurance`,
 * `insurance`, or `high_value_protection` may appear — never two
 * simultaneously.
 *
 * @param services - Additional services to validate
 * @returns null when valid, or an error message string
 */
export function validateInsuranceExclusivity(services: AdditionalServiceEntry[]): string | null {
    const selected = services
        .map((s) => s.service)
        .filter((name) => (INSURANCE_SERVICES as readonly string[]).includes(name));

    if (selected.length > 1) {
        return (
            `Only one insurance service may be selected at a time. ` +
            `Found: ${selected.join(', ')}. ` +
            `Choose one of: ${INSURANCE_SERVICES.join(', ')}.`
        );
    }

    return null;
}

// ---------------------------------------------------------------------------
// V4 order package builders
// ---------------------------------------------------------------------------

/**
 * Build a single package payload from a V4 order package.
 *
 * Passes through all available V4 data without inventing fields.
 *
 * @param pkg - V4 package from the orders API
 * @param includeItems - Whether to include product line items (for international shipments)
 * @returns Package ready for the rate or generate API payload
 */
export function buildPackageFromV4(pkg: V4Package, includeItems: boolean): ShipmentPackage {
    const payload: ShipmentPackage = {
        type: pkg.package_type_name?.toLowerCase() || DEFAULT_PACKAGE_TYPE,
        content: pkg.content || 'General merchandise',
        amount: pkg.amount || 1,
        weight: pkg.weight || 0,
        weightUnit: pkg.weight_unit || DEFAULT_WEIGHT_UNIT,
        lengthUnit: pkg.length_unit || DEFAULT_LENGTH_UNIT,
        dimensions: {
            length: pkg.dimensions?.length || 0,
            width: pkg.dimensions?.width || 0,
            height: pkg.dimensions?.height || 0,
        },
    };

    if (pkg.declared_value != null && pkg.declared_value > 0) payload.declaredValue = pkg.declared_value;
    if (pkg.insurance != null && pkg.insurance > 0) payload.insurance = pkg.insurance;
    if (pkg.box_code) payload.boxCode = pkg.box_code;

    if (pkg.additional_services && pkg.additional_services.length > 0) {
        payload.additionalServices = pkg.additional_services;
    }

    if (includeItems && pkg.products?.length > 0) {
        payload.items = buildItemsFromV4(pkg.products);
    }

    return payload;
}

/**
 * Build package payloads from an array of V4 order packages.
 *
 * @param pkgs - V4 packages from the orders API
 * @param includeItems - Whether to include product line items
 * @returns Array of packages ready for the API payload
 */
export function buildPackagesFromV4(pkgs: V4Package[], includeItems: boolean): ShipmentPackage[] {
    return pkgs.map((pkg) => buildPackageFromV4(pkg, includeItems));
}

/**
 * Build product item payloads from V4 order products.
 *
 * Maps V4 product fields to the `packageItem` schema definition.
 *
 * @param products - V4 product line items
 * @returns Array of item payloads for international shipments
 */
export function buildItemsFromV4(products: V4Product[]): PackageItem[] {
    return products.map((prod) => {
        const item: PackageItem = {
            description: prod.name,
            quantity: prod.quantity,
            price: prod.price,
        };

        if (prod.sku) item.sku = prod.sku;
        if (prod.weight != null && prod.weight > 0) item.weight = prod.weight;

        return item;
    });
}
