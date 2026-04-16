/**
 * Envia MCP Server — Products, Billing & DCe Service
 *
 * Provides query helpers and text formatters for:
 *  - /products                   GET  — company product catalogue
 *  - /billing-information        GET  — company billing details
 *  - /billing-information/check  GET  — whether billing info exists
 *  - /dce/status                 GET  — DCe Brazil authorization status
 *
 * All endpoints are served by the Queries service (queriesBase).
 * Reuses buildQueryUrl from shipments.ts for query-param endpoints.
 *
 * Critical traps:
 *  - /products/envia/{id} is BROKEN. Use ?product_identifier=X on /products instead.
 *  - billing_data in /billing-information is JSON-stringified — use top-level fields only.
 *  - DCe cStat "999" is normal in sandbox — not an error.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';
import { formatCurrency } from './shipments.js';
import type {
    Product,
    ProductsResponse,
    BillingInformation,
    BillingInfoCheck,
    DceStatusResponse,
} from '../types/products.js';

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the company product catalogue.
 * Accepts optional query params: limit, page, product_identifier.
 *
 * NOTE: /products/envia/{id} is broken in sandbox.
 * Use product_identifier query param as a workaround for filtered lookup.
 */
export async function queryProducts(
    client: EnviaApiClient,
    config: EnviaConfig,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<ProductsResponse>> {
    const url = buildQueryUrl(config.queriesBase, '/products', params);
    return client.get<ProductsResponse>(url);
}

/**
 * Fetch the company billing information.
 *
 * NOTE: The response contains a `billing_data` field that is JSON-stringified.
 * Use only the top-level fields (address_name, street, city, etc.) for display.
 */
export async function queryBillingInfo(
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ApiResponse<BillingInformation>> {
    const url = `${config.queriesBase}/billing-information`;
    return client.get<BillingInformation>(url);
}

/**
 * Check whether the company has billing information configured.
 */
export async function queryBillingInfoCheck(
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ApiResponse<BillingInfoCheck>> {
    const url = `${config.queriesBase}/billing-information/check`;
    return client.get<BillingInfoCheck>(url);
}

/**
 * Fetch the DCe (Declaração de Conteúdo Eletrônica) authorization status for Brazil.
 *
 * NOTE: cStat "999" is returned in sandbox — this is normal and means SEFAZ
 * is not available in the test environment. Not an error.
 */
export async function queryDceStatus(
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ApiResponse<DceStatusResponse>> {
    const url = `${config.queriesBase}/dce/status`;
    return client.get<DceStatusResponse>(url);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a single product entry for display.
 */
export function formatProduct(product: Product): string {
    const parts: string[] = [`• ${product.product_name}  (ID: ${product.product_identifier})`];

    if (product.description) {
        parts.push(`  Description: ${product.description}`);
    }

    const dims: string[] = [];
    if (product.weight !== null) dims.push(`${product.weight} kg`);
    if (product.length !== null && product.width !== null && product.height !== null) {
        dims.push(`${product.length}×${product.width}×${product.height} cm`);
    }
    if (dims.length > 0) parts.push(`  Dimensions: ${dims.join('  ')}`);

    if (product.price !== null) {
        const currency = product.currency ?? 'MXN';
        parts.push(`  Price: ${formatCurrency(product.price, currency)}`);
    }

    if (product.quantity !== null) parts.push(`  Stock: ${product.quantity}`);
    if (product.product_code) parts.push(`  HS/NCM code: ${product.product_code}`);

    return parts.join('\n');
}

/**
 * Format the products list response.
 */
export function formatProducts(data: ProductsResponse): string {
    const products = data.data ?? [];
    if (products.length === 0) {
        return 'No products found in the catalogue.';
    }

    const total = data.total ?? products.length;
    const header = `Product Catalogue — ${products.length} of ${total} products`;
    const rows = products.map((p) => formatProduct(p));

    return [header, '', ...rows].join('\n');
}

/**
 * Format billing information using only top-level fields.
 *
 * IMPORTANT: billing_data is JSON-stringified — never parse it. Use the flat fields.
 */
export function formatBillingInfo(info: BillingInformation): string {
    const lines: string[] = ['Billing Information:'];

    if (info.address_name) lines.push(`  Legal name:    ${info.address_name}`);
    if (info.rfc) lines.push(`  RFC / Tax ID:  ${info.rfc}`);
    if (info.email) lines.push(`  Email:         ${info.email}`);
    if (info.phone) lines.push(`  Phone:         ${info.phone}`);

    const addressParts: string[] = [];
    if (info.street) {
        const street = info.street_number ? `${info.street} ${info.street_number}` : info.street;
        addressParts.push(street);
    }
    if (info.neighborhood) addressParts.push(info.neighborhood);

    const cityLine: string[] = [];
    if (info.city) cityLine.push(info.city);
    if (info.state) cityLine.push(info.state);
    if (info.postal_code) cityLine.push(info.postal_code);
    if (cityLine.length > 0) addressParts.push(cityLine.join(', '));
    if (info.country) addressParts.push(info.country);

    if (addressParts.length > 0) {
        lines.push(`  Address:`);
        for (const part of addressParts) {
            lines.push(`    ${part}`);
        }
    }

    return lines.join('\n');
}

/**
 * Format the billing info check response.
 */
export function formatBillingInfoCheck(check: BillingInfoCheck): string {
    return check.hasBillingInfo
        ? 'Billing information is configured for this company.'
        : 'No billing information has been configured yet. Use envia_get_billing_info to set it up.';
}

/**
 * Format the DCe status response.
 *
 * cStat "999" is the expected sandbox response — documented explicitly.
 */
export function formatDceStatus(status: DceStatusResponse): string {
    const lines: string[] = ['DCe Authorization Status (Brazil):'];
    lines.push(`  Status code: ${status.cStat}`);
    lines.push(`  Message:     ${status.xMotivo}`);

    if (status.cStat === '999') {
        lines.push('');
        lines.push('  Note: cStat 999 is the expected response in the sandbox environment.');
        lines.push('  In production, this will return the real SEFAZ authorization status.');
    }

    return lines.join('\n');
}
