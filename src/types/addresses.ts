/**
 * Envia MCP Server — Address Types
 *
 * TypeScript interfaces for address-related API responses
 * from the Envia Queries service.
 */

/** Branch info attached to origin addresses. */
export interface AddressBranch {
    carrier_id?: number;
    branch_code?: string;
    carrier_name?: string;
}

/** A saved address record from GET /all-addresses. */
export interface AddressRecord {
    address_id: number;
    type: number;
    name?: string;
    company?: string;
    email?: string;
    phone?: string;
    phone_code?: string;
    street?: string;
    number?: string;
    district?: string;
    interior_number?: string;
    city?: string;
    state?: string;
    country?: string;
    country_name?: string;
    postal_code?: string;
    identification_number?: string;
    reference?: string;
    latitude?: number;
    longitude?: number;
    state_registration?: string;
    return_address?: number;
    alias?: string;
    description?: string;
    is_favorite?: number;
    is_default?: number;
    branches?: AddressBranch[];
}

/** Response shape for GET /all-addresses/{type}. */
export interface AddressListResponse {
    data: AddressRecord[];
    total: number;
    emptyState: number;
}

/** Response shape for POST /user-address. */
export interface CreateAddressResponse {
    id: number;
}

/** Response shape for PUT/DELETE operations. */
export interface AddressMutationResponse {
    data: boolean;
}

/** Response shape for POST /favorite-address. */
export interface FavoriteAddressResponse {
    address_id: number;
    is_favorite: boolean;
}

/** Default address response — returns full address or empty object. */
export type DefaultAddressResponse = AddressRecord | Record<string, never>;
