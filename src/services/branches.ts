/**
 * Envia MCP Server — Branches Service
 *
 * Helpers for the branch/pickup-point API endpoints served by the Queries
 * service (/branches/*, /branches-bulk/*).
 *
 * IMPORTANT: Branch endpoints return a RAW JSON ARRAY, not a { data: [...] }
 * wrapper. The ApiResponse.data field IS the array itself.
 *
 * All branch endpoints are public (no auth required), but requests still flow
 * through the standard EnviaApiClient for SSRF protection and retry logic.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { BranchRecord, BranchCatalog } from '../types/branches.js';

// ---------------------------------------------------------------------------
// Branch type labels
// ---------------------------------------------------------------------------

/** Human-readable label for each branch_type value. */
export const BRANCH_TYPE_LABELS: ReadonlyMap<number, string> = new Map([
    [1, 'Pickup'],
    [2, 'Drop-off'],
    [3, 'Pickup & Drop-off'],
]);

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/**
 * Build a Queries-service URL for a branches path, appending query params.
 *
 * @param base   - Queries base URL (e.g. "https://queries-test.envia.com")
 * @param path   - Endpoint path (e.g. "/branches/fedex/MX")
 * @param params - Query parameters (undefined values are omitted)
 */
export function buildBranchUrl(
    base: string,
    path: string,
    params: Record<string, unknown> = {},
): string {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Execute a GET request to a branch endpoint.
 * Response shape is a raw array — caller receives ApiResponse<BranchRecord[]>.
 */
export async function queryBranchesApi(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<BranchRecord[]>> {
    const url = buildBranchUrl(config.queriesBase, path, params);
    return client.get<BranchRecord[]>(url);
}

/**
 * Execute a GET request to the branch catalog endpoint.
 * Response shape is a BranchCatalog object with states and localities.
 */
export async function queryBranchCatalogApi(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
): Promise<ApiResponse<BranchCatalog>> {
    const url = buildBranchUrl(config.queriesBase, path, {});
    return client.get<BranchCatalog>(url);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a single branch as a one-line summary.
 *
 * @param branch - BranchRecord from the API
 * @returns Formatted summary line
 */
export function formatBranchSummary(branch: BranchRecord): string {
    const typeLabel = BRANCH_TYPE_LABELS.get(branch.branch_type) ?? `Type ${branch.branch_type}`;
    const city = branch.address.city ?? branch.address.locality ?? '—';
    const state = branch.address.state ?? '—';
    const postal = branch.address.postalCode ?? '—';
    const distance = branch.distance !== null ? ` | ${branch.distance.toFixed(1)} km` : '';
    return `[${branch.branch_code}] ${branch.reference} (${typeLabel}) — ${city}, ${state} ${postal}${distance}`;
}

/**
 * Format a branch with full address detail for display.
 *
 * @param branch - BranchRecord from the API
 * @returns Formatted multi-field detail string
 */
export function formatBranchDetail(branch: BranchRecord): string {
    const typeLabel = BRANCH_TYPE_LABELS.get(branch.branch_type) ?? `Type ${branch.branch_type}`;
    const addr = branch.address;
    const street = [addr.street, addr.number].filter(Boolean).join(' ') || '—';
    const city = addr.city ?? addr.locality ?? '—';
    const state = addr.state ?? '—';
    const postal = addr.postalCode ?? '—';
    const distance = branch.distance !== null ? `${branch.distance.toFixed(1)} km` : '—';

    const lines = [
        `Branch: ${branch.reference}`,
        `  Code: ${branch.branch_code} | ID: ${branch.branch_id} | Type: ${typeLabel}`,
        `  Address: ${street}, ${city}, ${state}, CP ${postal}, ${addr.country}`,
        `  Distance: ${distance}`,
        `  Delivery: ${addr.delivery ? 'Yes' : 'No'} | Admission: ${addr.admission ? 'Yes' : 'No'}`,
    ];

    return lines.join('\n');
}
