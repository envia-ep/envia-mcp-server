/**
 * Schema tests for src/schemas/carrier-constraints.ts
 *
 * Live fixture captured 2026-04-28 from GET /carrier-constraints/1 (FedEx).
 */

import { describe, it, expect } from 'vitest';
import { CarrierConstraintsResponseSchema } from '../../src/schemas/carrier-constraints.js';

// Captured live 2026-04-28: GET /carrier-constraints/1
const liveFixture = {
    status: 'success',
    data: {
        carrier: {
            id: 1,
            name: 'fedex',
            display_name: 'Fedex',
            controller: 'FedexRest',
            color: '#4D148C',
            volumetric_factor: 5000,
            volumetric_factor_id: 1,
            box_weight: 100,
            pallet_weight: 1000,
            allows_mps: true,
            allows_async_create: true,
            include_vat: true,
            tax_percentage_included: 0,
            private: false,
        },
        pickup: {
            supported: true,
            same_day: true,
            start_hour: 9,
            end_hour: 18,
            span_minutes: 4,
            daily_limit: 1,
            fee: 50,
        },
        tracking: {
            envia_track_url_template: 'https://test.envia.com/rastreo?label=',
            carrier_track_url_template: 'https://www.fedex.com/apps/fedextrack/?tracknumbers=',
            pattern: 'apiKey|secretKey|account',
            track_limit: 10,
            tracking_delay_minutes: 0,
        },
        services: [
            {
                id: 1,
                service_code: 'FEDEX_EXPRESS_SAVER',
                name: 'ground',
                description: 'FedEx Nacional Económico',
                delivery_estimate: '2-4 días',
                international_code: 0,
                international: false,
                international_scope: 'national',
                limits: {
                    min_weight_kg: 0.1,
                    max_weight_kg: null,
                    limit_pallets: null,
                    weight_unit: 'KG',
                    volumetric_factor: 5000,
                    volumetric_factor_id: 1,
                    company_override: { applied: false },
                },
                cash_on_delivery: {
                    enabled: true,
                    minimum_amount: 100,
                    commission_percentage: 5,
                },
                options: {
                    drop_off: false,
                    branch_type: null,
                    private: false,
                    active: true,
                    custom_plan: true,
                },
                shipment_type: { id: 1, label: 'box' },
                rate_type: { id: 2, label: 'plan_definitions' },
                operational: {
                    hour_limit: null,
                    timeout_seconds: 30,
                    pickup_package_max: 0,
                    return_percentage_cost: null,
                },
            },
        ],
        additional_services: [
            {
                id: 14,
                name: 'insurance',
                translation_tag: 'createLabel.shippingInfo.insurance',
                category_id: 7,
                address_type_id: null,
                description: 'Seguro (LTL)',
                shipment_type_id: 2,
                form_id: 13,
                concept_id: 7,
                front_order_index: null,
                visible: true,
                active: true,
                available_for_services: [464],
            },
        ],
        hardcoded_limits: {
            _note: 'Dimensions and per-piece weight limits are still enforced in carrier-specific code.',
            values: [],
        },
    },
    meta: {
        carrier_id: 1,
        company_id: 254,
        service_filter: null,
        generated_at: '2026-04-28T18:17:47Z',
    },
};

describe('CarrierConstraintsResponseSchema', () => {
    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = CarrierConstraintsResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects when data.carrier.id is missing', () => {
        const broken = {
            ...liveFixture,
            data: { ...liveFixture.data, carrier: { name: 'fedex' } },
        };
        const result = CarrierConstraintsResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { ...liveFixture, new_top_level_field: 'hello' };
        const result = CarrierConstraintsResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts coverage_summary absent (only present with ?include=coverage_summary)', () => {
        const withoutCoverage = {
            ...liveFixture,
            data: { ...liveFixture.data, coverage_summary: undefined },
        };
        const result = CarrierConstraintsResponseSchema.safeParse(withoutCoverage);
        expect(result.success).toBe(true);
    });

    it('accepts coverage_summary with _unavailable placeholder', () => {
        const withCoverage = {
            ...liveFixture,
            data: {
                ...liveFixture.data,
                coverage_summary: { _unavailable: 'Coverage data not available at this time.' },
            },
        };
        const result = CarrierConstraintsResponseSchema.safeParse(withCoverage);
        expect(result.success).toBe(true);
    });

    it('accepts services as empty array (meta._note case)', () => {
        const emptyServices = {
            ...liveFixture,
            data: { ...liveFixture.data, services: [] },
            meta: { ...liveFixture.meta, _note: 'No services available for this company.' },
        };
        const result = CarrierConstraintsResponseSchema.safeParse(emptyServices);
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            CarrierConstraintsResponseSchema.safeParse(liveFixture);
        }
        const elapsed = performance.now() - start;
        expect(elapsed / ITERATIONS).toBeLessThan(5);
    });
});
