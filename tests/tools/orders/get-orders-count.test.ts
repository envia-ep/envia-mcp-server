import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetOrdersCount } from '../../../src/tools/orders/get-orders-count.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeCountsResponse() {
    return {
        data: {
            payment_pending: { total: 26, total_by_store: [] },
            label_pending: { total: 2190, total_by_store: [] },
            pickup_pending: { total: 112, total_by_store: [] },
            shipped: { total: 3, total_by_store: [] },
            canceled: { total: 576, total_by_store: [] },
            other: { total: 11, total_by_store: [] },
            completed: { total: 2325, total_by_store: [] },
        },
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_get_orders_count', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeCountsResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetOrdersCount(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_orders_count')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return all 7 status category counts
    // -------------------------------------------------------------------------
    it('should return all 7 status category counts', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('26');    // payment_pending
        expect(text).toContain('2190');  // label_pending
        expect(text).toContain('112');   // pickup_pending
        expect(text).toContain('2325');  // completed
    });

    // -------------------------------------------------------------------------
    // 2. should include human-readable status labels
    // -------------------------------------------------------------------------
    it('should include human-readable status labels', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Payment Pending');
        expect(text).toContain('Label Pending');
        expect(text).toContain('Completed');
    });

    // -------------------------------------------------------------------------
    // 3. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        // The api-client retries 5xx errors up to 3 times (4 total attempts).
        // Override the default mock so ALL attempts return 401 (non-retryable).
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get order counts:');
    });

    // -------------------------------------------------------------------------
    // 4. should handle missing data key in response
    // -------------------------------------------------------------------------
    it('should handle missing data key in response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('No order count data returned');
    });

    // -------------------------------------------------------------------------
    // 5. should call /v2/orders-count endpoint
    // -------------------------------------------------------------------------
    it('should call the /v2/orders-count endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2/orders-count');
    });
});
