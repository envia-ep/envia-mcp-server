/**
 * Envia MCP Server — Clients Service
 *
 * Provides helper functions for querying the Envia Queries API
 * for client CRUD operations. Used by all client tools.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';

/**
 * Execute a GET request against the Queries API for clients.
 */
export async function queryClientsApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a POST request against the Queries API for clients.
 */
export async function mutateClientApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

/**
 * Execute a PUT request against the Queries API for clients.
 */
export async function updateClientApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.put<T>(url, body);
}

/**
 * Execute a DELETE request against the Queries API for clients.
 */
export async function deleteClientApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.delete<T>(url);
}

/**
 * Format a client address as a one-line summary.
 */
export function formatClientAddress(
    addr: { street?: string; number?: string; city?: string; state?: string; country?: string; postal_code?: string } | null | undefined,
): string {
    if (!addr) return '—';
    const street = [addr.street, addr.number].filter(Boolean).join(' ');
    const location = [addr.city, addr.state, addr.country].filter(Boolean).join(', ');
    return [street, location, addr.postal_code].filter(Boolean).join(' | ') || '—';
}

/**
 * Format a client contact as a one-line summary.
 */
export function formatClientContact(
    contact: { full_name?: string; email?: string; phone?: string } | null | undefined,
): string {
    if (!contact) return '—';
    const parts = [contact.full_name, contact.email, contact.phone].filter(Boolean);
    return parts.join(' · ') || '—';
}
