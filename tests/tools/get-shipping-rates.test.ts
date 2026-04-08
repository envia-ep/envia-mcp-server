/**
 * Tests for the quote_shipment tool.
 *
 * The tool now accepts minimal params (postal codes + weight), resolves
 * city/state via the address-resolver, and supports "all" carrier mode.
 * Address resolution is mocked at the module level for full isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../helpers/mock-server.js';
import {
    MOCK_CONFIG,
    VALID_QUOTE_ARGS,
    MOCK_RATES_RESPONSE,
} from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { registerGetShippingRates } from '../../src/tools/get-shipping-rates.js';
import { resolveAddress } from '../../src/utils/address-resolver.js';

vi.mock('../../src/utils/address-resolver.js', () => ({
    resolveAddress: vi.fn(),
}));

const resolveAddressMock = vi.mocked(resolveAddress);

describe('quote_shipment', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        resolveAddressMock.mockResolvedValue({
            postalCode: '64000',
            country: 'MX',
            city: 'Monterrey',
            state: 'NL',
        });

        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(MOCK_RATES_RESPONSE),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetShippingRates(server, client, MOCK_CONFIG);
        handler = handlers.get('quote_shipment')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Carrier routing
    // -----------------------------------------------------------------------

    it('should fetch carrier list and fan out requests when carriers is "all"', async () => {
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: [
                        { name: 'fedex', import: 0, third_party: 0 },
                        { name: 'dhl', import: 0, third_party: 0 },
                    ],
                }),
            })
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_RATES_RESPONSE),
            });

        await handler({ ...VALID_QUOTE_ARGS, carriers: 'all' });

        expect(mockFetch).toHaveBeenCalledTimes(3);
        const firstCallUrl = mockFetch.mock.calls[0][0];
        expect(firstCallUrl).toContain('/available-carrier/MX/0/1');
        const rateCarriers = mockFetch.mock.calls.slice(1).map(
            (call: unknown[]) => JSON.parse((call[1] as { body: string }).body).shipment.carrier,
        );
        expect(rateCarriers).toContain('fedex');
        expect(rateCarriers).toContain('dhl');
    });

    it('should include import and third_party flags from carrier discovery in the shipment payload', async () => {
        // Mirrors the real AR→MX response: DHL appears twice with different routing flags.
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: [
                        { name: 'dhl', import: 0, third_party: 0 },
                        { name: 'dhl', import: 1, third_party: 0 },
                        { name: 'ups', import: 1, third_party: 0 },
                        { name: 'fedex', import: 0, third_party: 1 },
                    ],
                }),
            })
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_RATES_RESPONSE),
            });

        await handler({
            ...VALID_QUOTE_ARGS,
            carriers: 'all',
            origin_country: 'AR',
            destination_country: 'MX',
        });

        const shipments = mockFetch.mock.calls.slice(1).map(
            (call: unknown[]) => JSON.parse((call[1] as { body: string }).body).shipment,
        );

        expect(shipments).toContainEqual(
            expect.objectContaining({ carrier: 'dhl', import: 0, third_party: 0 }),
        );
        expect(shipments).toContainEqual(
            expect.objectContaining({ carrier: 'dhl', import: 1, third_party: 0 }),
        );
        expect(shipments).toContainEqual(
            expect.objectContaining({ carrier: 'ups', import: 1, third_party: 0 }),
        );
        expect(shipments).toContainEqual(
            expect.objectContaining({ carrier: 'fedex', import: 0, third_party: 1 }),
        );
    });

    it('should include reverse_pickup: 0 in every shipment payload', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });

        const shipment = JSON.parse(
            (mockFetch.mock.calls[0][1] as { body: string }).body,
        ).shipment;
        expect(shipment.reverse_pickup).toBe(0);
    });

    it('should default import and third_party to 0 for comma-separated carrier input', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl,fedex' });

        const shipments = mockFetch.mock.calls.map(
            (call: unknown[]) => JSON.parse((call[1] as { body: string }).body).shipment,
        );
        for (const shipment of shipments) {
            expect(shipment.import).toBe(0);
            expect(shipment.third_party).toBe(0);
        }
    });

    it('should send parallel requests for comma-separated carriers', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl,fedex,estafeta' });

        expect(mockFetch).toHaveBeenCalledTimes(3);
        const carriers = mockFetch.mock.calls.map(
            (call: unknown[]) => JSON.parse((call[1] as { body: string }).body).shipment.carrier,
        );
        expect(carriers).toContain('dhl');
        expect(carriers).toContain('fedex');
        expect(carriers).toContain('estafeta');
    });

    it('should detect international shipments when origin and destination countries differ', async () => {
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: [{ name: 'fedex', import: 0, third_party: 0 }],
                }),
            })
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_RATES_RESPONSE),
            });

        await handler({
            ...VALID_QUOTE_ARGS,
            carriers: 'all',
            origin_country: 'MX',
            destination_country: 'US',
        });

        const firstCallUrl = mockFetch.mock.calls[0][0];
        expect(firstCallUrl).toContain('/available-carrier/MX/1/1');
        expect(firstCallUrl).toContain('destination_country=US');
    });

    it('should pass destination_country query param for international carrier discovery', async () => {
        // Regression: AR→MX previously returned only DHL because /available-carrier/AR/1
        // only knows carriers for Argentina. The fix passes ?destination_country=MX so
        // the API filters carriers that can serve the full route.
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: [
                        { name: 'dhl', import: 0, third_party: 0 },
                        { name: 'ups', import: 1, third_party: 0 },
                        { name: 'fedex', import: 0, third_party: 1 },
                    ],
                }),
            })
            .mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_RATES_RESPONSE),
            });

        await handler({
            ...VALID_QUOTE_ARGS,
            carriers: 'all',
            origin_country: 'AR',
            destination_country: 'MX',
        });

        const discoveryUrl = mockFetch.mock.calls[0][0];
        expect(discoveryUrl).toContain('/available-carrier/AR/1/1');
        expect(discoveryUrl).toContain('destination_country=MX');
    });

    it('should return error when "all" resolves to no carriers', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [] }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'all' });
        const text = result.content[0].text;

        expect(text).toContain('No carriers available');
    });

    it('should cap carrier list at 10 entries', async () => {
        const twelveCarriers = 'c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12';
        await handler({ ...VALID_QUOTE_ARGS, carriers: twelveCarriers });

        expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('should return error when carriers is empty string', async () => {
        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: '' });
        const text = result.content[0].text;

        expect(text).toContain('Error');
        expect(text).toContain('at least one carrier');
    });

    // -----------------------------------------------------------------------
    // Input validation
    // -----------------------------------------------------------------------

    it('should return error when origin has neither postal code nor city', async () => {
        const result = await handler({
            weight: 2,
            destination_postal_code: '03100',
            origin_country: 'MX',
            destination_country: 'MX',
            carriers: 'dhl',
            length: 10, width: 10, height: 10,
            content: 'General merchandise', declared_value: 0,
        });
        const text = result.content[0].text;

        expect(text).toContain('Error');
        expect(text).toContain('origin_postal_code');
        expect(text).toContain('origin_city');
    });

    it('should return error when destination has neither postal code nor city', async () => {
        const result = await handler({
            origin_postal_code: '64000',
            weight: 2,
            origin_country: 'MX',
            destination_country: 'CO',
            carriers: 'dhl',
            length: 10, width: 10, height: 10,
            content: 'General merchandise', declared_value: 0,
        });
        const text = result.content[0].text;

        expect(text).toContain('Error');
        expect(text).toContain('destination_postal_code');
        expect(text).toContain('destination_city');
    });

    it('should accept city without postal code for CO destinations', async () => {
        resolveAddressMock.mockResolvedValue({
            country: 'CO',
            city: '11001000',
            state: 'DC',
        });

        const result = await handler({
            origin_postal_code: '66612',
            origin_country: 'MX',
            destination_country: 'CO',
            destination_city: 'Bogota',
            destination_state: 'DC',
            weight: 2,
            carriers: 'fedex',
            length: 10, width: 10, height: 10,
            content: 'General merchandise', declared_value: 0,
        });
        const text = result.content[0].text;

        expect(text).not.toContain('Error');
        expect(resolveAddressMock).toHaveBeenCalledWith(
            expect.objectContaining({ city: 'Bogota', state: 'DC', country: 'CO' }),
            expect.anything(),
            expect.anything(),
        );
    });

    it('should accept city without postal code for CO origins', async () => {
        resolveAddressMock.mockResolvedValue({
            country: 'CO',
            city: '11001000',
            state: 'DC',
        });

        const result = await handler({
            origin_country: 'CO',
            origin_city: 'Bogota',
            origin_state: 'DC',
            destination_postal_code: '66612',
            destination_country: 'MX',
            weight: 2,
            carriers: 'fedex',
            length: 10, width: 10, height: 10,
            content: 'General merchandise', declared_value: 0,
        });
        const text = result.content[0].text;

        expect(text).not.toContain('Error');
    });

    it('should lowercase and trim carrier slugs', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: '  DHL , FedEx  ' });

        const carriers = mockFetch.mock.calls.map(
            (call: unknown[]) => JSON.parse((call[1] as { body: string }).body).shipment.carrier,
        );
        expect(carriers).toContain('dhl');
        expect(carriers).toContain('fedex');
    });

    // -----------------------------------------------------------------------
    // Rate sorting and formatting
    // -----------------------------------------------------------------------

    it('should return rates sorted by price cheapest first', async () => {
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: [{ carrier: 'fedex', service: 'overnight', totalPrice: '500.00', currency: 'MXN' }],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: [{ carrier: 'dhl', service: 'ground', totalPrice: '100.00', currency: 'MXN' }],
                }),
            });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'fedex,dhl' });
        const text = result.content[0].text;

        const groundIndex = text.indexOf('dhl / ground');
        const overnightIndex = text.indexOf('fedex / overnight');
        expect(groundIndex).toBeLessThan(overnightIndex);
    });

    it('should format output with carrier, service, price, and delivery estimate', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [{
                    carrier: 'dhl',
                    service: 'express',
                    serviceDescription: 'DHL Express',
                    totalPrice: '250.00',
                    currency: 'MXN',
                    deliveryEstimate: '1-2 business days',
                }],
            }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('dhl / express');
        expect(text).toContain('(DHL Express)');
        expect(text).toContain('$250.00 MXN');
        expect(text).toContain('1-2 business days');
    });

    it('should omit delivery estimate when not present', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [{ carrier: 'dhl', service: 'standard', totalPrice: '180.00', currency: 'MXN' }],
            }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const rateLine = result.content[0].text.split('\n').find((l: string) => l.startsWith('•'));

        expect(rateLine).toBeDefined();
        expect(rateLine).not.toContain('|');
    });

    it('should omit service description when not present', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [{ carrier: 'dhl', service: 'standard', totalPrice: '180.00', currency: 'MXN' }],
            }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const rateLine = result.content[0].text.split('\n').find((l: string) => l.startsWith('•'));

        expect(rateLine).toBeDefined();
        expect(rateLine).not.toMatch(/\(.*\)/);
    });

    it('should default currency to MXN when not specified in response', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [{ carrier: 'dhl', service: 'express', totalPrice: '250.00' }],
            }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('$250.00 MXN');
    });

    it('should include next step guidance in success output', async () => {
        const result = await handler({ ...VALID_QUOTE_ARGS });
        const text = result.content[0].text;

        expect(text).toContain('Next step:');
        expect(text).toContain('envia_create_label');
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    it('should return error messages when all carrier requests fail', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Invalid carrier' }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'badcarrier1,badcarrier2' });
        const text = result.content[0].text;

        expect(text).toContain('No rates found');
        expect(text).toContain('Errors');
    });

    it('should return partial results when some carriers succeed and others fail', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [{ carrier: 'dhl', service: 'express', totalPrice: '250.00', currency: 'MXN' }],
            }),
        });
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Invalid carrier' }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl,badcarrier' });
        const text = result.content[0].text;

        expect(text).toContain('dhl / express');
        expect(text).toContain('$250.00');
        expect(text).toContain('Carrier errors:');
    });

    it('should handle Promise.allSettled rejected entries', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [{ carrier: 'dhl', service: 'express', totalPrice: '250.00', currency: 'MXN' }],
            }),
        });
        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl,fedex' });
        const text = result.content[0].text;

        expect(text).toContain('dhl / express');
    });

    it('should handle empty rates array from API', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [] }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('No rates');
    });

    it('should surface API error message when response is OK but has no rate data', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ message: 'Carrier not available for this route' }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('No rates found');
        expect(text).toContain('Errors');
        expect(text).toContain('Carrier not available for this route');
    });

    it('should surface API error field when response is OK but has no rate data', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ error: 'Invalid destination' }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('No rates found');
        expect(text).toContain('Invalid destination');
    });

    it('should dump response shape when response is OK but has no rate data and no message', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ unexpected: 'shape' }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('No rates found');
        expect(text).toContain('unexpected response shape');
        expect(text).toContain('"unexpected":"shape"');
    });

    it('should handle "all" carrier mode when carrier list fetch fails', async () => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Server error' }),
        });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'all' });
        const text = result.content[0].text;

        expect(text).toContain('No carriers available');
    });

    it('should handle "all" carrier mode when rate requests fail', async () => {
        mockFetch.mockReset();
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ data: [{ name: 'fedex' }, { name: 'dhl' }] }),
            })
            .mockResolvedValue({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ message: 'Server error' }),
            });

        const result = await handler({ ...VALID_QUOTE_ARGS, carriers: 'all' });
        const text = result.content[0].text;

        expect(text).toContain('No rates found');
        expect(text).toContain('Errors');
    });

    // -----------------------------------------------------------------------
    // Package payload
    // -----------------------------------------------------------------------

    it('should send correct package payload with defaults', async () => {
        await handler({
            origin_postal_code: '64000',
            destination_postal_code: '03100',
            weight: 3.0,
            origin_country: 'MX',
            destination_country: 'MX',
            carriers: 'dhl',
            length: 10,
            width: 10,
            height: 10,
            content: 'General merchandise',
            declared_value: 0,
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.packages[0].weight).toBe(3.0);
        expect(body.packages[0].weightUnit).toBe('KG');
        expect(body.packages[0].dimensions).toEqual({ length: 10, width: 10, height: 10 });
        expect(body.packages[0].content).toBe('General merchandise');
    });

    it('should send custom dimensions when provided', async () => {
        await handler({
            ...VALID_QUOTE_ARGS,
            carriers: 'dhl',
            length: 50,
            width: 40,
            height: 30,
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.packages[0].dimensions).toEqual({ length: 50, width: 40, height: 30 });
    });

    it('should include currency in settings when provided', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl', currency: 'USD' });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.settings.currency).toBe('USD');
    });

    it('should not include settings when currency is not provided', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.settings).toBeUndefined();
    });

    it('should hardcode shipment type to 1 (parcel)', async () => {
        await handler({ ...VALID_QUOTE_ARGS, carriers: 'dhl' });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.shipment.type).toBe(1);
    });
});
