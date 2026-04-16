/**
 * Envia MCP Server — Orders Service
 *
 * Provides CRUD helpers and text formatters for the ecommerce orders API.
 * All endpoints are served by the Queries service (queriesBase).
 * Reuses buildQueryUrl from shipments.ts — not duplicated here.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';
import type { OrderRecord, ShopRecord, OrderCountsResponse, OrderAnalyticsResponse } from '../types/orders.js';

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Execute a GET request against the Queries API for orders.
 */
export async function queryOrdersApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a POST request against the Queries API for orders.
 */
export async function mutateOrderApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

/**
 * Execute a PUT request against the Queries API for orders.
 */
export async function updateOrderApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.put<T>(url, body);
}

/**
 * Execute a DELETE request with a JSON body against the Queries API for orders.
 *
 * Uses client.request() directly because the convenience delete() helper does
 * not support a request body (required for DELETE /orders/tags).
 */
export async function deleteOrderApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.request<T>({ url, method: 'DELETE', body });
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format the general status label from status_id.
 */
function generalStatusLabel(statusId: number): string {
    const map: Record<number, string> = {
        1: 'Payment Pending',
        2: 'Label Pending',
        3: 'Pickup Pending',
        4: 'Shipped',
        5: 'Canceled',
        7: 'Completed',
    };
    return map[statusId] ?? `Status ${statusId}`;
}

/**
 * Format the fulfillment status label from fulfillment_status_id.
 */
function fulfillmentStatusLabel(statusId: number | undefined): string {
    const map: Record<number, string> = {
        1: 'Fulfilled',
        2: 'Partial',
        3: 'Unfulfilled',
        4: 'Other',
        5: 'On Hold',
    };
    return statusId !== undefined ? (map[statusId] ?? `Fulfillment ${statusId}`) : '—';
}

/**
 * Format a single order as a one-line summary including all three status dimensions.
 *
 * @param order - V4 order object from /v4/orders
 * @returns Multi-line formatted summary block
 */
export function formatOrderSummary(order: OrderRecord): string {
    const name = order.order?.name ?? `#${order.id}`;
    const shop = order.shop?.name ?? '—';
    const customer = order.customer?.name ?? '—';
    const platform = order.ecommerce?.name ?? '—';
    const general = generalStatusLabel(order.status_id);
    const payment = order.ecart_status_name ?? '—';
    const fulfillment = fulfillmentStatusLabel(order.fulfillment_status_id);
    const destination = order.shipment_data?.shipping_address;
    const destStr = destination
        ? `${destination.city ?? '—'}, ${destination.state_code ?? '—'}, ${destination.country_code ?? '—'}`
        : '—';
    const tags = Array.isArray(order.tags) && order.tags.length > 0
        ? order.tags.map((t) => (typeof t === 'string' ? t : t.tag)).join(', ')
        : '';

    const lines = [
        `• [${order.id}] ${name} — ${shop} (${platform})`,
        `  Customer: ${customer} | Destination: ${destStr}`,
        `  General: ${general} | Payment: ${payment} | Fulfillment: ${fulfillment}`,
    ];
    if (tags) lines.push(`  Tags: ${tags}`);
    return lines.join('\n');
}

/**
 * Format the /v2/orders-count response as a readable status summary.
 *
 * @param data - The data object from OrderCountsResponse
 * @returns Multi-line formatted counts
 */
export function formatOrderCounts(data: OrderCountsResponse['data']): string {
    const entries: Array<[string, string]> = [
        ['payment_pending', 'Payment Pending (unpaid)'],
        ['label_pending', 'Label Pending (ready to prepare)'],
        ['pickup_pending', 'Pickup Pending (label created)'],
        ['shipped', 'Shipped (in transit)'],
        ['canceled', 'Canceled'],
        ['other', 'Other (en route / incidents / returned)'],
        ['completed', 'Completed (delivered)'],
    ];

    const lines = ['Order status summary:', ''];
    for (const [key, label] of entries) {
        const category = data[key as keyof typeof data];
        if (category) {
            lines.push(`  ${label}: ${category.total}`);
        }
    }
    return lines.join('\n');
}

/**
 * Format a single ShopRecord as a readable one-line summary.
 *
 * @param shop - Shop record from /company/shops
 * @returns Formatted shop summary string
 */
export function formatShopSummary(shop: ShopRecord): string {
    const status = shop.active === 1 && shop.deleted === 0 ? 'active' : 'inactive';
    const url = shop.url ? ` | ${shop.url}` : '';
    return `• [${shop.id}] ${shop.name} — ${shop.ecommerce_description} (${status})${url}`;
}

/**
 * Format the flat analytics response as readable text.
 *
 * @param data - OrderAnalyticsResponse from /orders/orders-information-by-status
 * @returns Multi-line formatted analytics summary
 */
export function formatAnalytics(data: OrderAnalyticsResponse): string {
    return [
        'Order analytics by shipment status:',
        '',
        `  Unfulfilled orders:        ${data.unfullfilledOrders}`,
        `  Ready to fulfill:          ${data.readyToFulFill}`,
        `  Ready to ship:             ${data.readyToShip}`,
        `  Active orders total:       ${data.sumOrdersActive}`,
        '',
        `  Pickup / In transit:       ${data.pickUpInTransit} (${data.percentagePickUpInTransit})`,
        `  Out for delivery:          ${data.outForDelivery} (${data.percentageOutForDelivery})`,
        `  Delivered:                 ${data.delivered} (${data.percentageDelivered})`,
        `  With incidents:            ${data.withIncidents} (${data.percentageWithIncidents})`,
        `  Returned:                  ${data.returned} (${data.percentageReturned})`,
    ].join('\n');
}
