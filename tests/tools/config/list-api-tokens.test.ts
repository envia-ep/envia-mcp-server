import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListApiTokens } from '../../../src/tools/config/list-api-tokens.js';

function makeToken(overrides: Record<string, unknown> = {}) {
    return {
        user_name: 'Jose Vidrio',
        user_email: 'jose@envia.com',
        access_token: 'ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3',
        description: null,
        ecommerce: 0,
        ...overrides,
    };
}

describe('envia_list_api_tokens', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeToken()] }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerListApiTokens(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_list_api_tokens')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return user name in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Jose Vidrio');
    });

    it('should truncate access_token — show only first 8 chars', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('ea7aa228...');
        expect(result.content[0].text).not.toContain('ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3');
    });

    it('should show Standard for ecommerce=0', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Standard');
    });

    it('should show Ecommerce for ecommerce=1', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeToken({ ecommerce: 1 })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Ecommerce');
    });

    it('should include security note in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('truncated for security');
    });

    it('should return "No API tokens found" when empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No API tokens found.');
    });

    it('should pass limit param when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 5 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limit=5');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Failed to list API tokens:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should call /get-api-tokens endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('get-api-tokens');
    });
});
