import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListWebhooks } from '../../../src/tools/config/list-webhooks.js';

function makeWebhook(overrides: Record<string, unknown> = {}) {
    return {
        id: 372,
        type: 'onShipmentStatusUpdate',
        url: 'https://example.com/webhook',
        auth_token: '3d8ad90c215bfcfe650a5e374c812f150fa794e34d7627ff81ebc8383909b6a2',
        active: 1,
        ...overrides,
    };
}

describe('envia_list_webhooks', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeWebhook()] }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerListWebhooks(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_list_webhooks')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return webhook ID in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('#372');
    });

    it('should show webhook URL', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('example.com/webhook');
    });

    it('should truncate auth_token — show only first 8 chars', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('3d8ad90c...');
        expect(result.content[0].text).not.toContain('3d8ad90c215bfcfe650a5e374c812f150fa794e34d7627ff81ebc8383909b6a2');
    });

    it('should show Active for active=1', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Active');
    });

    it('should show Inactive for active=0', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeWebhook({ active: 0 })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Inactive');
    });

    it('should return "No webhooks found" when empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No webhooks found.');
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
        expect(result.content[0].text).toContain('Failed to list webhooks:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should include security note about truncated tokens', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('truncated for security');
    });
});
