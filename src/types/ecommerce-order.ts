/**
 * Ecommerce Order Types
 *
 * Typed interfaces for the V4 orders API response from the Queries service
 * and the transformation output structures used by MCP tools.
 *
 * Carriers API payload types (addresses, packages, settings, ecommerce
 * sections) live in ./carriers-api.ts — this file only contains V4
 * response shapes and tool-level transformation types.
 */

import type {
    RateAddress,
    GenerateAddress,
    ShipmentPackage,
    EcommerceSection,
} from './carriers-api.js';

// ---------------------------------------------------------------------------
// V4 Orders API response shapes (GET /v4/orders)
// ---------------------------------------------------------------------------

/** Top-level response from GET /v4/orders. */
export interface V4OrdersResponse {
    orders_info: V4Order[];
    countries: unknown[];
    totals?: Record<string, unknown>;
}

/** A single order as returned by the V4 endpoint. */
export interface V4Order {
    id: number;
    status_id: number;
    order: V4OrderDetails;
    customer: V4Customer;
    shop: V4Shop;
    ecommerce: V4Ecommerce;
    shipment_data: V4ShipmentData;
    tags?: V4Tag[];
    is_favorite?: boolean;
}

/** Ecommerce-specific order identifiers and metadata. */
export interface V4OrderDetails {
    identifier: string;
    name: string;
    number: string;
    status_payment: string;
    currency: string;
    total: number;
    shipping_method: string;
    shipping_option_reference: string | null;
    cod: number;
    logistic_mode: string | null;
    created_at_ecommerce: string;
}

/** Customer information attached to the order. */
export interface V4Customer {
    name: string;
    email: string;
}

/** Store (shop) that owns the order. */
export interface V4Shop {
    id: number;
    name: string;
}

/** Ecommerce platform metadata. */
export interface V4Ecommerce {
    id: number;
    name: string;
}

/** Shipment data containing destination address and origin locations. */
export interface V4ShipmentData {
    shipping_address: V4ShippingAddress;
    locations: V4Location[];
}

/** Customer shipping address (destination). */
export interface V4ShippingAddress {
    company: string | null;
    first_name: string;
    last_name: string;
    phone: string;
    address_1: string;
    address_2: string | null;
    address_3: string | null;
    city: string;
    state_code: string;
    country_code: string;
    postal_code: string;
    email: string;
    reference: string | null;
    identification_number: string | null;
    branch_code: string | null;
}

/** Origin location (warehouse/store) containing packages. */
export interface V4Location {
    id: number;
    first_name: string;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    address_1: string;
    address_2: string | null;
    city: string;
    state_code: string;
    country_code: string;
    postal_code: string;
    packages: V4Package[];
}

/** A package within a location, including carrier quote and products. */
export interface V4Package {
    id: number;
    name: string | null;
    content: string;
    amount: number;
    box_code: string | null;
    package_type_id: number;
    package_type_name: string;
    insurance: number;
    declared_value: number;
    dimensions: V4Dimensions;
    weight: number;
    weight_unit: string;
    length_unit: string;
    quote: V4PackageQuote;
    shipment: V4PackageShipment | null;
    fulfillment: V4Fulfillment;
    products: V4Product[];
    additional_services?: V4AdditionalService[];
    is_return?: boolean;
}

/** Package physical dimensions. */
export interface V4Dimensions {
    height: number;
    length: number;
    width: number;
}

/**
 * Carrier quote pre-selected at the package level.
 * This is the authoritative carrier selection source — order-level
 * shipping_options are ignored per the Scan & Go specification.
 */
export interface V4PackageQuote {
    price: number | null;
    service_id: number | null;
    carrier_id: number | null;
    carrier_name: string | null;
    service_name: string | null;
}

/** Shipment data for an already-generated label. */
export interface V4PackageShipment {
    name: string | null;
    tracking_number: string | null;
    shipment_id: number | null;
    status: string | null;
}

/** Fulfillment status for the package. */
export interface V4Fulfillment {
    status: string;
    status_id: number;
}

/** Line item within a package. */
export interface V4Product {
    name: string;
    sku: string | null;
    quantity: number;
    price: number;
    weight: number | null;
    identifier: string | null;
    variant_id: string | null;
}

/** Additional service attached to a package (e.g. insurance, COD). */
export interface V4AdditionalService {
    service: string;
    data?: { amount?: number };
}

/** Tag attached to an order. */
export interface V4Tag {
    id: number;
    tag: string;
    source: 'ecommerce' | 'user';
}

// ---------------------------------------------------------------------------
// Carrier extraction result
// ---------------------------------------------------------------------------

/** Carrier information extracted from a package-level quote. */
export interface PayloadCarrier {
    carrier: string;
    service: string;
    carrierId: number;
    serviceId: number;
}

// ---------------------------------------------------------------------------
// Per-location transformed payloads
// ---------------------------------------------------------------------------

/** Rate quoting payload for a single origin location. */
export interface LocationQuotePayload {
    origin: RateAddress;
    destination: RateAddress;
    packages: ShipmentPackage[];
    carrier?: PayloadCarrier;
}

/** Label generation payload for a single origin location. */
export interface LocationGeneratePayload {
    origin: GenerateAddress;
    destination: GenerateAddress;
    packages: ShipmentPackage[];
    shipment: {
        carrier: string;
        service: string;
        type: number;
        orderReference: string;
    };
    settings: {
        currency: string;
    };
    ecommerce: EcommerceSection;
}

// ---------------------------------------------------------------------------
// Transformed order (tool output)
// ---------------------------------------------------------------------------

/** Summary metadata for an order. */
export interface OrderSummary {
    orderId: number;
    orderIdentifier: string;
    orderName: string;
    orderNumber: string;
    shopName: string;
    ecommercePlatform: string;
    currency: string;
    statusPayment: string;
    fulfillmentWarnings: string[];
}

/** A single location with its transformed payloads and warnings. */
export interface TransformedLocation {
    locationIndex: number;
    originLabel: string;
    carrier: PayloadCarrier | null;
    quotePayload: LocationQuotePayload;
    generatePayload: LocationGeneratePayload | null;
    warnings: string[];
}

/** Complete transformation result for an order. */
export interface TransformedOrder {
    summary: OrderSummary;
    locations: TransformedLocation[];
}
