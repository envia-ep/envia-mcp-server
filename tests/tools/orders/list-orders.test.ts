import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListOrders } from '../../../src/tools/orders/list-orders.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: 109543,
        status_id: 2,
        ecart_status_name: 'Paid',
        fulfillment_status_id: 3,
        order: { name: '#2416', identifier: 'MKT001', number: '2416', total_price: 1099, currency: 'MXN' },
        customer: { name: 'Erick Ameida', email: 'erick@test.com' },
        shop: { id: 33488, name: 'Ferreteria Norte' },
        ecommerce: { id: 1, name: 'shopify' },
        shipment_data: {
            shipping_address: {
                city: 'Azcapotzalco', state_code: 'CX', country_code: 'MX', postal_code: '02070',
                first_name: 'Erick', last_name: 'Ameida', phone: '9381234567',
                address_1: 'Av Centenario', address_2: null, address_3: null,
                company: null, email: 'erick@test.com', reference: null,
                identification_number: null, branch_code: null,
            },
            locations: [],
        },
        tags: [],
        ...overrides,
    };
}

function makeListResponse(orders: unknown[] = [makeOrder()], extras: Record<string, unknown> = {}) {
    return {
        orders_info: orders,
        countries: ['MX'],
        totals: orders.length,
        ...extras,
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_list_orders', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListOrders(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_orders')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted order list with order name and customer
    // -------------------------------------------------------------------------
    it('should return formatted order list with order name and customer', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, page: 1, limit: 20 });
        const text = result.content[0].text;

        expect(text).toContain('#2416');
        expect(text).toContain('Erick Ameida');
        expect(text).toContain('Ferreteria Norte');
    });

    // -------------------------------------------------------------------------
    // 2. should show all three status dimensions
    // -------------------------------------------------------------------------
    it('should show all three status dimensions', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, page: 1, limit: 20 });
        const text = result.content[0].text;

        expect(text).toContain('Label Pending');
        expect(text).toContain('Paid');
        expect(text).toContain('Unfulfilled');
    });

    // -------------------------------------------------------------------------
    // 3. should return "no orders found" when API returns empty array
    // -------------------------------------------------------------------------
    it('should return "no orders found" when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([], { totals: 0 })),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, page: 1, limit: 20 });
        const text = result.content[0].text;

        expect(text).toContain('No orders found matching the specified filters.');
    });

    // -------------------------------------------------------------------------
    // 4. should return error message when API call fails
    // -------------------------------------------------------------------------
    it('should return error message when API call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, page: 1, limit: 20 });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list orders:');
    });

    // -------------------------------------------------------------------------
    // 5. should pass filters to the API URL
    // -------------------------------------------------------------------------
    it('should pass filters to the API URL', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            page: 2,
            limit: 50,
            shop_id: 33488,
            status_id: 2,
            date_from: '2026-01-01 00:00:00',
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url] = mockFetch.mock.calls[0];

        expect(url).toContain('page=2');
        expect(url).toContain('limit=50');
        expect(url).toContain('shop_id=33488');
        expect(url).toContain('status_id=2');
        expect(url).toContain('date_from=');
    });

    // -------------------------------------------------------------------------
    // 6. should include total count in output header
    // -------------------------------------------------------------------------
    it('should include total count in output header', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeOrder()], { totals: 518 })),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, page: 1, limit: 20 });
        const text = result.content[0].text;

        expect(text).toContain('518');
    });

    // -------------------------------------------------------------------------
    // 7. should include guidance for next steps
    // -------------------------------------------------------------------------
    it('should include guidance for next steps', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, page: 1, limit: 20 });
        const text = result.content[0].text;

        expect(text).toContain('envia_get_ecommerce_order');
    });

    // -------------------------------------------------------------------------
    // 8. should use the api_key from args for Authorization header
    // -------------------------------------------------------------------------
    it('should use the api_key from args for Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz', page: 1, limit: 20 });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });
});
