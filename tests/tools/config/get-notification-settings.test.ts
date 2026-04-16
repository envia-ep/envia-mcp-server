import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetNotificationSettings } from '../../../src/tools/config/get-notification-settings.js';

function makeSettings(overrides: Record<string, unknown> = {}) {
    return { id: 203, sms: 0, flash: 0, email: 1, email_generate: 1, fulfillment: 1, whatsapp: 1, ecommerce_cod: 0, shipment_cod: 1, shipment_pod: 1, ...overrides };
}

describe('envia_get_notification_settings', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        // Response is a RAW ARRAY
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve([makeSettings()]),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerGetNotificationSettings(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_get_notification_settings')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should show Email section in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Email');
    });

    it('should show Enabled for email=1', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Enabled');
    });

    it('should show Disabled for sms=0', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        // SMS is 0 in makeSettings
        expect(result.content[0].text).toContain('Disabled');
    });

    it('should show WhatsApp section', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('WhatsApp');
    });

    it('should show COD/POD events section', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Shipment COD');
        expect(result.content[0].text).toContain('Shipment POD');
    });

    it('should handle raw array response correctly', async () => {
        // If response is NOT wrapped in { data: [] }, should still work
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve([makeSettings({ email: 0 })]),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Notification Settings');
    });

    it('should return "No notification settings found" when array is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve([]),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No notification settings found.');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Failed to get notification settings:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should call /config/notification endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('config/notification');
    });
});
