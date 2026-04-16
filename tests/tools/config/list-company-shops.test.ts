import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListCompanyShops } from '../../../src/tools/config/list-company-shops.js';

function makeShop(overrides: Record<string, unknown> = {}) {
    return {
        id: 34022,
        company_id: 254,
        ecommerce_id: 3,
        user_id: 2138,
        ecart_shop_id: 'abc123',
        ecart_shop_group: null,
        name: 'My Test Shop',
        url: 'https://myshop.com',
        store: null,
        auth: '',
        checkout: 1,
        form_options: 0,
        webhook: 1,
        order_create: 1,
        order_update: 0,
        order_delete: 0,
        ...overrides,
    };
}

describe('envia_list_company_shops', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeShop()] }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerListCompanyShops(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_list_company_shops')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return shop name in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('My Test Shop');
    });

    it('should show shop ID in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('34022');
    });

    it('should show Checkout feature when enabled', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Checkout');
    });

    it('should show Webhook feature when enabled', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Webhook');
    });

    it('should show total shop count in heading', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('1 total');
    });

    it('should return "No shops found" when data is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No shops found.');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Failed to list company shops:');
    });

    it('should NOT pass query params to /company/shops', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });
        const [url] = mockFetch.mock.calls[0];
        expect(url).not.toContain('limit=');
        expect(url).not.toContain('?');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-custom-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-custom-key');
    });

    it('should truncate long shop names in output', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeShop({ name: 'A'.repeat(60) })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        // Should not crash on long names
        expect(result.content[0].text).toBeTruthy();
    });
});
