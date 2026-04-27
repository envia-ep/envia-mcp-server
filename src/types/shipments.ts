/**
 * Envia MCP Server — Shipment Types
 *
 * TypeScript interfaces for shipment-related API responses
 * from the Envia Queries service.
 */

/** Address within a shipment response. */
export interface ShipmentAddress {
    name?: string;
    email?: string;
    phone?: string;
    street?: string;
    number?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
}

/**
 * A single shipment record from GET /shipments.
 *
 * NOTE on naming (verified against live sandbox 2026-04-27):
 * The backend uses `name` for the carrier slug and `service` for the service
 * slug, plus `carrier_description` / `service_description` for display.
 * Earlier versions of this type assumed `carrier_name` / `service_name` —
 * that pair is correct on /shipments/cod and /get-shipments-ndr but NOT on
 * /shipments. Both pairs are kept optional so consumers can fall through:
 *   carrier_name ?? carrier_description ?? name
 *   service_name ?? service_description ?? service
 */
export interface ShipmentRecord {
    id: number;
    tracking_number: string;
    folio?: string;
    status_id: number;
    status?: string;
    carrier_id?: number;
    /** Carrier display name on /shipments/cod, /get-shipments-ndr. Absent on /shipments. */
    carrier_name?: string;
    /** Carrier display name on /shipments. Absent on /shipments/cod. */
    carrier_description?: string;
    /** Carrier slug on /shipments (e.g. "paquetexpress"). Absent on /shipments/cod. */
    name?: string;
    /** Service display name on /shipments/cod, /get-shipments-ndr. Absent on /shipments. */
    service_name?: string;
    /** Service display name on /shipments (e.g. "Paquetexpress Domicilio - ocurre"). */
    service_description?: string;
    /** Service slug on /shipments (e.g. "ground_do"). */
    service?: string;
    /**
     * Nested origin object — present on some endpoints (legacy / typed
     * derivations) but NOT on /shipments. /shipments uses the flat
     * `sender_*` family below.
     */
    origin?: ShipmentAddress;
    /** Nested destination — same caveat as origin. */
    destination?: ShipmentAddress;
    /** Flat sender fields — used by /shipments (verified 2026-04-27). */
    sender_name?: string;
    sender_email?: string;
    sender_phone?: string;
    sender_street?: string;
    sender_number?: string;
    sender_district?: string;
    sender_city?: string;
    sender_state?: string;
    sender_country?: string;
    sender_postalcode?: string;
    /** Flat consignee fields — used by /shipments (verified 2026-04-27). */
    consignee_name?: string;
    consignee_email?: string;
    consignee_phone?: string;
    consignee_street?: string;
    consignee_number?: string;
    consignee_district?: string;
    consignee_city?: string;
    consignee_state?: string;
    consignee_country?: string;
    consignee_postalcode?: string;
    total?: number;
    currency?: string;
    insurance_cost?: number;
    additional_services_cost?: number;
    grand_total?: number;
    created_at?: string;
    shipped_at?: string;
    delivered_at?: string;
    label_file?: string;
    packages?: ShipmentPackageInfo[];
    last_event?: { location?: string; datetime?: string; description?: string };
    ticket?: { id?: number; type_id?: number; status_id?: number };
    created_by?: { name?: string; email?: string };
}

/**
 * Detail record from GET /guide/{tracking}.
 *
 * Verified against live sandbox 2026-04-27. The endpoint wraps a SINGLE
 * record inside a one-element array (`data: [record]`) and uses flat
 * `sender_*` / `consignee_*` fields rather than nested origin/destination
 * objects. Carrier display is `name` (slug only — no carrier_description on
 * this endpoint). Postal code fields are `sender_postalcode` /
 * `consignee_postalcode` (no underscore between "postal" and "code").
 */
export interface ShipmentDetailRecord {
    id: number;
    tracking_number: string;
    folio?: string | null;
    status_id: number;
    status?: string;
    carrier_id?: number;
    /** Carrier slug. /guide/{tracking} does NOT return a carrier_description. */
    name?: string;
    /** Service slug. */
    service?: string;
    service_id?: number;

    sender_name?: string;
    sender_company_name?: string;
    sender_email?: string;
    sender_phone?: string;
    sender_street?: string;
    sender_number?: string;
    sender_district?: string;
    sender_city?: string;
    sender_state?: string;
    sender_country?: string;
    sender_postalcode?: string;
    sender_identification_number?: string | null;
    sender_references?: string | null;

    consignee_name?: string;
    consignee_company_name?: string;
    consignee_email?: string;
    consignee_phone?: string;
    consignee_street?: string;
    consignee_number?: string;
    consignee_district?: string;
    consignee_city?: string;
    consignee_state?: string;
    consignee_country?: string;
    consignee_postalcode?: string;
    consignee_identification_number?: string | null;
    consignee_references?: string | null;

    total?: number;
    currency?: string;
    insurance_cost?: number;
    additional_services_cost?: number;
    grand_total?: number;

    created_at?: string;
    shipped_at?: string | null;
    delivered_at?: string | null;
    balance_returned?: number;
    balance_returned_at?: string | null;

    label_file?: string | null;
    evidence_file?: string | null;
    bol_file?: string | null;

    created_by_name?: string;
    created_by_email?: string;

    shipment_type?: string;
    shipment_type_id?: number;
    shipment_weight?: number;
    package_type?: string;
    international?: number;
}

/** Response wrapper for GET /guide/{tracking}. Always wraps the record in a one-element array. */
export interface ShipmentDetailResponse {
    data: ShipmentDetailRecord[];
    total_rows?: number;
}

/** Package info within a shipment. */
export interface ShipmentPackageInfo {
    tracking_number?: string;
    content?: string;
    weight?: number;
    dimensions?: { length?: number; width?: number; height?: number };
    type?: string;
}

/** Response shape for GET /shipments. */
export interface ShipmentListResponse {
    data: ShipmentRecord[];
    total?: number;
    total_incidents?: number;
    total_reported?: number;
}

/** A single COD shipment record. */
export interface CodShipmentRecord {
    id: number;
    tracking_number: string;
    status_id: number;
    status?: string;
    carrier_name?: string;
    service_name?: string;
    cash_on_delivery_amount?: number;
    cash_on_delivery_cost?: number;
    currency?: string;
    payed_amount?: number;
    payed_at?: string;
    payment_reference?: string;
    destination_name?: string;
    destination_phone?: string;
    created_at?: string;
    ticket_id?: number;
}

/** COD counters response. */
export interface CodCountersResponse {
    data: {
        delivered?: number;
        payed_amount?: number;
        not_payed?: number;
        total?: number;
        paid?: number;
        pending?: number;
        reported?: number;
    };
}

/**
 * Shipment status statistics returned by GET /shipments/packages-information-by-status.
 *
 * Verified live 2026-04-27: the endpoint returns a FLAT object at the top
 * level — NOT wrapped in a `data` envelope. The MCP tool reads `res.data`
 * directly. Extra fields (`dateFromMiddleware`, `dateTo`,
 * `packagesPendingPickUp`, `packagesActiveAndDeliveryFilter`) are returned
 * but the formatter does not surface them today; they are typed so future
 * additions can rely on them without a type change.
 */
export interface ShipmentStatusStats {
    packagesPendingShip?: number;
    packagesPendingPickUp?: number;
    packagesPickup?: number;
    percentagePickup?: number;
    packagesShipped?: number;
    percentageShipped?: number;
    packagesOutForDelivery?: number;
    percentageOutForDelivery?: number;
    packagesDeliveryFilter?: number;
    percentagePackagesDeliveryFilter?: number;
    packagesActiveAndDeliveryFilter?: number;
    packagesIssue?: number;
    percentageIssue?: number;
    packagesReturned?: number;
    percentageReturned?: number;
    /** Echo of the (normalised) start of the queried date range. */
    dateFromMiddleware?: string;
    /** Echo of the end of the queried date range. */
    dateTo?: string;
}

/**
 * Surcharge (overweight) shipment record.
 *
 * Sandbox returned `{data: [], total: 0}` at audit time (2026-04-27) so the
 * exact carrier/service field naming on this endpoint could not be confirmed
 * live. Both naming conventions are kept optional so consumers can fall
 * through (carrier_name ?? carrier_description ?? name).
 */
export interface SurchargeRecord {
    shipment_id: number;
    tracking_number: string;
    /** Carrier display on /shipments/cod, /get-shipments-ndr style endpoints. */
    carrier_name?: string;
    /** Carrier display on /shipments style endpoints. */
    carrier_description?: string;
    /** Carrier slug on /shipments style endpoints. */
    name?: string;
    /** Service display on /shipments/cod, /get-shipments-ndr style endpoints. */
    service_name?: string;
    /** Service display on /shipments style endpoints. */
    service_description?: string;
    /** Service slug on /shipments style endpoints. */
    service?: string;
    declared_weight?: number;
    revised_weight?: number;
    overweight?: number;
    overcharge_cost?: number;
    cost_after_overcharge?: number;
    ticket_id?: number;
    ticket_status?: string;
    created_at?: string;
}

/** NDR (Non-Delivery Report) shipment record. */
export interface NdrRecord {
    id: number;
    tracking_number: string;
    status_id: number;
    carrier_name?: string;
    service_name?: string;
    ndr_action?: string;
    request_code?: string;
    shipped_at?: string;
    delivered_at?: string;
    created_at?: string;
    options?: Array<{ action_code?: string; action_translate?: string }>;
    ndr_history?: Array<Record<string, unknown>>;
    origin?: ShipmentAddress;
    destination?: ShipmentAddress;
}

/** NDR list response with stats. */
export interface NdrListResponse {
    data: NdrRecord[];
    total?: number;
    total_required_attention?: number;
    total_requested?: number;
    total_rto_delivered?: number;
}

/**
 * Invoice record from GET /shipments/invoices.
 *
 * Verified live 2026-04-27. Notes:
 *   - Backend returns the count of shipments under `total_shipments`, not
 *     `shipments_amount` as earlier drafts assumed. `shipments_amount` is
 *     kept here as a deprecated alias for back-compat with old fixtures.
 *   - The list is wrapped in `{ recordsTotal, recordsFiltered, data }` —
 *     NOT `{ data, total }` like other list endpoints. Consumers should
 *     read `recordsTotal` for the absolute count.
 */
export interface InvoiceRecord {
    id: number;
    month?: string;
    year?: string;
    total?: number;
    invoice_id?: string;
    invoice_url?: string;
    /** Real backend field — count of shipments billed in this invoice. */
    total_shipments?: number;
    /** @deprecated Live API returns `total_shipments`. Kept only for back-compat. */
    shipments_amount?: number;
    /** Currency-amount sum of the invoice's shipping line. */
    invoice_type_amount?: number;
    /** Tax intermediation total (Brazil-specific accounting field). */
    tax_intermediacio_total?: number;
    invoiced_by?: string;
    status?: string;
}

/**
 * Response wrapper for GET /shipments/invoices. Uses DataTables-style fields
 * (`recordsTotal`, `recordsFiltered`) rather than the `{ data, total }`
 * convention used by most other list endpoints in queries.
 */
export interface InvoiceListResponse {
    data: InvoiceRecord[];
    recordsTotal?: number;
    recordsFiltered?: number;
}
