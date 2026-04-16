import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerUpdateWebhook } from '../../../src/tools/config/update-webhook.js';

describe('envia_update_webhook', () => {
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
        registerUpdateWebhook(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_update_webhook')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return success message with webhook ID', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 372, active: 0 });
        expect(result.content[0].text).toContain('#372 updated successfully');
    });

    it('should PUT to /webhooks/{id}', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 372, active: 0 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('webhooks/372');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.method).toBe('PUT');
    });

    it('should only send url and active — no type or auth_token', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 372, url: 'https://new.com/hook', active: 1 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.url).toBe('https://new.com/hook');
        expect(body.active).toBe(1);
        expect(body.type).toBeUndefined();
        expect(body.auth_token).toBeUndefined();
    });

    it('should send only active when url not provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 372, active: 0 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.active).toBe(0);
        expect(body.url).toBeUndefined();
    });

    it('should send empty body when no optional fields given', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 372 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(Object.keys(body)).toHaveLength(0);
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 372, active: 0 });
        expect(result.content[0].text).toContain('Failed to update webhook #372:');
    });

    it('should return error on 404', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 404,
            json: () => Promise.resolve({ message: 'Not Found' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 9999, active: 0 });
        expect(result.content[0].text).toContain('Failed to update webhook #9999:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key', id: 372, active: 1 });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });
});
