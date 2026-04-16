/**
 * Orders Types — Fase 3
 *
 * New response-level types for ecommerce order management endpoints.
 * Carrier-payload and V4 order shapes are imported from ecommerce-order.ts;
 * only types unique to the order-management tools are defined here.
 */

// Re-export types already defined in ecommerce-order.ts so callers can import
// from a single "orders" namespace without duplication.
export type {
    V4OrdersResponse,
    V4Order,
    V4Shop,
    V4Tag,
} from './ecommerce-order.js';

import type { V4Order } from './ecommerce-order.js';

// ---------------------------------------------------------------------------
// Extended order type — includes additional status fields present in the real
// /v4/orders API response that V4Order does not declare.
// ---------------------------------------------------------------------------

/** V4Order extended with payment/fulfillment status fields from the real API. */
export interface OrderRecord extends V4Order {
    /** Payment status ID: 1=Paid, 2=Pending, 3+=COD/other. */
    ecart_status_id?: number;
    /** Human-readable payment status (e.g. "Paid"). */
    ecart_status_name?: string;
    /** CSS class hint: success | warning | danger. */
    ecart_status_class?: string;
    /** Preparation status: 1=Fulfilled, 2=Partial, 3=Unfulfilled, 4=Other, 5=On Hold. */
    fulfillment_status_id?: number;
    /** UTC datetime the order was created in the ecommerce platform. */
    created_at_ecommerce?: string;
    /** Estimated delivery date, or null. */
    estimated_delivery_in?: string | null;
    /** MercadoLibre logistics mode. */
    logistic?: { mode: string | null };
}

/** Top-level response from GET /v4/orders using the extended order type. */
export interface OrderListResponse {
    orders_info: OrderRecord[];
    countries: string[];
    totals: number;
}

// ---------------------------------------------------------------------------
// GET /v2/orders-count
// ---------------------------------------------------------------------------

/** Per-store breakdown within a single status category. */
export interface OrderCountByStore {
    shop_id: number;
    general_status_id: number;
    general_status_description: string;
    total: number;
}

/** A single status category returned by /v2/orders-count. */
export interface OrderCountCategory {
    total: number;
    total_by_store: OrderCountByStore[];
}

/** Top-level response from GET /v2/orders-count. */
export interface OrderCountsResponse {
    data: {
        payment_pending: OrderCountCategory;
        label_pending: OrderCountCategory;
        pickup_pending: OrderCountCategory;
        shipped: OrderCountCategory;
        canceled: OrderCountCategory;
        other: OrderCountCategory;
        completed: OrderCountCategory;
    };
}

// ---------------------------------------------------------------------------
// GET /company/shops
// ---------------------------------------------------------------------------

/**
 * A single shop record returned by /company/shops.
 * Distinct from V4Shop (which only has id/name); this has full store metadata.
 */
export interface ShopRecord {
    id: number;
    company_id: number;
    ecommerce_id: number;
    ecommerce_name: string;
    ecommerce_description: string;
    name: string;
    url: string | null;
    active: number;
    deleted: number;
    package_automatic: number;
    package_automatic_recommended: unknown | null;
    checkout: number;
    origin: string;
}

// ---------------------------------------------------------------------------
// GET /orders/filter-options
// ---------------------------------------------------------------------------

/** A single destination country option. */
export interface DestinationCountry {
    country_code: string;
    country_name: string;
}

/** Response from GET /orders/filter-options. */
export interface OrderFilterOptionsResponse {
    destinations_country_code: DestinationCountry[];
}

// ---------------------------------------------------------------------------
// GET /orders/orders-information-by-status
// ---------------------------------------------------------------------------

/**
 * Response from GET /orders/orders-information-by-status.
 * Flat structure — note the intentional typo "unfullfilledOrders" in the API.
 */
export interface OrderAnalyticsResponse {
    unfullfilledOrders: number;
    readyToFulFill: number;
    readyToShip: number;
    pickUpInTransit: number;
    percentagePickUpInTransit: string;
    outForDelivery: number;
    percentageOutForDelivery: string;
    delivered: number;
    percentageDelivered: string;
    withIncidents: number;
    percentageWithIncidents: string;
    returned: number;
    percentageReturned: string;
    sumOrdersActive: number;
}

// ---------------------------------------------------------------------------
// POST /orders/{shop_id}/{order_id}/fulfillment/order-shipments
// ---------------------------------------------------------------------------

/** Response from POST fulfillment/order-shipments. */
export interface FulfillOrderResponse {
    success: boolean;
    id?: number;
    packages_fulfillment?: unknown[];
    isFulfillmentOrder?: boolean;
    completed?: boolean;
}

// ---------------------------------------------------------------------------
// POST/DELETE /orders/tags
// ---------------------------------------------------------------------------

/** A single tag record returned after adding tags. */
export interface TagRecord {
    order_id: number;
    tag_id: number;
    tag: string;
    source: string;
    created_by: number;
    created_at: string;
}

/** Response from POST /orders/tags (add action). */
export interface TagAddResponse {
    success: boolean;
    inserted: number;
    tags: TagRecord[];
}

/** Response from DELETE /orders/tags (remove action). */
export interface TagRemoveResponse {
    success: boolean;
    deleted: number;
}
