import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetNotificationConfig } from '../../../src/tools/notifications/get-notification-config.js';

// =============================================================================
// Factories
// =============================================================================

function makeConfigEntry(id = 1414826, type = 'balance_return') {
    return {
        id,
        type,
        body: JSON.stringify({
            trackingNumber: '32192528',
            carrier: 'buslog',
            price: 108.6,
            amount: 108.6,
            currency: 'MXN',
            type: 'cancel_balance_return',
        }),
        html: null,
        redirect_url: 'https://envia.com/shipments',
        active: 1,
        created_at: '2026-04-14 15:26:44',
    };
}

function makeNotificationConfigResponse() {
    return {
        data: {
            returns: [makeConfigEntry()],
        },
        notificationCount: 5,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_notification_config', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeNotificationConfigResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetNotificationConfig(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_notification_config')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return notification config grouped by category
    // -------------------------------------------------------------------------
    it('should return notification config grouped by category', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Returns');
        expect(text).toContain('balance_return');
    });

    // -------------------------------------------------------------------------
    // 2. should parse body JSON and include tracking info
    // -------------------------------------------------------------------------
    it('should parse body JSON and include tracking number', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('32192528');
    });

    // -------------------------------------------------------------------------
    // 3. should parse body JSON and include carrier info
    // -------------------------------------------------------------------------
    it('should parse body JSON and include carrier name', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('buslog');
    });

    // -------------------------------------------------------------------------
    // 4. should parse body JSON and include amount
    // -------------------------------------------------------------------------
    it('should parse body JSON and include amount', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('108.60');
    });

    // -------------------------------------------------------------------------
    // 5. should include total count in output heading
    // -------------------------------------------------------------------------
    it('should include total notification count in output heading', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('5 entries');
    });

    // -------------------------------------------------------------------------
    // 6. should return empty message when data is empty
    // -------------------------------------------------------------------------
    it('should return empty message when data object is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: {}, notificationCount: 0 }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('No notification config entries found.');
    });

    // -------------------------------------------------------------------------
    // 7. should pass limit param when provided
    // -------------------------------------------------------------------------
    it('should pass limit param when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limit=20');
    });

    // -------------------------------------------------------------------------
    // 8. should return error message when API fails with 401
    // -------------------------------------------------------------------------
    it('should return error message when API fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get notification config:');
    });

    // -------------------------------------------------------------------------
    // 9. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 10. should handle malformed body JSON without crashing
    // -------------------------------------------------------------------------
    it('should handle malformed body JSON gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: {
                    returns: [{
                        id: 999,
                        type: 'unknown',
                        body: 'not valid json {{{',
                        html: null,
                        redirect_url: 'https://envia.com',
                        active: 1,
                        created_at: '2026-04-14 15:26:44',
                    }],
                },
                notificationCount: 1,
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        // Should not throw — still shows the entry
        expect(text).toContain('unknown');
    });
});
