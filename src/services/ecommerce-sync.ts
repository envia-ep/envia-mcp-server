/**
 * Envia MCP Server — Ecommerce Fulfillment Sync
 *
 * After the MCP creates a label from an ecommerce order (`envia_create_label`
 * with `order_identifier`), this helper notifies the source ecommerce platform
 * (Shopify, WooCommerce, Tiendanube, etc.) that the order has been fulfilled.
 *
 * The sync fires as a SILENT SIDE-EFFECT — it never throws and never causes
 * the overall `create_label` tool to fail. If the sync fails, the caller
 * appends a human-readable warning to the tool's response text.
 *
 * Mechanism: calls `POST {queriesBase}/tmp-fulfillment/{shop_id}/{order_identifier}`
 * on the Queries service. The Queries service then runs the platform-specific
 * fulfillment strategy (Shopify fulfillment orders, Tiendanube shipments, etc.)
 * and posts the tracking info to ecartAPI, which relays it to the platform.
 *
 * The payload `url` field is the ecartAPI fulfillment endpoint. It is always:
 *   `{ENVIA_ECART_HOSTNAME}/api/v2/orders/{order_identifier}/fulfillments`
 *
 * When `ENVIA_ECART_HOSTNAME` is not configured, the sync is skipped and
 * `ok: false` is returned — `create_label` will append a warning.
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Item to be fulfilled in the ecommerce platform. */
export interface FulfillmentItem {
    /** Platform-specific item ID (ecartAPI ID). May be null for orders that predate ecartAPI indexing. */
    id: string | null;
    /** Quantity as a string (ecartAPI expects string). */
    quantity: string;
}

/** Input for the syncFulfillment helper. */
export interface SyncFulfillmentInput {
    /** Envia shop ID (from the V4 order's `shop.id`). */
    shopId: number;
    /** Platform order identifier (e.g. Shopify order ID, WooCommerce order number). */
    orderIdentifier: string;
    /** Tracking number returned by the label creation. */
    trackingNumber: string;
    /** Carrier name (e.g. "dhl", "fedex"). */
    carrier: string;
    /** Service code (e.g. "express"). Optional. */
    service?: string;
    /** Tracking URL. Optional — generated from trackingNumber when absent. */
    trackUrl?: string;
    /** Items to mark as fulfilled. Empty array results in a no-op on most platforms. */
    items: FulfillmentItem[];
}

/** Outcome returned by syncFulfillment. Never throws. */
export interface SyncFulfillmentResult {
    /** True when the queries service accepted the fulfillment request (HTTP 2xx). */
    ok: boolean;
    /** Human-readable reason when ok is false. */
    error?: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Generate a tracking URL from a tracking number.
 *
 * Falls back to the Envia public tracking page — the Queries service
 * will override this with a carrier-specific URL when available.
 *
 * @param trackingNumber - The shipment tracking number to encode in the URL.
 * @returns A fully-formed tracking page URL.
 */
function buildTrackingUrl(trackingNumber: string): string {
    return `https://envia.com/tracking?label=${encodeURIComponent(trackingNumber)}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Notify the ecommerce platform that a label has been created.
 *
 * This is a best-effort call. It never throws. On failure it returns
 * `{ ok: false, error: reason }` so the caller can append a warning.
 *
 * @param input   - Fulfillment context extracted from the create_label response
 * @param client  - Authenticated Envia API client
 * @param config  - Server configuration
 * @returns Outcome — check `ok` before surfacing to the user
 */
export async function syncFulfillment(
    input: SyncFulfillmentInput,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<SyncFulfillmentResult> {
    if (!config.ecartApiBase) {
        return {
            ok: false,
            error: 'ENVIA_ECART_HOSTNAME is not configured — fulfillment sync skipped.',
        };
    }

    const today = new Date().toISOString().split('T')[0];
    const trackingUrl = input.trackUrl ?? buildTrackingUrl(input.trackingNumber);
    const ecartFulfillmentUrl = `${config.ecartApiBase}/api/v2/orders/${input.orderIdentifier}/fulfillments`;

    const payload: Record<string, unknown> = {
        url: ecartFulfillmentUrl,
        fulfillment: {
            tracking: {
                number: input.trackingNumber,
                company: input.carrier,
                url: trackingUrl,
            },
            shippingMethod: input.service ?? '',
            shippingDate: today,
            items: input.items,
        },
        type_generate: 'mcp_generate',
    };

    const url = `${config.queriesBase}/tmp-fulfillment/${input.shopId}/${input.orderIdentifier}`;
    try {
        const res = await client.post<{ success?: boolean }>(url, payload);
        if (!res.ok) {
            return { ok: false, error: res.error ?? `HTTP ${res.status}` };
        }
        return { ok: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false, error: message };
    }
}
