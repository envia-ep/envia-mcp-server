import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGenerateManifest } from '../../../src/tools/carriers-advanced/generate-manifest.js';

// =============================================================================
// Factories
// =============================================================================

function makeManifestResponse(overrides: Record<string, unknown> = {}) {
    return {
        meta: 'manifest',
        data: {
            company: 'Fedma CO',
            carriers: {
                estafeta: 'https://s3.us-east-2.amazonaws.com/manifests/estafeta/abc.pdf',
                dhl: 'https://s3.us-east-2.amazonaws.com/manifests/dhl/abc.pdf',
            },
            ...overrides,
        },
    };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    tracking_numbers: ['3200000000112T00021436', '3200000000112T00021437'],
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_generate_manifest', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeManifestResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGenerateManifest(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_generate_manifest')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return success message with PDF URLs when API responds
    // -------------------------------------------------------------------------
    it('should return success message with PDF URLs when API responds', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Manifest generated successfully.');
        expect(text).toContain('Fedma CO');
        expect(text).toContain('estafeta');
        expect(text).toContain('dhl');
        expect(text).toContain('manifests/estafeta');
    });

    // -------------------------------------------------------------------------
    // 2. should POST to the correct manifest URL
    // -------------------------------------------------------------------------
    it('should POST to the correct manifest URL', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/manifest`);
        expect(opts.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // 3. should send only trackingNumbers in body (no carrier field)
    // -------------------------------------------------------------------------
    it('should send only trackingNumbers in body — no carrier field', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body).toHaveProperty('trackingNumbers');
        expect(Array.isArray(body.trackingNumbers)).toBe(true);
        expect(body.trackingNumbers).toEqual(BASE_ARGS.tracking_numbers);
        expect(body).not.toHaveProperty('carrier');
    });

    // -------------------------------------------------------------------------
    // 4. should include tracking count in output
    // -------------------------------------------------------------------------
    it('should include tracking count in output', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain(`${BASE_ARGS.tracking_numbers.length}`);
    });

    // -------------------------------------------------------------------------
    // 5. should return error message when API call fails
    // -------------------------------------------------------------------------
    it('should return error message when API call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Bad request' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Manifest generation failed:');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message when API returns 401
    // -------------------------------------------------------------------------
    it('should return error message when API returns 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Manifest generation failed:');
        expect(text).toContain('Suggestion:');
    });

    // -------------------------------------------------------------------------
    // 7. should use provided api_key as bearer token
    // -------------------------------------------------------------------------
    it('should use provided api_key as bearer token', async () => {
        await handler({ ...BASE_ARGS, api_key: 'custom-token-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-token-xyz');
    });

    // -------------------------------------------------------------------------
    // 8. should handle response with no carriers gracefully
    // -------------------------------------------------------------------------
    it('should handle response with no carriers gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'manifest', data: { company: 'Test Co', carriers: {} } }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Manifest generated successfully.');
        expect(text).toContain('Test Co');
        expect(text).toContain('no carriers');
    });

    // -------------------------------------------------------------------------
    // 9. should handle null data in response
    // -------------------------------------------------------------------------
    it('should handle null data in response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'manifest' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('no data');
    });

    // -------------------------------------------------------------------------
    // 10. should work with a single tracking number
    // -------------------------------------------------------------------------
    it('should work with a single tracking number', async () => {
        const result = await handler({ ...BASE_ARGS, tracking_numbers: ['SINGLE123'] });
        const text = result.content[0].text;

        expect(text).toContain('Manifest generated successfully.');
    });
});
