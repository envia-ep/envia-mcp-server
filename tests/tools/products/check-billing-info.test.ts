import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCheckBillingInfo } from '../../../src/tools/products/check-billing-info.js';

// =============================================================================
// Suite
// =============================================================================

describe('envia_check_billing_info', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ hasBillingInfo: true }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCheckBillingInfo(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_check_billing_info')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should call GET /billing-information/check
    // -------------------------------------------------------------------------
    it('should call GET /billing-information/check', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/billing-information/check');
        expect(opts.method).toBe('GET');
    });

    // -------------------------------------------------------------------------
    // 2. should confirm billing info is configured when hasBillingInfo is true
    // -------------------------------------------------------------------------
    it('should confirm billing info is configured when hasBillingInfo is true', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Billing information is configured');
    });

    // -------------------------------------------------------------------------
    // 3. should indicate no billing info when hasBillingInfo is false
    // -------------------------------------------------------------------------
    it('should indicate no billing info when hasBillingInfo is false', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ hasBillingInfo: false }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('No billing information has been configured');
    });

    // -------------------------------------------------------------------------
    // 4. should suggest envia_get_billing_info when info is missing
    // -------------------------------------------------------------------------
    it('should suggest envia_get_billing_info when info is missing', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ hasBillingInfo: false }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('envia_get_billing_info');
    });

    // -------------------------------------------------------------------------
    // 5. should return error message on API failure
    // -------------------------------------------------------------------------
    it('should return error message on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to check billing information:');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message on 400 bad request
    // -------------------------------------------------------------------------
    it('should return error message on 400 bad request', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Bad Request' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to check billing information:');
    });

    // -------------------------------------------------------------------------
    // 7. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'check-key-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer check-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 8. should make exactly one API call
    // -------------------------------------------------------------------------
    it('should make exactly one API call', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
    });
});
