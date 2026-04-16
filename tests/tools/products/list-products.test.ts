import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListProducts } from '../../../src/tools/products/list-products.js';

// =============================================================================
// Factories
// =============================================================================

function makeProduct(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        product_identifier: 'SKU-001',
        product_name: 'Test Widget',
        description: 'A test product',
        weight: 1.5,
        length: 20,
        width: 15,
        height: 10,
        price: 199.99,
        quantity: 50,
        product_code: '8471.30',
        currency: 'MXN',
        content: null,
        ...overrides,
    };
}

function makeProductsResponse(products: unknown[] = [makeProduct()]) {
    return { data: products, total: products.length };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_list_products', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeProductsResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListProducts(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_products')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should call GET /products
    // -------------------------------------------------------------------------
    it('should call GET /products', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/products');
        expect(opts.method).toBe('GET');
    });

    // -------------------------------------------------------------------------
    // 2. should return product name and identifier in output
    // -------------------------------------------------------------------------
    it('should return product name and identifier in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Test Widget');
        expect(text).toContain('SKU-001');
    });

    // -------------------------------------------------------------------------
    // 3. should include price and currency in output
    // -------------------------------------------------------------------------
    it('should include price and currency in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('199.99');
        expect(text).toContain('MXN');
    });

    // -------------------------------------------------------------------------
    // 4. should include weight and dimensions in output
    // -------------------------------------------------------------------------
    it('should include weight and dimensions in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('1.5');
        expect(text).toContain('20');
        expect(text).toContain('15');
        expect(text).toContain('10');
    });

    // -------------------------------------------------------------------------
    // 5. should include HS/NCM product code in output
    // -------------------------------------------------------------------------
    it('should include HS/NCM product code in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('8471.30');
    });

    // -------------------------------------------------------------------------
    // 6. should pass limit query param when provided
    // -------------------------------------------------------------------------
    it('should pass limit query param when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 10 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limit=10');
    });

    // -------------------------------------------------------------------------
    // 7. should pass page query param when provided
    // -------------------------------------------------------------------------
    it('should pass page query param when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, page: 2 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('page=2');
    });

    // -------------------------------------------------------------------------
    // 8. should pass product_identifier query param for filtered lookup
    // -------------------------------------------------------------------------
    it('should pass product_identifier query param for filtered lookup', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, product_identifier: 'SKU-042' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('product_identifier=SKU-042');
    });

    // -------------------------------------------------------------------------
    // 9. should return empty catalogue message when data is empty
    // -------------------------------------------------------------------------
    it('should return empty catalogue message when data is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [], total: 0 }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('No products found in the catalogue.');
    });

    // -------------------------------------------------------------------------
    // 10. should show multiple products in output
    // -------------------------------------------------------------------------
    it('should show multiple products in output', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(
                    makeProductsResponse([
                        makeProduct({ product_name: 'Widget A', product_identifier: 'SKU-001' }),
                        makeProduct({ product_name: 'Widget B', product_identifier: 'SKU-002' }),
                    ]),
                ),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Widget A');
        expect(text).toContain('Widget B');
        expect(text).toContain('SKU-001');
        expect(text).toContain('SKU-002');
    });

    // -------------------------------------------------------------------------
    // 11. should show total count in header
    // -------------------------------------------------------------------------
    it('should show total count in header', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeProductsResponse()),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Product Catalogue');
        expect(text).toContain('1');
    });

    // -------------------------------------------------------------------------
    // 12. should omit dimensions when all are null
    // -------------------------------------------------------------------------
    it('should omit dimensions when all are null', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(
                    makeProductsResponse([
                        makeProduct({ weight: null, length: null, width: null, height: null }),
                    ]),
                ),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Test Widget');
        expect(text).not.toContain('Dimensions:');
    });

    // -------------------------------------------------------------------------
    // 13. should return error message on API failure
    // -------------------------------------------------------------------------
    it('should return error message on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list products:');
    });

    // -------------------------------------------------------------------------
    // 14. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-abc' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-abc');
    });
});
