/**
 * Envia MCP Server — AI Shipping Service
 *
 * Thin helpers for the Queries AI shipping endpoints. Keeps tool handlers
 * focused on argument shaping + output formatting by extracting:
 *   - HTTP call orchestration
 *   - Response narrowing
 *   - Shared formatters for rate summaries
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { AiRateCarrierResult, AiRateResponse, ParseAddressResponse, RateSummary } from '../types/ai-shipping.js';

/**
 * POST to `/ai/shipping/parse-address`.
 *
 * @param client - Authenticated Envia API client
 * @param config - Server configuration
 * @param body   - Free-form text (required) + optional country hint
 */
export async function parseAddressApi(
    client: EnviaApiClient,
    config: EnviaConfig,
    body: { text: string; country?: string },
): Promise<ApiResponse<ParseAddressResponse>> {
    const url = `${config.queriesBase}/ai/shipping/parse-address`;
    return client.post<ParseAddressResponse>(url, body);
}

/**
 * POST to `/ai/shipping/rate`.
 *
 * Runs a multi-carrier rate in parallel. Always returns a list of results,
 * one per carrier considered, each flagged with its own success/failure.
 */
export async function aiRateApi(
    client: EnviaApiClient,
    config: EnviaConfig,
    body: Record<string, unknown>,
): Promise<ApiResponse<AiRateResponse>> {
    const url = `${config.queriesBase}/ai/shipping/rate`;
    return client.post<AiRateResponse>(url, body);
}

/**
 * Narrow a carrier result into a compact summary, discarding verbose fields
 * that would bloat the chat output. Returns null when the carrier call
 * failed or returned a business-level error.
 */
export function summariseRateResult(result: AiRateCarrierResult): RateSummary | null {
    if (!result.ok || result.data?.meta === 'error') {
        return null;
    }

    const data = result.data?.data as Record<string, unknown> | undefined;
    if (!data) return null;

    // The upstream /ship/rate response varies slightly by carrier. We pick
    // the fields used across all of them, falling back to unknown values as
    // em-dashes in the formatter.
    const totalPrice = typeof data.totalPrice === 'number' ? data.totalPrice : undefined;
    const currency = typeof data.currency === 'string' ? data.currency : undefined;
    const service = typeof data.service === 'string' ? data.service : undefined;
    const deliveryEstimate = typeof data.deliveryEstimate === 'string'
        ? data.deliveryEstimate
        : typeof data.deliveryDate === 'string'
            ? data.deliveryDate
            : undefined;

    return {
        carrier: result.carrier,
        service,
        totalPrice,
        currency,
        deliveryEstimate,
    };
}

/**
 * Format a list of rate summaries as a short chat-friendly table.
 *
 * Sorts by price (cheapest first) and truncates to 10 results to stay
 * readable. Rows with unknown price fall to the bottom.
 */
export function formatRateSummaries(summaries: RateSummary[]): string {
    if (summaries.length === 0) return 'No carriers returned a valid rate for this route.';

    const sorted = [...summaries].sort((a, b) => {
        if (a.totalPrice === undefined) return 1;
        if (b.totalPrice === undefined) return -1;
        return a.totalPrice - b.totalPrice;
    }).slice(0, 10);

    const lines: string[] = [];
    for (const row of sorted) {
        const price = row.totalPrice !== undefined
            ? `${row.totalPrice.toFixed(2)} ${row.currency ?? ''}`.trim()
            : 'price unavailable';
        const parts = [`  ${row.carrier}`];
        if (row.service) parts.push(row.service);
        parts.push(`— ${price}`);
        if (row.deliveryEstimate) parts.push(`(${row.deliveryEstimate})`);
        lines.push(parts.join(' '));
    }
    return lines.join('\n');
}
