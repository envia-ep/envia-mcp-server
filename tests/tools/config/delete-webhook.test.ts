import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerDeleteWebhook } from '../../../src/tools/config/delete-webhook.js';

describe('envia_delete_webhook', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: true }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerDeleteWebhook(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_delete_webhook')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return success message with webhook ID', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 294 });
        expect(result.content[0].text).toContain('#294 deleted successfully');
    });

    it('should DELETE to /webhooks/{id}', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 294 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('webhooks/294');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.method).toBe('DELETE');
    });

    it('should embed correct ID in URL path', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 999 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('webhooks/999');
    });

    it('should not send a request body on DELETE', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 294 });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.body).toBeUndefined();
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 294 });
        expect(result.content[0].text).toContain('Failed to delete webhook #294:');
    });

    it('should return error on 404', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 404,
            json: () => Promise.resolve({ message: 'Not Found' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 9999 });
        expect(result.content[0].text).toContain('Failed to delete webhook #9999:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key', id: 294 });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });
});
