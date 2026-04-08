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

// ---------------------------------------------------------------------------
// Rate address builders (POST /ship/rate)
// ---------------------------------------------------------------------------

/** Minimal geographic input for rate quoting. */
export interface RateAddressInput {
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
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

    return address;
}

/**
 * Build a rate address from a V4 origin location.
 *
 * @param loc - V4 origin location
 * @returns Minimal geographic address for rate quoting
 */
export function buildRateAddressFromLocation(loc: V4Location): RateAddress {
    return {
        street: PLACEHOLDER_STREET,
        city: loc.city ?? '',
        state: loc.state_code ?? '',
        country: (loc.country_code ?? '').toUpperCase(),
        postalCode: loc.postal_code ?? '',
    };
}

/**
 * Build a rate address from a V4 customer shipping address.
 *
 * @param addr - V4 shipping address (destination)
 * @returns Minimal geographic address for rate quoting
 */
export function buildRateAddressFromShippingAddress(addr: V4ShippingAddress): RateAddress {
    return {
        street: PLACEHOLDER_STREET,
        city: addr.city ?? '',
        state: addr.state_code ?? '',
        country: (addr.country_code ?? '').toUpperCase(),
        postalCode: addr.postal_code ?? '',
    };
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
 * Matches the full address definition in generate.v1.schema, including
 * optional fields like number, district, interior_number, company,
 * identificationNumber, email, and reference. Only non-empty optional
 * fields are included in the output.
 *
 * @param input - All address fields; geographic fields may come from resolveAddress
 * @returns Address object ready for the generate payload
 */
export function buildGenerateAddress(input: GenerateAddressInput): GenerateAddress {
    const address: GenerateAddress = {
        name: input.name,
        street: input.street,
        city: input.city,
        state: input.state,
        country: input.country.trim().toUpperCase(),
        postalCode: input.postalCode,
    };

    if (input.phone) address.phone = input.phone;
    if (input.number) address.number = input.number;
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
    const address: GenerateAddress = {
        name,
        street: loc.address_1 ?? '',
        city: loc.city ?? '',
        state: loc.state_code ?? '',
        country: (loc.country_code ?? '').toUpperCase(),
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
    const address: GenerateAddress = {
        name,
        street: addr.address_1 ?? '',
        city: addr.city ?? '',
        state: addr.state_code ?? '',
        country: (addr.country_code ?? '').toUpperCase(),
        postalCode: addr.postal_code ?? '',
    };
    if (addr.phone) address.phone = addr.phone;
    if (addr.email) address.email = addr.email;
    if (addr.company) address.company = addr.company;
    if (addr.reference) address.reference = addr.reference;
    return address;
}
