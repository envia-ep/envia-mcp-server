import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListShops } from '../../../src/tools/orders/list-shops.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeShop(overrides: Record<string, unknown> = {}) {
    return {
        id: 33488,
        company_id: 254,
        ecommerce_id: 1,
        ecommerce_name: 'shopify',
        ecommerce_description: 'Shopify',
        name: 'Ferreteria Norte',
        url: 'https://ferreteria.myshopify.com',
        active: 1,
        deleted: 0,
        package_automatic: 0,
        package_automatic_recommended: null,
        checkout: 0,
        origin: '1',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_list_shops', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        // /company/shops returns a raw top-level array
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve([makeShop()]),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListShops(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_shops')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return active shops with name, id, and platform
    // -------------------------------------------------------------------------
    it('should return active shops with name, id, and platform', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: false });
        const text = result.content[0].text;

        expect(text).toContain('33488');
        expect(text).toContain('Ferreteria Norte');
        expect(text).toContain('Shopify');
    });

    // -------------------------------------------------------------------------
    // 2. should filter out deleted/inactive shops by default
    // -------------------------------------------------------------------------
    it('should filter out deleted shops when include_inactive is false', async () => {
        const shops = [
            makeShop({ id: 1, name: 'Active Shop', active: 1, deleted: 0 }),
            makeShop({ id: 2, name: 'Deleted Shop', active: 1, deleted: 1 }),
            makeShop({ id: 3, name: 'Inactive Shop', active: 0, deleted: 0 }),
        ];
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(shops),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: false });
        const text = result.content[0].text;

        expect(text).toContain('Active Shop');
        expect(text).not.toContain('Deleted Shop');
        expect(text).not.toContain('Inactive Shop');
    });

    // -------------------------------------------------------------------------
    // 3. should return all shops when include_inactive is true
    // -------------------------------------------------------------------------
    it('should return all shops when include_inactive is true', async () => {
        const shops = [
            makeShop({ id: 1, name: 'Active Shop', active: 1, deleted: 0 }),
            makeShop({ id: 2, name: 'Deleted Shop', active: 1, deleted: 1 }),
        ];
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(shops),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: true });
        const text = result.content[0].text;

        expect(text).toContain('Active Shop');
        expect(text).toContain('Deleted Shop');
    });

    // -------------------------------------------------------------------------
    // 4. should return "no active shops found" when all shops are inactive
    // -------------------------------------------------------------------------
    it('should return appropriate message when no active shops exist', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([makeShop({ active: 0, deleted: 0 })]),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: false });
        const text = result.content[0].text;

        expect(text).toContain('No active shops found');
        expect(text).toContain('include_inactive=true');
    });

    // -------------------------------------------------------------------------
    // 5. should show total vs active count in the header
    // -------------------------------------------------------------------------
    it('should show total count vs active count in header', async () => {
        const shops = [
            makeShop({ id: 1, active: 1, deleted: 0 }),
            makeShop({ id: 2, active: 0, deleted: 0 }),
            makeShop({ id: 3, active: 1, deleted: 1 }),
        ];
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(shops),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: false });
        const text = result.content[0].text;

        // 1 active out of 3 total
        expect(text).toContain('1 active out of 3 total');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: () => Promise.resolve({ message: 'Forbidden' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: false });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list shops:');
    });

    // -------------------------------------------------------------------------
    // 7. should call /company/shops endpoint
    // -------------------------------------------------------------------------
    it('should call the /company/shops endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, include_inactive: false });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/company/shops');
    });
});
