/**
 * Envia MCP Server — Addresses Service
 *
 * Provides helper functions for querying the Envia Queries API
 * for saved-address CRUD operations. Used by all address tools.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';

/**
 * Execute a GET request against the Queries API for addresses.
 */
export async function queryAddressesApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a POST request against the Queries API for addresses.
 */
export async function mutateAddressApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

/**
 * Execute a PUT request against the Queries API for addresses.
 */
export async function updateAddressApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.put<T>(url, body);
}

/**
 * Execute a DELETE request against the Queries API for addresses.
 */
export async function deleteAddressApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.delete<T>(url);
}

/**
 * Format a saved address as a readable one-line summary.
 */
export function formatAddressLine(addr: {
    name?: string;
    street?: string;
    number?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
}): string {
    const street = [addr.street, addr.number].filter(Boolean).join(' ');
    const location = [addr.district, addr.city, addr.state].filter(Boolean).join(', ');
    const full = [street, location, addr.country, addr.postal_code].filter(Boolean).join(' | ');
    return full || '—';
}
