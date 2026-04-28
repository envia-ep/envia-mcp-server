/**
 * Zod schemas for shipment-related API responses.
 *
 * All schemas verified live 2026-04-28 against the Envia queries-test sandbox.
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.2 for capture methodology.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** ISO-style datetime string returned by the Envia backend (no timezone). */
const EnviaDateTimeSchema = z.string();

/** Flat sender fields used on /guide/{tracking} and /shipments. */
const FlatSenderSchema = z.object({
    sender_name: z.string().optional(),
    sender_company_name: z.string().optional(),
    sender_email: z.string().optional(),
    sender_phone: z.string().optional(),
    sender_street: z.string().optional(),
    sender_number: z.string().optional(),
    sender_interior_number: z.string().nullable().optional(),
    sender_district: z.string().optional(),
    sender_city: z.string().optional(),
    sender_state: z.string().optional(),
    sender_country: z.string().optional(),
    sender_postalcode: z.string().optional(),
    sender_identification_number: z.string().nullable().optional(),
    sender_references: z.string().nullable().optional(),
    sender_branch: z.number().optional(),
});

/** Flat consignee fields used on /guide/{tracking} and /shipments. */
const FlatConsigneeSchema = z.object({
    consignee_name: z.string().optional(),
    consignee_company_name: z.string().optional(),
    consignee_email: z.string().optional(),
    consignee_phone: z.string().optional(),
    consignee_street: z.string().optional(),
    consignee_number: z.string().optional(),
    consignee_interior_number: z.string().nullable().optional(),
    consignee_district: z.string().optional(),
    consignee_city: z.string().optional(),
    consignee_state: z.string().optional(),
    consignee_country: z.string().optional(),
    consignee_postalcode: z.string().optional(),
    /** Some endpoints return both postalcode (no underscore) and postal_code (with underscore). */
    consignee_postal_code: z.string().optional(),
    consignee_identification_number: z.string().nullable().optional(),
    consignee_references: z.string().nullable().optional(),
    consignee_branch: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Tool #1 — envia_get_shipment_detail
// Verified live 2026-04-28 against GET /guide/{tracking} (queries service)
// Tracking: 9824510570 → shipment_id 170633
// ---------------------------------------------------------------------------

/**
 * A single record from GET /guide/{tracking}.
 *
 * The endpoint wraps a SINGLE record in a one-element array.
 * Uses flat sender_* / consignee_* fields (not nested origin/destination).
 * endpoint field is present in sandbox but intentionally excluded (internal URL).
 */
const ShipmentDetailRecordSchema = FlatSenderSchema.merge(FlatConsigneeSchema).merge(
    z.object({
        id: z.number(),
        tracking_number: z.string(),
        folio: z.string().nullable().optional(),
        status: z.string().optional(),
        status_id: z.number(),
        balance_returned: z.number().optional(),
        balance_returned_at: EnviaDateTimeSchema.nullable().optional(),
        carrier_id: z.number().optional(),
        name: z.string().optional(),
        service_id: z.number().optional(),
        service: z.string().optional(),
        reverse_pickup: z.number().optional(),
        zone: z.number().optional(),
        custom_key: z.number().optional(),
        created_at: EnviaDateTimeSchema.optional(),
        shipped_at: EnviaDateTimeSchema.nullable().optional(),
        delivered_at: EnviaDateTimeSchema.nullable().optional(),
        signed_by: z.string().nullable().optional(),
        information_detail: z.string().nullable().optional(),
        international: z.number().optional(),
        shipment_type_id: z.number().optional(),
        shipment_type: z.string().optional(),
        shipment_real_weight: z.number().nullable().optional(),
        shipment_weight: z.number().optional(),
        currency: z.string().optional(),
        insurance: z.number().optional(),
        insurance_cost: z.union([z.number(), z.string()]).optional(),
        extended_zone: z.number().optional(),
        additional_services_cost: z.union([z.number(), z.string()]).optional(),
        import_fee: z.number().optional(),
        import_tax: z.number().optional(),
        cash_on_delivery_cost: z.number().optional(),
        cash_on_delivery_amount: z.number().optional(),
        custom_key_cost: z.number().optional(),
        sms_cost: z.number().optional(),
        overcharge_applied: z.number().optional(),
        overcharge_cost: z.number().nullable().optional(),
        total: z.union([z.number(), z.string()]).optional(),
        whatsapp_cost: z.number().optional(),
        grand_total: z.union([z.number(), z.string()]).optional(),
        label_file: z.string().nullable().optional(),
        evidence_file: z.string().nullable().optional(),
        bol_file: z.string().nullable().optional(),
        created_by_name: z.string().optional(),
        created_by_email: z.string().optional(),
        additional_file: z.string().nullable().optional(),
        additional_file_type: z.string().nullable().optional(),
        shipment_id: z.number().optional(),
        missing_pld_cost: z.number().optional(),
        failed_pickup_cost: z.number().optional(),
        address_correction: z.number().optional(),
        overweight: z.number().optional(),
    }),
);

/** Response from GET /guide/{tracking}. Verified live 2026-04-28. */
export const ShipmentDetailResponseSchema = z.object({
    data: z.array(ShipmentDetailRecordSchema),
});

export type ShipmentDetailResponseT = z.infer<typeof ShipmentDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Tool #2 — envia_list_shipments
// Verified live 2026-04-28 against GET /shipments (queries service)
// ---------------------------------------------------------------------------

const ShipmentPackageSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    tracking_number: z.string().optional(),
    status_id: z.number().optional(),
    status: z.string().optional(),
    status_parent_id: z.number().optional(),
    status_translation_tag: z.string().optional(),
    class_name: z.string().optional(),
    type: z.string().optional(),
    contet: z.string().optional(),
    content: z.string().optional(),
    length: z.union([z.string(), z.number()]).optional(),
    width: z.union([z.string(), z.number()]).optional(),
    height: z.union([z.string(), z.number()]).optional(),
    weight: z.union([z.string(), z.number()]).optional(),
    weight_unit_code: z.string().optional(),
    length_unit_code: z.string().optional(),
});

const ShipmentAdditionalServiceSchema = z.object({
    additional_service_id: z.number().optional(),
    packageId: z.number().nullable().optional(),
    additionalService: z.string().optional(),
    translationTag: z.string().optional(),
    commission: z.union([z.number(), z.string()]).optional(),
    taxes: z.union([z.number(), z.string()]).optional(),
    cost: z.union([z.number(), z.string()]).optional(),
    value: z.union([z.number(), z.string()]).optional(),
});

/**
 * A single shipment record from GET /shipments.
 * NOTE: /shipments uses `name` (carrier slug) + `service_description` (display)
 * and flat sender/consignee fields. Verified live 2026-04-28.
 */
const ShipmentRecordSchema = FlatSenderSchema.merge(FlatConsigneeSchema).merge(
    z.object({
        id: z.number(),
        tracking_number: z.string(),
        folio: z.string().nullable().optional(),
        status_id: z.number(),
        status: z.string().optional(),
        status_parent_id: z.number().optional(),
        status_translation_tag: z.string().optional(),
        class_name: z.string().optional(),
        carrier_id: z.number().optional(),
        service_id: z.number().optional(),
        service: z.string().optional(),
        service_description: z.string().optional(),
        name: z.string().optional(),
        carrier_description: z.string().optional(),
        shipment_type_id: z.number().optional(),
        shipment_type: z.string().optional(),
        shipment_type_description: z.string().optional(),
        international: z.number().optional(),
        international_documents: z.number().optional(),
        overcharge_applied: z.number().optional(),
        zone: z.number().optional(),
        reverse_pickup: z.number().optional(),
        custom_key: z.number().optional(),
        created_at: EnviaDateTimeSchema.optional(),
        utc_created_at: EnviaDateTimeSchema.optional(),
        shipped_at: EnviaDateTimeSchema.nullable().optional(),
        appointment_date: EnviaDateTimeSchema.nullable().optional(),
        pickup_date: EnviaDateTimeSchema.nullable().optional(),
        delivered_at: EnviaDateTimeSchema.nullable().optional(),
        delivered_at_origin_at: EnviaDateTimeSchema.nullable().optional(),
        estimated_delivery: EnviaDateTimeSchema.nullable().optional(),
        signed_by: z.string().nullable().optional(),
        information_detail: z.string().nullable().optional(),
        shipment_real_weight: z.number().nullable().optional(),
        shipment_weight: z.number().optional(),
        currency: z.string().optional(),
        insurance: z.number().optional(),
        insurance_cost: z.union([z.number(), z.string()]).optional(),
        extended_zone: z.number().optional(),
        additional_services_cost: z.union([z.number(), z.string()]).optional(),
        additional_charges_cost: z.number().optional(),
        import_fee: z.number().optional(),
        import_tax: z.number().optional(),
        cash_on_delivery_cost: z.number().optional(),
        cash_on_delivery_amount: z.number().optional(),
        custom_key_cost: z.number().optional(),
        sms_cost: z.number().optional(),
        whatsapp_cost: z.number().optional(),
        additional_tax: z.number().optional(),
        tax: z.number().optional(),
        cost: z.number().optional(),
        total: z.union([z.number(), z.string()]).optional(),
        grand_total: z.union([z.number(), z.string()]).optional(),
        canceled: z.number().optional(),
        canceled_at: EnviaDateTimeSchema.nullable().optional(),
        balance_returned: z.number().optional(),
        security_deposit: z.number().optional(),
        security_weight: z.number().optional(),
        balance_returned_at: EnviaDateTimeSchema.nullable().optional(),
        evidence_file: z.string().nullable().optional(),
        bol_file: z.string().nullable().optional(),
        pod_file: z.string().nullable().optional(),
        label_file: z.string().nullable().optional(),
        carrier_logo: z.string().optional(),
        created_by_id: z.number().optional(),
        created_by_name: z.string().optional(),
        created_by_email: z.string().optional(),
        cancelled_by_name: z.string().nullable().optional(),
        additional_file: z.string().nullable().optional(),
        additional_file_type: z.string().nullable().optional(),
        action_id: z.number().optional(),
        ticket_id: z.number().nullable().optional(),
        ticket_type_id: z.number().nullable().optional(),
        ticket_status_id: z.number().nullable().optional(),
        ticket_type_name: z.string().nullable().optional(),
        order_id: z.number().nullable().optional(),
        order_row_id: z.number().nullable().optional(),
        order_currency: z.string().nullable().optional(),
        generate_order_id: z.number().nullable().optional(),
        shop: z.unknown().nullable().optional(),
        ecommerce: z.unknown().nullable().optional(),
        draft_order_reference: z.string().nullable().optional(),
        order_identifier: z.string().nullable().optional(),
        total_declared_value: z.number().optional(),
        comment: z.string().nullable().optional(),
        last_event_location: z.string().nullable().optional(),
        last_event_datetime: z.string().nullable().optional(),
        last_event_description: z.string().nullable().optional(),
        cod_translation_tag: z.string().nullable().optional(),
        cod_color: z.string().nullable().optional(),
        pod_confirmation_date: z.string().nullable().optional(),
        pod_confirmation_value: z.string().nullable().optional(),
        ecommerce_description: z.string().nullable().optional(),
        return_name: z.string().optional(),
        return_company_name: z.string().optional(),
        return_email: z.string().optional(),
        return_phone: z.string().optional(),
        return_street: z.string().optional(),
        return_number: z.string().optional(),
        return_district: z.string().optional(),
        return_city: z.string().optional(),
        return_state: z.string().optional(),
        return_country: z.string().optional(),
        return_postalcode: z.string().optional(),
        return_identification_number: z.string().nullable().optional(),
        return_references: z.string().nullable().optional(),
        packages: z.array(ShipmentPackageSchema).optional(),
        additional_services: z.array(ShipmentAdditionalServiceSchema).optional(),
        products: z.array(z.unknown()).optional(),
    }),
);

/**
 * Response from GET /shipments.
 * NOTE: top-level wrapper is { data, total, total_incidents, total_reported, total_completed }.
 * There is NO total_rows field (differs from the TypeScript type). Verified live 2026-04-28.
 */
export const ShipmentListResponseSchema = z.object({
    data: z.array(ShipmentRecordSchema),
    total: z.number().optional(),
    total_incidents: z.number().optional(),
    total_reported: z.number().optional(),
    total_completed: z.number().optional(),
});

export type ShipmentListResponseT = z.infer<typeof ShipmentListResponseSchema>;

// ---------------------------------------------------------------------------
// Tool #3 — envia_get_shipments_status
// Verified live 2026-04-28 against GET /shipments/packages-information-by-status
// Returns a FLAT object — no data wrapper.
// Percentages are pre-formatted strings with "%" baked in (e.g. "6.40%").
// ---------------------------------------------------------------------------

/**
 * Response from GET /shipments/packages-information-by-status.
 * Flat object — no `data` wrapper. Percentages are strings (e.g. "7.14%").
 * Verified live 2026-04-28.
 */
export const ShipmentStatusStatsSchema = z.object({
    packagesPendingShip: z.number().optional(),
    packagesPendingPickUp: z.number().optional(),
    packagesPickup: z.number().optional(),
    percentagePickup: z.string().optional(),
    packagesShipped: z.number().optional(),
    percentageShipped: z.string().optional(),
    packagesOutForDelivery: z.number().optional(),
    percentageOutForDelivery: z.string().optional(),
    packagesDeliveryFilter: z.number().optional(),
    percentagePackagesDeliveryFilter: z.string().optional(),
    packagesActiveAndDeliveryFilter: z.number().optional(),
    packagesIssue: z.number().optional(),
    percentageIssue: z.string().optional(),
    packagesReturned: z.number().optional(),
    percentageReturned: z.string().optional(),
    dateFromMiddleware: z.string().optional(),
    dateTo: z.string().optional(),
});

export type ShipmentStatusStatsT = z.infer<typeof ShipmentStatusStatsSchema>;

// ---------------------------------------------------------------------------
// Tool #4 — envia_get_shipment_invoices
// Verified live 2026-04-28 against GET /shipments/invoices (queries service)
// DataTables-style wrapper: { recordsTotal, recordsFiltered, data }.
// ---------------------------------------------------------------------------

const InvoiceRecordSchema = z.object({
    id: z.number(),
    month: z.number().optional(),
    year: z.number().optional(),
    total: z.union([z.number(), z.string()]).optional(),
    invoice_id: z.number().nullable().optional(),
    invoice_url: z.string().nullable().optional(),
    invoice_type_amount: z.string().optional(),
    total_shipments: z.number().optional(),
    invoiced_by: z.string().nullable().optional(),
    status: z.string().optional(),
    tax_intermediacio_total: z.number().optional(),
});

/**
 * Response from GET /shipments/invoices.
 * Uses DataTables-style wrapper (recordsTotal, recordsFiltered).
 * Verified live 2026-04-28.
 */
export const InvoiceListResponseSchema = z.object({
    recordsTotal: z.number().optional(),
    recordsFiltered: z.number().optional(),
    data: z.array(InvoiceRecordSchema),
});

export type InvoiceListResponseT = z.infer<typeof InvoiceListResponseSchema>;
