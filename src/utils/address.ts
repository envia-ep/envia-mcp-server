/**
 * Shared address builders.
 *
 * Constructs address objects expected by Envia API endpoints.
 * Centralises the country-uppercasing logic so every tool is consistent.
 *
 * Two builders are provided:
 *  - `buildAddress`      — full address for label generation, pickups, etc.
 *  - `buildQuoteAddress` — minimal geographic fields for rate quoting.
 */

// ---------------------------------------------------------------------------
// Full address (labels, pickups, invoices)
// ---------------------------------------------------------------------------

export interface AddressInput {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
}

export interface EnviaAddress {
    name: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
}

/**
 * Convert flat tool parameters into the Envia API address structure.
 */
export function buildAddress(input: AddressInput): EnviaAddress {
    return {
        name: input.name,
        phone: input.phone,
        street: input.street,
        city: input.city,
        state: input.state,
        country: input.country.trim().toUpperCase(),
        postalCode: input.postal_code,
    };
}

// ---------------------------------------------------------------------------
// Quote address (rate quoting — no name/phone/street needed)
// ---------------------------------------------------------------------------

/** Minimal geographic input for rate quoting. */
export interface QuoteAddressInput {
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
}

/** Address shape the rate API accepts for quoting. */
export interface EnviaQuoteAddress {
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
}

/**
 * Build a minimal address payload for rate quoting.
 *
 * Only includes the geographic fields the rate API needs — no personal
 * information (name, phone, street). Uppercases the country code for
 * consistency with the Envia API.
 *
 * @param input - Resolved geographic fields from the address-resolver
 * @returns Address object ready for the rate API payload
 */
export function buildQuoteAddress(input: QuoteAddressInput): EnviaQuoteAddress {
    const address: EnviaQuoteAddress = {
        country: input.country.trim().toUpperCase(),
    };

    if (input.city) address.city = input.city;
    if (input.state) address.state = input.state;
    if (input.postalCode) address.postalCode = input.postalCode;

    return address;
}
