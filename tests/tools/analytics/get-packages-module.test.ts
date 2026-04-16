import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetPackagesModule } from '../../../src/tools/analytics/get-packages-module.js';

// =============================================================================
// Factories
// =============================================================================

function makeCarrierPerformance(name = 'Paquetexpress', overrides: Record<string, unknown> = {}) {
    return {
        name,
        image: 'https://img.envia.com/paquetexpress.svg',
        shippedCount: 6,
        inTransitCount: 1,
        outForDeliveryCount: 0,
        deliveryCount: 1,
        deliverySecondSum: 21600,
        returnOriginCount: 0,
        issuesCount: 3,
        pendingCount: 29,
        total: 1740,
        services: [],
        deliveredVsShippedPercentage: 16.67,
        deliveredTimeAvg: 0.25,
        totalAvg: 290,
        returnOriginPercentage: 0,
        issuePercentage: 50,
        ...overrides,
    };
}

function makePackagesModuleResponse(carriers = [makeCarrierPerformance()]) {
    return {
        data: carriers,
        pendingTotal: 195,
        shippedTotal: 14,
        inTransitTotal: 1,
        outForDeliveryTotal: 0,
        deliveryTotal: 1,
        deliveredVsShippedAvgTotal: 7.14,
        deliveredTimeAvgTotal: 0.25,
        priceTotal: 8395.64,
        priceAvgTotal: 599.69,
        returnedTotal: 0,
        returnedPercentageTotal: 0,
        issuesTotal: 6,
        issuesPercentageTotal: 42.86,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_packages_module', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makePackagesModuleResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetPackagesModule(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_packages_module')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return carrier performance in output
    // -------------------------------------------------------------------------
    it('should return carrier performance in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Paquetexpress');
        expect(text).toContain('Shipped: 6');
    });

    // -------------------------------------------------------------------------
    // 2. should include global totals in output
    // -------------------------------------------------------------------------
    it('should include global totals in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('14 shipped');
        expect(text).toContain('1 delivered');
        expect(text).toContain('6 issues');
    });

    // -------------------------------------------------------------------------
    // 3. should return empty message when data array is empty
    // -------------------------------------------------------------------------
    it('should return empty message when data array is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makePackagesModuleResponse([])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('No packages performance data found');
    });

    // -------------------------------------------------------------------------
    // 4. should pass sDate and eDate as query params
    // -------------------------------------------------------------------------
    it('should pass sDate and eDate as query params', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-02-01', end_date: '2026-02-28' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('sDate=2026-02-01');
        expect(url).toContain('eDate=2026-02-28');
    });

    // -------------------------------------------------------------------------
    // 5. should return error message when API fails with 401
    // -------------------------------------------------------------------------
    it('should return error message when API fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get packages module:');
    });

    // -------------------------------------------------------------------------
    // 6. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz', start_date: '2026-01-01', end_date: '2026-03-31' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 7. should include issue percentage in output
    // -------------------------------------------------------------------------
    it('should include issue percentage in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Issue%: 50.0%');
    });

    // -------------------------------------------------------------------------
    // 8. should include delivery rate in output
    // -------------------------------------------------------------------------
    it('should include delivery rate in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Delivery%: 16.7%');
    });

    // -------------------------------------------------------------------------
    // 9. should call the correct packages-module endpoint
    // -------------------------------------------------------------------------
    it('should call the correct packages-module endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('packages-module');
    });

    // -------------------------------------------------------------------------
    // 10. should handle carrier with trailing spaces in name
    // -------------------------------------------------------------------------
    it('should handle carrier with trailing spaces in name', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makePackagesModuleResponse([makeCarrierPerformance('DHL  ')])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('DHL');
    });
});
