import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetShipmentsByStatus } from '../../../src/tools/analytics/get-shipments-by-status.js';

// =============================================================================
// Factories
// =============================================================================

function makeStatusCount(id: number, status: string, total: number, color = '#28a745') {
    return { id, status, total, color };
}

function makeGuidesPerStatusResponse() {
    return {
        data: [
            makeStatusCount(1, 'Created', 192),
            makeStatusCount(2, 'Shipped', 1, '#077ccd'),
            makeStatusCount(3, 'Delivered', 5, '#1ea5e0'),
            makeStatusCount(4, 'Canceled', 336, '#dc3545'),
            makeStatusCount(10, 'Lost', 2, '#f44336'),
            makeStatusCount(14, 'Damaged', 4, '#f44336'),
        ],
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_shipments_by_status', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeGuidesPerStatusResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetShipmentsByStatus(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_shipments_by_status')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return status counts in output
    // -------------------------------------------------------------------------
    it('should return status counts in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Created');
        expect(text).toContain('Canceled');
    });

    // -------------------------------------------------------------------------
    // 2. should include grand total in output
    // -------------------------------------------------------------------------
    it('should include grand total in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        // 192 + 1 + 5 + 336 + 2 + 4 = 540
        expect(text).toContain('540');
    });

    // -------------------------------------------------------------------------
    // 3. should embed dates in URL path — not as query params
    // -------------------------------------------------------------------------
    it('should embed dates in URL path, not query params', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('guides-per-status/2026-01-01/2026-03-31');
        expect(url).not.toContain('sDate=');
        expect(url).not.toContain('eDate=');
    });

    // -------------------------------------------------------------------------
    // 4. should filter out statuses with total = 0
    // -------------------------------------------------------------------------
    it('should filter out statuses with total 0', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    makeStatusCount(1, 'Created', 5),
                    makeStatusCount(2, 'Shipped', 0),
                ],
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('Created');
        expect(text).not.toContain('Shipped');
    });

    // -------------------------------------------------------------------------
    // 5. should return empty message when all totals are 0
    // -------------------------------------------------------------------------
    it('should return empty message when all totals are 0', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [makeStatusCount(1, 'Created', 0)],
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('No shipments found');
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

        expect(text).toContain('Failed to get shipments by status:');
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
    // 8. should sort statuses by total descending
    // -------------------------------------------------------------------------
    it('should sort statuses by total descending', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        const canceledIndex = text.indexOf('Canceled');
        const createdIndex = text.indexOf('Created');

        // Canceled (336) should appear before Created (192) in sorted output
        expect(canceledIndex).toBeLessThan(createdIndex);
    });

    // -------------------------------------------------------------------------
    // 9. should call the correct guides-per-status endpoint
    // -------------------------------------------------------------------------
    it('should call the correct guides-per-status endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('guides-per-status');
    });

    // -------------------------------------------------------------------------
    // 10. should handle empty data array gracefully
    // -------------------------------------------------------------------------
    it('should handle empty data array gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [] }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, start_date: '2026-01-01', end_date: '2026-03-31' });
        const text = result.content[0].text;

        expect(text).toContain('No shipments found');
    });
});
