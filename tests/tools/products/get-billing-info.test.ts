import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetBillingInfo } from '../../../src/tools/products/get-billing-info.js';

// =============================================================================
// Factories
// =============================================================================

function makeBillingInfo(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        address_name: 'Empresa ABC S.A. de C.V.',
        street: 'Av. Insurgentes Sur',
        street_number: '1458',
        neighborhood: 'Del Valle',
        city: 'Mexico City',
        state: 'CDMX',
        postal_code: '03100',
        country: 'MX',
        rfc: 'EABC123456XYZ',
        email: 'facturacion@empresa.mx',
        phone: '+525555001234',
        billing_data: '{"some":"stringified","json":"data"}', // should never be parsed
        ...overrides,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_billing_info', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeBillingInfo()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetBillingInfo(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_billing_info')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should call GET /billing-information
    // -------------------------------------------------------------------------
    it('should call GET /billing-information', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/billing-information');
        expect(url).not.toContain('/billing-information/check');
        expect(opts.method).toBe('GET');
    });

    // -------------------------------------------------------------------------
    // 2. should display legal name in output
    // -------------------------------------------------------------------------
    it('should display legal name in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Empresa ABC S.A. de C.V.');
    });

    // -------------------------------------------------------------------------
    // 3. should display RFC/tax ID in output
    // -------------------------------------------------------------------------
    it('should display RFC/tax ID in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('EABC123456XYZ');
    });

    // -------------------------------------------------------------------------
    // 4. should display email in output
    // -------------------------------------------------------------------------
    it('should display email in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('facturacion@empresa.mx');
    });

    // -------------------------------------------------------------------------
    // 5. should display address fields in output
    // -------------------------------------------------------------------------
    it('should display address fields in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Av. Insurgentes Sur');
        expect(text).toContain('1458');
        expect(text).toContain('Mexico City');
        expect(text).toContain('CDMX');
        expect(text).toContain('03100');
    });

    // -------------------------------------------------------------------------
    // 6. should NOT expose the stringified billing_data field
    // -------------------------------------------------------------------------
    it('should NOT expose the stringified billing_data field', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        // The raw JSON string in billing_data must never appear verbatim
        expect(text).not.toContain('"some":"stringified"');
        expect(text).not.toContain('billing_data');
    });

    // -------------------------------------------------------------------------
    // 7. should display phone when present
    // -------------------------------------------------------------------------
    it('should display phone when present', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('+525555001234');
    });

    // -------------------------------------------------------------------------
    // 8. should omit phone line when phone is null
    // -------------------------------------------------------------------------
    it('should omit phone line when phone is null', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeBillingInfo({ phone: null })),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Empresa ABC S.A. de C.V.');
        expect(text).not.toContain('Phone:');
    });

    // -------------------------------------------------------------------------
    // 9. should show Billing Information header
    // -------------------------------------------------------------------------
    it('should show Billing Information header', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Billing Information');
    });

    // -------------------------------------------------------------------------
    // 10. should return error message on API failure
    // -------------------------------------------------------------------------
    it('should return error message on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get billing information:');
    });

    // -------------------------------------------------------------------------
    // 11. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'billing-key-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer billing-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 12. should handle missing optional address fields gracefully
    // -------------------------------------------------------------------------
    it('should handle missing optional address fields gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(
                    makeBillingInfo({
                        street_number: null,
                        neighborhood: null,
                        postal_code: null,
                    }),
                ),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        // Should still render without crashing
        expect(text).toContain('Billing Information');
        expect(text).toContain('Empresa ABC S.A. de C.V.');
    });
});
