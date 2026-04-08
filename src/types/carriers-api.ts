/**
 * Carriers API Types
 *
 * Single source of truth for payload structures consumed by the Envia
 * carriers service (rate quoting and label generation).
 *
 * These interfaces match the JSON Schema definitions in the carriers
 * project (generate.v1.schema, rate.v1.schema) and are produced by
 * the builders in src/builders/.
 */

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * Minimal geographic address for rate quoting (POST /ship/rate).
 *
 * The rate schema requires only city, state, country, and postalCode.
 * A placeholder street is included because the API still expects it.
 */
export interface RateAddress {
    street: string;
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
}

/**
 * Full address for label generation (POST /ship/generate).
 *
 * Matches the `definitions.address` in generate.v1.schema.
 * Required: name, street, number, city, state, country, postalCode.
 * The remaining fields are optional but improve label quality.
 */
export interface GenerateAddress {
    name: string;
    street: string;
    number?: string;
    district?: string;
    interior_number?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    phone?: string;
    company?: string;
    email?: string;
    reference?: string;
    identificationNumber?: string;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

/** Physical dimensions of a package in centimeters. */
export interface PackageDimensions {
    length: number;
    width: number;
    height: number;
}

/**
 * Product item within a package.
 * Used for international shipments and customs declarations.
 */
export interface PackageItem {
    name: string;
    sku: string;
    quantity: number;
    price: number;
    weight: number;
}

/**
 * Package payload for both rate quoting and label generation.
 *
 * Matches the `definitions.singlePackage` in rate.v1.schema and
 * generate.v1.schema (shared core structure).
 */
export interface ShipmentPackage {
    type: string;
    content: string;
    amount: number;
    declaredValue: number;
    weight: number;
    weightUnit: string;
    lengthUnit: string;
    dimensions: PackageDimensions;
    items?: PackageItem[];
}

// ---------------------------------------------------------------------------
// Shipment section
// ---------------------------------------------------------------------------

/**
 * Shipment section for label generation (POST /ship/generate).
 *
 * The generate schema requires carrier, service, and type.
 * orderReference and customKey are optional metadata.
 */
export interface GenerateShipment {
    carrier: string;
    service: string;
    type: number;
    orderReference?: string;
    customKey?: string;
}

// ---------------------------------------------------------------------------
// Settings section
// ---------------------------------------------------------------------------

/**
 * Settings section for label generation (POST /ship/generate).
 *
 * The generate schema requires printFormat and printSize.
 * currency, shopId, and returnFile are optional.
 */
export interface GenerateSettings {
    printFormat: string;
    printSize: string;
    currency?: string;
    shopId?: number;
    returnFile?: boolean;
}

// ---------------------------------------------------------------------------
// Ecommerce section
// ---------------------------------------------------------------------------

/**
 * Ecommerce metadata included in generation payloads for orders
 * originating from an ecommerce platform (Shopify, Tiendanube, etc.).
 */
export interface EcommerceSection {
    shop_id: number;
    order_id: number;
    order_identifier: string;
    order_name: string;
    order_number: string;
    type_generate: 'multi_generate';
}
