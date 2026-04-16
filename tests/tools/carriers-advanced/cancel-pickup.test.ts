import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCancelPickup } from '../../../src/tools/carriers-advanced/cancel-pickup.js';

// =============================================================================
// Factories
// =============================================================================

function makeCancelResponse() {
    return {
        meta: 'pickupcancel',
        data: { carrier: 'fedex', confirmation: 'CONF12345' },
    };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    carrier: 'fedex',
    confirmation: 'CONF12345',
    locale: 1,
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_cancel_pickup', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeCancelResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCancelPickup(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_cancel_pickup')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return success message with carrier and confirmation
    // -------------------------------------------------------------------------
    it('should return success message with carrier and confirmation', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Pickup cancelled successfully.');
        expect(text).toContain('fedex');
        expect(text).toContain('CONF12345');
    });

    // -------------------------------------------------------------------------
    // 2. should POST to /ship/pickupcancel (not /ship/pickup)
    // -------------------------------------------------------------------------
    it('should POST to /ship/pickupcancel (not /ship/pickup)', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/pickupcancel`);
        expect(url).not.toBe(`${MOCK_CONFIG.shippingBase}/ship/pickup`);
        expect(opts.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // 3. should send confirmation as string (not array) in body
    // -------------------------------------------------------------------------
    it('should send confirmation as string (not array) in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(typeof body.confirmation).toBe('string');
        expect(Array.isArray(body.confirmation)).toBe(false);
        expect(body.confirmation).toBe('CONF12345');
    });

    // -------------------------------------------------------------------------
    // 4. should send locale as integer in body
    // -------------------------------------------------------------------------
    it('should send locale as integer in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(typeof body.locale).toBe('number');
        expect(body.locale).toBe(1);
    });

    // -------------------------------------------------------------------------
    // 5. should lowercase carrier in body
    // -------------------------------------------------------------------------
    it('should lowercase carrier in body', async () => {
        await handler({ ...BASE_ARGS, carrier: 'FedEx' });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.carrier).toBe('fedex');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Pickup not found' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Pickup cancellation failed:');
    });

    // -------------------------------------------------------------------------
    // 7. should return error message with suggestion when API returns 401
    // -------------------------------------------------------------------------
    it('should return error message with suggestion when API returns 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Suggestion:');
    });

    // -------------------------------------------------------------------------
    // 8. should use provided api_key as bearer token
    // -------------------------------------------------------------------------
    it('should use provided api_key as bearer token', async () => {
        await handler({ ...BASE_ARGS, api_key: 'cancel-token-abc' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer cancel-token-abc');
    });

    // -------------------------------------------------------------------------
    // 9. should use locale 1 (default) when locale is explicitly set to 1
    // -------------------------------------------------------------------------
    it('should use locale 1 (default) when locale is explicitly set to 1', async () => {
        await handler({ ...BASE_ARGS, locale: 1 });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.locale).toBe(1);
    });

    // -------------------------------------------------------------------------
    // 10. should handle success response without data object
    // -------------------------------------------------------------------------
    it('should handle success response without data object', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'pickupcancel' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Pickup cancelled successfully.');
    });
});
