/**
 * Envia MCP Server — Shipments Service
 *
 * Provides helper functions for querying the Envia Queries API
 * for shipment-related data. Used by all shipment tools.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';

/**
 * Build a URL with query parameters from a params object.
 * Skips undefined, null, and empty string values.
 */
export function buildQueryUrl(base: string, path: string, params: Record<string, unknown>): string {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.append(key, String(value));
    }
    return url.toString();
}

/**
 * Execute a GET request against the Queries API with query parameters.
 */
export async function queryShipmentsApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Format a shipment's origin/destination as a one-line summary.
 */
export function formatAddressSummary(
    addr: { name?: string; city?: string; state?: string; country?: string } | undefined,
): string {
    if (!addr) return '—';
    const parts = [addr.name, addr.city, addr.state, addr.country].filter(Boolean);
    return parts.join(', ') || '—';
}

/**
 * Format a currency amount with symbol.
 */
export function formatCurrency(amount: number | undefined, currency?: string): string {
    if (amount === undefined || amount === null) return '—';
    return `$${Number(amount).toFixed(2)} ${currency ?? 'MXN'}`;
}
