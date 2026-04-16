/**
 * Address Resolver — postal code geocoding and city-based resolution.
 *
 * Provides reusable address resolution for any tool that needs to convert
 * minimal user input (postal code + country, or city + country) into a
 * fully resolved address with city, state, and postal code.
 *
 * Three resolution strategies:
 *  - Postal code geocoding via `GET {geocodesBase}/zipcode/{country}/{zip}`
 *  - Colombian DANE city translation via `POST {shippingBase}/locate`
 *  - Geocodes city lookup via `GET {geocodesBase}/locate/{country}/{city}`
 *    for countries that use city names instead of postal codes (CL, GT, etc.)
 *
 * All functions are pure async with injected dependencies — no MCP or
 * tool awareness. Any tool that works with addresses can import these.
 */

import type { EnviaApiClient } from './api-client.js';
import type { EnviaConfig } from '../config.js';
import { transformPostalCode, transformPhone } from '../services/country-rules.js';

export { transformPostalCode, transformPhone };

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
    /** Neighborhood / colonia resolved from postal code suburbs (important for MX). */
    district?: string;
}

/** Shape returned by the Geocodes API for a single postal code entry. */
interface GeocodeEntry {
    locality?: string;
    city?: string;
    state?: {
        code?: { '2digit'?: string };
        name?: string;
    };
    /** Neighborhood names (colonias). Present for MX postal codes. */
    suburbs?: string[];
}

/** Shape returned by the carriers `/locate` endpoint for Colombian cities. */
interface LocateResponse {
    city?: string;
    name?: string;
    state?: string;
}

/** Shape returned by the Geocodes `/locate/{country}/{city}` endpoint. */
interface GeocodeLocateEntry {
    state?: {
        code?: { '2digit'?: string };
        name?: string;
    };
    zip_codes?: Array<{
        zip_code?: string;
        locality?: string;
    }>;
}

/** 8-digit DANE municipality code pattern (Colombia-specific). */
const DANE_CODE_PATTERN = /^\d{8}$/;

/** Countries that resolve city names via the Geocodes `/locate` endpoint. */
const GEOCODE_CITY_COUNTRIES = new Set(['CL', 'GT', 'PA', 'HN', 'PE', 'BO']);

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

    const url = `${config.geocodesBase}/zipcode/${encodeURIComponent(base.country)}/${encodeURIComponent(postalCode)}`;

    const res = await client.get<GeocodeEntry[] | GeocodeEntry>(url);

    if (!res.ok || !res.data) return base;

    const entry = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!entry) return base;

    const resolved: ResolvedAddress = {
        postalCode,
        country: base.country,
        city: entry.locality ?? entry.city ?? undefined,
        state: entry.state?.code?.['2digit'] ?? entry.state?.name ?? undefined,
    };

    if (Array.isArray(entry.suburbs) && entry.suburbs.length > 0) {
        resolved.district = entry.suburbs[0];
    }

    return resolved;
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
// resolveCityByGeocode
// ---------------------------------------------------------------------------

/**
 * Resolve a city name via the Geocodes `/locate` endpoint.
 *
 * Calls `GET {geocodesBase}/locate/{country}/{city}` to look up the
 * canonical city name, 2-digit state code, and postal code for countries
 * that use city-based addressing (CL, GT, PA, HN, PE, BO).
 *
 * Falls back gracefully on API errors — returns the original values so
 * the rate API can attempt its own resolution.
 *
 * @param city    - City name to look up
 * @param country - ISO 3166-1 alpha-2 country code
 * @param client  - Envia API client instance
 * @param config  - Server configuration with geocodesBase URL
 * @returns Resolved address with city, state, and postal code when available
 */
export async function resolveCityByGeocode(
    city: string,
    country: string,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<ResolvedAddress> {
    const base: ResolvedAddress = { country, city };

    const url = `${config.geocodesBase}/locate/${encodeURIComponent(country)}/${encodeURIComponent(city)}`;

    const res = await client.get<GeocodeLocateEntry[]>(url);

    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
        return base;
    }

    const entry = res.data[0];
    const zipEntry = entry.zip_codes?.[0];

    return {
        country,
        city: zipEntry?.locality ?? city,
        state: entry.state?.code?.['2digit'] ?? entry.state?.name ?? undefined,
        postalCode: zipEntry?.zip_code ?? undefined,
    };
}

// ---------------------------------------------------------------------------
// resolveAddress (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Resolve an address from minimal user input into a fully populated address.
 *
 * Orchestrates three resolution strategies based on country:
 * 1. If a postal code is provided, geocodes it to get city/state.
 * 2. Merges geocoded results with any explicit overrides from the caller.
 * 3. For CO: translates the city name to a DANE code via `POST /locate`.
 * 4. For CL, GT, PA, HN, PE, BO: resolves city via `GET /locate/{country}/{city}`
 *    on the Geocodes API, extracting state and postal code.
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
    const normalizedPostal = params.postalCode ? transformPostalCode(country, params.postalCode) : params.postalCode;

    let resolved: ResolvedAddress = { country };

    if (normalizedPostal) {
        resolved = await resolvePostalCode(normalizedPostal, country, client, config);
    }

    if (params.city) resolved.city = params.city;
    if (params.state) resolved.state = params.state;
    if (normalizedPostal) resolved.postalCode = normalizedPostal;

    if (country === 'CO' && resolved.city) {
        const located = await resolveColombianCity(resolved.city, resolved.state ?? '', country, client, config);
        resolved.city = located.city;
        if (located.state) resolved.state = located.state;

        if (!resolved.postalCode && DANE_CODE_PATTERN.test(resolved.city)) {
            resolved.postalCode = resolved.city;
        }
    } else if (GEOCODE_CITY_COUNTRIES.has(country) && resolved.city) {
        const located = await resolveCityByGeocode(resolved.city, country, client, config);
        resolved.city = located.city ?? resolved.city;
        if (located.state) resolved.state = located.state;
        if (located.postalCode && !resolved.postalCode) resolved.postalCode = located.postalCode;
    }

    return resolved;
}

// ---------------------------------------------------------------------------
// Island detection
// ---------------------------------------------------------------------------

/** Result of island detection for a postal code. */
export interface IslandDetection {
    /** Whether the postal code belongs to an island region. */
    isIsland: boolean;
    /** Island group name (empty string if not an island). */
    type: string;
}

/**
 * Detect whether a postal code belongs to an island region.
 *
 * Relevant for Italy (Sicily, Sardinia) and Spain (Canary Islands, Balearic Islands).
 * Island shipments may have different pricing or carrier restrictions.
 *
 * @param country - ISO 3166-1 alpha-2 country code
 * @param postalCode - Postal code to check
 * @returns Island detection result
 */
export function detectIsland(country: string, postalCode: string): IslandDetection {
    const cc = country.toUpperCase().trim();
    const pc = postalCode.trim();

    if (cc === 'IT' && pc.length >= 2) {
        const prefix = pc.slice(0, 2);
        const num = parseInt(prefix, 10);
        if (num >= 90 && num <= 98) return { isIsland: true, type: 'Sicily' };
        if (prefix === '07' || prefix === '08' || prefix === '09') return { isIsland: true, type: 'Sardinia' };
    }

    if (cc === 'ES' && pc.length >= 2) {
        if (pc.startsWith('35') || pc.startsWith('38')) return { isIsland: true, type: 'Canary Islands' };
        if (pc.startsWith('07')) return { isIsland: true, type: 'Balearic Islands' };
    }

    return { isIsland: false, type: '' };
}
