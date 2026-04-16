import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerUpdateCheckoutRule } from '../../../src/tools/config/update-checkout-rule.js';

describe('envia_update_checkout_rule', () => {
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
        registerUpdateCheckoutRule(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_update_checkout_rule')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return success message with rule ID', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, active: 0 });
        expect(result.content[0].text).toContain('#5 updated successfully');
    });

    it('should PUT to /checkout-rules/{id}', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, active: 0 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('checkout-rules/5');
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.method).toBe('PUT');
    });

    it('should only include provided fields in body', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, active: 0 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.active).toBe(0);
        expect(body.type).toBeUndefined();
        expect(body.amount).toBeUndefined();
    });

    it('should include amount when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, amount: 200 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.amount).toBe(200);
    });

    it('should include type and measurement when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, type: 'Weight', measurement: 'KG' });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.type).toBe('Weight');
        expect(body.measurement).toBe('KG');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, active: 0 });
        expect(result.content[0].text).toContain('Failed to update checkout rule #5:');
    });

    it('should return error on 404 (rule not found)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 404,
            json: () => Promise.resolve({ message: 'Not Found' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, id: 9999, active: 0 });
        expect(result.content[0].text).toContain('Failed to update checkout rule #9999:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key', id: 5, active: 1 });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should send empty body when no optional fields given', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(Object.keys(body)).toHaveLength(0);
    });

    it('should include operation_id when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, operation_id: 2 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.operation_id).toBe(2);
    });

    it('should include min and max when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, id: 5, min: 100, max: 500 });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body as string);
        expect(body.min).toBe(100);
        expect(body.max).toBe(500);
    });
});
