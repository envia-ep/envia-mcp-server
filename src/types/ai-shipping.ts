/**
 * Envia MCP Server — AI Shipping Types
 *
 * The Queries service exposes an AI-assisted layer on top of the standard
 * rate/address endpoints. Two capabilities are consumed from this layer:
 *
 *   - `POST /ai/shipping/parse-address` — Extracts structured address fields
 *     from a free-form text block (or image, out of scope for v1).
 *   - `POST /ai/shipping/rate` — Runs a multi-carrier rate in parallel and
 *     returns all results in a single response, including per-carrier errors.
 */

// ---------------------------------------------------------------------------
// parse-address
// ---------------------------------------------------------------------------

/**
 * Structured address returned by the AI parser. Field shapes mirror the
 * backend response exactly — nullable strings remain strings, not undefined.
 */
export interface ParsedAddress {
    street: string;
    number: string;
    postal_code: string;
    district: string;
    district_select?: string;
    city: string;
    city_select?: string;
    state: string;
    identification_number?: string;
    reference?: string;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    phone_code?: string;
    country: string;
    coordinates?: {
        latitude: string;
        longitude: string;
    };
    suburbs?: string[];
}

export interface ParseAddressResponse {
    success: boolean;
    data: ParsedAddress;
}

// ---------------------------------------------------------------------------
// ai rate
// ---------------------------------------------------------------------------

/**
 * Result entry for a single carrier in a multi-carrier AI rate call.
 * `ok=true` means the carrier call completed without a transport error; the
 * payload may still be a business-level error under `data.meta === "error"`.
 */
export interface AiRateCarrierResult {
    carrier: string;
    ok: boolean;
    data: {
        meta?: string;
        error?: {
            code: number;
            description: string;
            message: string;
        };
        // Successful rate payloads mirror the regular /ship/rate shape.
        // Keep as `unknown` here to avoid coupling — the tool formatter
        // handles narrowing before display.
        data?: unknown;
    };
}

export interface AiRateResponse {
    carriers_considered: string[];
    results: AiRateCarrierResult[];
}

/**
 * Lean summary of a successful rate row (subset of RateBreakdown fields).
 * Used by the formatter to present a compact comparison table in chat.
 */
export interface RateSummary {
    carrier: string;
    service?: string;
    totalPrice?: number;
    currency?: string;
    deliveryEstimate?: string;
}
