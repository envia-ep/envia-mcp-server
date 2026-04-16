import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerTrackPickup } from '../../../src/tools/carriers-advanced/track-pickup.js';

// NOTE: Sandbox returns deep PHP null reference errors for pickuptrack because
// there are no real pickup confirmations. Tests mock fetch completely.

// =============================================================================
// Factories
// =============================================================================

function makePickupTrackResponse() {
    return {
        meta: 'pickuptrack',
        data: {
            carrier: 'dhl',
            confirmation: 'CONF12345',
            status: 'Scheduled',
            date: '2026-04-20',
        },
    };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    carrier: 'dhl',
    confirmations: ['CONF12345'],
    locale: 1,
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_track_pickup', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makePickupTrackResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerTrackPickup(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_track_pickup')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return pickup tracking result on success
    // -------------------------------------------------------------------------
    it('should return pickup tracking result on success', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Pickup tracking result:');
        expect(text).toContain('dhl');
        expect(text).toContain('CONF12345');
    });

    // -------------------------------------------------------------------------
    // 2. should POST to /ship/pickuptrack (not /ship/pickup)
    // -------------------------------------------------------------------------
    it('should POST to /ship/pickuptrack (not /ship/pickup)', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/pickuptrack`);
        expect(url).not.toBe(`${MOCK_CONFIG.shippingBase}/ship/pickup`);
        expect(opts.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // 3. should send confirmation as ARRAY in body (not string)
    // -------------------------------------------------------------------------
    it('should send confirmation as ARRAY in body (not string)', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(Array.isArray(body.confirmation)).toBe(true);
        expect(body.confirmation).toContain('CONF12345');
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
        await handler({ ...BASE_ARGS, carrier: 'DHL' });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.carrier).toBe('dhl');
    });

    // -------------------------------------------------------------------------
    // 6. should send multiple confirmations as array
    // -------------------------------------------------------------------------
    it('should send multiple confirmations as array', async () => {
        const multiArgs = { ...BASE_ARGS, confirmations: ['CONF001', 'CONF002', 'CONF003'] };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'pickuptrack', data: { status: 'ok' } }),
        });

        await handler(multiArgs);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.confirmation).toHaveLength(3);
        expect(body.confirmation).toContain('CONF002');
    });

    // -------------------------------------------------------------------------
    // 7. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Pickup not found' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Pickup tracking failed:');
    });

    // -------------------------------------------------------------------------
    // 8. should return error with suggestion on 401
    // -------------------------------------------------------------------------
    it('should return error with suggestion on 401', async () => {
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
    // 9. should use provided api_key as bearer token
    // -------------------------------------------------------------------------
    it('should use provided api_key as bearer token', async () => {
        await handler({ ...BASE_ARGS, api_key: 'track-pickup-token' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer track-pickup-token');
    });

    // -------------------------------------------------------------------------
    // 10. should handle null data in response
    // -------------------------------------------------------------------------
    it('should handle null data in response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'pickuptrack' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('no data was returned');
    });
});
