/**
 * Unit tests for envia_get_carrier_constraints tool.
 *
 * All HTTP calls are mocked via vi.stubGlobal('fetch', ...).
 * Tests are fully offline and deterministic.
 *
 * v2 changes (2026-04-27):
 *   - Fixtures updated to v2 contract: D4 triple international, D5 volumetric_factor_id,
 *     D6 dual track URLs, D10 endpoint removed, D13 meta.cached removed.
 *   - New tests: D4 international_scope rendering (all 4 values), D6 both URLs rendered,
 *     D9 coverage_summary placeholder, D11 meta._note rendered, D13 meta.cached absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createMockServer, type ToolHandler } from '../helpers/mock-server.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { registerGetCarrierConstraints } from '../../src/tools/get-carrier-constraints.js';
import type { CarrierConstraintsResponse } from '../../src/types/carrier-constraints.js';

// ---------------------------------------------------------------------------
// Input schema (mirrors the tool's Zod schema for direct validation tests)
// ---------------------------------------------------------------------------

const toolInputSchema = z.object({
    api_key: z.string().trim().min(1).optional(),
    carrier_id: z.number().int().positive(),
    service_id: z.number().int().positive().optional(),
    include: z.array(z.enum(['additional_services', 'coverage_summary'])).optional().default(['additional_services']),
});

// =============================================================================
// Factories
// =============================================================================

/**
 * Build a minimal CarrierConstraintsResponse fixture based on spec §2.2 v2.
 * One service has company_override applied (national), one does not (international).
 *
 * v2 changes applied:
 *   D4:  services include international_code + international_scope.
 *   D5:  carrier includes volumetric_factor_id.
 *   D6:  tracking uses envia_track_url_template + carrier_track_url_template.
 *   D10: carrier.endpoint removed.
 *   D13: meta.cached removed.
 */
function makeConstraintsResponse(
    overrides: Partial<CarrierConstraintsResponse> = {},
): CarrierConstraintsResponse {
    return {
        status: 'success',
        data: {
            carrier: {
                id: 1,
                name: 'fedex',
                display_name: 'FedEx',
                controller: 'FedexRest',
                color: '#4D148C',
                // D10: endpoint intentionally absent
                volumetric_factor: 5000,
                volumetric_factor_id: 12, // D5
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
                // D6: two separate URL templates
                envia_track_url_template: 'https://envia.com/track/{tracking_number}',
                carrier_track_url_template: 'https://www.fedex.com/fedextrack/?trknbr={tracking_number}',
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
                    international: false,          // D4
                    international_code: 0,          // D4
                    international_scope: 'national', // D4
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
                    service_code: 'FEDEX_EXPRESS_INT',
                    name: 'FedEx International Express',
                    description: 'International overnight express',
                    delivery_estimate: '1-3 business days',
                    international: true,              // D4
                    international_code: 1,             // D4: export
                    international_scope: 'international', // D4
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
                    rate_type: { id: 3, label: 'international' },
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
                    description: 'Cash on delivery',
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
            // D13: cached removed
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

describe('envia_get_carrier_constraints', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse(makeConstraintsResponse()));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetCarrierConstraints(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_carrier_constraints')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Tool registers without throwing
    // -------------------------------------------------------------------------
    it('should register the tool without throwing', () => {
        expect(handler).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // 2. Happy path — response contains carrier name
    // -------------------------------------------------------------------------
    it('should return textResponse with carrier display name on success', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('FedEx');
    });

    // -------------------------------------------------------------------------
    // 3. Services are rendered in the output
    // -------------------------------------------------------------------------
    it('should include service names and codes in the output', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('FedEx Ground');
        expect(text).toContain('FEDEX_GROUND');
    });

    // -------------------------------------------------------------------------
    // 4. Additional services are rendered
    // -------------------------------------------------------------------------
    it('should include additional services section in the output', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('insurance_ltl');
        expect(text).toContain('cash_on_delivery');
    });

    // -------------------------------------------------------------------------
    // 5. company_override applied=true is rendered with warning indicator
    // -------------------------------------------------------------------------
    it('should render company override details when applied=true', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Company override');
        expect(text).toContain('25');
    });

    // -------------------------------------------------------------------------
    // 6. company_override applied=false renders "no override" message
    // -------------------------------------------------------------------------
    it('should render "no company override" when applied=false', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('no company override');
    });

    // -------------------------------------------------------------------------
    // 7. Backend 404 returns error message via textResponse
    // -------------------------------------------------------------------------
    it('should return error textResponse on backend 404', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse({ error: 'Carrier not found', status: 'error' }, false, 404),
        );

        const result = await handler({ carrier_id: 99999 });
        const text = result.content[0].text;

        expect(text).toContain('Carrier not found');
    });

    // -------------------------------------------------------------------------
    // 8. Backend 401 returns auth error message
    // -------------------------------------------------------------------------
    it('should return authentication error message on backend 401', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse({ error: 'Unauthenticated.' }, false, 401),
        );

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Authentication failed');
    });

    // -------------------------------------------------------------------------
    // 9. Zod rejects carrier_id = 0
    // The mock server bypasses Zod (the MCP framework enforces it at runtime).
    // We test the schema directly here to confirm the constraint is declared.
    // -------------------------------------------------------------------------
    it('should have schema that rejects carrier_id=0', () => {
        const result = toolInputSchema.safeParse({ carrier_id: 0 });
        expect(result.success).toBe(false);
    });

    // -------------------------------------------------------------------------
    // 10. Zod rejects negative carrier_id
    // -------------------------------------------------------------------------
    it('should have schema that rejects negative carrier_id', () => {
        const result = toolInputSchema.safeParse({ carrier_id: -5 });
        expect(result.success).toBe(false);
    });

    // -------------------------------------------------------------------------
    // 11. Zod rejects invalid include value
    // -------------------------------------------------------------------------
    it('should have schema that rejects invalid include values', () => {
        const result = toolInputSchema.safeParse({ carrier_id: 1, include: ['invalid_section'] });
        expect(result.success).toBe(false);
    });

    // -------------------------------------------------------------------------
    // 12. Optional service_id is forwarded in the URL
    // -------------------------------------------------------------------------
    it('should include service_id in the request URL when provided', async () => {
        await handler({ carrier_id: 1, service_id: 23 });

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('service_id=23');
    });

    // -------------------------------------------------------------------------
    // 13. COD enabled status is visible in service output
    // -------------------------------------------------------------------------
    it('should show COD enabled indicator for services that support it', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('COD ✓');
    });

    // -------------------------------------------------------------------------
    // 14. D13: meta.cached is NOT rendered in the output
    // -------------------------------------------------------------------------
    it('should not include "cached:" text in the output (meta.cached removed in D13)', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).not.toContain('cached:');
    });

    // -------------------------------------------------------------------------
    // 15. Meta block (company_id, generated) appears at the end of the output
    // -------------------------------------------------------------------------
    it('should include meta information (company_id, generated_at) in the output', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('12345');
        expect(text).toContain('generated:');
    });

    // -------------------------------------------------------------------------
    // 16. Empty services list renders graceful message
    // -------------------------------------------------------------------------
    it('should render graceful message when services array is empty', async () => {
        const fixture = makeConstraintsResponse();
        fixture.data.services = [];
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('No active services found');
    });

    // -------------------------------------------------------------------------
    // 17. additional_services=null renders no additional services section
    // -------------------------------------------------------------------------
    it('should not render additional services section when backend returns null', async () => {
        const fixture = makeConstraintsResponse();
        fixture.data.additional_services = null;
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).not.toContain('Additional Services');
    });

    // -------------------------------------------------------------------------
    // 18. Backend 422 (service_id mismatch) surfaces clear error
    // -------------------------------------------------------------------------
    it('should surface 422 validation error message when service_id mismatches carrier', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse(
                { error: 'service_id does not belong to this carrier', status: 'error' },
                false,
                422,
            ),
        );

        const result = await handler({ carrier_id: 1, service_id: 9999 });
        const text = result.content[0].text;

        expect(text).toContain('service_id does not belong to this carrier');
    });

    // -------------------------------------------------------------------------
    // 19. D4: international_scope is rendered for a national service (code 0)
    // -------------------------------------------------------------------------
    it('should render "national (code 0)" for a domestic service', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('national (code 0)');
    });

    // -------------------------------------------------------------------------
    // 20. D4: international_scope is rendered for an international service (code 1)
    // -------------------------------------------------------------------------
    it('should render "international (code 1)" for an export service', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('international (code 1)');
    });

    // -------------------------------------------------------------------------
    // 21. D4: international_scope "import" (code 2) is rendered correctly
    // -------------------------------------------------------------------------
    it('should render "import (code 2)" for an import service', async () => {
        const fixture = makeConstraintsResponse();
        fixture.data.services = [{
            ...fixture.data.services[0],
            id: 25,
            service_code: 'FEDEX_IMPORT',
            name: 'FedEx Import',
            international: true,
            international_code: 2,
            international_scope: 'import',
        }];
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('import (code 2)');
    });

    // -------------------------------------------------------------------------
    // 22. D4: international_scope "thirdparty" (code 3) is rendered correctly
    // -------------------------------------------------------------------------
    it('should render "thirdparty (code 3)" for a third-party international service', async () => {
        const fixture = makeConstraintsResponse();
        fixture.data.services = [{
            ...fixture.data.services[0],
            id: 26,
            service_code: 'FEDEX_THIRDPARTY',
            name: 'FedEx Third Party',
            international: true,
            international_code: 3,
            international_scope: 'thirdparty',
        }];
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('thirdparty (code 3)');
    });

    // -------------------------------------------------------------------------
    // 23. D6: both tracking URLs are rendered with correct labels
    // -------------------------------------------------------------------------
    it('should render both Envia and carrier tracking URLs with their labels', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Envia tracking:');
        expect(text).toContain('Carrier tracking:');
        expect(text).toContain('envia.com/track');
        expect(text).toContain('fedex.com/fedextrack');
    });

    // -------------------------------------------------------------------------
    // 24. D9: coverage_summary placeholder renders "pending Phase 2" message
    // -------------------------------------------------------------------------
    it('should render "pending Phase 2" message when coverage_summary has _unavailable set', async () => {
        const fixture = makeConstraintsResponse();
        fixture.data.coverage_summary = {
            _unavailable: 'Computed asynchronously — pending Phase 2',
            by_service: [],
        };
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('pending Phase 2');
        expect(text).toContain('Coverage Summary');
    });

    // -------------------------------------------------------------------------
    // 25. D11: meta._note is rendered prominently when services[] is empty
    // -------------------------------------------------------------------------
    it('should render meta._note prominently when carrier has no services for the company', async () => {
        const fixture = makeConstraintsResponse();
        fixture.data.services = [];
        fixture.meta._note = 'Carrier exists but has no services available for your company.';
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Note:');
        expect(text).toContain('no services available');
    });

    // -------------------------------------------------------------------------
    // 26. D5: volumetric_factor_id is shown in the carrier header when present
    // -------------------------------------------------------------------------
    it('should include volumetric_factor_id catalog reference when present', async () => {
        const result = await handler({ carrier_id: 1 });
        const text = result.content[0].text;

        // volumetric_factor_id: 12 should appear as "catalog id: 12"
        expect(text).toContain('catalog id: 12');
    });
});
