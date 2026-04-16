import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCreateWebhook } from '../../../src/tools/config/create-webhook.js';

const VALID_ARGS = { api_key: MOCK_CONFIG.apiKey, url: 'https://myapp.com/envia-webhook' };

describe('envia_create_webhook', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 400 }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerCreateWebhook(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_create_webhook')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return success message on 200', async () => {
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('created successfully');
    });

    it('should include URL in success message', async () => {
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('myapp.com/envia-webhook');
    });

    it('should POST to /webhooks endpoint', async () => {
        await handler(VALID_ARGS);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/webhooks');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.method).toBe('POST');
    });

    it('should send ONLY url in request body — no type or auth_token', async () => {
        await handler(VALID_ARGS);
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.url).toBe('https://myapp.com/envia-webhook');
        expect(body.type).toBeUndefined();
        expect(body.auth_token).toBeUndefined();
        expect(body.active).toBeUndefined();
    });

    it('should return friendly message on 422 (sandbox limitation)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 422,
            json: () => Promise.resolve({ message: 'Invalid data.' }),
        });
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('sandbox limitation');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('Failed to create webhook:');
    });

    it('should mention envia_list_webhooks in success message', async () => {
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('envia_list_webhooks');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ ...VALID_ARGS, api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should return error on 400 bad request', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 400,
            json: () => Promise.resolve({ message: 'Bad Request' }),
        });
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('Failed to create webhook:');
    });

    it('should return error on 403 forbidden', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 403,
            json: () => Promise.resolve({ message: 'Forbidden' }),
        });
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('Failed to create webhook:');
    });
});
