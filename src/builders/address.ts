/**
 * Address Builders
 *
 * Constructs address objects for the Envia carriers API.
 * Two variants match the two main API actions:
 *
 *  - Rate addresses  — minimal geography for POST /ship/rate
 *  - Generate addresses — full contact + geography for POST /ship/generate
 *
 * Builders accept either manual input (from tool parameters) or V4 order
 * data (from the ecommerce orders API), producing the same output types.
 *
 * All address types are defined in src/types/carriers-api.ts.
 */

import type { RateAddress, GenerateAddress } from '../types/carriers-api.js';
import type { V4Location, V4ShippingAddress } from '../types/ecommerce-order.js';

/** Placeholder street the rate API requires even for quoting. */
export const PLACEHOLDER_STREET = 'Calle 1 #100';

/**
 * Countries where the carriers API expects `number` as a separate field.
 * For all other countries the full raw address goes into `street` and
 * `number` is sent as an empty string.
 */
export const SEPARATE_NUMBER_COUNTRIES: ReadonlySet<string> = new Set(['MX', 'BR']);

/** Empty fallback — never invent address data; leave blank if the user did not provide it. */
export const DEFAULT_SEPARATE_NUMBER = '';

/**
 * Whether a country requires the exterior number as a separate field.
 *
 * @param country - ISO 3166-1 alpha-2 country code
 * @returns true if `number` must be split out from the street
 */
export function requiresSeparateNumber(country: string): boolean {
    return SEPARATE_NUMBER_COUNTRIES.has(country.trim().toUpperCase());
}

// ---------------------------------------------------------------------------
// Rate address builders (POST /ship/rate)
// ---------------------------------------------------------------------------

/** Minimal geographic input for rate quoting. */
export interface RateAddressInput {
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
    /** Neighborhood / colonia. Important for MX where carriers may validate at this level. */
    district?: string;
}

/**
 * Build a minimal address payload for rate quoting.
 *
 * Includes a hardcoded placeholder street because the Envia rate API
 * requires it even for price comparison. Real street data is only
 * needed when creating a shipment label.
 *
 * @param input - Resolved geographic fields from the address-resolver
 * @returns Address object ready for the rate API payload
 */
export function buildRateAddress(input: RateAddressInput): RateAddress {
    const address: RateAddress = {
        street: PLACEHOLDER_STREET,
        country: input.country.trim().toUpperCase(),
    };

    if (input.city) address.city = input.city;
    if (input.state) address.state = input.state;
    if (input.postalCode) address.postalCode = input.postalCode;
    if (input.district) address.district = input.district;

    return address;
}

/**
 * Build a rate address from a V4 origin location.
 *
 * @param loc - V4 origin location
 * @returns Minimal geographic address for rate quoting
 */
export function buildRateAddressFromLocation(loc: V4Location): RateAddress {
    const address: RateAddress = {
        street: PLACEHOLDER_STREET,
        country: (loc.country_code ?? '').toUpperCase(),
    };
    if (loc.city) address.city = loc.city;
    if (loc.state_code) address.state = loc.state_code;
    if (loc.postal_code) address.postalCode = loc.postal_code;
    return address;
}

/**
 * Build a rate address from a V4 customer shipping address.
 *
 * @param addr - V4 shipping address (destination)
 * @returns Minimal geographic address for rate quoting
 */
export function buildRateAddressFromShippingAddress(addr: V4ShippingAddress): RateAddress {
    const address: RateAddress = {
        street: PLACEHOLDER_STREET,
        country: (addr.country_code ?? '').toUpperCase(),
    };
    if (addr.city) address.city = addr.city;
    if (addr.state_code) address.state = addr.state_code;
    if (addr.postal_code) address.postalCode = addr.postal_code;
    return address;
}

// ---------------------------------------------------------------------------
// Generate address builders (POST /ship/generate)
// ---------------------------------------------------------------------------

/**
 * Input for the full generate address builder.
 * Includes every field supported by the generate.v1.schema address definition.
 * Only name, street, city, state, country, and postalCode are required.
 */
export interface GenerateAddressInput {
    name: string;
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    phone?: string;
    number?: string;
    district?: string;
    interior_number?: string;
    company?: string;
    email?: string;
    reference?: string;
    identificationNumber?: string;
}

/**
 * Build a rich address payload for label generation (POST /ship/generate).
 *
 * The `street` field receives the raw address as provided by the user.
 * For countries in {@link SEPARATE_NUMBER_COUNTRIES} the exterior number
 * must be sent in a dedicated `number` field; for all others `number` is
 * an empty string because the number is already part of the street.
 *
 * @param input - All address fields; geographic fields may come from resolveAddress
 * @returns Address object ready for the generate payload
 */
export function buildGenerateAddress(input: GenerateAddressInput): GenerateAddress {
    const normalizedCountry = input.country.trim().toUpperCase();
    const number = requiresSeparateNumber(normalizedCountry)
        ? (input.number || DEFAULT_SEPARATE_NUMBER)
        : '';

    const address: GenerateAddress = {
        name: input.name,
        street: input.street,
        number,
        city: input.city,
        state: input.state,
        country: normalizedCountry,
        postalCode: input.postalCode,
    };

    if (input.phone) address.phone = input.phone;
    if (input.district) address.district = input.district;
    if (input.interior_number) address.interior_number = input.interior_number;
    if (input.company) address.company = input.company;
    if (input.email) address.email = input.email;
    if (input.reference) address.reference = input.reference;
    if (input.identificationNumber) address.identificationNumber = input.identificationNumber;

    return address;
}

/**
 * Build a generate address from a V4 origin location.
 *
 * @param loc - V4 origin location
 * @returns Full address formatted for label generation
 */
export function buildGenerateAddressFromLocation(loc: V4Location): GenerateAddress {
    const name = [loc.first_name, loc.last_name].filter(Boolean).join(' ');
    const normalizedCountry = (loc.country_code ?? '').toUpperCase();
    const number = requiresSeparateNumber(normalizedCountry)
        ? (loc.address_2 || DEFAULT_SEPARATE_NUMBER)
        : '';

    const address: GenerateAddress = {
        name,
        street: loc.address_1 ?? '',
        number,
        city: loc.city ?? '',
        state: loc.state_code ?? '',
        country: normalizedCountry,
        postalCode: loc.postal_code ?? '',
    };
    if (loc.phone) address.phone = loc.phone;
    if (loc.company) address.company = loc.company;
    return address;
}

/**
 * Build a generate address from a V4 customer shipping address.
 *
 * @param addr - V4 shipping address (destination)
 * @returns Full address formatted for label generation
 */
export function buildGenerateAddressFromShippingAddress(addr: V4ShippingAddress): GenerateAddress {
    const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ');
    const normalizedCountry = (addr.country_code ?? '').toUpperCase();
    const number = requiresSeparateNumber(normalizedCountry)
        ? (addr.address_2 || DEFAULT_SEPARATE_NUMBER)
        : '';

    const address: GenerateAddress = {
        name,
        street: addr.address_1 ?? '',
        number,
        city: addr.city ?? '',
        state: addr.state_code ?? '',
        country: normalizedCountry,
        postalCode: addr.postal_code ?? '',
    };
    if (addr.address_3) address.district = addr.address_3;
    if (addr.phone) address.phone = addr.phone;
    if (addr.email) address.email = addr.email;
    if (addr.company) address.company = addr.company;
    if (addr.reference) address.reference = addr.reference;
    if (addr.identification_number) address.identificationNumber = addr.identification_number;
    return address;
}
