import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetMonthlyAnalytics } from '../../../src/tools/analytics/get-monthly-analytics.js';

// =============================================================================
// Factories
// =============================================================================

function makeCarrier(name = 'dhl', count = 6, sum = 6330.84) {
    return {
        name,
        color: '#FFCC00',
        dataShipments: [0, count, 0],
        dataTotal: [0, sum, 0],
        shipmentCountCarrier: count,
        shipmentSumCarrier: sum,
    };
}

function makeMonthlyResponse(carriers = [makeCarrier()], count = 6, sum = 6330.84) {
    return {
        barData: carriers,
        shipmentCount: count,
        shipmentSum: sum,
        monthsList: [{ year: 26, month: 1 }, { year: 26, month: 2 }],
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_monthly_analytics', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeMonthlyResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetMonthlyAnalytics(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_monthly_analytics')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted analytics when API returns data
    // -------------------------------------------------------------------------
    it('should return formatted analytics when API returns data', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('dhl');
        expect(text).toContain('6 shipments');
    });

    // -------------------------------------------------------------------------
    // 2. should include grand total in output
    // -------------------------------------------------------------------------
    it('should include grand total in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('6 total shipments');
    });

    // -------------------------------------------------------------------------
    // 3. should return empty message when barData is empty
    // -------------------------------------------------------------------------
    it('should return empty message when barData is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeMonthlyResponse([], 0, 0)),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('No analytics data found');
    });

    // -------------------------------------------------------------------------
    // 4. should pass sDate and eDate as query params
    // -------------------------------------------------------------------------
    it('should pass sDate and eDate as query params', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('sDate=2026-01-01');
        expect(url).toContain('eDate=2026-03-31');
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

        expect(text).toContain('Failed to get monthly analytics:');
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
    // 7. should handle multiple carriers in output
    // -------------------------------------------------------------------------
    it('should handle multiple carriers in output', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeMonthlyResponse([makeCarrier('dhl', 6, 6000), makeCarrier('fedex', 4, 4000)], 10, 10000)),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('dhl');
        expect(text).toContain('fedex');
    });

    // -------------------------------------------------------------------------
    // 8. should call the correct analytics endpoint
    // -------------------------------------------------------------------------
    it('should call the correct analytics endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('get-monthly-analytics-data');
    });

    // -------------------------------------------------------------------------
    // 9. should strip trailing spaces from carrier names
    // -------------------------------------------------------------------------
    it('should not throw on carrier name with trailing spaces', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeMonthlyResponse([makeCarrier('Paquetexpress ', 5, 1740)], 5, 1740)),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Paquetexpress');
    });

    // -------------------------------------------------------------------------
    // 10. should return error message on 400 bad request
    // -------------------------------------------------------------------------
    it('should return error message on 400 bad request', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Bad Request' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get monthly analytics:');
    });
});
