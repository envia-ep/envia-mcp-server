import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetDceStatus } from '../../../src/tools/products/get-dce-status.js';

// =============================================================================
// Factories
// =============================================================================

function makeDceStatusResponse(overrides: Record<string, unknown> = {}) {
    return {
        cStat: '100',
        xMotivo: 'Autorizado o uso do DCe',
        ...overrides,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_dce_status', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeDceStatusResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetDceStatus(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_dce_status')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should call GET /dce/status
    // -------------------------------------------------------------------------
    it('should call GET /dce/status', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/dce/status');
        expect(opts.method).toBe('GET');
    });

    // -------------------------------------------------------------------------
    // 2. should display cStat code in output
    // -------------------------------------------------------------------------
    it('should display cStat code in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('100');
    });

    // -------------------------------------------------------------------------
    // 3. should display xMotivo message in output
    // -------------------------------------------------------------------------
    it('should display xMotivo message in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Autorizado o uso do DCe');
    });

    // -------------------------------------------------------------------------
    // 4. should show DCe header in output
    // -------------------------------------------------------------------------
    it('should show DCe header in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('DCe Authorization Status');
    });

    // -------------------------------------------------------------------------
    // 5. should document sandbox note when cStat is 999
    // -------------------------------------------------------------------------
    it('should document sandbox note when cStat is 999', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeDceStatusResponse({ cStat: '999', xMotivo: 'Serviço em Manutenção' })),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('999');
        expect(text).toContain('sandbox');
    });

    // -------------------------------------------------------------------------
    // 6. should NOT show sandbox note for non-999 cStat
    // -------------------------------------------------------------------------
    it('should NOT show sandbox note for non-999 cStat', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        // cStat is 100, not 999 — no sandbox note
        expect(text).not.toContain('sandbox');
    });

    // -------------------------------------------------------------------------
    // 7. should return error message on API failure
    // -------------------------------------------------------------------------
    it('should return error message on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get DCe status:');
    });

    // -------------------------------------------------------------------------
    // 8. should return error message on 500 server error
    // The API client retries on 5xx — mock all attempts with the error response
    // -------------------------------------------------------------------------
    it('should return error message on 500 server error', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal Server Error' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get DCe status:');
    });

    // -------------------------------------------------------------------------
    // 9. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'dce-key-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer dce-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 10. should make exactly one API call
    // -------------------------------------------------------------------------
    it('should make exactly one API call', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
    });
});
