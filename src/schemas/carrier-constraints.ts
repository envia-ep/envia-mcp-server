/**
 * Zod schemas for the carrier-constraints API response.
 *
 * Verified live 2026-04-28 against GET /carrier-constraints/1 (carriers service).
 * Mirrors _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md v3 contract.
 *
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.2 for capture methodology.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const CarrierMetaSchema = z.object({
    id: z.number(),
    name: z.string(),
    display_name: z.string(),
    controller: z.string(),
    color: z.string(),
    volumetric_factor: z.number(),
    volumetric_factor_id: z.number().nullable(),
    box_weight: z.number().optional(),
    pallet_weight: z.number().optional(),
    allows_mps: z.boolean().optional(),
    allows_async_create: z.boolean().optional(),
    include_vat: z.boolean().optional(),
    tax_percentage_included: z.number().optional(),
    private: z.boolean().optional(),
});

const PickupConfigSchema = z.object({
    supported: z.boolean(),
    same_day: z.boolean().optional(),
    start_hour: z.number().optional(),
    end_hour: z.number().optional(),
    span_minutes: z.number().optional(),
    daily_limit: z.number().optional(),
    fee: z.number().optional(),
});

const TrackingConfigSchema = z.object({
    envia_track_url_template: z.string().optional(),
    carrier_track_url_template: z.string().optional(),
    pattern: z.string().optional(),
    track_limit: z.number().optional(),
    tracking_delay_minutes: z.number().optional(),
});

const ServiceLimitsSchema = z.object({
    min_weight_kg: z.number().optional(),
    max_weight_kg: z.number().nullable().optional(),
    limit_pallets: z.number().nullable().optional(),
    weight_unit: z.string().optional(),
    volumetric_factor: z.number().optional(),
    volumetric_factor_id: z.number().optional(),
    company_override: z.object({
        applied: z.boolean().optional(),
    }).optional(),
});

const CodConfigSchema = z.object({
    enabled: z.boolean().optional(),
    minimum_amount: z.number().optional(),
    commission_percentage: z.number().optional(),
});

const ServiceOptionsSchema = z.object({
    drop_off: z.boolean().optional(),
    branch_type: z.string().nullable().optional(),
    private: z.boolean().optional(),
    active: z.boolean().optional(),
    custom_plan: z.boolean().optional(),
});

const ShipmentTypeRefSchema = z.object({
    id: z.number().optional(),
    label: z.string().optional(),
});

const OperationalSchema = z.object({
    hour_limit: z.number().nullable().optional(),
    timeout_seconds: z.number().optional(),
    pickup_package_max: z.number().optional(),
    return_percentage_cost: z.number().nullable().optional(),
});

const ServiceConstraintSchema = z.object({
    id: z.number(),
    service_code: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    delivery_estimate: z.string().optional(),
    international_code: z.number().optional(),
    international: z.boolean().optional(),
    international_scope: z.string().optional(),
    limits: ServiceLimitsSchema.optional(),
    cash_on_delivery: CodConfigSchema.optional(),
    options: ServiceOptionsSchema.optional(),
    shipment_type: ShipmentTypeRefSchema.optional(),
    rate_type: ShipmentTypeRefSchema.optional(),
    operational: OperationalSchema.optional(),
});

const AdditionalServiceRefSchema = z.object({
    id: z.number(),
    name: z.string().optional(),
    translation_tag: z.string().optional(),
    category_id: z.number().optional(),
    address_type_id: z.number().nullable().optional(),
    description: z.string().optional(),
    shipment_type_id: z.number().optional(),
    form_id: z.number().optional(),
    concept_id: z.number().optional(),
    front_order_index: z.number().nullable().optional(),
    visible: z.boolean().optional(),
    active: z.boolean().optional(),
    available_for_services: z.array(z.number()).optional(),
});

/** coverage_summary — only present when ?include=coverage_summary. */
const CoverageSummarySchema = z.object({
    _unavailable: z.string().optional(),
    total_postal_codes: z.number().optional(),
    covered_postal_codes: z.number().optional(),
});

const HardcodedLimitsSchema = z.object({
    _note: z.string().optional(),
    values: z.array(z.unknown()).optional(),
});

const ResponseMetaSchema = z.object({
    carrier_id: z.number().optional(),
    company_id: z.number().optional(),
    service_filter: z.unknown().nullable().optional(),
    generated_at: z.string().optional(),
    _note: z.string().optional(),
});

const CarrierConstraintsDataSchema = z.object({
    carrier: CarrierMetaSchema,
    pickup: PickupConfigSchema,
    tracking: TrackingConfigSchema,
    services: z.array(ServiceConstraintSchema),
    additional_services: z.array(AdditionalServiceRefSchema).optional(),
    hardcoded_limits: HardcodedLimitsSchema.optional(),
    coverage_summary: CoverageSummarySchema.optional(),
    company_overrides: z.array(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Tool #6 — envia_get_carrier_constraints
// Verified live 2026-04-28 against GET /carrier-constraints/1 (FedEx)
// ---------------------------------------------------------------------------

/**
 * Response from GET /carrier-constraints/{carrier_id}.
 * Verified live 2026-04-28 against carrier_id=1 (FedEx).
 * Structure: { status, data, meta } at the top level.
 */
export const CarrierConstraintsResponseSchema = z.object({
    status: z.string(),
    data: CarrierConstraintsDataSchema,
    meta: ResponseMetaSchema.optional(),
});

export type CarrierConstraintsResponseT = z.infer<typeof CarrierConstraintsResponseSchema>;
