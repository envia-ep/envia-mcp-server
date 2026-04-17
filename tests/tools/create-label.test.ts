/**
 * Tests for the create_shipment tool (dual-mode: manual + ecommerce).
 *
 * Manual mode: address resolution is mocked at the module level.
 * Ecommerce mode: order fetch, print settings, and generate API are mocked via global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../helpers/mock-server.js';
import {
    MOCK_CONFIG,
    MOCK_LABEL_RESPONSE,
} from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { registerCreateLabel } from '../../src/tools/create-label.js';
import { resolveAddress } from '../../src/utils/address-resolver.js';
import type { V4Order } from '../../src/types/ecommerce-order.js';

vi.mock('../../src/utils/address-resolver.js', () => ({
    resolveAddress: vi.fn(),
}));

const resolveAddressMock = vi.mocked(resolveAddress);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeV4Order(overrides: Partial<V4Order> = {}): V4Order {
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

function makeOrderApiResponse(order: V4Order) {
    return { orders_info: [order], countries: [] };
}

function makePrintLimitsResponse(format = 'ZPL', size = 'STOCK_4X8') {
    return { print: [{ type_id: format, size_id: size }] };
}

const VALID_MANUAL_ARGS = {
    origin_name: 'Juan Perez',
    origin_phone: '+528180001234',
    origin_street: 'Av. Constitucion 123',
    origin_city: 'Monterrey',
    origin_state: 'NL',
    origin_country: 'MX',
    origin_postal_code: '64000',
    destination_name: 'Maria Lopez',
    destination_phone: '+528180005678',
    destination_street: 'Calle Reforma 456',
    destination_city: 'Mexico City',
    destination_state: 'CDMX',
    destination_country: 'MX',
    destination_postal_code: '03100',
    package_weight: 2.5,
    package_length: 30,
    package_width: 20,
    package_height: 15,
    package_content: 'Electronics',
    package_declared_value: 500,
    carrier: 'dhl',
    service: 'express',
    shipment_type: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('create_shipment', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();

        resolveAddressMock.mockResolvedValue({
            postalCode: '64000',
            country: 'MX',
            city: 'Monterrey',
            state: 'NL',
        });

        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCreateLabel(server, client, MOCK_CONFIG);
        handler = handlers.get('create_shipment')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Manual mode — payload structure
    // -----------------------------------------------------------------------

    it('should call POST /ship/generate/ with correct body in manual mode', async () => {
        await handler({ ...VALID_MANUAL_ARGS });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        expect(generateCall).toBeDefined();

        const body = JSON.parse((generateCall![1] as { body: string }).body);
        expect(body).toHaveProperty('origin');
        expect(body).toHaveProperty('destination');
        expect(body).toHaveProperty('packages');
        expect(body).toHaveProperty('shipment');
        expect(body).toHaveProperty('settings');
        expect(body.origin.name).toBe('Juan Perez');
        expect(body.destination.name).toBe('Maria Lopez');
        expect(body.shipment.carrier).toBe('dhl');
        expect(body.shipment.service).toBe('express');
        expect(body.packages[0].weight).toBe(2.5);
    });

    it('should include printFormat and printSize in settings', async () => {
        await handler({ ...VALID_MANUAL_ARGS });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.printFormat).toBe('PDF');
        expect(body.settings.printSize).toBe('STOCK_4X6');
    });

    it('should allow overriding print settings via params', async () => {
        await handler({
            ...VALID_MANUAL_ARGS,
            print_format: 'ZPL',
            print_size: 'STOCK_4X8',
        });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.printFormat).toBe('ZPL');
        expect(body.settings.printSize).toBe('STOCK_4X8');
    });

    it('should include currency in settings when provided', async () => {
        await handler({ ...VALID_MANUAL_ARGS, currency: 'USD' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.currency).toBe('USD');
    });

    it('should include optional address fields in payload when provided', async () => {
        await handler({
            ...VALID_MANUAL_ARGS,
            origin_number: '123',
            origin_district: 'Centro',
            origin_company: 'ACME Corp',
            destination_number: '456',
            destination_reference: 'Near the park',
        });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.origin.number).toBe('123');
        expect(body.origin.district).toBe('Centro');
        expect(body.origin.company).toBe('ACME Corp');
        expect(body.destination.number).toBe('456');
        expect(body.destination.reference).toBe('Near the park');
    });

    it('should include orderReference in shipment when provided', async () => {
        await handler({ ...VALID_MANUAL_ARGS, order_reference: 'ORD-9999' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.shipment.orderReference).toBe('ORD-9999');
    });

    // -----------------------------------------------------------------------
    // Manual mode — address resolution
    // -----------------------------------------------------------------------

    it('should call resolveAddress for both origin and destination', async () => {
        await handler({ ...VALID_MANUAL_ARGS });

        expect(resolveAddressMock).toHaveBeenCalledTimes(2);
        expect(resolveAddressMock).toHaveBeenCalledWith(
            expect.objectContaining({ postalCode: '64000', country: 'MX' }),
            expect.anything(),
            expect.anything(),
        );
        expect(resolveAddressMock).toHaveBeenCalledWith(
            expect.objectContaining({ postalCode: '03100', country: 'MX' }),
            expect.anything(),
            expect.anything(),
        );
    });

    it('should use resolved city/state in the payload', async () => {
        resolveAddressMock
            .mockResolvedValueOnce({ country: 'MX', postalCode: '64000', city: 'Monterrey', state: 'NL' })
            .mockResolvedValueOnce({ country: 'MX', postalCode: '03100', city: 'Del Valle', state: 'DF' });

        await handler({ ...VALID_MANUAL_ARGS });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.origin.city).toBe('Monterrey');
        expect(body.origin.state).toBe('NL');
        expect(body.destination.city).toBe('Del Valle');
        expect(body.destination.state).toBe('DF');
    });

    it('should lowercase and trim carrier slug in manual mode', async () => {
        await handler({ ...VALID_MANUAL_ARGS, carrier: '  DHL  ' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.shipment.carrier).toBe('dhl');
    });

    // -----------------------------------------------------------------------
    // Manual mode — validation errors
    // -----------------------------------------------------------------------

    it('should return error when origin_country is missing in manual mode', async () => {
        const { origin_country: _, ...noCountry } = VALID_MANUAL_ARGS;
        const result = await handler(noCountry);

        expect(result.content[0].text).toContain('Error');
        expect(result.content[0].text).toContain('origin_country');
    });

    it('should return error when carrier is missing in manual mode', async () => {
        const { carrier: _, ...noCarrier } = VALID_MANUAL_ARGS;
        const result = await handler(noCarrier);

        expect(result.content[0].text).toContain('Error');
        expect(result.content[0].text).toContain('carrier');
    });

    it('should return error when service is missing in manual mode', async () => {
        const { service: _, ...noService } = VALID_MANUAL_ARGS;
        const result = await handler(noService);

        expect(result.content[0].text).toContain('Error');
        expect(result.content[0].text).toContain('carrier');
    });

    it('should return error when required address fields are missing', async () => {
        const { origin_name: _, ...noName } = VALID_MANUAL_ARGS;
        const result = await handler(noName);

        expect(result.content[0].text).toContain('Error');
        expect(result.content[0].text).toContain('origin_name');
    });

    it('should return error when package dimensions are missing', async () => {
        const { package_weight: _, ...noPkgWeight } = VALID_MANUAL_ARGS;
        const result = await handler(noPkgWeight);

        expect(result.content[0].text).toContain('Error');
        expect(result.content[0].text).toContain('package_weight');
    });

    // -----------------------------------------------------------------------
    // Manual mode — success output
    // -----------------------------------------------------------------------

    it('should return tracking number and label URL on success', async () => {
        const result = await handler({ ...VALID_MANUAL_ARGS });
        const text = result.content[0].text;

        expect(text).toContain('Label created successfully!');
        expect(text).toContain('7520610403');
        expect(text).toContain('https://api.envia.com/labels/7520610403.pdf');
    });

    it('should include price and currency in output', async () => {
        const result = await handler({ ...VALID_MANUAL_ARGS });
        const text = result.content[0].text;

        expect(text).toContain('$150.5');
        expect(text).toContain('MXN');
    });

    it('should include next steps guidance', async () => {
        const result = await handler({ ...VALID_MANUAL_ARGS });
        const text = result.content[0].text;

        expect(text).toContain('Next steps:');
        expect(text).toContain('envia_track_package');
        expect(text).toContain('envia_schedule_pickup');
    });

    // -----------------------------------------------------------------------
    // Manual mode — error handling
    // -----------------------------------------------------------------------

    it('should return error when generate API fails', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Invalid carrier' }),
        });

        const result = await handler({ ...VALID_MANUAL_ARGS });
        const text = result.content[0].text;

        expect(text).toContain('Label creation failed:');
        expect(text).toContain('Suggestion:');
    });

    it('should return message when tracking number is missing in response', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [{ carrier: 'dhl', service: 'express' }] }),
        });

        const result = await handler({ ...VALID_MANUAL_ARGS });

        expect(result.content[0].text).toContain('unexpected response');
    });

    // -----------------------------------------------------------------------
    // Ecommerce mode — successful flow
    // -----------------------------------------------------------------------

    it('should create label from ecommerce order in one step', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        const result = await handler({ order_identifier: 'SHOP-1234' });
        const text = result.content[0].text;

        expect(text).toContain('Label created successfully!');
        expect(text).toContain('7520610403');
    });

    it('should use carrier from order quote when no override provided', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.shipment.carrier).toBe('fedex');
        expect(body.shipment.service).toBe('ground');
    });

    it('should allow overriding carrier in ecommerce mode', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234', carrier: 'dhl', service: 'express' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.shipment.carrier).toBe('dhl');
        expect(body.shipment.service).toBe('express');
    });

    it('should include ecommerce metadata in payload', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.ecommerce).toBeDefined();
        expect(body.ecommerce.shop_id).toBe(42);
        expect(body.ecommerce.order_id).toBe(9001);
        expect(body.ecommerce.order_identifier).toBe('SHOP-1234');
        expect(body.ecommerce.type_generate).toBe('multi_generate');
    });

    it('should include shopId in settings for ecommerce mode', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.shopId).toBe(42);
        expect(body.settings.currency).toBe('MXN');
    });

    it('should fetch print settings from pickup-limits in ecommerce mode', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse('PNG', 'PAPER_4X6')),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const pickupCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/pickup-limits/'),
        );
        expect(pickupCall).toBeDefined();
        expect((pickupCall![0] as string)).toContain('/pickup-limits/fedex/ground/MX?carrier_id=3');

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.printFormat).toBe('PNG');
        expect(body.settings.printSize).toBe('PAPER_4X6');
    });

    it('should use order number as orderReference in ecommerce mode', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.shipment.orderReference).toBe('1234');
    });

    it('should map origin and destination addresses from order data', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.origin.name).toBe('Warehouse Norte');
        expect(body.origin.street).toBe('Av. Constitucion 123');
        expect(body.origin.city).toBe('Monterrey');
        expect(body.origin.country).toBe('MX');

        expect(body.destination.name).toBe('Maria Lopez');
        expect(body.destination.street).toBe('Calle Reforma 456');
        expect(body.destination.city).toBe('Mexico City');
    });

    // -----------------------------------------------------------------------
    // Ecommerce mode — error handling
    // -----------------------------------------------------------------------

    it('should return error when order is not found', async () => {
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ orders_info: [], countries: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ orders_info: [], countries: [] }),
            });

        const result = await handler({ order_identifier: 'NONEXISTENT' });

        expect(result.content[0].text).toContain('No order found');
    });

    it('should return error when order fetch fails', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Server error' }),
        });

        const result = await handler({ order_identifier: 'SHOP-1234' });

        expect(result.content[0].text).toContain('Failed to fetch order');
    });

    it('should return error when all packages are fulfilled', async () => {
        const order = makeV4Order({
            shipment_data: {
                shipping_address: makeV4Order().shipment_data.shipping_address,
                locations: [{
                    ...makeV4Order().shipment_data.locations[0],
                    packages: [{
                        ...makeV4Order().shipment_data.locations[0].packages[0],
                        shipment: { name: 'DHL', tracking_number: 'TRACK123', shipment_id: 1, status: 'Delivered' },
                    }],
                }],
            },
        });

        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeOrderApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234' });

        expect(result.content[0].text).toContain('already fulfilled');
    });

    it('should return error when no carrier pre-selected and none provided', async () => {
        const order = makeV4Order();
        order.shipment_data.locations[0].packages[0].quote = {
            price: null,
            service_id: null,
            carrier_id: null,
            carrier_name: null,
            service_name: null,
        };

        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeOrderApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234' });

        expect(result.content[0].text).toContain('No carrier pre-selected');
        expect(result.content[0].text).toContain('quote_shipment');
    });

    it('should return error when location_index is out of bounds', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeOrderApiResponse(order)),
        });

        const result = await handler({ order_identifier: 'SHOP-1234', location_index: 5 });

        expect(result.content[0].text).toContain('out of bounds');
    });

    // -----------------------------------------------------------------------
    // Ecommerce mode — multi-location
    // -----------------------------------------------------------------------

    it('should target the specified location_index', async () => {
        const order = makeV4Order();
        order.shipment_data.locations.push({
            id: 2,
            first_name: 'Warehouse',
            last_name: 'Sur',
            company: null,
            phone: '+525555555555',
            address_1: 'Av. Insurgentes 789',
            address_2: null,
            city: 'Guadalajara',
            state_code: 'JAL',
            country_code: 'MX',
            postal_code: '44100',
            packages: [{
                id: 200,
                name: 'Package 2',
                content: 'Shoes',
                amount: 1,
                box_code: null,
                package_type_id: 1,
                package_type_name: 'Box',
                insurance: 0,
                declared_value: 800,
                dimensions: { height: 15, length: 30, width: 20 },
                weight: 2.0,
                weight_unit: 'KG',
                length_unit: 'CM',
                quote: {
                    price: 150,
                    service_id: 5,
                    carrier_id: 3,
                    carrier_name: 'estafeta',
                    service_name: 'standard',
                },
                shipment: null,
                fulfillment: { status: 'Pending', status_id: 0 },
                products: [],
            }],
        });

        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234', location_index: 1 });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.origin.city).toBe('Guadalajara');
        expect(body.origin.state).toBe('JAL');
        expect(body.shipment.carrier).toBe('estafeta');
        expect(body.shipment.service).toBe('standard');
        expect(body.packages[0].content).toBe('Shoes');
    });

    // -----------------------------------------------------------------------
    // Ecommerce mode — print settings fallback
    // -----------------------------------------------------------------------

    it('should fall back to PDF/STOCK_4X6 when pickup-limits API fails', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ message: 'Server error' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.printFormat).toBe('PDF');
        expect(body.settings.printSize).toBe('STOCK_4X6');
    });

    it('should allow print setting overrides in ecommerce mode', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse('ZPL', 'STOCK_4X8')),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({
            order_identifier: 'SHOP-1234',
            print_format: 'PDF',
            print_size: 'PAPER_LETTER',
        });

        const generateCall = mockFetch.mock.calls.find(
            (call: unknown[]) => (call[0] as string).includes('/ship/generate/'),
        );
        const body = JSON.parse((generateCall![1] as { body: string }).body);

        expect(body.settings.printFormat).toBe('PDF');
        expect(body.settings.printSize).toBe('PAPER_LETTER');
    });

    // -----------------------------------------------------------------------
    // Ecommerce mode — fulfillment sync (with ecartApiBase configured)
    // -----------------------------------------------------------------------

    describe('ecommerce mode — fulfillment sync', () => {
        const CONFIG_WITH_ECART = { ...MOCK_CONFIG, ecartApiBase: 'https://api.ecart.io' };

        it('should call tmp-fulfillment when order_identifier is present and label succeeds', async () => {
            // Arrange
            const order = makeV4Order();
            const { server: ecartServer, handlers: ecartHandlers } = createMockServer();
            const ecartClient = new EnviaApiClient(CONFIG_WITH_ECART);
            registerCreateLabel(ecartServer, ecartClient, CONFIG_WITH_ECART);
            const ecartHandler = ecartHandlers.get('create_shipment')!;

            mockFetch.mockReset();
            mockFetch
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(makeOrderApiResponse(order)),
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(makePrintLimitsResponse()),
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({ success: true }),
                });

            // Act
            await ecartHandler({ order_identifier: 'SHOP-1234' });

            // Assert
            const tmpFulfillmentCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/tmp-fulfillment/'));
            expect(tmpFulfillmentCall).toBeDefined();
        });

        it('should NOT call tmp-fulfillment when label creation fails', async () => {
            // Arrange
            const order = makeV4Order();
            const { server: ecartServer, handlers: ecartHandlers } = createMockServer();
            const ecartClient = new EnviaApiClient(CONFIG_WITH_ECART);
            registerCreateLabel(ecartServer, ecartClient, CONFIG_WITH_ECART);
            const ecartHandler = ecartHandlers.get('create_shipment')!;

            mockFetch.mockReset();
            mockFetch
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(makeOrderApiResponse(order)),
                })
                .mockResolvedValueOnce({
                    ok: false, status: 422,
                    json: () => Promise.resolve({ message: 'Carrier error' }),
                });

            // Act
            await ecartHandler({ order_identifier: 'SHOP-1234' });

            // Assert
            const tmpFulfillmentCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/tmp-fulfillment/'));
            expect(tmpFulfillmentCall).toBeUndefined();
        });

        it('should append warning when sync fails but label was created', async () => {
            // Arrange
            const order = makeV4Order();
            const { server: ecartServer, handlers: ecartHandlers } = createMockServer();
            const ecartClient = new EnviaApiClient(CONFIG_WITH_ECART);
            registerCreateLabel(ecartServer, ecartClient, CONFIG_WITH_ECART);
            const ecartHandler = ecartHandlers.get('create_shipment')!;

            mockFetch.mockReset();
            mockFetch
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(makeOrderApiResponse(order)),
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(makePrintLimitsResponse()),
                })
                .mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
                })
                .mockResolvedValueOnce({
                    ok: false, status: 500,
                    json: () => Promise.resolve({ message: 'Sync failed' }),
                });

            // Act
            const result = await ecartHandler({ order_identifier: 'SHOP-1234' });
            const text = result.content[0].text;

            // Assert
            expect(text).toContain('Label created successfully');
            expect(text).toContain('fulfillment sync');
        });

        it('should NOT call tmp-fulfillment in manual mode', async () => {
            // Arrange — manual mode uses the default handler (no ecartApiBase needed)
            mockFetch.mockReset();
            mockFetch.mockResolvedValue({
                ok: true, status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

            // Act
            await handler({ ...VALID_MANUAL_ARGS });

            // Assert
            const tmpFulfillmentCall = mockFetch.mock.calls.find(([url]: [string]) => url.includes('/tmp-fulfillment/'));
            expect(tmpFulfillmentCall).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // Ecommerce mode — does NOT call resolveAddress
    // -----------------------------------------------------------------------

    it('should not call resolveAddress in ecommerce mode', async () => {
        const order = makeV4Order();
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makeOrderApiResponse(order)),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(makePrintLimitsResponse()),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

        await handler({ order_identifier: 'SHOP-1234' });

        expect(resolveAddressMock).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Manual mode — identification validation
    // -----------------------------------------------------------------------

    describe('identification validation', () => {
        it('should error when BR origin has all-same-digit CPF', async () => {
            resolveAddressMock.mockResolvedValue({
                postalCode: '01310-100',
                country: 'BR',
                city: 'Sao Paulo',
                state: 'SP',
            });

            const result = await handler({
                ...VALID_MANUAL_ARGS,
                origin_country: 'BR',
                origin_postal_code: '01310-100',
                destination_country: 'BR',
                destination_postal_code: '20040-020',
                origin_identification_number: '11111111111',
                destination_identification_number: '52998224725',
            });

            expect(result.content[0].text).toContain('CPF is invalid');
        });

        it('should error when CO origin is missing NIT', async () => {
            resolveAddressMock.mockResolvedValue({
                postalCode: '110111',
                country: 'CO',
                city: 'Bogota',
                state: 'DC',
            });

            const result = await handler({
                ...VALID_MANUAL_ARGS,
                origin_country: 'CO',
                origin_postal_code: '110111',
                destination_country: 'CO',
                destination_postal_code: '760001',
            });

            expect(result.content[0].text).toContain('identification number is required');
        });

        it('should error when CO NIT is too short', async () => {
            resolveAddressMock.mockResolvedValue({
                postalCode: '110111',
                country: 'CO',
                city: 'Bogota',
                state: 'DC',
            });

            const result = await handler({
                ...VALID_MANUAL_ARGS,
                origin_country: 'CO',
                origin_postal_code: '110111',
                destination_country: 'CO',
                destination_postal_code: '760001',
                origin_identification_number: '12345',
                destination_identification_number: '9001234567',
            });

            expect(result.content[0].text).toContain('NIT is invalid');
        });

        it('should not error for MX domestic without identification', async () => {
            const result = await handler({ ...VALID_MANUAL_ARGS });
            const text = result.content[0].text;

            expect(text).not.toContain('Identification validation failed');
        });
    });

    // -----------------------------------------------------------------------
    // Manual mode — items requirement check
    // -----------------------------------------------------------------------

    describe('items requirement check', () => {
        it('should error when BR to BR has no items', async () => {
            resolveAddressMock.mockResolvedValue({
                postalCode: '01310-100',
                country: 'BR',
                city: 'Sao Paulo',
                state: 'SP',
            });

            const result = await handler({
                ...VALID_MANUAL_ARGS,
                origin_country: 'BR',
                origin_postal_code: '01310-100',
                destination_country: 'BR',
                destination_postal_code: '20040-020',
                origin_identification_number: '52998224725',
                destination_identification_number: '52998224725',
            });

            expect(result.content[0].text).toContain('requires items');
        });

        it('should error when MX to US has no items', async () => {
            resolveAddressMock
                .mockResolvedValueOnce({
                    postalCode: '64000',
                    country: 'MX',
                    city: 'Monterrey',
                    state: 'NL',
                })
                .mockResolvedValueOnce({
                    postalCode: '90210',
                    country: 'US',
                    city: 'Beverly Hills',
                    state: 'CA',
                });

            const result = await handler({
                ...VALID_MANUAL_ARGS,
                origin_country: 'MX',
                destination_country: 'US',
                destination_postal_code: '90210',
            });

            expect(result.content[0].text).toContain('requires items');
        });

        it('should not error when MX to MX has no items', async () => {
            const result = await handler({ ...VALID_MANUAL_ARGS });
            const text = result.content[0].text;

            expect(text).not.toContain('requires items');
        });
    });
});
