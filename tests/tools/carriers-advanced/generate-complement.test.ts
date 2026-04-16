import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGenerateComplement } from '../../../src/tools/carriers-advanced/generate-complement.js';

// =============================================================================
// Factories
// =============================================================================

function makeComplementResponse() {
    return { meta: 'complement', data: { success: true } };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    shipments: [
        {
            shipment_id: 166810,
            items: [
                {
                    product_description: 'Camisa de algodón',
                    product_code: '10191510',
                    weight_unit: 'XBX',
                    packaging_type: '1A',
                    quantity: 1,
                    unit_price: 200,
                },
            ],
        },
    ],
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_generate_complement', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeComplementResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGenerateComplement(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_generate_complement')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return success message with shipment and item counts
    // -------------------------------------------------------------------------
    it('should return success message with shipment and item counts', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('SAT Carta Porte complement submitted successfully.');
        expect(text).toContain('1');  // 1 shipment
    });

    // -------------------------------------------------------------------------
    // 2. should POST to /ship/complement
    // -------------------------------------------------------------------------
    it('should POST to /ship/complement', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/complement`);
        expect(opts.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // 3. should send complement as top-level ARRAY in request body
    // -------------------------------------------------------------------------
    it('should send complement as top-level ARRAY in request body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(1);
    });

    // -------------------------------------------------------------------------
    // 4. should map shipment_id to shipmentId in body
    // -------------------------------------------------------------------------
    it('should map shipment_id to shipmentId in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body[0]).toHaveProperty('shipmentId', 166810);
        expect(body[0]).not.toHaveProperty('shipment_id');
    });

    // -------------------------------------------------------------------------
    // 5. should map items to bolComplement in body
    // -------------------------------------------------------------------------
    it('should map items to bolComplement in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body[0]).toHaveProperty('bolComplement');
        expect(Array.isArray(body[0].bolComplement)).toBe(true);
        expect(body[0].bolComplement).toHaveLength(1);
    });

    // -------------------------------------------------------------------------
    // 6. should map snake_case fields to camelCase in bolComplement items
    // -------------------------------------------------------------------------
    it('should map snake_case fields to camelCase in bolComplement items', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        const item = body[0].bolComplement[0];

        expect(item).toHaveProperty('productDescription', 'Camisa de algodón');
        expect(item).toHaveProperty('productCode', '10191510');
        expect(item).toHaveProperty('weightUnit', 'XBX');
        expect(item).toHaveProperty('packagingType', '1A');
        expect(item).toHaveProperty('quantity', 1);
        expect(item).toHaveProperty('unitPrice', 200);
    });

    // -------------------------------------------------------------------------
    // 7. should set missing optional fields to null
    // -------------------------------------------------------------------------
    it('should set missing optional fields to null', async () => {
        const minimalArgs = {
            api_key: MOCK_CONFIG.apiKey,
            shipments: [
                {
                    shipment_id: 999,
                    items: [{ quantity: 1, unit_price: 100 }],
                },
            ],
        };

        await handler(minimalArgs);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        const item = body[0].bolComplement[0];

        expect(item.productDescription).toBeNull();
        expect(item.productCode).toBeNull();
        expect(item.weightUnit).toBeNull();
        expect(item.packagingType).toBeNull();
    });

    // -------------------------------------------------------------------------
    // 8. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: "Carrier doesn't have complement action" }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Complement generation failed:');
    });

    // -------------------------------------------------------------------------
    // 9. should use provided api_key as bearer token
    // -------------------------------------------------------------------------
    it('should use provided api_key as bearer token', async () => {
        await handler({ ...BASE_ARGS, api_key: 'complement-custom-key' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer complement-custom-key');
    });

    // -------------------------------------------------------------------------
    // 10. should handle multiple shipments in the array
    // -------------------------------------------------------------------------
    it('should handle multiple shipments in the array', async () => {
        const multiArgs = {
            api_key: MOCK_CONFIG.apiKey,
            shipments: [
                {
                    shipment_id: 100,
                    items: [{ product_description: 'Item A', quantity: 2, unit_price: 50 }],
                },
                {
                    shipment_id: 200,
                    items: [
                        { product_description: 'Item B', quantity: 1, unit_price: 100 },
                        { product_description: 'Item C', quantity: 3, unit_price: 30 },
                    ],
                },
            ],
        };

        await handler(multiArgs);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(2);
        expect(body[0].shipmentId).toBe(100);
        expect(body[1].shipmentId).toBe(200);
        expect(body[1].bolComplement).toHaveLength(2);
    });
});
