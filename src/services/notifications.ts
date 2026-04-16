/**
 * Envia MCP Server — Notifications Service
 *
 * Provides query helpers and text formatters for the notifications API.
 * All endpoints are served by the Queries service (queriesBase).
 * Reuses buildQueryUrl from shipments.ts for query-param endpoints.
 *
 * IMPORTANT: /notifications/prices returns a RAW ARRAY — no { data: [] } wrapper.
 * IMPORTANT: /company-notifications body field is JSON-stringified — must parse.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';
import { formatCurrency } from './shipments.js';
import type {
    NotificationPrice,
    CompanyNotificationsResponse,
    CompanyNotification,
    NotificationConfigResponse,
    NotificationConfigEntry,
} from '../types/notifications.js';

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Fetch notification prices.
 * Response is a raw array — not wrapped in { data: [] }.
 */
export async function queryNotificationPrices(
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ApiResponse<NotificationPrice[]>> {
    const url = buildQueryUrl(config.queriesBase, '/notifications/prices', {});
    return client.get<NotificationPrice[]>(url);
}

/**
 * Fetch company notifications feed, optionally filtered by limit.
 */
export async function queryCompanyNotifications(
    client: EnviaApiClient,
    config: EnviaConfig,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<CompanyNotificationsResponse>> {
    const url = buildQueryUrl(config.queriesBase, '/company/notifications', params);
    return client.get<CompanyNotificationsResponse>(url);
}

/**
 * Fetch notification config entries from /company-notifications.
 * Each entry's body field is a JSON-stringified object.
 */
export async function queryNotificationConfig(
    client: EnviaApiClient,
    config: EnviaConfig,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<NotificationConfigResponse>> {
    const url = buildQueryUrl(config.queriesBase, '/company-notifications', params);
    return client.get<NotificationConfigResponse>(url);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a single notification price entry.
 */
export function formatNotificationPrice(entry: NotificationPrice): string {
    return `  ${entry.type.toUpperCase().padEnd(12)} ${formatCurrency(entry.price, entry.currency)} per notification`;
}

/**
 * Format the notification prices response.
 */
export function formatNotificationPrices(prices: NotificationPrice[]): string {
    if (prices.length === 0) {
        return 'No notification pricing data available.';
    }

    const lines: string[] = ['Notification Prices:', ''];
    for (const price of prices) {
        lines.push(formatNotificationPrice(price));
    }

    return lines.join('\n');
}

/**
 * Format a single company notification for display.
 */
export function formatCompanyNotification(notification: CompanyNotification): string {
    const date = notification.created_at.split(' ')[0] ?? notification.created_at;
    return `  [${date}] (${notification.type}) ${notification.title}`;
}

/**
 * Format the company notifications response grouped by category.
 */
export function formatCompanyNotifications(data: CompanyNotificationsResponse): string {
    const categories = Object.entries(data.data ?? {});
    if (categories.length === 0) {
        return 'No notifications found.';
    }

    const lines: string[] = [`Notifications — ${data.unreadCounter} unread`, ''];

    for (const [category, bucket] of categories) {
        if (bucket.notifications.length === 0) continue;
        lines.push(`${category.charAt(0).toUpperCase() + category.slice(1)} (${bucket.unreadCounter} unread):`);
        for (const notification of bucket.notifications) {
            lines.push(formatCompanyNotification(notification));
        }
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}

/**
 * Parse a notification config entry body and format it for display.
 * The body is a JSON-stringified object — parse before use.
 */
export function formatNotificationConfigEntry(entry: NotificationConfigEntry): string {
    const date = entry.created_at.split(' ')[0] ?? entry.created_at;
    let detail = '';

    try {
        const parsed = JSON.parse(entry.body) as Record<string, unknown>;
        const trackingNumber = typeof parsed.trackingNumber === 'string' ? parsed.trackingNumber : null;
        const carrier = typeof parsed.carrier === 'string' ? parsed.carrier : null;
        const amount = typeof parsed.amount === 'number' ? parsed.amount : null;
        const currency = typeof parsed.currency === 'string' ? parsed.currency : 'MXN';

        const parts: string[] = [];
        if (carrier) parts.push(`Carrier: ${carrier}`);
        if (trackingNumber) parts.push(`Tracking: ${trackingNumber}`);
        if (amount !== null) parts.push(`Amount: ${formatCurrency(amount, currency)}`);
        detail = parts.length > 0 ? ` — ${parts.join('  ')}` : '';
    } catch {
        detail = '';
    }

    return `  [${date}] (${entry.type})${detail}`;
}

/**
 * Format the notification config response grouped by category.
 */
export function formatNotificationConfig(data: NotificationConfigResponse): string {
    const categories = Object.entries(data.data ?? {});
    if (categories.length === 0) {
        return 'No notification config entries found.';
    }

    const lines: string[] = [`Notification Config — ${data.notificationCount} entries`, ''];

    for (const [category, entries] of categories) {
        if (entries.length === 0) continue;
        lines.push(`${category.charAt(0).toUpperCase() + category.slice(1)}:`);
        for (const entry of entries) {
            lines.push(formatNotificationConfigEntry(entry));
        }
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}
