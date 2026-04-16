import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetNotificationPrices } from '../../../src/tools/notifications/get-notification-prices.js';

// =============================================================================
// Factories
// =============================================================================

function makePricesResponse() {
    return [
        { type: 'sms', price: 1.5, currency: 'MXN' },
        { type: 'whatsapp', price: 1, currency: 'MXN' },
    ];
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_notification_prices', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makePricesResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetNotificationPrices(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_notification_prices')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return notification prices in output
    // -------------------------------------------------------------------------
    it('should return notification prices in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('SMS');
        expect(text).toContain('WHATSAPP');
    });

    // -------------------------------------------------------------------------
    // 2. should include price and currency in output
    // -------------------------------------------------------------------------
    it('should include price and currency in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('1.50');
        expect(text).toContain('MXN');
    });

    // -------------------------------------------------------------------------
    // 3. should handle raw array response — not wrapped in { data: [] }
    // -------------------------------------------------------------------------
    it('should handle raw array response correctly', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ type: 'email', price: 0.5, currency: 'MXN' }]),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('EMAIL');
        expect(text).toContain('0.50');
    });

    // -------------------------------------------------------------------------
    // 4. should return empty message when API returns empty array
    // -------------------------------------------------------------------------
    it('should return empty message when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('No notification pricing data available.');
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

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get notification prices:');
    });

    // -------------------------------------------------------------------------
    // 6. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 7. should call the correct notifications/prices endpoint
    // -------------------------------------------------------------------------
    it('should call the correct notifications/prices endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('notifications/prices');
    });

    // -------------------------------------------------------------------------
    // 8. should show heading in output
    // -------------------------------------------------------------------------
    it('should show heading in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Notification Prices');
    });

    // -------------------------------------------------------------------------
    // 9. should handle multiple price entries
    // -------------------------------------------------------------------------
    it('should handle multiple price entries in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        // Both SMS and WhatsApp should be present
        expect(text).toContain('SMS');
        expect(text).toContain('WHATSAPP');
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

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get notification prices:');
    });
});
