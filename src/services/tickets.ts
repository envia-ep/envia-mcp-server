/**
 * Envia MCP Server — Tickets Service
 *
 * Provides CRUD helpers and text formatters for the support ticket API.
 * All endpoints are served by the Queries service (queriesBase).
 * Reuses buildQueryUrl from shipments.ts — not duplicated here.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';
import type { TicketRecord, TicketComment, TicketType } from '../types/tickets.js';

// ---------------------------------------------------------------------------
// Status name map
// ---------------------------------------------------------------------------

/**
 * Human-readable label for each ticket_status_id.
 * Used for display when ticket_status_name from the API is lowercase/abbreviated.
 */
export const TICKET_STATUS_NAMES: ReadonlyMap<number, string> = new Map([
    [1, 'Pending'],
    [2, 'Accepted'],
    [3, 'Declined'],
    [4, 'Incomplete'],
    [5, 'Follow-up'],
    [6, 'In Review'],
    [7, 'Complete'],
    [8, 'Rejected'],
    [9, 'In Analysis'],
    [10, 'Claim In Review'],
]);

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Execute a GET request against the Queries API for tickets.
 */
export async function queryTicketsApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a POST request against the Queries API for tickets.
 */
export async function mutateTicketApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

/**
 * Execute a PUT request against the Queries API for tickets.
 */
export async function updateTicketApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.put<T>(url, body);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a single ticket as a one-line summary.
 *
 * @param ticket - TicketRecord from the API
 * @returns Formatted summary line
 */
export function formatTicketSummary(ticket: TicketRecord): string {
    const status = TICKET_STATUS_NAMES.get(ticket.ticket_status_id) ?? ticket.ticket_status_name;
    const carrier = ticket.carrier ?? '—';
    const tracking = ticket.tracking_number ?? '—';
    return `#${ticket.id} — ${ticket.ticket_type_name} (${status}) | Carrier: ${carrier} | Tracking: ${tracking} | Created: ${ticket.created_at}`;
}

/**
 * Format a single ticket comment for display.
 *
 * @param comment - TicketComment from the API
 * @returns Formatted comment line
 */
export function formatTicketComment(comment: TicketComment): string {
    return `[${comment.type}] ${comment.created_by_name} (${comment.created_at}): ${comment.description}`;
}

/**
 * Format a single ticket type for display.
 *
 * @param type - TicketType from /tickets/types
 * @returns Formatted type line
 */
export function formatTicketType(type: TicketType): string {
    const activeLabel = type.active === 1 ? 'Active' : 'Inactive';
    return `${type.description} (ID: ${type.id}) — ${activeLabel}`;
}
