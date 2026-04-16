import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerLocateCity } from '../../../src/tools/carriers-advanced/locate-city.js';

// =============================================================================
// Factories
// =============================================================================

function makeLocateResponse() {
    return { city: '11001000', name: 'BOGOTA', state: 'DC' };
}

function makeLocateError() {
    return {
        meta: 'error',
        error: {
            code: 1149,
            description: 'Invalid Option',
            message: 'Address cannot be validated.',
        },
    };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    city: 'Bogota',
    state: 'DC',
    country: 'CO',
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_locate_city', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeLocateResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerLocateCity(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_locate_city')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return DANE code and city name on success
    // -------------------------------------------------------------------------
    it('should return DANE code and city name on success', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('11001000');
        expect(text).toContain('BOGOTA');
        expect(text).toContain('DC');
    });

    // -------------------------------------------------------------------------
    // 2. should POST to the correct locate URL without Authorization header
    // -------------------------------------------------------------------------
    it('should POST to the correct locate URL without Authorization header', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/locate`);
        expect(opts.method).toBe('POST');
        expect(opts.headers['Authorization']).toBeUndefined();
        expect(opts.headers['Content-Type']).toBe('application/json');
    });

    // -------------------------------------------------------------------------
    // 3. should send trimmed and uppercased country in body
    // -------------------------------------------------------------------------
    it('should send trimmed and uppercased country in body', async () => {
        await handler({ ...BASE_ARGS, country: 'co' });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.country).toBe('CO');
    });

    // -------------------------------------------------------------------------
    // 4. should trim city and state values in body
    // -------------------------------------------------------------------------
    it('should trim city and state values in body', async () => {
        await handler({ ...BASE_ARGS, city: '  Bogota  ', state: '  DC  ' });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.city).toBe('Bogota');
        expect(body.state).toBe('DC');
    });

    // -------------------------------------------------------------------------
    // 5. should return error message when API returns error envelope
    // -------------------------------------------------------------------------
    it('should return error message when API returns error envelope', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeLocateError()),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('City not found:');
        expect(text).toContain('Address cannot be validated.');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message when HTTP response is not ok
    // -------------------------------------------------------------------------
    it('should return error message when HTTP response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('City lookup failed: HTTP 500');
    });

    // -------------------------------------------------------------------------
    // 7. should mention DANE code usage in success response
    // -------------------------------------------------------------------------
    it('should mention DANE code usage in success response', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('DANE code');
    });

    // -------------------------------------------------------------------------
    // 8. should mention Colombia-only limitation in error response
    // -------------------------------------------------------------------------
    it('should mention Colombia-only limitation in error response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeLocateError()),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('CO');
    });

    // -------------------------------------------------------------------------
    // 9. should send CO as country when country is explicitly set to CO
    // -------------------------------------------------------------------------
    it('should send CO as country when country is explicitly set to CO', async () => {
        await handler({ ...BASE_ARGS, country: 'CO' });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.country).toBe('CO');
    });

    // -------------------------------------------------------------------------
    // 10. should mention using DANE code for Colombia shipments
    // -------------------------------------------------------------------------
    it('should mention using DANE code for Colombia shipments', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('postal_code');
    });
});
