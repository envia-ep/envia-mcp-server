import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCreateCheckoutRule } from '../../../src/tools/config/create-checkout-rule.js';

const VALID_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    shop_id: 34022,
    type: 'Money' as const,
    measurement: 'MXN',
    min: 500,
    amount: 50,
    amount_type: 'DISCOUNT',
    active: 1,
    operation_id: 1,
};

describe('envia_create_checkout_rule', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 99 }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerCreateCheckoutRule(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_create_checkout_rule')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return success message on 200', async () => {
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('created successfully');
    });

    it('should include shop_id and amount in success message', async () => {
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('34022');
        expect(result.content[0].text).toContain('50');
    });

    it('should return friendly message on 422 (sandbox limitation)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 422,
            json: () => Promise.resolve({ message: 'Invalid data.' }),
        });
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('checkout-enabled shop');
        expect(result.content[0].text).toContain('sandbox limitation');
    });

    it('should POST to /checkout-rules endpoint', async () => {
        await handler(VALID_ARGS);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('checkout-rules');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.method).toBe('POST');
    });

    it('should send shop_id in request body', async () => {
        await handler(VALID_ARGS);
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.shop_id).toBe(34022);
    });

    it('should send type and amount in request body', async () => {
        await handler(VALID_ARGS);
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.type).toBe('Money');
        expect(body.amount).toBe(50);
    });

    it('should include min when provided', async () => {
        await handler({ ...VALID_ARGS, min: 300 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.min).toBe(300);
    });

    it('should not include min when not provided', async () => {
        const { min: _, ...argsWithoutMin } = VALID_ARGS;
        await handler(argsWithoutMin);
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.min).toBeUndefined();
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler(VALID_ARGS);
        expect(result.content[0].text).toContain('Failed to create checkout rule:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ ...VALID_ARGS, api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });
});
