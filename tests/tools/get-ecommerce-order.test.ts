import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../helpers/mock-server.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { registerGetEcommerceOrder } from '../../src/tools/get-ecommerce-order.js';
import type { V4Order } from '../../src/types/ecommerce-order.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeV4OrderResponse(overrides: Partial<V4Order> = {}): V4Order {
    return {
        id: 9001,
        status_id: 2,
        order: {
            identifier: 'SHOP-1234',
            name: '#1234',
            number: '1234',
            status_payment: 'paid',
            currency: 'MXN',
            total: 599.98,
            shipping_method: 'Standard',
            shipping_option_reference: null,
            cod: 0,
            logistic_mode: null,
            created_at_ecommerce: '2026-03-01T10:00:00Z',
        },
        customer: { name: 'Maria Lopez', email: 'maria@example.com' },
        shop: { id: 42, name: 'My Shopify Store' },
        ecommerce: { id: 1, name: 'Shopify' },
        shipment_data: {
            shipping_address: {
                company: null,
                first_name: 'Maria',
                last_name: 'Lopez',
                phone: '+528180005678',
                address_1: 'Calle Reforma 456',
                address_2: null,
                address_3: null,
                city: 'Mexico City',
                state_code: 'CDMX',
                country_code: 'MX',
                postal_code: '03100',
                email: 'maria@example.com',
                reference: null,
                identification_number: null,
                branch_code: null,
            },
            locations: [{
                id: 1,
                first_name: 'Warehouse',
                last_name: 'Norte',
                company: 'ACME Corp',
                phone: '+528180001234',
                address_1: 'Av. Constitucion 123',
                address_2: null,
                city: 'Monterrey',
                state_code: 'NL',
                country_code: 'MX',
                postal_code: '64000',
                packages: [{
                    id: 100,
                    name: 'Package 1',
                    content: 'T-Shirts',
                    amount: 1,
                    box_code: null,
                    package_type_id: 1,
                    package_type_name: 'Box',
                    insurance: 0,
                    declared_value: 500,
                    dimensions: { height: 10, length: 20, width: 15 },
                    weight: 1.5,
                    weight_unit: 'KG',
                    length_unit: 'CM',
                    quote: {
                        price: 120,
                        service_id: 5,
                        carrier_id: 3,
                        carrier_name: 'fedex',
                        service_name: 'ground',
                    },
                    shipment: null,
                    fulfillment: { status: 'Pending', status_id: 0 },
                    products: [{
                        name: 'Blue T-Shirt',
                        sku: 'TSH-001',
                        quantity: 2,
                        price: 299.99,
                        weight: 0.3,
                        identifier: 'prod-1',
                        variant_id: 'var-1',
                    }],
                }],
            }],
        },
        ...overrides,
    };
}

function makeApiResponse(order: V4Order) {
    return { orders_info: [order], countries: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('envia_get_ecommerce_order', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetEcommerceOrder(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_ecommerce_order')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Successful fetch and transformation
    // -----------------------------------------------------------------------

    it('should return order summary when order is found', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('Order found successfully!');
        expect(text).toContain('SHOP-1234');
        expect(text).toContain('#1234');
        expect(text).toContain('My Shopify Store');
        expect(text).toContain('Shopify');
        expect(text).toContain('MXN');
    });

    it('should call GET /v4/orders with order_identifier and sort_by params', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ orders_info: [], countries: [] }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ orders_info: [], countries: [] }),
        });

        await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        const [firstUrl] = mockFetch.mock.calls[0];
        expect(firstUrl).toContain('order_identifier=SHOP-1234');
        expect(firstUrl).toContain('sort_by=created_at_ecommerce');
    });

    // -----------------------------------------------------------------------
    // Quote payload output
    // -----------------------------------------------------------------------

    it('should include quote payload when payload_type is quote', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'quote' });
        const text = result.content[0].text;

        expect(text).toContain('Quote Payload');
        expect(text).toContain('64000');
        expect(text).toContain('03100');
        expect(text).toContain('1.5KG');
        expect(text).not.toContain('Generate Payload');
    });

    // -----------------------------------------------------------------------
    // Generate payload output
    // -----------------------------------------------------------------------

    it('should include generate payload when payload_type is generate', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'generate' });
        const text = result.content[0].text;

        expect(text).toContain('Generate Payload');
        expect(text).toContain('Warehouse Norte');
        expect(text).toContain('Maria Lopez');
        expect(text).toContain('fedex / ground');
        expect(text).not.toContain('Quote Payload');
    });

    it('should include both payloads when payload_type is both', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('Quote Payload');
        expect(text).toContain('Generate Payload');
    });

    // -----------------------------------------------------------------------
    // Carrier display
    // -----------------------------------------------------------------------

    it('should display carrier info when pre-selected', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('fedex / ground');
    });

    it('should show not selected when no carrier in quote', async () => {
        const order = makeV4OrderResponse();
        order.shipment_data.locations[0].packages[0].quote = {
            price: null,
            service_id: null,
            carrier_id: null,
            carrier_name: null,
            service_name: null,
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('Carrier:     Not selected');
        expect(text).toContain('No carrier pre-selected');
    });

    // -----------------------------------------------------------------------
    // Fulfillment warnings
    // -----------------------------------------------------------------------

    it('should warn when order is fully fulfilled', async () => {
        const order = makeV4OrderResponse();
        order.shipment_data.locations[0].packages[0].shipment = {
            name: 'fedex',
            tracking_number: 'TRK-001',
            shipment_id: 1,
            status: 'delivered',
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('fully fulfilled');
    });

    // -----------------------------------------------------------------------
    // Order not found
    // -----------------------------------------------------------------------

    it('should return helpful message when order is not found by either strategy', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ orders_info: [], countries: [] }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ orders_info: [], countries: [] }),
        });

        const result = await handler({ order_identifier: 'NONEXISTENT', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('No order found');
        expect(text).toContain('NONEXISTENT');
        expect(text).toContain('Tips');
    });

    // -----------------------------------------------------------------------
    // API error handling
    // -----------------------------------------------------------------------

    it('should return error message when API call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal server error' }),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to fetch order');
        expect(text).toContain('SHOP-1234');
    });

    // -----------------------------------------------------------------------
    // Next steps guidance
    // -----------------------------------------------------------------------

    it('should suggest envia_quote_shipment when no carrier is pre-selected', async () => {
        const order = makeV4OrderResponse();
        order.shipment_data.locations[0].packages[0].quote = {
            price: null,
            service_id: null,
            carrier_id: null,
            carrier_name: null,
            service_name: null,
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('envia_quote_shipment');
    });

    it('should suggest envia_create_shipment when carrier is available', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('envia_create_shipment');
    });

    it('should suggest envia_track_package when all packages are fulfilled', async () => {
        const order = makeV4OrderResponse();
        order.shipment_data.locations[0].packages[0].shipment = {
            name: 'fedex',
            tracking_number: 'TRK-001',
            shipment_id: 1,
            status: 'delivered',
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('envia_track_package');
    });

    // -----------------------------------------------------------------------
    // Location label formatting
    // -----------------------------------------------------------------------

    it('should display location address as origin label', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });
        const text = result.content[0].text;

        expect(text).toContain('Av. Constitucion 123, Monterrey, NL');
    });

    // -----------------------------------------------------------------------
    // Plan V2 §5 — lean-list flags surfaced in summary output
    // -----------------------------------------------------------------------

    it('should render fulfillment status row when backend provides fulfillment_status_name', async () => {
        const order = makeV4OrderResponse({ fulfillment_status_name: 'Shipped' });
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        expect(result.content[0].text).toContain('Fulfillment: Shipped');
    });

    it('should render COD flag when order has cod > 0', async () => {
        const base = makeV4OrderResponse();
        const order = { ...base, order: { ...base.order, cod: 500 } };
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        expect(result.content[0].text).toContain('💳 COD');
    });

    it('should render fraud-risk flag when order.fraud_risk is a non-zero number', async () => {
        const base = makeV4OrderResponse();
        const order = { ...base, order: { ...base.order, fraud_risk: 1 } };
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        expect(result.content[0].text).toContain('⚠️ fraud risk');
    });

    it('should render partial-availability flag when order.partial_available is 1', async () => {
        const base = makeV4OrderResponse();
        const order = { ...base, order: { ...base.order, partial_available: 1 } };
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        expect(result.content[0].text).toContain('🔀 partially available');
    });

    it('should render internal note block when order_comment object is populated', async () => {
        const order = makeV4OrderResponse({
            order_comment: { comment: 'Leave at front desk', created_at: null, created_by: null },
        });
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        expect(result.content[0].text).toContain('Leave at front desk');
    });

    it('should NOT render flags row when no flags are set', async () => {
        const order = makeV4OrderResponse();
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200, json: () => Promise.resolve(makeApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', payload_type: 'both' });

        expect(result.content[0].text).not.toContain('Flags:');
    });
});
