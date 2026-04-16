import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerDeleteCheckoutRule } from '../../../src/tools/config/delete-checkout-rule.js';

describe('envia_delete_checkout_rule', () => {
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
        registerDeleteCheckoutRule(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_delete_checkout_rule')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return success message with rule ID', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 5 });
        expect(result.content[0].text).toContain('#5 deleted successfully');
    });

    it('should DELETE to /checkout-rules/{id}', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('checkout-rules/5');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.method).toBe('DELETE');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 5 });
        expect(result.content[0].text).toContain('Failed to delete checkout rule #5:');
    });

    it('should return error on 404', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 404,
            json: () => Promise.resolve({ message: 'Not Found' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 9999 });
        expect(result.content[0].text).toContain('Failed to delete checkout rule #9999:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key', id: 5 });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should embed correct ID in URL path', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 42 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('checkout-rules/42');
    });

    it('should not send a request body on DELETE', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5 });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.body).toBeUndefined();
    });
});
