import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListCheckoutRules } from '../../../src/tools/config/list-checkout-rules.js';

function makeRule(overrides: Record<string, unknown> = {}) {
    return {
        id: 5, shop_id: 2027, name: null, description: null,
        international: 0, type: 'Money', measurement: 'MXN',
        selected_country_code: null, selected_state_code: null, selected_city_code: null,
        min: 2000, max: null, amount: 150, amount_type: 'DISCOUNT', active: 1,
        created_at: '2020-06-26', created_by: 'Envia', operation_id: 1, operation_description: 'Flat Value',
        ...overrides,
    };
}

describe('envia_list_checkout_rules', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeRule()] }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerListCheckoutRules(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_list_checkout_rules')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return rule ID in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('#5');
    });

    it('should show rule type (Money)', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Money');
    });

    it('should show DISCOUNT amount', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('DISCOUNT');
        expect(result.content[0].text).toContain('150');
    });

    it('should show Active status', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Active');
    });

    it('should show Inactive for active=0', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeRule({ active: 0 })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Inactive');
    });

    it('should return "No checkout rules found" when empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No checkout rules found.');
    });

    it('should pass limit and page when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 10, page: 2 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limit=10');
        expect(url).toContain('page=2');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Failed to list checkout rules:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should call /checkout-rules endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('checkout-rules');
    });
});
