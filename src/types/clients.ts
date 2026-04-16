/**
 * Envia MCP Server — Client Types
 *
 * TypeScript interfaces for client-related API responses
 * from the Envia Queries service.
 */

/** Contact info within a client record. */
export interface ClientContact {
    id?: number;
    contact_id?: number;
    full_name?: string;
    role?: string;
    email?: string;
    phone_code?: string;
    phone?: string;
    landline_code?: string;
    landline?: string;
    default?: number;
    preferred_channel?: string;
    language_code?: string;
    created_at?: string;
    updated_at?: string;
}

/** Address within a client record. */
export interface ClientAddress {
    client_address_id?: number;
    config_address_id?: number;
    name?: string;
    company?: string;
    email?: string;
    phone_code?: string;
    phone?: string;
    street?: string;
    number?: string;
    district?: string;
    interior_number?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    identification_number?: string;
    reference?: string;
    latitude?: number;
    longitude?: number;
    state_registration?: string;
}

/** A client record from GET /clients or GET /clients/:id. */
export interface ClientRecord {
    id: number;
    client_type?: string;
    name?: string;
    external_ref?: string;
    company_name?: string;
    rfc?: string;
    notes?: string;
    status?: number;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
    contact?: ClientContact | null;
    billing_address?: ClientAddress | null;
    shipping_address?: ClientAddress | null;
    use_billing_as_shipping?: boolean;
}

/** Response shape for GET /clients. */
export interface ClientListResponse {
    data: ClientRecord[];
    total: number;
    emptyState: number;
}

/** Response shape for GET /clients/:id. */
export interface ClientDetailResponse {
    data: ClientRecord;
}

/** Response shape for POST /clients. */
export interface CreateClientResponse {
    id: number;
}

/** Response shape for PUT/DELETE operations. */
export interface ClientMutationResponse {
    data: boolean;
}

/** Response shape for GET /clients/summary. */
export interface ClientSummaryResponse {
    data: {
        independent: number;
        business: number;
        distributor: number;
        total: number;
    };
}
