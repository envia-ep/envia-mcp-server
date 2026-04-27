/**
 * TypeScript interfaces for the carrier-constraints endpoint response.
 *
 * Mirrors the contract in _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md §2.2 (v3)
 * verbatim. Every field's optional/required status matches the v3 spec.
 *
 * Backend ticket: C11 (endpoint not yet available — see BACKEND_TEAM_BRIEF.md).
 * Once C11 ships no changes here are required; only the env-var pointing to
 * the carriers service needs to be live.
 *
 * v2 changes (2026-04-27 backend round-1 review):
 *   D4.  `international` is now a triple field (bool + code + scope).
 *   D5.  `volumetric_factor_id` added as optional FK to CarrierMeta.
 *   D6.  Tracking split into envia_track_url_template + carrier_track_url_template.
 *   D9.  CoverageSummary `_unavailable` field already existed; JSDoc updated.
 *   D10. `endpoint` removed from CarrierMeta (security — internal URL not exposed).
 *   D11. ResponseMeta gains optional `_note` field for empty-services semantics.
 *   D13. `cached` removed from ResponseMeta (observability via Datadog APM instead).
 *
 * v3 changes (2026-04-27 backend round-2 review):
 *   D1.  Strict 404/200/422 hierarchy — private/disabled → 404; empty services → 200+note;
 *        service_id mismatch → 422; service_id filtered-by-company → 200+note.
 *   D2.  `coverage_summary` is optional (only present when ?include=coverage_summary).
 *   D5.  `volumetric_factor_id` is now `number | null` (required, nullable) — always present.
 *   D6.  `carrier.active` removed — redundant (any carrier in a 200 is active by contract).
 */

// ---------------------------------------------------------------------------
// Sub-shapes
// ---------------------------------------------------------------------------

/**
 * Carrier-level metadata sourced from the `carriers` table.
 * §2.2 → data.carrier
 *
 * D10: `endpoint` (internal carrier API URL) is intentionally NOT included.
 * Exposing it would leak internal infrastructure to MCP consumers — see §6
 * of the spec for the security rationale.
 *
 * D6 (v3): `active` is NOT included. There is no `active` column on the `carriers`
 * table; and per the strict 404/200 hierarchy (D1 v3), any carrier surfaced in a
 * 200 response is accessible by contract — the field is redundant noise.
 */
export interface CarrierMeta {
    id: number;
    name: string;
    display_name: string;
    controller: string;
    color: string;
    /**
     * Default volumetric divisor resolved from `catalog_volumetrict_factor.factor`
     * via FK in the `carriers` table. Most common value: 5000.
     * D5: actual divisor (not a multiplier). Source: backend `carriers.volumetric_factor` column.
     */
    volumetric_factor: number;
    /**
     * FK to `catalog_volumetrict_factor`. Always present in the response; `null` when
     * not set in the DB.
     * D5 v3: changed from optional to required nullable (number | null). Always present.
     */
    volumetric_factor_id: number | null;
    box_weight: number;
    pallet_weight: number;
    allows_mps: boolean;
    allows_async_create: boolean;
    include_vat: boolean;
    tax_percentage_included: number;
    private: boolean;
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
 *
 * D6: Two separate URL templates are now exposed:
 *   - `envia_track_url_template` — the Envia-hosted tracking page URL (from `carriers.track_url`).
 *   - `carrier_track_url_template` — the carrier's own tracking page URL (from `carriers.track_url_site`).
 * Both are required. Use `envia_track_url_template` for customer-facing links in the portal.
 * Use `carrier_track_url_template` to deep-link directly into the carrier's tracking system.
 */
export interface Tracking {
    envia_track_url_template: string;
    carrier_track_url_template: string;
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
 *
 * D4: The `international` field is now a triple:
 *   - `international` (bool): true when international_code > 0.
 *   - `international_code` (0|1|2|3): the raw integer from `services.international`.
 *   - `international_scope` ('national'|'international'|'import'|'thirdparty'):
 *       human-readable label derived from the code.
 *
 * Mapping (source: CarrierUtil.php:406 + Service.php:84):
 *   0 → 'national'      (domestic / nacional)
 *   1 → 'international' (international export)
 *   2 → 'import'        (import — Service.php: is_import = international == 2)
 *   3 → 'thirdparty'    (third-party international)
 */
export interface ServiceConstraint {
    id: number;
    service_code: string;
    name: string;
    description: string | null;
    delivery_estimate: string | null;
    /** True when international_code > 0. */
    international: boolean;
    /** Raw integer from `services.international` column. See JSDoc for mapping. */
    international_code: 0 | 1 | 2 | 3;
    /** Human-readable scope derived from international_code. See JSDoc for mapping. */
    international_scope: 'national' | 'international' | 'import' | 'thirdparty';
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
 *
 * D9 — Phase 1 behaviour: when `?include=coverage_summary` is requested,
 * the backend returns the placeholder shape below. The MCP must NOT treat
 * this as an error — return it as-is and render a "pending Phase 2" message.
 *
 * Phase 1 placeholder shape (from the backend):
 * ```json
 * {
 *   "_unavailable": "Computed asynchronously — pending Phase 2",
 *   "by_service": []
 * }
 * ```
 *
 * Phase 2 will populate `by_service` with actual postal-code counts per country.
 * Only populated when `?include=coverage_summary` is set.
 */
export interface CoverageSummary {
    _note?: string;
    /** Present in Phase 1 when coverage data is not yet computed. */
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
 *
 * D11: `_note` added — present when carrier exists but has no services
 * available for the requesting company (200 + empty services[]).
 *
 * D13: `cached` removed. Cache hit/miss is tracked via Datadog APM span
 * attributes, not via the response body. Verify cache state directly:
 *   `EXISTS carrier-constraints:{carrier_id}:{company_id}:all:additional_services`
 */
export interface ResponseMeta {
    carrier_id: number;
    company_id: number | null;
    service_filter: number | null;
    generated_at: string;
    /**
     * Present when the carrier exists but has no active services available for
     * the requesting company (200 + empty services[]). D11.
     */
    _note?: string;
}

/**
 * Full response shape for GET /carrier-constraints/{carrier_id}.
 * §2.2
 *
 * D2 v3: `coverage_summary` is OPTIONAL (sparse fieldset). It is only present
 * in the response when the caller passes `?include=coverage_summary`. When
 * absent, the field is missing from the response entirely (not `null`).
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
        /** Present only when ?include=coverage_summary was requested. */
        coverage_summary?: CoverageSummary;
    };
    meta: ResponseMeta;
}
