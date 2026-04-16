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

/** A single shipment record from GET /shipments. */
export interface ShipmentRecord {
    id: number;
    tracking_number: string;
    folio?: string;
    status_id: number;
    status?: string;
    carrier_id?: number;
    carrier_name?: string;
    service_name?: string;
    service_description?: string;
    origin?: ShipmentAddress;
    destination?: ShipmentAddress;
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

/** Shipment status statistics. */
export interface ShipmentStatusStats {
    packagesPendingShip?: number;
    packagesPickup?: number;
    percentagePickup?: number;
    packagesShipped?: number;
    percentageShipped?: number;
    packagesOutForDelivery?: number;
    percentageOutForDelivery?: number;
    packagesDeliveryFilter?: number;
    percentagePackagesDeliveryFilter?: number;
    packagesIssue?: number;
    percentageIssue?: number;
    packagesReturned?: number;
    percentageReturned?: number;
}

/** Surcharge (overweight) shipment record. */
export interface SurchargeRecord {
    shipment_id: number;
    tracking_number: string;
    service_name?: string;
    carrier_name?: string;
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

/** Invoice record. */
export interface InvoiceRecord {
    id: number;
    month?: string;
    year?: string;
    total?: number;
    invoice_id?: string;
    invoice_url?: string;
    shipments_amount?: number;
    invoiced_by?: string;
    status?: string;
}
