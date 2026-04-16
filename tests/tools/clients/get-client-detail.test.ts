import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetClientDetail } from '../../../src/tools/clients/get-client-detail.js';

describe('envia_get_client_detail', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    const mockClientDetail = {
        data: {
            id: 18,
            client_type: 'business',
            name: 'API Test Client',
            company_name: 'Test Corp',
            rfc: 'XAXX010101000',
            external_ref: 'EXT-001',
            notes: 'VIP client',
            created_at: '2026-03-30 18:08:52',
            contact: {
                contact_id: 31,
                full_name: 'Juan Perez',
                role: 'Manager',
                email: 'juan@test.com',
                phone_code: 'MX',
                phone: '5512345678',
                landline: '5598765432',
                preferred_channel: 'email',
            },
            billing_address: {
                street: 'Av. Reforma',
                number: '222',
                city: 'CDMX',
                state: 'CX',
                country: 'MX',
                postal_code: '06600',
            },
            shipping_address: {
                street: 'Calle 5',
                number: '100',
                city: 'Monterrey',
                state: 'NL',
                country: 'MX',
                postal_code: '64000',
            },
            use_billing_as_shipping: false,
        },
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockClientDetail),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetClientDetail(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_client_detail')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return formatted client detail', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, client_id: 18 });
        const text = result.content[0].text;

        expect(text).toContain('Client #18');
        expect(text).toContain('API Test Client');
        expect(text).toContain('business');
        expect(text).toContain('Test Corp');
        expect(text).toContain('XAXX010101000');
    });

    it('should show contact details', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, client_id: 18 });
        const text = result.content[0].text;

        expect(text).toContain('Juan Perez');
        expect(text).toContain('Manager');
        expect(text).toContain('juan@test.com');
        expect(text).toContain('5512345678');
        expect(text).toContain('email');
    });

    it('should show both addresses', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, client_id: 18 });
        const text = result.content[0].text;

        expect(text).toContain('Billing address');
        expect(text).toContain('Shipping address');
        expect(text).toContain('Av. Reforma');
        expect(text).toContain('Monterrey');
    });

    it('should show same as billing when use_billing_as_shipping is true', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: { ...mockClientDetail.data, use_billing_as_shipping: true },
            }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, client_id: 18 });

        expect(result.content[0].text).toContain('same as billing');
    });

    it('should handle not found', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ message: 'Not Found' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, client_id: 999 });

        expect(result.content[0].text).toContain('Failed to get client 999');
    });
});
