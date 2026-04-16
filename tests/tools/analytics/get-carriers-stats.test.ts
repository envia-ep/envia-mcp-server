import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetCarriersStats } from '../../../src/tools/analytics/get-carriers-stats.js';

// =============================================================================
// Factories
// =============================================================================

function makeCarrierStat(name = 'DHL', value = 6, percentage = 42.86) {
    return { primaryName: name, image: 'https://img.envia.com/dhl.svg', value, percentage };
}

function makeDeliveryTime(name = 'Express', value = 0.25, percentage = 100) {
    return {
        primaryName: name,
        image: 'https://img.envia.com/dhl.svg',
        deliveredCount: 1,
        deliveryDaysSum2: value,
        deliveryDaysSum: 21600,
        value,
        percentage,
    };
}

function makeLocationStat(name = 'México', value = 14, percentage = 100) {
    return { primaryName: name, value, primaryCode: 'MX', postalCode: '66056', percentage, isCountry: true };
}

function makeWeightStat(range = '0.5 - 1 Kg', value = 7, percentage = 50) {
    return { primaryName: range, rangeWeight: '0.5-1', value, categoryWeight: range, orderCategory: 2, percentage };
}

function makeCarriersStatsResponse() {
    return {
        sortDataCarrierStats: [makeCarrierStat()],
        sortDataServiceStats: [makeCarrierStat('Paquetexpress ', 5, 35.71)],
        sortAvgDeliveryTimeByServiceStats: [makeDeliveryTime()],
        sortOriginPackagesStats: [makeLocationStat()],
        sortDestinationPackagesStats: [makeLocationStat('Colombia', 2, 50)],
        sortWeightPackagesStats: [makeWeightStat()],
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_carriers_stats', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeCarriersStatsResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetCarriersStats(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_carriers_stats')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return carrier stats sections in output
    // -------------------------------------------------------------------------
    it('should return carrier stats sections in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Top Carriers');
        expect(text).toContain('DHL');
    });

    // -------------------------------------------------------------------------
    // 2. should include service stats section
    // -------------------------------------------------------------------------
    it('should include service stats section', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Top Services');
        expect(text).toContain('Paquetexpress');
    });

    // -------------------------------------------------------------------------
    // 3. should include delivery time section
    // -------------------------------------------------------------------------
    it('should include delivery time section', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Avg Delivery Time');
    });

    // -------------------------------------------------------------------------
    // 4. should include weight distribution section
    // -------------------------------------------------------------------------
    it('should include weight distribution section', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Weight Distribution');
        expect(text).toContain('0.5 - 1 Kg');
    });

    // -------------------------------------------------------------------------
    // 5. should pass sDate and eDate as query params
    // -------------------------------------------------------------------------
    it('should pass sDate and eDate as query params', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('sDate=2026-01-01');
        expect(url).toContain('eDate=2026-03-31');
    });

    // -------------------------------------------------------------------------
    // 6. should return empty message when all sections are empty
    // -------------------------------------------------------------------------
    it('should return empty message when all stats are empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                sortDataCarrierStats: [],
                sortDataServiceStats: [],
                sortAvgDeliveryTimeByServiceStats: [],
                sortOriginPackagesStats: [],
                sortDestinationPackagesStats: [],
                sortWeightPackagesStats: [],
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('No carrier stats data found');
    });

    // -------------------------------------------------------------------------
    // 7. should return error message when API fails with 401
    // -------------------------------------------------------------------------
    it('should return error message when API fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get carriers stats:');
    });

    // -------------------------------------------------------------------------
    // 8. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz', start_date: '2026-01-01', end_date: '2026-03-31' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 9. should include percentages in output
    // -------------------------------------------------------------------------
    it('should include percentage values in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toMatch(/\d+\.\d+%/);
    });

    // -------------------------------------------------------------------------
    // 10. should call the correct carriers-stats endpoint
    // -------------------------------------------------------------------------
    it('should call the correct carriers-stats endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('carriers-stats');
    });
});
