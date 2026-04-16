import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGenerateBillOfLading } from '../../../src/tools/carriers-advanced/generate-bill-of-lading.js';

// =============================================================================
// Factories
// =============================================================================

function makeBolResponse() {
    return {
        meta: 'billoflading',
        data: {
            carrier: 'paquetexpress',
            trackingNumber: '141168417447',
            billOfLading: 'https://s3.us-east-2.amazonaws.com/paquetexpress_bill_of_lading/141168417447.pdf',
        },
    };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    carrier: 'paquetexpress',
    tracking_number: '141168417447',
    origin_name: 'ARBOT',
    origin_street: 'Vasco Nunez 11',
    origin_number: '11',
    origin_city: 'Monterrey',
    origin_state: 'NL',
    origin_country: 'MX',
    origin_postal_code: '64000',
    destination_name: 'Erick Almeida',
    destination_street: 'Av Centenario',
    destination_number: '1',
    destination_city: 'Azcapotzalco',
    destination_state: 'CX',
    destination_country: 'MX',
    destination_postal_code: '02070',
    package_amount: 1,
    package_cost: 200,
    package_declared_value: 200,
    package_currency: 'MXN',
    package_weight: 2,
    package_cubic_meters: 0.001,
    items: [{ description: 'Producto', quantity: 1, price: 200 }],
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_generate_bill_of_lading', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeBolResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGenerateBillOfLading(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_generate_bill_of_lading')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return success message with PDF URL
    // -------------------------------------------------------------------------
    it('should return success message with PDF URL', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Bill of lading generated successfully.');
        expect(text).toContain('paquetexpress');
        expect(text).toContain('141168417447');
        expect(text).toContain('bill_of_lading');
    });

    // -------------------------------------------------------------------------
    // 2. should POST to the correct BOL URL
    // -------------------------------------------------------------------------
    it('should POST to the correct BOL URL', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/billoflading`);
        expect(opts.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // 3. should include declaredValue in package body
    // -------------------------------------------------------------------------
    it('should include declaredValue in package body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.packages).toHaveLength(1);
        expect(body.packages[0]).toHaveProperty('declaredValue', BASE_ARGS.package_declared_value);
    });

    // -------------------------------------------------------------------------
    // 4. should structure origin and destination correctly
    // -------------------------------------------------------------------------
    it('should structure origin and destination correctly', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.origin.name).toBe(BASE_ARGS.origin_name);
        expect(body.origin.postalCode).toBe(BASE_ARGS.origin_postal_code);
        expect(body.destination.name).toBe(BASE_ARGS.destination_name);
        expect(body.destination.country).toBe(BASE_ARGS.destination_country);
    });

    // -------------------------------------------------------------------------
    // 5. should include shipment carrier and tracking number in body
    // -------------------------------------------------------------------------
    it('should include shipment carrier and tracking number in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.shipment.carrier).toBe(BASE_ARGS.carrier);
        expect(body.shipment.trackingNumber).toBe(BASE_ARGS.tracking_number);
    });

    // -------------------------------------------------------------------------
    // 6. should include items in package body
    // -------------------------------------------------------------------------
    it('should include items in package body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.packages[0].items).toHaveLength(1);
        expect(body.packages[0].items[0].description).toBe('Producto');
    });

    // -------------------------------------------------------------------------
    // 7. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ message: 'Missing value' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Bill of lading generation failed:');
    });

    // -------------------------------------------------------------------------
    // 8. should use provided api_key as bearer token
    // -------------------------------------------------------------------------
    it('should use provided api_key as bearer token', async () => {
        await handler({ ...BASE_ARGS, api_key: 'bol-custom-key' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer bol-custom-key');
    });

    // -------------------------------------------------------------------------
    // 9. should handle null data in response
    // -------------------------------------------------------------------------
    it('should handle null data in response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'billoflading' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('no data');
    });

    // -------------------------------------------------------------------------
    // 10. should include package weight in body
    // -------------------------------------------------------------------------
    it('should include package weight in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.packages[0].totalWeight).toBe(BASE_ARGS.package_weight);
        expect(body.packages[0].cubicMeters).toBe(BASE_ARGS.package_cubic_meters);
    });
});
