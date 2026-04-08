/**
 * Package Builders
 *
 * Constructs package objects for the Envia carriers API.
 * Used by both rate quoting and label generation endpoints.
 *
 * Two entry points:
 *  - Manual input  — from flat tool parameters (create-label, quote_shipment)
 *  - V4 order data — from ecommerce order packages
 *
 * All package types are defined in src/types/carriers-api.ts.
 */

import type { ShipmentPackage, PackageItem } from '../types/carriers-api.js';
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
    type?: string;
    amount?: number;
    weightUnit?: string;
    lengthUnit?: string;
}

/**
 * Build a single package payload from flat tool parameters.
 *
 * @param input - Package dimensions and metadata from tool args
 * @returns Package ready for the rate or generate API payload
 */
export function buildManualPackage(input: ManualPackageInput): ShipmentPackage {
    return {
        type: input.type || DEFAULT_PACKAGE_TYPE,
        content: input.content || 'General merchandise',
        amount: input.amount || 1,
        declaredValue: input.declaredValue || 0,
        weight: input.weight,
        weightUnit: input.weightUnit || DEFAULT_WEIGHT_UNIT,
        lengthUnit: input.lengthUnit || DEFAULT_LENGTH_UNIT,
        dimensions: {
            length: input.length,
            width: input.width,
            height: input.height,
        },
    };
}

// ---------------------------------------------------------------------------
// V4 order package builders
// ---------------------------------------------------------------------------

/**
 * Build a single package payload from a V4 order package.
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
        declaredValue: pkg.declared_value || 0,
        weight: pkg.weight || 0,
        weightUnit: pkg.weight_unit || DEFAULT_WEIGHT_UNIT,
        lengthUnit: pkg.length_unit || DEFAULT_LENGTH_UNIT,
        dimensions: {
            length: pkg.dimensions?.length || 0,
            width: pkg.dimensions?.width || 0,
            height: pkg.dimensions?.height || 0,
        },
    };

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
 * @param products - V4 product line items
 * @returns Array of item payloads for international shipments
 */
export function buildItemsFromV4(products: V4Product[]): PackageItem[] {
    return products.map((prod) => ({
        name: prod.name,
        sku: prod.sku ?? '',
        quantity: prod.quantity,
        price: prod.price,
        weight: prod.weight ?? 0,
    }));
}
