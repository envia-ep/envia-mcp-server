/**
 * Envia MCP Server — Config Service
 *
 * Provides query helpers and text formatters for company configuration APIs.
 * Covers: users, shops, carrier config, notification settings, API tokens,
 * checkout rules, and webhooks. All served by the Queries service (queriesBase).
 *
 * IMPORTANT:
 *  - GET /config/notification → raw array, NOT { data: [] }
 *  - GET /company/shops → NO query params (limit causes 400)
 *  - POST /webhooks body → only { url } accepted
 *  - PUT /webhooks body → only { url?, active? } accepted
 *  - access_token and auth_token must be truncated in output
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';
import type {
    CompanyUser,
    CompanyUsersResponse,
    CompanyShop,
    CompanyShopsResponse,
    CarrierConfig,
    CarrierConfigResponse,
    NotificationSettings,
    ApiToken,
    ApiTokensResponse,
    CheckoutRule,
    CheckoutRulesResponse,
    CreateCheckoutRuleBody,
    UpdateCheckoutRuleBody,
    Webhook,
    WebhooksResponse,
    CreateWebhookBody,
    UpdateWebhookBody,
    BooleanResultResponse,
} from '../types/config.js';

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Execute a GET request against the Queries API for config endpoints.
 */
export async function queryConfigApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a POST request against the Queries API for config endpoints.
 */
export async function createConfigApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

/**
 * Execute a PUT request for a path-param endpoint (e.g. /checkout-rules/{id}).
 * URL is built directly — path already includes the ID.
 */
export async function updateConfigApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = `${config.queriesBase}${path}`;
    return client.put<T>(url, body);
}

/**
 * Execute a DELETE request for a path-param endpoint (e.g. /webhooks/{id}).
 * URL is built directly — path already includes the ID.
 */
export async function deleteConfigApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
): Promise<ApiResponse<T>> {
    const url = `${config.queriesBase}${path}`;
    return client.delete<T>(url);
}

// ---------------------------------------------------------------------------
// Formatters — Company Users
// ---------------------------------------------------------------------------

/**
 * Format a single company user as a one-line summary.
 */
export function formatUserLine(user: CompanyUser): string {
    const status = user.status === 1 ? 'Active' : 'Inactive';
    const invite = user.invitation_status.charAt(0).toUpperCase() + user.invitation_status.slice(1);
    return `  ${user.name.padEnd(30)} ${user.email.padEnd(35)} ${user.role_description.padEnd(15)} ${status} (${invite})`;
}

/**
 * Format the company users response.
 */
export function formatCompanyUsers(data: CompanyUsersResponse): string {
    const users = data.data ?? [];
    if (users.length === 0) return 'No users found.';

    const lines: string[] = [`Company Team — ${users.length} member(s)`, ''];
    for (const user of users) {
        lines.push(formatUserLine(user));
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — Company Shops
// ---------------------------------------------------------------------------

/**
 * Format a single company shop as a one-line summary.
 */
export function formatShopLine(shop: CompanyShop): string {
    const features: string[] = [];
    if (shop.checkout === 1) features.push('Checkout');
    if (shop.webhook === 1) features.push('Webhook');
    if (shop.order_create === 1) features.push('Orders');
    const featureStr = features.length > 0 ? features.join(', ') : 'No features';
    return `  #${String(shop.id).padEnd(8)} ${shop.name.slice(0, 40).padEnd(42)} ${featureStr}`;
}

/**
 * Format the company shops response.
 */
export function formatCompanyShops(data: CompanyShopsResponse): string {
    const shops = data.data ?? [];
    if (shops.length === 0) return 'No shops found.';

    const lines: string[] = [`Connected Shops — ${shops.length} total`, ''];
    for (const shop of shops.slice(0, 20)) {
        lines.push(formatShopLine(shop));
    }
    if (shops.length > 20) {
        lines.push(`  ... and ${shops.length - 20} more`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — Carrier Config
// ---------------------------------------------------------------------------

/**
 * Format a single carrier config entry.
 */
export function formatCarrierConfigLine(carrier: CarrierConfig): string {
    const activeServices = carrier.services.filter((s) => s.active === 1);
    const codServices = activeServices.filter((s) => s.cash_on_delivery === 1);
    const blocked = carrier.blocked === 1 || carrier.blocked_admin === 1 ? ' [BLOCKED]' : '';
    return (
        `  ${carrier.description.padEnd(25)} (${carrier.name}) — ` +
        `${activeServices.length} active service(s)  COD: ${codServices.length > 0 ? 'Yes' : 'No'}` +
        blocked
    );
}

/**
 * Format the carrier config response.
 */
export function formatCarrierConfig(data: CarrierConfigResponse): string {
    const carriers = data.data ?? [];
    if (carriers.length === 0) return 'No carrier configuration found.';

    const active = carriers.filter((c) => c.blocked === 0 && c.blocked_admin === 0);
    const blocked = carriers.filter((c) => c.blocked === 1 || c.blocked_admin === 1);

    const lines: string[] = [`Carrier Configuration — ${carriers.length} carrier(s)  (${active.length} active)`, ''];
    for (const carrier of carriers) {
        lines.push(formatCarrierConfigLine(carrier));
    }
    if (blocked.length > 0) {
        lines.push('', `${blocked.length} carrier(s) are blocked.`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — Notification Settings
// ---------------------------------------------------------------------------

/**
 * Format a single notification settings entry.
 */
export function formatNotificationSettings(settings: NotificationSettings[]): string {
    if (settings.length === 0) return 'No notification settings found.';

    const s = settings[0];
    const on = (v: number) => (v === 1 ? '✓ Enabled' : '✗ Disabled');

    return [
        'Notification Settings',
        '',
        'Email:',
        `  General notifications   ${on(s.email)}`,
        `  Label generated         ${on(s.email_generate)}`,
        `  Fulfillment             ${on(s.fulfillment)}`,
        '',
        'Messaging:',
        `  SMS                     ${on(s.sms)}`,
        `  Flash                   ${on(s.flash)}`,
        `  WhatsApp                ${on(s.whatsapp)}`,
        '',
        'Events:',
        `  Shipment COD            ${on(s.shipment_cod)}`,
        `  Shipment POD            ${on(s.shipment_pod)}`,
        `  Ecommerce COD           ${on(s.ecommerce_cod)}`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — API Tokens
// ---------------------------------------------------------------------------

/**
 * Truncate a sensitive token for safe display.
 * @param token - Full token string
 * @returns First 8 chars + "..."
 */
export function truncateToken(token: string): string {
    if (!token) return '—';
    return `${token.slice(0, 8)}...`;
}

/**
 * Format a single API token entry.
 */
export function formatApiTokenLine(token: ApiToken): string {
    const type = token.ecommerce === 1 ? 'Ecommerce' : 'Standard';
    const desc = token.description ?? '(no description)';
    return `  ${token.user_name.padEnd(25)} ${token.user_email.padEnd(35)} Token: ${truncateToken(token.access_token)}  [${type}]  ${desc}`;
}

/**
 * Format the API tokens response.
 */
export function formatApiTokens(data: ApiTokensResponse): string {
    const tokens = data.data ?? [];
    if (tokens.length === 0) return 'No API tokens found.';

    const lines: string[] = [`API Tokens — ${tokens.length} token(s)`, ''];
    for (const token of tokens) {
        lines.push(formatApiTokenLine(token));
    }
    lines.push('', 'Note: Tokens are truncated for security. Use the Envia dashboard to manage tokens.');
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — Checkout Rules
// ---------------------------------------------------------------------------

/**
 * Format a single checkout rule as a one-line summary.
 */
export function formatCheckoutRuleLine(rule: CheckoutRule): string {
    const scope = rule.international === 1 ? 'International' : 'Domestic';
    const min = rule.min !== null ? rule.min : '0';
    const max = rule.max !== null ? rule.max : '∞';
    const range = `${min}–${max} ${rule.measurement}`;
    const status = rule.active === 1 ? 'Active' : 'Inactive';
    const name = rule.name ?? `${rule.type} Rule`;
    return `  #${String(rule.id).padEnd(6)} ${name.slice(0, 25).padEnd(27)} ${rule.type.padEnd(8)} ${range.padEnd(20)} → ${rule.amount_type}: ${rule.amount}  ${scope}  ${status}`;
}

/**
 * Format the checkout rules response.
 */
export function formatCheckoutRules(data: CheckoutRulesResponse): string {
    const rules = data.data ?? [];
    if (rules.length === 0) return 'No checkout rules found.';

    const lines: string[] = [`Checkout Rules — ${rules.length} rule(s)`, ''];
    for (const rule of rules) {
        lines.push(formatCheckoutRuleLine(rule));
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatters — Webhooks
// ---------------------------------------------------------------------------

/**
 * Format a single webhook entry.
 */
export function formatWebhookLine(webhook: Webhook): string {
    const status = webhook.active === 1 ? 'Active' : 'Inactive';
    const token = truncateToken(webhook.auth_token);
    return `  #${String(webhook.id).padEnd(6)} ${webhook.type.padEnd(30)} ${webhook.url.slice(0, 50).padEnd(52)} Token: ${token}  ${status}`;
}

/**
 * Format the webhooks response.
 */
export function formatWebhooks(data: WebhooksResponse): string {
    const webhooks = data.data ?? [];
    if (webhooks.length === 0) return 'No webhooks found.';

    const lines: string[] = [`Webhooks — ${webhooks.length} configured`, ''];
    for (const webhook of webhooks) {
        lines.push(formatWebhookLine(webhook));
    }
    lines.push('', 'Note: Tokens are truncated for security.');
    return lines.join('\n');
}

// Re-export types needed by tool files to avoid double-import
export type {
    CompanyUser,
    CompanyUsersResponse,
    CompanyShop,
    CompanyShopsResponse,
    CarrierConfig,
    CarrierConfigResponse,
    NotificationSettings,
    ApiToken,
    ApiTokensResponse,
    CheckoutRule,
    CheckoutRulesResponse,
    CreateCheckoutRuleBody,
    UpdateCheckoutRuleBody,
    Webhook,
    WebhooksResponse,
    CreateWebhookBody,
    UpdateWebhookBody,
    BooleanResultResponse,
};
