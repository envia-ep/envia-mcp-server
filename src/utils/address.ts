/**
 * Shared address builder.
 *
 * Constructs the address object expected by Envia API endpoints.
 * Centralises the country-uppercasing logic so every tool is consistent.
 */

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
