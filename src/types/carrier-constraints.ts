/**
 * TypeScript interfaces for the carrier-constraints endpoint response.
 *
 * Mirrors the contract in _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md §2.2
 * verbatim. Every field's optional/required status matches the spec.
 *
 * Backend ticket: C11 (endpoint not yet available — see BACKEND_TEAM_BRIEF.md).
 * Once C11 ships no changes here are required; only the env-var pointing to
 * the carriers service needs to be live.
 */

// ---------------------------------------------------------------------------
// Sub-shapes
// ---------------------------------------------------------------------------

/**
 * Carrier-level metadata sourced from the `carriers` table.
 * §2.2 → data.carrier
 */
export interface CarrierMeta {
    id: number;
    name: string;
    display_name: string;
    controller: string;
    color: string;
    endpoint: string;
    track_url: string;
    volumetric_factor: number;
    box_weight: number;
    pallet_weight: number;
    allows_mps: boolean;
    allows_async_create: boolean;
    include_vat: boolean;
    tax_percentage_included: number;
    private: boolean;
    active: boolean;
}

/**
 * Pickup window configuration for the carrier.
 * §2.2 → data.pickup
 */
export interface Pickup {
    supported: boolean;
    same_day: boolean;
    start_hour: number | null;
    end_hour: number | null;
    span_minutes: number | null;
    daily_limit: number | null;
    fee: number;
}

/**
 * Tracking configuration for the carrier.
 * §2.2 → data.tracking
 */
export interface Tracking {
    track_url_template: string;
    pattern: string | null;
    track_limit: number;
    tracking_delay_minutes: number;
}

/**
 * Company-level weight override for a single service.
 * §2.2 → data.services[].limits.company_override
 * §3.3 — sourced from company_service_restrictions table.
 */
export interface CompanyOverride {
    applied: boolean;
    min_weight_kg?: number | null;
    max_weight_kg?: number;
    half_slab?: boolean;
    source?: 'company_service_restrictions';
}

/**
 * Weight and pallet limits for a service.
 * §2.2 → data.services[].limits
 */
export interface ServiceLimits {
    min_weight_kg: number | null;
    max_weight_kg: number;
    limit_pallets: number;
    weight_unit: string;
    volumetric_factor: number;
    company_override: CompanyOverride;
}

/**
 * Cash-on-delivery configuration for a service.
 * §2.2 → data.services[].cash_on_delivery
 */
export interface CashOnDelivery {
    enabled: boolean;
    minimum_amount: number | null;
    commission_percentage: number | null;
}

/**
 * Operational options for a service (drop-off, visibility, plan).
 * §2.2 → data.services[].options
 */
export interface ServiceOptions {
    drop_off: boolean;
    branch_type: string | null;
    private: boolean;
    active: boolean;
    custom_plan: boolean;
}

/**
 * Shipment type reference (parcel, LTL, etc.).
 * §2.2 → data.services[].shipment_type
 */
export interface ShipmentTypeRef {
    id: number;
    label: string | null;
}

/**
 * Rate type reference (domestic, international, etc.).
 * §2.2 → data.services[].rate_type
 */
export interface RateTypeRef {
    id: number;
    label: string | null;
}

/**
 * Operational time and limit parameters for a service.
 * §2.2 → data.services[].operational
 */
export interface OperationalLimits {
    hour_limit: string | null;
    timeout_seconds: number;
    pickup_package_max: number;
    return_percentage_cost: number;
}

/**
 * A single carrier service with all its constraints.
 * §2.2 → data.services[]
 */
export interface ServiceConstraint {
    id: number;
    service_code: string;
    name: string;
    description: string | null;
    delivery_estimate: string | null;
    international: boolean;
    limits: ServiceLimits;
    cash_on_delivery: CashOnDelivery;
    options: ServiceOptions;
    shipment_type: ShipmentTypeRef;
    rate_type: RateTypeRef;
    operational: OperationalLimits;
}

/**
 * An additional (add-on) service available for the carrier.
 * §2.2 → data.additional_services[]
 */
export interface AdditionalServiceRef {
    id: number;
    name: string;
    translation_tag: string;
    category_id: number;
    address_type_id: number | null;
    description: string | null;
    shipment_type_id: number | null;
    form_id: number | null;
    concept_id: number | null;
    front_order_index: number | null;
    visible: boolean;
    active: boolean;
    available_for_services: number[];
}

/**
 * Phase-1 placeholder for hardcoded per-carrier limits.
 * §2.2 → data.hardcoded_limits
 * §3.5 — Phase 2 will populate this; Phase 1 always returns values: [].
 */
export interface HardcodedLimits {
    _note: string;
    values: unknown[];
}

/**
 * Coverage summary by service and country.
 * §2.2 → data.coverage_summary
 * Only populated when ?include=coverage_summary is requested.
 */
export interface CoverageSummary {
    _note?: string;
    _unavailable?: string;
    by_service: Array<{
        service_id: number;
        countries: Array<{
            country_code: string;
            postal_code_count: number;
        }>;
    }>;
}

/**
 * Response metadata included at the top level of every response.
 * §2.2 → meta
 */
export interface ResponseMeta {
    carrier_id: number;
    company_id: number | null;
    service_filter: number | null;
    cached: boolean;
    generated_at: string;
}

/**
 * Full response shape for GET /carrier-constraints/{carrier_id}.
 * §2.2
 */
export interface CarrierConstraintsResponse {
    status: 'success';
    data: {
        carrier: CarrierMeta;
        pickup: Pickup;
        tracking: Tracking;
        services: ServiceConstraint[];
        additional_services: AdditionalServiceRef[] | null;
        hardcoded_limits: HardcodedLimits;
        coverage_summary: CoverageSummary | null;
    };
    meta: ResponseMeta;
}
