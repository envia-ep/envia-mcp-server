/**
 * Tickets Types — Fase 4
 *
 * Response interfaces for the support ticket API endpoints
 * served by the Queries service (/company/tickets, /tickets/*).
 */

// ---------------------------------------------------------------------------
// Ticket File
// ---------------------------------------------------------------------------

/** A file attachment on a ticket. */
export interface TicketFile {
    id: number;
    ticket_id: number;
    file_url: string;
    created_at: string;
}

// ---------------------------------------------------------------------------
// Ticket Comment
// ---------------------------------------------------------------------------

/** A single comment in a ticket thread. */
export interface TicketComment {
    /** Author type: "client" or "admin". */
    type: string;
    status_id: number;
    tracking_number: string | null;
    status_name: string;
    status_color: string;
    /** The comment text. */
    description: string;
    created_by_name: string;
    created_at: string;
}

// ---------------------------------------------------------------------------
// Ticket Record
// ---------------------------------------------------------------------------

/** Full ticket record as returned by /company/tickets and /company/tickets/{id}. */
export interface TicketRecord {
    id: number;
    company_id: number;
    carrier_id: number | null;
    shipment_id: number | null;
    credit_id: number | null;
    warehouse_package_id: number | null;
    /** Initial comment / description text. */
    comments: string | null;
    created_by: number;
    created_at: string;
    updated_at: string;
    utc_created_at: string;
    ticket_status_id: number;
    /** Status name e.g. "pending", "accepted", "declined". */
    ticket_status_name: string;
    /** Hex color for the status badge (e.g. "#FFB136"). */
    ticket_status_color: string;
    /** CSS class hint: "warning" | "success" | "danger". */
    ticket_class_name: string;
    ticket_type_id: number;
    /** Type name e.g. "delay", "overweight". */
    ticket_type_name: string;
    /**
     * Double-stringified reference field (e.g. "\"guide\"").
     * Parse with JSON.parse twice when a raw string is needed.
     */
    reference: string | null;
    ticket_type_active: number;
    tracking_number: string | null;
    /** Carrier service name — may have trailing whitespace. */
    service: string | null;
    carrier: string | null;
    carrier_description: string | null;
    file_quantity: number;
    files: TicketFile[];
    last_comment: Record<string, unknown>;
    /** Only populated when getComments=true is sent. */
    allComments: TicketComment[];
    /** Stringified JSON with ticket-specific variables. */
    data: string | null;
    // Flat consignee fields (root level — use nested `consignee` for formatting)
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    /** Nested consignee block — use this one for display. */
    consignee: {
        consignee_name: string | null;
        consignee_company_name: string | null;
        consignee_email: string | null;
        consignee_phone: string | null;
        consignee_street: string | null;
        consignee_number: string | null;
        consignee_district: string | null;
        consignee_city: string | null;
        consignee_state: string | null;
        consignee_postal_code: string | null;
        consignee_country: string | null;
    };
    payment_method: Record<string, unknown>;
    /**
     * CSAT rating block.
     * `evaluated` is 1 only when ticket_status_id is 2 (Accepted) or 3 (Declined).
     */
    rating: {
        evaluated: number;
        rating: number | null;
        comment: string | null;
    };
    additional_services: Array<{
        additional_service_id: number;
        packageId: number | null;
        additionalService: string;
        translationTag: string;
        commission: number;
        taxes: number;
        cost: number;
        value: number;
    }>;
}

// ---------------------------------------------------------------------------
// Ticket List Response
// ---------------------------------------------------------------------------

/** Response from GET /company/tickets. */
export interface TicketListResponse {
    data: TicketRecord[];
    total_rows: number;
}

/** Response from GET /company/tickets/{id}. Always an array even for single record. */
export interface TicketDetailResponse {
    data: TicketRecord[];
    total_rows: number;
}

/** Response from GET /company/tickets/comments/{id}. */
export interface TicketCommentsResponse {
    data: TicketComment[];
}

// ---------------------------------------------------------------------------
// Ticket Type
// ---------------------------------------------------------------------------

/** A single ticket type returned by GET /tickets/types. */
export interface TicketType {
    id: number;
    /** Internal name e.g. "overweight", "delay". */
    name: string;
    /** Human-readable description e.g. "Overweight", "Delayed Package". */
    description: string;
    /** Stringified JSON with eligibility conditions — parse before use. */
    rules: string | null;
    type: null;
    /** 0 = inactive, 1 = active. */
    active: number;
}

/** Response from GET /tickets/types. */
export interface TicketTypesResponse {
    data: TicketType[];
}

// ---------------------------------------------------------------------------
// Create Ticket
// ---------------------------------------------------------------------------

/** Response from POST /company/tickets. */
export interface CreateTicketResponse {
    id: number;
}

// ---------------------------------------------------------------------------
// Add Comment / Rate
// ---------------------------------------------------------------------------

/** Response from POST /company/tickets/{id}/comments. */
export interface AddCommentResponse {
    data: boolean;
}

/** Response from POST /tickets/ratings/{id} on success. */
export interface RateTicketResponse {
    data: boolean;
    message: string;
}
