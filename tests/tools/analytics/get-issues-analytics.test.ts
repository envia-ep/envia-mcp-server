import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetIssuesAnalytics } from '../../../src/tools/analytics/get-issues-analytics.js';

// =============================================================================
// Factories
// =============================================================================

function makeIssueType(name = 'Damaged Package', value = 3, percentage = 50) {
    return { primaryName: name, translation_tag: 'ticket.type.damaged', value, percentage };
}

function makeCarrierMonthlyIssue(name = 'DHL', data = [0, 1, 0, 1]) {
    return { name, color: '#FFCC00', dataShipments: data };
}

function makeIssuesModuleResponse() {
    return {
        monthsList: [{ year: 26, month: 1 }],
        sortDataByIssues: [makeIssueType(), makeIssueType('Lost Package', 1, 16.67)],
        sortDataReturnedCarrierStats: [],
        barDataCarrierMonthlyIssues: [makeCarrierMonthlyIssue()],
        barDataIssueVsShipped: [{ issueRatePercentage: 0 }, { issueRatePercentage: 25 }],
        barDataCarrierMonthlyReturnedToOrigin: [],
        barDataReturnedToOriginVsShipped: [],
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_issues_analytics', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeIssuesModuleResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetIssuesAnalytics(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_issues_analytics')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return issue types in output
    // -------------------------------------------------------------------------
    it('should return issue types in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Damaged Package');
        expect(text).toContain('Lost Package');
    });

    // -------------------------------------------------------------------------
    // 2. should include carrier breakdown in output
    // -------------------------------------------------------------------------
    it('should include carrier breakdown in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('DHL');
        expect(text).toContain('issues');
    });

    // -------------------------------------------------------------------------
    // 3. should include monthly issue rates in output
    // -------------------------------------------------------------------------
    it('should include monthly issue rates in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Monthly issue rates');
        expect(text).toContain('25.0%');
    });

    // -------------------------------------------------------------------------
    // 4. should return empty message when no issues data
    // -------------------------------------------------------------------------
    it('should return empty message when no issues data', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                monthsList: [],
                sortDataByIssues: [],
                sortDataReturnedCarrierStats: [],
                barDataCarrierMonthlyIssues: [],
                barDataIssueVsShipped: [],
                barDataCarrierMonthlyReturnedToOrigin: [],
                barDataReturnedToOriginVsShipped: [],
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('No issues data found');
    });

    // -------------------------------------------------------------------------
    // 5. should pass sDate and eDate as query params
    // -------------------------------------------------------------------------
    it('should pass sDate and eDate as query params', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-02-01', end_date: '2026-02-28' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('sDate=2026-02-01');
        expect(url).toContain('eDate=2026-02-28');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message when API fails with 401
    // -------------------------------------------------------------------------
    it('should return error message when API fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get issues analytics:');
    });

    // -------------------------------------------------------------------------
    // 7. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz', start_date: '2026-01-01', end_date: '2026-03-31' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 8. should include percentage values in issue types
    // -------------------------------------------------------------------------
    it('should include percentage values in issue type output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('50.0%');
    });

    // -------------------------------------------------------------------------
    // 9. should call the correct issues-module endpoint
    // -------------------------------------------------------------------------
    it('should call the correct issues-module endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('issues-module');
    });

    // -------------------------------------------------------------------------
    // 10. should handle empty barDataIssueVsShipped gracefully
    // -------------------------------------------------------------------------
    it('should handle empty barDataIssueVsShipped gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                ...makeIssuesModuleResponse(),
                barDataIssueVsShipped: [],
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Damaged Package');
        expect(text).not.toContain('Monthly issue rates');
    });
});
