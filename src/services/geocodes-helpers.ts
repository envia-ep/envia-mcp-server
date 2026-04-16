/**
 * Envia MCP Server — Geocodes Internal Helpers
 *
 * These helpers are INTERNAL — they are not registered as LLM-visible tools.
 * Portal-facing tools (quote, create_label, create_address, etc.) call them
 * to delegate business logic to the canonical backend instead of replicating
 * it client-side. Examples:
 *
 *   - `getAddressRequirements` decides whether items[] are mandatory for a
 *     given origin/destination pair, reusing the backend's own
 *     `/location-requirements` logic (exceptional territories, EU rules,
 *     US↔PR handling).
 *   - `resolveDaneCode` translates a Colombian city name into its DANE code
 *     (e.g. "Bogotá" → "11001000") so downstream rate calls succeed.
 *   - `getBrazilIcms` fetches the ICMS tax rate between two Brazilian
 *     states — required for accurate rate calculations on BR-BR routes.
 *
 * Important: the geocodes service has NO sandbox environment. All helpers
 * hit `https://geocodes.envia.com` regardless of the configured environment.
 * The hostname is already in the SSRF allowlist of EnviaApiClient.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Geocodes has a single production environment. Override via env var for
 * integration testing only.
 */
const GEOCODES_BASE = process.env.ENVIA_GEOCODES_HOSTNAME ?? 'https://geocodes.envia.com';

// ---------------------------------------------------------------------------
// address-requirements
// ---------------------------------------------------------------------------

/** Body shape accepted by `POST /location-requirements`. */
export interface AddressRequirementsInput {
    origin: { country_code: string; state_code: string; postal_code?: string };
    destination: { country_code: string; state_code: string; postal_code?: string };
}

/**
 * Response from `POST /location-requirements`.
 *
 * - `applyTaxes` — true when the route is treated as domestic for tax
 *   purposes (items[] are NOT required).
 * - `includeBOL` — true when a Bill of Lading / commercial invoice is
 *   required (international or territorial exception).
 * - `isInternalEU` / `isInternalGB` / `isInternalUK` — intra-zone flags
 *   used for post-Brexit tax decisions.
 */
export interface AddressRequirements {
    applyTaxes: boolean;
    includeBOL: boolean;
    isInternalEU: boolean;
    isInternalGB: boolean;
    isInternalUK: boolean;
}

/**
 * Fetch the tax/items requirements for a given origin → destination pair.
 *
 * Consumed by rate and generate tools to decide if `items[]` must be
 * populated before calling the carriers API, avoiding silent 1129 errors.
 *
 * The endpoint is public — we still route through EnviaApiClient so SSRF
 * prevention applies. The client attaches the bearer token automatically
 * but geocodes ignores it for public endpoints.
 */
export async function getAddressRequirements(
    client: EnviaApiClient,
    input: AddressRequirementsInput,
): Promise<ApiResponse<AddressRequirements>> {
    const url = `${GEOCODES_BASE}/location-requirements`;
    const body = {
        origin: normaliseLocationPair(input.origin),
        destination: normaliseLocationPair(input.destination),
    };
    return client.post<AddressRequirements>(url, body);
}

/** Uppercase country + state codes; trim postal when present. */
function normaliseLocationPair(
    pair: { country_code: string; state_code: string; postal_code?: string },
): Record<string, string> {
    const out: Record<string, string> = {
        country_code: pair.country_code.trim().toUpperCase(),
        state_code: pair.state_code.trim().toUpperCase(),
    };
    if (pair.postal_code !== undefined && pair.postal_code !== '') {
        out.postal_code = pair.postal_code.trim();
    }
    return out;
}

// ---------------------------------------------------------------------------
// dane-code resolver (Colombia)
// ---------------------------------------------------------------------------

/**
 * Regex matching a Colombian DANE code (5 to 8 digits).
 *
 * Backend accepts 5-8 digit variants; the canonical form is 5 digits (e.g.
 * "11001" for Bogotá) but some tables use 8 digits with trailing zeros.
 */
const DANE_CODE_PATTERN = /^\d{5,8}$/;

/** Response shape from `GET /zipcode/{country}/{zip}` for a Colombia lookup. */
interface ZipcodeResponse {
    zip?: string;
    locality?: string;
    country?: string;
    region1?: string;
    state?: { code?: string };
    [key: string]: unknown;
}

/**
 * Resolve a Colombian city into its DANE code.
 *
 * Input precedence:
 *   1. If `input` already looks like a DANE code, return it verbatim.
 *   2. Otherwise call `/locate/CO/{cityOrState}/{cityName}` (if state hint
 *      is provided) or `/locate/CO/{cityName}` and pick the first match.
 *
 * Returns null when no match can be found — callers should surface a clear
 * error to the user instead of falling back to "00000".
 */
export async function resolveDaneCode(
    client: EnviaApiClient,
    cityOrCode: string,
    stateHint?: string,
): Promise<string | null> {
    const trimmed = cityOrCode.trim();
    if (trimmed === '') return null;

    if (DANE_CODE_PATTERN.test(trimmed)) {
        return trimmed;
    }

    const encoded = encodeURIComponent(trimmed);
    const url = stateHint
        ? `${GEOCODES_BASE}/locate/CO/${encodeURIComponent(stateHint.trim())}/${encoded}`
        : `${GEOCODES_BASE}/locate/CO/${encoded}`;

    const res = await client.get<ZipcodeResponse[] | ZipcodeResponse>(url);
    if (!res.ok) return null;

    const data = res.data;
    const first = Array.isArray(data) ? data[0] : data;
    if (!first || typeof first !== 'object') return null;

    const zip = (first as ZipcodeResponse).zip;
    return typeof zip === 'string' && DANE_CODE_PATTERN.test(zip) ? zip : null;
}

// ---------------------------------------------------------------------------
// brazil-icms
// ---------------------------------------------------------------------------

/** Response from `GET /brazil/icms/{origin}/{destination}`. */
export interface BrazilIcmsResponse {
    /** Percentage as a string, e.g. "12.00". */
    value: string;
}

/**
 * Fetch the ICMS tax rate between two Brazilian states.
 *
 * Both inputs must be 2-letter Brazilian state codes (e.g. "SP", "RJ").
 * Returns the numeric percentage parsed from the backend's string response,
 * or null when the call fails or the state codes are not recognised.
 */
export async function getBrazilIcms(
    client: EnviaApiClient,
    originState: string,
    destinationState: string,
): Promise<number | null> {
    const origin = originState.trim().toUpperCase();
    const destination = destinationState.trim().toUpperCase();
    if (origin.length !== 2 || destination.length !== 2) return null;

    const url = `${GEOCODES_BASE}/brazil/icms/${origin}/${destination}`;
    const res = await client.get<BrazilIcmsResponse>(url);
    if (!res.ok || !res.data?.value) return null;

    const parsed = parseFloat(res.data.value);
    return Number.isFinite(parsed) ? parsed : null;
}

// Export internals for isolated testing only.
export { normaliseLocationPair, DANE_CODE_PATTERN };
