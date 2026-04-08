/**
 * Tests for the EcommerceOrderService.
 *
 * Builder methods (address, package, ecommerce section) are tested in
 * tests/builders/. This file focuses on the service orchestration:
 * fetchOrder, resolveLocation, resolveCarrier, extractCarrier,
 * buildSummary, transformLocation, and transformOrder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { EcommerceOrderService } from '../../src/services/ecommerce-order.js';
import type {
    V4Order,
    V4ShippingAddress,
    V4Location,
    V4Package,
    V4Product,
} from '../../src/types/ecommerce-order.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<V4Product> = {}): V4Product {
    return {
        name: 'Blue T-Shirt',
        sku: 'TSH-001',
        quantity: 2,
        price: 299.99,
        weight: 0.3,
        identifier: 'prod-1',
        variant_id: 'var-1',
        ...overrides,
    };
}

function makePackage(overrides: Partial<V4Package> = {}): V4Package {
    return {
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
        products: [makeProduct()],
        ...overrides,
    };
}

function makeShippingAddress(overrides: Partial<V4ShippingAddress> = {}): V4ShippingAddress {
    return {
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
        reference: 'Near the park',
        identification_number: null,
        branch_code: null,
        ...overrides,
    };
}

function makeLocation(overrides: Partial<V4Location> = {}): V4Location {
    return {
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
        packages: [makePackage()],
        ...overrides,
    };
}

function makeOrder(overrides: Partial<V4Order> = {}): V4Order {
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
            shipping_address: makeShippingAddress(),
            locations: [makeLocation()],
        },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EcommerceOrderService', () => {
    let service: EcommerceOrderService;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        const client = new EnviaApiClient(MOCK_CONFIG);
        service = new EcommerceOrderService(client, MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // fetchOrder
    // -----------------------------------------------------------------------

    describe('fetchOrder', () => {
        const emptyResponse = () => ({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ orders_info: [], countries: [] }),
        });

        const orderResponse = (order: V4Order) => ({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ orders_info: [order], countries: [] }),
        });

        it('should return the first order when order_identifier matches', async () => {
            const order = makeOrder();
            mockFetch.mockResolvedValueOnce(orderResponse(order));

            const result = await service.fetchOrder('SHOP-1234');

            expect(result).toEqual(order);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should include sort_by to bypass the 6-month default filter', async () => {
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce(emptyResponse());

            await service.fetchOrder('SHOP-1234');

            const [firstUrl] = mockFetch.mock.calls[0];
            expect(firstUrl).toContain('sort_by=created_at_ecommerce');
            expect(firstUrl).toContain('sort_direction=DESC');
        });

        it('should call order_identifier first then fall back to search', async () => {
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce(emptyResponse());

            await service.fetchOrder('1062');

            expect(mockFetch).toHaveBeenCalledTimes(2);
            const [firstUrl] = mockFetch.mock.calls[0];
            const [secondUrl] = mockFetch.mock.calls[1];
            expect(firstUrl).toContain('order_identifier=1062');
            expect(secondUrl).toContain('search=1062');
        });

        it('should return order from search fallback when order_identifier finds nothing', async () => {
            const order = makeOrder();
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce(orderResponse(order));

            const result = await service.fetchOrder('1062');

            expect(result).toEqual(order);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should not call search when order_identifier already found an order', async () => {
            const order = makeOrder();
            mockFetch.mockResolvedValueOnce(orderResponse(order));

            await service.fetchOrder('SHOP-1234');

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should URL-encode the identifier in both calls', async () => {
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce(emptyResponse());

            await service.fetchOrder('ORDER #123');

            const [firstUrl] = mockFetch.mock.calls[0];
            const [secondUrl] = mockFetch.mock.calls[1];
            expect(firstUrl).toContain('order_identifier=ORDER%20%23123');
            expect(secondUrl).toContain('search=ORDER%20%23123');
        });

        it('should trim whitespace from identifier', async () => {
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce(emptyResponse());

            await service.fetchOrder('  SHOP-1234  ');

            const [firstUrl] = mockFetch.mock.calls[0];
            expect(firstUrl).toContain('order_identifier=SHOP-1234');
        });

        it('should return null when both strategies find nothing', async () => {
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce(emptyResponse());

            const result = await service.fetchOrder('NONEXISTENT');

            expect(result).toBeNull();
        });

        it('should return null when first call is 404 and search finds nothing', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ message: 'Not found' }),
            });
            mockFetch.mockResolvedValueOnce(emptyResponse());

            const result = await service.fetchOrder('NONEXISTENT');

            expect(result).toBeNull();
        });

        it('should throw when order_identifier call returns a non-404 error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ message: 'Server error' }),
            });

            await expect(service.fetchOrder('SHOP-1234')).rejects.toThrow();
        });

        it('should throw when search fallback returns a non-404 error', async () => {
            mockFetch.mockResolvedValueOnce(emptyResponse());
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ message: 'Server error' }),
            });

            await expect(service.fetchOrder('1062')).rejects.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // resolveLocation
    // -----------------------------------------------------------------------

    describe('resolveLocation', () => {
        it('should return the location and active packages for a valid index', () => {
            const order = makeOrder();

            const result = service.resolveLocation(order, 0);

            expect('error' in result).toBe(false);
            if (!('error' in result)) {
                expect(result.location.id).toBe(1);
                expect(result.activePackages).toHaveLength(1);
            }
        });

        it('should return error when order has no locations', () => {
            const order = makeOrder({
                shipment_data: { shipping_address: makeShippingAddress(), locations: [] },
            });

            const result = service.resolveLocation(order, 0);

            expect(result).toHaveProperty('error');
            expect((result as { error: string }).error).toContain('no locations');
        });

        it('should return error when location_index is out of bounds', () => {
            const order = makeOrder();

            const result = service.resolveLocation(order, 5);

            expect(result).toHaveProperty('error');
            expect((result as { error: string }).error).toContain('out of bounds');
        });

        it('should filter out fulfilled packages', () => {
            const order = makeOrder({
                shipment_data: {
                    shipping_address: makeShippingAddress(),
                    locations: [makeLocation({
                        packages: [
                            makePackage({ id: 1, shipment: null }),
                            makePackage({
                                id: 2,
                                shipment: { name: 'fedex', tracking_number: 'TRK-1', shipment_id: 1, status: 'delivered' },
                            }),
                        ],
                    })],
                },
            });

            const result = service.resolveLocation(order, 0);

            expect(result).not.toHaveProperty('error');
            expect((result as { activePackages: { id: number }[] }).activePackages).toHaveLength(1);
            expect((result as { activePackages: { id: number }[] }).activePackages[0].id).toBe(1);
        });

        it('should filter out return packages', () => {
            const order = makeOrder({
                shipment_data: {
                    shipping_address: makeShippingAddress(),
                    locations: [makeLocation({
                        packages: [
                            makePackage({ id: 1, is_return: false }),
                            makePackage({ id: 2, is_return: true }),
                        ],
                    })],
                },
            });

            const result = service.resolveLocation(order, 0);

            expect(result).not.toHaveProperty('error');
            expect((result as { activePackages: unknown[] }).activePackages).toHaveLength(1);
        });

        it('should return error when all packages are fulfilled', () => {
            const order = makeOrder({
                shipment_data: {
                    shipping_address: makeShippingAddress(),
                    locations: [makeLocation({
                        packages: [makePackage({
                            shipment: { name: 'fedex', tracking_number: 'TRK-1', shipment_id: 1, status: 'delivered' },
                        })],
                    })],
                },
            });

            const result = service.resolveLocation(order, 0);

            expect(result).toHaveProperty('error');
            expect((result as { error: string }).error).toContain('already fulfilled');
        });
    });

    // -----------------------------------------------------------------------
    // resolveCarrier
    // -----------------------------------------------------------------------

    describe('resolveCarrier', () => {
        it('should prefer explicit carrier and service params', () => {
            const packages = [makePackage()];

            const result = service.resolveCarrier(packages, 'dhl', 'express');

            expect(result).not.toHaveProperty('error');
            expect((result as { carrier: string; service: string; carrierId: number | null }).carrier).toBe('dhl');
            expect((result as { carrier: string; service: string; carrierId: number | null }).service).toBe('express');
            expect((result as { carrier: string; service: string; carrierId: number | null }).carrierId).toBeNull();
        });

        it('should fall back to package quote when no params provided', () => {
            const packages = [makePackage()];

            const result = service.resolveCarrier(packages, undefined, undefined);

            expect(result).not.toHaveProperty('error');
            expect((result as { carrier: string; service: string; carrierId: number | null }).carrier).toBe('fedex');
            expect((result as { carrier: string; service: string; carrierId: number | null }).service).toBe('ground');
            expect((result as { carrier: string; service: string; carrierId: number | null }).carrierId).toBe(3);
        });

        it('should return error when no carrier available from any source', () => {
            const packages = [makePackage({
                quote: { price: null, service_id: null, carrier_id: null, carrier_name: null, service_name: null },
            })];

            const result = service.resolveCarrier(packages, undefined, undefined);

            expect(result).toHaveProperty('error');
            expect((result as { error: string }).error).toContain('No carrier pre-selected');
        });

        it('should lowercase and trim carrier param', () => {
            const packages = [makePackage()];

            const result = service.resolveCarrier(packages, '  DHL  ', '  Express  ');

            expect(result).not.toHaveProperty('error');
            expect((result as { carrier: string; service: string }).carrier).toBe('dhl');
            expect((result as { carrier: string; service: string }).service).toBe('Express');
        });
    });

    // -----------------------------------------------------------------------
    // buildSummary
    // -----------------------------------------------------------------------

    describe('buildSummary', () => {
        it('should extract order identifiers and metadata', () => {
            const order = makeOrder();

            const summary = service.buildSummary(order);

            expect(summary.orderId).toBe(9001);
            expect(summary.orderIdentifier).toBe('SHOP-1234');
            expect(summary.orderName).toBe('#1234');
            expect(summary.orderNumber).toBe('1234');
            expect(summary.shopName).toBe('My Shopify Store');
            expect(summary.ecommercePlatform).toBe('Shopify');
            expect(summary.currency).toBe('MXN');
            expect(summary.statusPayment).toBe('paid');
        });

        it('should warn when order is fully fulfilled', () => {
            const order = makeOrder({
                shipment_data: {
                    shipping_address: makeShippingAddress(),
                    locations: [makeLocation({
                        packages: [makePackage({
                            shipment: { name: 'fedex', tracking_number: 'TRK-001', shipment_id: 1, status: 'delivered' },
                        })],
                    })],
                },
            });

            const summary = service.buildSummary(order);

            expect(summary.fulfillmentWarnings).toHaveLength(1);
            expect(summary.fulfillmentWarnings[0]).toContain('fully fulfilled');
        });

        it('should warn when order is partially fulfilled', () => {
            const order = makeOrder({
                shipment_data: {
                    shipping_address: makeShippingAddress(),
                    locations: [makeLocation({
                        packages: [
                            makePackage({ id: 100, shipment: null }),
                            makePackage({
                                id: 101,
                                shipment: { name: 'dhl', tracking_number: 'TRK-002', shipment_id: 2, status: 'shipped' },
                            }),
                        ],
                    })],
                },
            });

            const summary = service.buildSummary(order);

            expect(summary.fulfillmentWarnings).toHaveLength(1);
            expect(summary.fulfillmentWarnings[0]).toContain('Partially fulfilled');
            expect(summary.fulfillmentWarnings[0]).toContain('1/2');
        });

        it('should have no warnings when no packages are fulfilled', () => {
            const order = makeOrder();

            const summary = service.buildSummary(order);

            expect(summary.fulfillmentWarnings).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    // extractCarrier
    // -----------------------------------------------------------------------

    describe('extractCarrier', () => {
        it('should return carrier from the first package with a valid quote', () => {
            const packages = [makePackage()];

            const carrier = service.extractCarrier(packages);

            expect(carrier).toEqual({
                carrier: 'fedex',
                service: 'ground',
                carrierId: 3,
                serviceId: 5,
            });
        });

        it('should return null when no package has a complete quote', () => {
            const packages = [makePackage({
                quote: { price: null, service_id: null, carrier_id: null, carrier_name: null, service_name: null },
            })];

            const carrier = service.extractCarrier(packages);

            expect(carrier).toBeNull();
        });

        it('should skip packages with partial quote and use the first complete one', () => {
            const packages = [
                makePackage({
                    id: 100,
                    quote: { price: null, service_id: null, carrier_id: null, carrier_name: null, service_name: null },
                }),
                makePackage({
                    id: 101,
                    quote: { price: 200, service_id: 7, carrier_id: 4, carrier_name: 'dhl', service_name: 'express' },
                }),
            ];

            const carrier = service.extractCarrier(packages);

            expect(carrier?.carrier).toBe('dhl');
            expect(carrier?.service).toBe('express');
        });

        it('should return null for empty package array', () => {
            const carrier = service.extractCarrier([]);

            expect(carrier).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // transformLocation
    // -----------------------------------------------------------------------

    describe('transformLocation', () => {
        it('should produce both quote and generate payloads when carrier exists', () => {
            const order = makeOrder();
            const location = order.shipment_data.locations[0];
            const shippingAddr = order.shipment_data.shipping_address;

            const result = service.transformLocation(location, 0, shippingAddr, order);

            expect(result.quotePayload).toBeDefined();
            expect(result.generatePayload).toBeDefined();
            expect(result.carrier).toBeDefined();
            expect(result.warnings).toHaveLength(0);
        });

        it('should set generatePayload to null when no carrier is available', () => {
            const order = makeOrder();
            const location = makeLocation({
                packages: [makePackage({
                    quote: { price: null, service_id: null, carrier_id: null, carrier_name: null, service_name: null },
                })],
            });

            const result = service.transformLocation(location, 0, order.shipment_data.shipping_address, order);

            expect(result.generatePayload).toBeNull();
            expect(result.carrier).toBeNull();
            expect(result.warnings).toContain(
                'No carrier pre-selected for this location. ' +
                'Use quote_shipment to compare rates, then pass carrier and service to envia_create_label.',
            );
        });

        it('should skip fulfilled packages and return-only packages', () => {
            const location = makeLocation({
                packages: [
                    makePackage({
                        id: 100,
                        shipment: { name: 'dhl', tracking_number: 'TRK-001', shipment_id: 1, status: 'delivered' },
                    }),
                    makePackage({ id: 101, is_return: true }),
                ],
            });
            const order = makeOrder({ shipment_data: { shipping_address: makeShippingAddress(), locations: [location] } });

            const result = service.transformLocation(location, 0, order.shipment_data.shipping_address, order);

            expect(result.quotePayload.packages).toHaveLength(0);
            expect(result.warnings).toContain('All packages in this location are already fulfilled or are returns.');
        });

        it('should build origin label from location address fields', () => {
            const location = makeLocation();
            const order = makeOrder();

            const result = service.transformLocation(location, 0, order.shipment_data.shipping_address, order);

            expect(result.originLabel).toBe('Av. Constitucion 123, Monterrey, NL');
        });

        it('should fallback to Location N when address fields are empty', () => {
            const location = makeLocation({ address_1: '', city: '', state_code: '' });
            const order = makeOrder();

            const result = service.transformLocation(location, 2, order.shipment_data.shipping_address, order);

            expect(result.originLabel).toBe('Location 3');
        });

        it('should include items for international shipments', () => {
            const location = makeLocation({ country_code: 'US' });
            const order = makeOrder();

            const result = service.transformLocation(location, 0, order.shipment_data.shipping_address, order);

            expect(result.quotePayload.packages[0].items).toBeDefined();
        });

        it('should omit items for domestic shipments', () => {
            const location = makeLocation({ country_code: 'MX' });
            const order = makeOrder();

            const result = service.transformLocation(location, 0, order.shipment_data.shipping_address, order);

            expect(result.quotePayload.packages[0].items).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // transformOrder (end-to-end)
    // -----------------------------------------------------------------------

    describe('transformOrder', () => {
        it('should produce a complete transformed order for a single-location order', () => {
            const order = makeOrder();

            const result = service.transformOrder(order);

            expect(result.summary.orderIdentifier).toBe('SHOP-1234');
            expect(result.locations).toHaveLength(1);
            expect(result.locations[0].carrier?.carrier).toBe('fedex');
            expect(result.locations[0].quotePayload.origin.country).toBe('MX');
            expect(result.locations[0].quotePayload.destination.country).toBe('MX');
        });

        it('should handle multi-location orders with independent payloads', () => {
            const order = makeOrder({
                shipment_data: {
                    shipping_address: makeShippingAddress(),
                    locations: [
                        makeLocation({ id: 1, city: 'Monterrey' }),
                        makeLocation({
                            id: 2,
                            city: 'Guadalajara',
                            state_code: 'JAL',
                            packages: [makePackage({
                                id: 200,
                                quote: { price: 150, service_id: 8, carrier_id: 5, carrier_name: 'dhl', service_name: 'express' },
                            })],
                        }),
                    ],
                },
            });

            const result = service.transformOrder(order);

            expect(result.locations).toHaveLength(2);
            expect(result.locations[0].quotePayload.origin.city).toBe('Monterrey');
            expect(result.locations[1].quotePayload.origin.city).toBe('Guadalajara');
            expect(result.locations[0].carrier?.carrier).toBe('fedex');
            expect(result.locations[1].carrier?.carrier).toBe('dhl');
        });

        it('should populate ecommerce metadata in generation payloads', () => {
            const order = makeOrder();

            const result = service.transformOrder(order);
            const gen = result.locations[0].generatePayload!;

            expect(gen.ecommerce.shop_id).toBe(42);
            expect(gen.ecommerce.order_id).toBe(9001);
            expect(gen.ecommerce.order_identifier).toBe('SHOP-1234');
            expect(gen.ecommerce.order_name).toBe('#1234');
            expect(gen.ecommerce.type_generate).toBe('multi_generate');
        });

        it('should set shipment type to 1 (parcel) in generation payloads', () => {
            const order = makeOrder();

            const result = service.transformOrder(order);
            const gen = result.locations[0].generatePayload!;

            expect(gen.shipment.type).toBe(1);
        });

        it('should use placeholder street in quote addresses', () => {
            const order = makeOrder();

            const result = service.transformOrder(order);
            const quote = result.locations[0].quotePayload;

            expect(quote.origin.street).toBe('Calle 1 #100');
            expect(quote.destination.street).toBe('Calle 1 #100');
        });

        it('should use real streets in generation addresses', () => {
            const order = makeOrder();

            const result = service.transformOrder(order);
            const gen = result.locations[0].generatePayload!;

            expect(gen.origin.street).toBe('Av. Constitucion 123');
            expect(gen.destination.street).toBe('Calle Reforma 456');
        });

        it('should handle order with no locations gracefully', () => {
            const order = makeOrder({
                shipment_data: { shipping_address: makeShippingAddress(), locations: [] },
            });

            const result = service.transformOrder(order);

            expect(result.locations).toHaveLength(0);
            expect(result.summary.fulfillmentWarnings).toHaveLength(0);
        });

        it('should set currency from order details in generation settings', () => {
            const order = makeOrder();
            order.order.currency = 'USD';

            const result = service.transformOrder(order);
            const gen = result.locations[0].generatePayload!;

            expect(gen.settings.currency).toBe('USD');
        });

        it('should default currency to MXN when order currency is empty', () => {
            const order = makeOrder();
            order.order.currency = '';

            const result = service.transformOrder(order);
            const gen = result.locations[0].generatePayload!;

            expect(gen.settings.currency).toBe('MXN');
        });
    });
});
