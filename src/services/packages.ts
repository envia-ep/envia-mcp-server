/**
 * Envia MCP Server — Packages Service
 *
 * Provides helper functions for querying the Envia Queries API
 * for saved-package CRUD operations. Used by all package tools.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';

/**
 * Execute a GET request against the Queries API for packages.
 */
export async function queryPackagesApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a POST request against the Queries API for packages.
 */
export async function mutatePackageApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

/**
 * Execute a DELETE request against the Queries API for packages.
 */
export async function deletePackageApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.delete<T>(url);
}

/** Package type ID to human-readable name. */
const PACKAGE_TYPES: Record<number, string> = {
    1: 'Box',
    2: 'Envelope',
    3: 'Pallet',
    4: 'Tube',
};

/**
 * Format a package type ID to its human-readable label.
 */
export function formatPackageType(typeId: number | undefined): string {
    if (typeId === undefined) return '—';
    return PACKAGE_TYPES[typeId] ?? `Type ${typeId}`;
}

/**
 * Format package dimensions as a readable string.
 */
export function formatDimensions(
    pkg: { length?: number; width?: number; height?: number; length_unit?: string },
): string {
    const { length, width, height, length_unit } = pkg;
    if (!length && !width && !height) return '—';
    return `${length ?? '?'}×${width ?? '?'}×${height ?? '?'} ${length_unit ?? 'CM'}`;
}
