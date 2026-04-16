/**
 * Products, Billing, and DCe Types — Fase 10
 *
 * Response interfaces for the products, billing-information, and DCe status
 * API endpoints served by the Queries service.
 *
 * Critical notes:
 *  - /products/envia/{id} is BROKEN in sandbox.
 *    Use envia_list_products with ?product_identifier=X as a workaround for detail lookup.
 *  - /billing-information returns billing_data as a JSON-stringified string.
 *    Use the top-level fields (address_name, street, city, etc.) — do NOT JSON.parse billing_data.
 *  - /dce/status may return cStat "999" in sandbox — this is normal, not an error.
 */

// ---------------------------------------------------------------------------
// Products — GET /products
// ---------------------------------------------------------------------------

/** A single product saved in the company catalogue. */
export interface Product {
    id: number;
    /** Unique product identifier — use as ?product_identifier=X for filtered lookup. */
    product_identifier: string;
    product_name: string;
    description: string | null;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    price: number | null;
    quantity: number | null;
    /** HS/NCM product code for customs classification. */
    product_code: string | null;
    currency: string | null;
    content: string | null;
}

/** Response from GET /products. */
export interface ProductsResponse {
    data: Product[];
    total?: number;
}

// ---------------------------------------------------------------------------
// Billing Information — GET /billing-information
// ---------------------------------------------------------------------------

/**
 * Company billing information.
 *
 * IMPORTANT: The `billing_data` field is a JSON-stringified object.
 * Do NOT call JSON.parse on it — use the top-level fields instead:
 *   address_name, street, street_number, neighborhood, city, state,
 *   postal_code, country, rfc, email, phone.
 */
export interface BillingInformation {
    id: number;
    address_name: string | null;
    street: string | null;
    street_number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    rfc: string | null;
    email: string | null;
    phone: string | null;
    /** JSON-stringified object — do NOT parse, use top-level fields. */
    billing_data: string | null;
}

// ---------------------------------------------------------------------------
// Billing Information Check — GET /billing-information/check
// ---------------------------------------------------------------------------

/** Response from GET /billing-information/check. */
export interface BillingInfoCheck {
    hasBillingInfo: boolean;
}

// ---------------------------------------------------------------------------
// DCe Status — GET /dce/status
// ---------------------------------------------------------------------------

/**
 * DCe (Declaração de Conteúdo Eletrônica) authorization status for Brazil.
 *
 * NOTE: cStat "999" is returned in sandbox and means the service is operational
 * but no real SEFAZ connection is available. This is expected in sandbox — not an error.
 */
export interface DceStatusResponse {
    cStat: string;
    xMotivo: string;
}
