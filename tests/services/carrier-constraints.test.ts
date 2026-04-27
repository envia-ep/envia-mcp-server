/**
 * Unit tests for fetchCarrierConstraints service.
 *
 * All HTTP calls are mocked via vi.stubGlobal('fetch', ...).
 * Tests are fully offline and deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { fetchCarrierConstraints } from '../../src/services/carrier-constraints.js';
import type { CarrierConstraintsResponse } from '../../src/types/carrier-constraints.js';

// =============================================================================
// Factories
// =============================================================================

/**
 * Build a minimal but realistic CarrierConstraintsResponse fixture.
 * Matches spec §2.2 verbatim for FedEx carrier id=1.
 */
function makeConstraintsResponse(overrides: Partial<CarrierConstraintsResponse> = {}): CarrierConstraintsResponse {
    return {
        status: 'success',
        data: {
            carrier: {
                id: 1,
                name: 'fedex',
                display_name: 'FedEx',
                controller: 'FedexRest',
                color: '#4D148C',
                endpoint: 'https://apis.fedex.com',
                track_url: 'https://www.fedex.com/fedextrack/?trknbr={tracking_number}',
                volumetric_factor: 5000,
                box_weight: 0.5,
                pallet_weight: 30,
                allows_mps: true,
                allows_async_create: false,
                include_vat: false,
                tax_percentage_included: 0.0,
                private: false,
                active: true,
            },
            pickup: {
                supported: true,
                same_day: true,
                start_hour: 9,
                end_hour: 18,
                span_minutes: 60,
                daily_limit: null,
                fee: 0.0,
            },
            tracking: {
                track_url_template: 'https://www.fedex.com/fedextrack/?trknbr={tracking_number}',
                pattern: '^[0-9]{12}$',
                track_limit: 100,
                tracking_delay_minutes: 30,
            },
            services: [
                {
                    id: 23,
                    service_code: 'FEDEX_GROUND',
                    name: 'FedEx Ground',
                    description: 'Domestic ground shipping',
                    delivery_estimate: '3-5 business days',
                    international: false,
                    limits: {
                        min_weight_kg: 0.1,
                        max_weight_kg: 30,
                        limit_pallets: 0,
                        weight_unit: 'KG',
                        volumetric_factor: 5000,
                        company_override: {
                            applied: true,
                            min_weight_kg: 0.5,
                            max_weight_kg: 25,
                            half_slab: false,
                            source: 'company_service_restrictions',
                        },
                    },
                    cash_on_delivery: {
                        enabled: true,
                        minimum_amount: 100.0,
                        commission_percentage: 2.5,
                    },
                    options: {
                        drop_off: true,
                        branch_type: 'fedex_office',
                        private: false,
                        active: true,
                        custom_plan: false,
                    },
                    shipment_type: { id: 1, label: 'parcel' },
                    rate_type: { id: 2, label: 'domestic' },
                    operational: {
                        hour_limit: '16:00',
                        timeout_seconds: 30,
                        pickup_package_max: 50,
                        return_percentage_cost: 0.0,
                    },
                },
                {
                    id: 24,
                    service_code: 'FEDEX_EXPRESS',
                    name: 'FedEx Express',
                    description: 'Overnight express',
                    delivery_estimate: '1 business day',
                    international: false,
                    limits: {
                        min_weight_kg: 0.1,
                        max_weight_kg: 68,
                        limit_pallets: 0,
                        weight_unit: 'KG',
                        volumetric_factor: 5000,
                        company_override: { applied: false },
                    },
                    cash_on_delivery: {
                        enabled: false,
                        minimum_amount: null,
                        commission_percentage: null,
                    },
                    options: {
                        drop_off: false,
                        branch_type: null,
                        private: false,
                        active: true,
                        custom_plan: false,
                    },
                    shipment_type: { id: 1, label: 'parcel' },
                    rate_type: { id: 2, label: 'domestic' },
                    operational: {
                        hour_limit: '14:00',
                        timeout_seconds: 30,
                        pickup_package_max: 20,
                        return_percentage_cost: 0.0,
                    },
                },
            ],
            additional_services: [
                {
                    id: 14,
                    name: 'insurance_ltl',
                    translation_tag: 'additional.insurance.ltl',
                    category_id: 3,
                    address_type_id: null,
                    description: 'Insurance coverage for LTL freight',
                    shipment_type_id: 2,
                    form_id: 1,
                    concept_id: 14,
                    front_order_index: 1,
                    visible: true,
                    active: true,
                    available_for_services: [23, 24],
                },
                {
                    id: 15,
                    name: 'cash_on_delivery',
                    translation_tag: 'additional.cod',
                    category_id: 1,
                    address_type_id: null,
                    description: 'Cash on delivery service',
                    shipment_type_id: 1,
                    form_id: 2,
                    concept_id: 15,
                    front_order_index: 2,
                    visible: true,
                    active: true,
                    available_for_services: [23],
                },
            ],
            hardcoded_limits: {
                _note: 'Phase 1 placeholder.',
                values: [],
            },
            coverage_summary: null,
        },
        meta: {
            carrier_id: 1,
            company_id: 12345,
            service_filter: null,
            cached: false,
            generated_at: '2026-04-27T18:42:13Z',
        },
        ...overrides,
    };
}

function makeApiResponse(data: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        json: () => Promise.resolve(data),
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('fetchCarrierConstraints', () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse(makeConstraintsResponse()));
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Happy path — returns the full typed response
    // -------------------------------------------------------------------------
    it('should return full CarrierConstraintsResponse on HTTP 200', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);

        expect(result.status).toBe('success');
        expect(result.data.carrier.name).toBe('fedex');
    });

    // -------------------------------------------------------------------------
    // 2. Carrier meta fields are present
    // -------------------------------------------------------------------------
    it('should expose carrier volumetric_factor in the response', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);

        expect(result.data.carrier.volumetric_factor).toBe(5000);
    });

    // -------------------------------------------------------------------------
    // 3. Services list is present
    // -------------------------------------------------------------------------
    it('should include services array with service constraints', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);

        expect(result.data.services).toHaveLength(2);
        expect(result.data.services[0].service_code).toBe('FEDEX_GROUND');
    });

    // -------------------------------------------------------------------------
    // 4. company_override applied=true is preserved
    // -------------------------------------------------------------------------
    it('should preserve company_override applied=true in service limits', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);
        const override = result.data.services[0].limits.company_override;

        expect(override.applied).toBe(true);
        expect(override.max_weight_kg).toBe(25);
    });

    // -------------------------------------------------------------------------
    // 5. company_override applied=false is preserved
    // -------------------------------------------------------------------------
    it('should preserve company_override applied=false for services with no override', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);
        const override = result.data.services[1].limits.company_override;

        expect(override.applied).toBe(false);
    });

    // -------------------------------------------------------------------------
    // 6. Query string includes service_id when provided
    // -------------------------------------------------------------------------
    it('should append service_id query param when serviceId option is set', async () => {
        await fetchCarrierConstraints(client, 1, { serviceId: 23 }, MOCK_CONFIG);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('service_id=23');
    });

    // -------------------------------------------------------------------------
    // 7. Query string includes include param when provided
    // -------------------------------------------------------------------------
    it('should append include query param when include option is set', async () => {
        await fetchCarrierConstraints(
            client,
            1,
            { include: ['additional_services', 'coverage_summary'] },
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('include=additional_services%2Ccoverage_summary');
    });

    // -------------------------------------------------------------------------
    // 8. Default include=additional_services applied when omitted
    // -------------------------------------------------------------------------
    it('should default include to additional_services when options.include is omitted', async () => {
        await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('include=additional_services');
    });

    // -------------------------------------------------------------------------
    // 9. Correct URL path is constructed
    // -------------------------------------------------------------------------
    it('should call the correct shippingBase URL with carrier_id in path', async () => {
        await fetchCarrierConstraints(client, 7, {}, MOCK_CONFIG);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`${MOCK_CONFIG.shippingBase}/carrier-constraints/7`);
    });

    // -------------------------------------------------------------------------
    // 10. 404 response throws "Carrier not found"
    // -------------------------------------------------------------------------
    it('should throw "Carrier not found" on HTTP 404 with carrier error body', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse({ error: 'Carrier not found', status: 'error' }, false, 404),
        );

        await expect(
            fetchCarrierConstraints(client, 99999, {}, MOCK_CONFIG),
        ).rejects.toThrow('Carrier not found');
    });

    // -------------------------------------------------------------------------
    // 11. 401 response throws authentication error
    // -------------------------------------------------------------------------
    it('should throw authentication error on HTTP 401', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse({ error: 'Unauthenticated.' }, false, 401),
        );

        await expect(
            fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG),
        ).rejects.toThrow('Authentication failed');
    });

    // -------------------------------------------------------------------------
    // 12. 422 propagates backend validation message
    // -------------------------------------------------------------------------
    it('should throw with backend validation message on HTTP 422', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse(
                { error: 'service_id does not belong to this carrier', status: 'error' },
                false,
                422,
            ),
        );

        await expect(
            fetchCarrierConstraints(client, 1, { serviceId: 9999 }, MOCK_CONFIG),
        ).rejects.toThrow('service_id does not belong to this carrier');
    });

    // -------------------------------------------------------------------------
    // 13. 5xx response throws "Backend error"
    // Mock client.get directly to avoid triggering the 3-retry backoff loop
    // that the lower-level fetch mock would cause on 500 responses.
    // -------------------------------------------------------------------------
    it('should throw "Backend error" when client returns a 5xx response', async () => {
        vi.spyOn(client, 'get').mockResolvedValueOnce({
            ok: false,
            status: 503,
            data: { error: 'Internal error: DB connection failed' } as unknown as CarrierConstraintsResponse,
            error: 'Internal error: DB connection failed',
        });

        await expect(
            fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG),
        ).rejects.toThrow('Backend error');
    });

    // -------------------------------------------------------------------------
    // 14. Network/timeout error is propagated
    // Mock client.get directly to avoid the retry backoff delays.
    // -------------------------------------------------------------------------
    it('should propagate network-level errors from the client', async () => {
        vi.spyOn(client, 'get').mockResolvedValueOnce({
            ok: false,
            status: 0,
            data: {} as CarrierConstraintsResponse,
            error: 'Network error after 4 attempts. Check your internet connection and try again.',
        });

        await expect(
            fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG),
        ).rejects.toThrow('Network error');
    });

    // -------------------------------------------------------------------------
    // 15. additional_services are returned in the response
    // -------------------------------------------------------------------------
    it('should include additional_services in the response data', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);

        expect(Array.isArray(result.data.additional_services)).toBe(true);
        expect(result.data.additional_services).toHaveLength(2);
    });

    // -------------------------------------------------------------------------
    // 16. meta fields are present and correct
    // -------------------------------------------------------------------------
    it('should include correct meta block with carrier_id and generated_at', async () => {
        const result = await fetchCarrierConstraints(client, 1, {}, MOCK_CONFIG);

        expect(result.meta.carrier_id).toBe(1);
        expect(typeof result.meta.generated_at).toBe('string');
    });
});
