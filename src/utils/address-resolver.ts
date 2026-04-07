/**
 * Address Resolver — postal code geocoding and Colombian city translation.
 *
 * Provides reusable address resolution for any tool that needs to convert
 * minimal user input (postal code + country) into a fully resolved address
 * with city and state. Handles the Colombia special case where the city
 * must be an 8-digit DANE municipality code.
 *
 * All functions are pure async with injected dependencies — no MCP or
 * tool awareness. Any tool that works with addresses can import these.
 */

import type { EnviaApiClient } from './api-client.js';
import type { EnviaConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal input for address resolution. */
export interface AddressResolveInput {
    postalCode?: string;
    country: string;
    city?: string;
    state?: string;
}

/** Resolved address fields ready for address building. */
export interface ResolvedAddress {
    city?: string;
    state?: string;
    postalCode?: string;
    country: string;
}

/** Shape returned by the Geocodes API for a single postal code entry. */
interface GeocodeEntry {
    locality?: string;
    city?: string;
    state?: {
        code?: { '2digit'?: string };
        name?: string;
    };
}

/** Shape returned by the carriers `/locate` endpoint for Colombian cities. */
interface LocateResponse {
    city?: string;
    name?: string;
    state?: string;
}

/** 8-digit DANE municipality code pattern. */
const DANE_CODE_PATTERN = /^\d{8}$/;

// ---------------------------------------------------------------------------
// resolvePostalCode
// ---------------------------------------------------------------------------

/**
 * Resolve a postal code into city and state via the Geocodes API.
 *
 * Calls `GET {geocodesBase}/zipcode/{country}/{postalCode}` and extracts
 * the city (locality) and state (2-digit code) from the first result.
 *
 * Falls back gracefully when the postal code is empty, the API is
 * unreachable, or the response is unexpected — returning only the
 * fields the caller already provided.
 *
 * @param postalCode - Postal / ZIP code to look up
 * @param country    - ISO 3166-1 alpha-2 country code
 * @param client     - Envia API client instance
 * @param config     - Server configuration with geocodesBase URL
 * @returns Resolved address with city/state when available
 */
export async function resolvePostalCode(
    postalCode: string | undefined,
    country: string,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ResolvedAddress> {
    const base: ResolvedAddress = { country: country.trim().toUpperCase() };
    if (postalCode) base.postalCode = postalCode;

    if (!postalCode) return base;

    const url = `${config.geocodesBase}/zipcode/${encodeURIComponent(country)}/${encodeURIComponent(postalCode)}`;

    const res = await client.get<GeocodeEntry[] | GeocodeEntry>(url);

    if (!res.ok || !res.data) return base;

    const entry = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!entry) return base;

    return {
        postalCode,
        country: base.country,
        city: entry.locality ?? entry.city ?? undefined,
        state: entry.state?.code?.['2digit'] ?? entry.state?.name ?? undefined,
    };
}

// ---------------------------------------------------------------------------
// resolveColombianCity
// ---------------------------------------------------------------------------

/**
 * Translate a human-readable Colombian city name into its 8-digit DANE code.
 *
 * Calls `POST {shippingBase}/locate` with `{ city, state, country }`.
 * The endpoint performs a full-text search against the Province table and
 * returns `{ city: "<DANE code>", name: "<city name>", state: "<state code>" }`.
 *
 * Skips the call when the city already looks like a DANE code (8 digits).
 * Falls back gracefully on API errors — returns the original values so the
 * rate API can attempt its own resolution.
 *
 * @param city    - City name or DANE code
 * @param state   - State / department code
 * @param country - Must be "CO" for this function to act
 * @param client  - Envia API client instance
 * @param config  - Server configuration with shippingBase URL
 * @returns Object with resolved city (DANE code) and state
 */
export async function resolveColombianCity(
    city: string,
    state: string,
    country: string,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<{ city: string; state: string }> {
    if (DANE_CODE_PATTERN.test(city)) {
        return { city, state };
    }

    const url = `${config.shippingBase}/locate`;

    const res = await client.post<LocateResponse>(url, { city, state, country });

    if (!res.ok || !res.data) {
        return { city, state };
    }

    return {
        city: res.data.city ?? city,
        state: res.data.state ?? state,
    };
}

// ---------------------------------------------------------------------------
// resolveAddress (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Resolve an address from minimal user input into a fully populated address.
 *
 * Orchestrates postal code geocoding and Colombian DANE city translation:
 * 1. If a postal code is provided, geocodes it to get city/state.
 * 2. Merges geocoded results with any explicit overrides from the caller.
 * 3. If the country is CO and the city is not already a DANE code,
 *    translates the city name via the `/locate` endpoint.
 *
 * @param params - Minimal address input from the user
 * @param client - Envia API client instance
 * @param config - Server configuration
 * @returns Fully resolved address ready for building
 */
export async function resolveAddress(
    params: AddressResolveInput,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ResolvedAddress> {
    const country = params.country.trim().toUpperCase();

    let resolved: ResolvedAddress = { country };

    if (params.postalCode) {
        resolved = await resolvePostalCode(params.postalCode, country, client, config);
    }

    if (params.city) resolved.city = params.city;
    if (params.state) resolved.state = params.state;
    if (params.postalCode) resolved.postalCode = params.postalCode;

    if (country === 'CO' && resolved.city) {
        const located = await resolveColombianCity(resolved.city, resolved.state ?? '', country, client, config);
        resolved.city = located.city;
        if (located.state) resolved.state = located.state;

        if (!resolved.postalCode && DANE_CODE_PATTERN.test(resolved.city)) {
            resolved.postalCode = resolved.city;
        }
    }

    return resolved;
}
