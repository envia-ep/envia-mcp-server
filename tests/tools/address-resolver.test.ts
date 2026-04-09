/**
 * Tests for the address-resolver utility module.
 *
 * Covers resolvePostalCode, resolveColombianCity, resolveCityByGeocode,
 * and the resolveAddress orchestrator with full isolation via mocked
 * EnviaApiClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    resolvePostalCode,
    resolveColombianCity,
    resolveCityByGeocode,
    resolveAddress,
} from '../../src/utils/address-resolver.js';
import type { EnviaApiClient, ApiResponse } from '../../src/utils/api-client.js';
import type { EnviaConfig } from '../../src/config.js';

const MOCK_CONFIG: EnviaConfig = {
    apiKey: 'test-key',
    environment: 'sandbox',
    shippingBase: 'https://api-test.envia.com',
    queriesBase: 'https://queries-test.envia.com',
    geocodesBase: 'https://geocodes.envia.com',
};

function createMockClient(overrides: Partial<EnviaApiClient> = {}): EnviaApiClient {
    return {
        get: vi.fn(),
        post: vi.fn(),
        request: vi.fn(),
        ...overrides,
    } as unknown as EnviaApiClient;
}

// ---------------------------------------------------------------------------
// resolvePostalCode
// ---------------------------------------------------------------------------

describe('resolvePostalCode', () => {
    let client: EnviaApiClient;

    beforeEach(() => {
        client = createMockClient();
    });

    it('should return city and state when geocodes API succeeds', async () => {
        const geocodeResponse: ApiResponse = {
            ok: true,
            status: 200,
            data: [
                {
                    locality: 'Monterrey',
                    state: { code: { '2digit': 'NL' }, name: 'Nuevo León' },
                },
            ],
        };
        vi.mocked(client.get).mockResolvedValue(geocodeResponse);

        const result = await resolvePostalCode('64000', 'MX', client, MOCK_CONFIG);

        expect(result).toEqual({
            postalCode: '64000',
            country: 'MX',
            city: 'Monterrey',
            state: 'NL',
        });
    });

    it('should include district from first suburb when suburbs are present', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [
                {
                    locality: 'Del Valle',
                    state: { code: { '2digit': 'DF' } },
                    suburbs: ['Del Valle Centro', 'Del Valle Norte', 'Del Valle Sur'],
                },
            ],
        });

        const result = await resolvePostalCode('03100', 'MX', client, MOCK_CONFIG);

        expect(result.district).toBe('Del Valle Centro');
        expect(result.city).toBe('Del Valle');
        expect(result.state).toBe('DF');
    });

    it('should not include district when suburbs array is empty', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [
                {
                    locality: 'Monterrey',
                    state: { code: { '2digit': 'NL' } },
                    suburbs: [],
                },
            ],
        });

        const result = await resolvePostalCode('64000', 'MX', client, MOCK_CONFIG);

        expect(result.district).toBeUndefined();
    });

    it('should not include district when suburbs field is absent', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [
                {
                    locality: 'Miami',
                    state: { code: { '2digit': 'FL' } },
                },
            ],
        });

        const result = await resolvePostalCode('33101', 'US', client, MOCK_CONFIG);

        expect(result.district).toBeUndefined();
    });

    it('should call the geocodes API with the correct URL', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        await resolvePostalCode('03100', 'MX', client, MOCK_CONFIG);

        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/zipcode/MX/03100',
        );
    });

    it('should return base fields when postal code is empty', async () => {
        const result = await resolvePostalCode(undefined, 'MX', client, MOCK_CONFIG);

        expect(result).toEqual({ country: 'MX' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('should return base fields when geocodes API fails', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: false,
            status: 500,
            data: {},
            error: 'Server error',
        });

        const result = await resolvePostalCode('64000', 'MX', client, MOCK_CONFIG);

        expect(result).toEqual({ postalCode: '64000', country: 'MX' });
    });

    it('should return base fields when geocodes API returns empty array', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        const result = await resolvePostalCode('00000', 'MX', client, MOCK_CONFIG);

        expect(result).toEqual({ postalCode: '00000', country: 'MX' });
    });

    it('should fall back to city field when locality is absent', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{ city: 'Del Valle', state: { code: { '2digit': 'DF' } } }],
        });

        const result = await resolvePostalCode('03100', 'MX', client, MOCK_CONFIG);

        expect(result.city).toBe('Del Valle');
    });

    it('should fall back to state name when 2digit code is absent', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{ locality: 'Santiago', state: { name: 'Región Metropolitana' } }],
        });

        const result = await resolvePostalCode('8320000', 'CL', client, MOCK_CONFIG);

        expect(result.state).toBe('Región Metropolitana');
    });

    it('should uppercase the country code in both the URL and result', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        const result = await resolvePostalCode('64000', 'mx', client, MOCK_CONFIG);

        expect(result.country).toBe('MX');
        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/zipcode/MX/64000',
        );
    });

    it('should trim whitespace from country before building the URL', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        const result = await resolvePostalCode('64000', ' mx ', client, MOCK_CONFIG);

        expect(result.country).toBe('MX');
        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/zipcode/MX/64000',
        );
    });

    it('should handle non-array geocode response', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: { locality: 'Miami', state: { code: { '2digit': 'FL' } } },
        });

        const result = await resolvePostalCode('33101', 'US', client, MOCK_CONFIG);

        expect(result).toEqual({
            postalCode: '33101',
            country: 'US',
            city: 'Miami',
            state: 'FL',
        });
    });

    it('should encode special characters in postal code', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        await resolvePostalCode('M5V 3A8', 'CA', client, MOCK_CONFIG);

        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/zipcode/CA/M5V%203A8',
        );
    });
});

// ---------------------------------------------------------------------------
// resolveColombianCity
// ---------------------------------------------------------------------------

describe('resolveColombianCity', () => {
    let client: EnviaApiClient;

    beforeEach(() => {
        client = createMockClient();
    });

    it('should return DANE code when locate API succeeds', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '11001000', name: 'Bogotá', state: 'DC' },
        });

        const result = await resolveColombianCity('Bogota', 'DC', 'CO', client, MOCK_CONFIG);

        expect(result).toEqual({ city: '11001000', state: 'DC' });
    });

    it('should call the locate endpoint with correct payload', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '05001000', name: 'Medellín', state: 'AN' },
        });

        await resolveColombianCity('Medellin', 'AN', 'CO', client, MOCK_CONFIG);

        expect(client.post).toHaveBeenCalledWith(
            'https://api-test.envia.com/locate',
            { city: 'Medellin', state: 'AN', country: 'CO' },
        );
    });

    it('should skip API call when city is already a DANE code', async () => {
        const result = await resolveColombianCity('11001000', 'DC', 'CO', client, MOCK_CONFIG);

        expect(result).toEqual({ city: '11001000', state: 'DC' });
        expect(client.post).not.toHaveBeenCalled();
    });

    it('should return original values when locate API fails', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: false,
            status: 500,
            data: {},
            error: 'Server error',
        });

        const result = await resolveColombianCity('Bogota', 'DC', 'CO', client, MOCK_CONFIG);

        expect(result).toEqual({ city: 'Bogota', state: 'DC' });
    });

    it('should return original values when locate API returns null data', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: null,
        });

        const result = await resolveColombianCity('Cali', 'VA', 'CO', client, MOCK_CONFIG);

        expect(result).toEqual({ city: 'Cali', state: 'VA' });
    });

    it('should not treat 7-digit numbers as DANE codes', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '11001000', state: 'DC' },
        });

        await resolveColombianCity('1100100', 'DC', 'CO', client, MOCK_CONFIG);

        expect(client.post).toHaveBeenCalled();
    });

    it('should not treat 9-digit numbers as DANE codes', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '11001000', state: 'DC' },
        });

        await resolveColombianCity('110010001', 'DC', 'CO', client, MOCK_CONFIG);

        expect(client.post).toHaveBeenCalled();
    });

    it('should preserve resolved state from locate response', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '76001000', name: 'Cali', state: 'VA' },
        });

        const result = await resolveColombianCity('Cali', 'VAC', 'CO', client, MOCK_CONFIG);

        expect(result.state).toBe('VA');
    });
});

// ---------------------------------------------------------------------------
// resolveCityByGeocode
// ---------------------------------------------------------------------------

describe('resolveCityByGeocode', () => {
    let client: EnviaApiClient;

    beforeEach(() => {
        client = createMockClient();
    });

    it('should return city, state, and postal code when geocodes locate succeeds for CL', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { name: 'Bío-Bío', code: { '2digit': 'BI' } },
                zip_codes: [{ zip_code: '4030000', locality: 'Concepción' }],
            }],
        });

        const result = await resolveCityByGeocode('concepcion', 'CL', client, MOCK_CONFIG);

        expect(result).toEqual({
            country: 'CL',
            city: 'Concepción',
            state: 'BI',
            postalCode: '4030000',
        });
    });

    it('should call the geocodes locate endpoint with correct URL', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        await resolveCityByGeocode('Santiago', 'CL', client, MOCK_CONFIG);

        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/locate/CL/Santiago',
        );
    });

    it('should encode special characters in city name', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        await resolveCityByGeocode('San José', 'GT', client, MOCK_CONFIG);

        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/locate/GT/San%20Jos%C3%A9',
        );
    });

    it('should return original city when geocodes API fails', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: false,
            status: 500,
            data: {},
            error: 'Server error',
        });

        const result = await resolveCityByGeocode('Santiago', 'CL', client, MOCK_CONFIG);

        expect(result).toEqual({ country: 'CL', city: 'Santiago' });
    });

    it('should return original city when geocodes API returns empty array', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        const result = await resolveCityByGeocode('NonexistentCity', 'CL', client, MOCK_CONFIG);

        expect(result).toEqual({ country: 'CL', city: 'NonexistentCity' });
    });

    it('should return original city when geocodes API returns non-array', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: null,
        });

        const result = await resolveCityByGeocode('Santiago', 'CL', client, MOCK_CONFIG);

        expect(result).toEqual({ country: 'CL', city: 'Santiago' });
    });

    it('should fall back to state name when 2digit code is absent', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { name: 'Región Metropolitana' },
                zip_codes: [{ zip_code: '8320000', locality: 'Santiago' }],
            }],
        });

        const result = await resolveCityByGeocode('Santiago', 'CL', client, MOCK_CONFIG);

        expect(result.state).toBe('Región Metropolitana');
    });

    it('should handle missing zip_codes in response', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { code: { '2digit': 'RM' } },
            }],
        });

        const result = await resolveCityByGeocode('Santiago', 'CL', client, MOCK_CONFIG);

        expect(result.city).toBe('Santiago');
        expect(result.state).toBe('RM');
        expect(result.postalCode).toBeUndefined();
    });

    it('should work for Guatemalan cities', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { code: { '2digit': 'GU' } },
                zip_codes: [{ zip_code: '01001', locality: 'Guatemala' }],
            }],
        });

        const result = await resolveCityByGeocode('Guatemala', 'GT', client, MOCK_CONFIG);

        expect(result).toEqual({
            country: 'GT',
            city: 'Guatemala',
            state: 'GU',
            postalCode: '01001',
        });
    });
});

// ---------------------------------------------------------------------------
// resolveAddress (orchestrator)
// ---------------------------------------------------------------------------

describe('resolveAddress', () => {
    let client: EnviaApiClient;

    beforeEach(() => {
        client = createMockClient();
    });

    it('should geocode postal code and return resolved address for MX', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{ locality: 'Monterrey', state: { code: { '2digit': 'NL' } } }],
        });

        const result = await resolveAddress(
            { postalCode: '64000', country: 'MX' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toEqual({
            postalCode: '64000',
            country: 'MX',
            city: 'Monterrey',
            state: 'NL',
        });
    });

    it('should propagate district from postal code resolution for MX', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                locality: 'Apodaca',
                state: { code: { '2digit': 'NL' } },
                suburbs: ['Lombardia Residencial', 'Otro Fraccionamiento'],
            }],
        });

        const result = await resolveAddress(
            { postalCode: '66612', country: 'MX' },
            client,
            MOCK_CONFIG,
        );

        expect(result.district).toBe('Lombardia Residencial');
        expect(result.city).toBe('Apodaca');
        expect(result.state).toBe('NL');
    });

    it('should use explicit city/state overrides over geocoded values', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{ locality: 'Del Valle', state: { code: { '2digit': 'DF' } } }],
        });

        const result = await resolveAddress(
            { postalCode: '03100', country: 'MX', city: 'CDMX', state: 'CMX' },
            client,
            MOCK_CONFIG,
        );

        expect(result.city).toBe('CDMX');
        expect(result.state).toBe('CMX');
    });

    it('should resolve Colombian city via carriers locate when country is CO', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '11001000', name: 'Bogotá', state: 'DC' },
        });

        const result = await resolveAddress(
            { country: 'CO', city: 'Bogota', state: 'DC' },
            client,
            MOCK_CONFIG,
        );

        expect(client.post).toHaveBeenCalledWith(
            expect.stringContaining('/locate'),
            expect.objectContaining({ city: 'Bogota', state: 'DC', country: 'CO' }),
        );
        expect(result.city).toBe('11001000');
        expect(result.state).toBe('DC');
        expect(result.postalCode).toBe('11001000');
    });

    it('should resolve CL city via geocodes locate endpoint', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { code: { '2digit': 'RM' } },
                zip_codes: [{ zip_code: '8320000', locality: 'Santiago' }],
            }],
        });

        const result = await resolveAddress(
            { country: 'CL', city: 'Santiago' },
            client,
            MOCK_CONFIG,
        );

        expect(client.get).toHaveBeenCalledWith(
            'https://geocodes.envia.com/locate/CL/Santiago',
        );
        expect(client.post).not.toHaveBeenCalled();
        expect(result.city).toBe('Santiago');
        expect(result.state).toBe('RM');
        expect(result.postalCode).toBe('8320000');
    });

    it('should resolve CL city and populate postal code from geocodes', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { name: 'Bío-Bío', code: { '2digit': 'BI' } },
                zip_codes: [{ zip_code: '4030000', locality: 'Concepción' }],
            }],
        });

        const result = await resolveAddress(
            { country: 'CL', city: 'concepcion' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toEqual({
            country: 'CL',
            city: 'Concepción',
            state: 'BI',
            postalCode: '4030000',
        });
    });

    it('should not call carriers locate for CL addresses', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        await resolveAddress(
            { country: 'CL', city: 'Santiago' },
            client,
            MOCK_CONFIG,
        );

        expect(client.post).not.toHaveBeenCalled();
    });

    it('should not call locate for non-city-based countries like US', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{ locality: 'Miami', state: { code: { '2digit': 'FL' } } }],
        });

        await resolveAddress(
            { postalCode: '33101', country: 'US', city: 'Miami', state: 'FL' },
            client,
            MOCK_CONFIG,
        );

        expect(client.post).not.toHaveBeenCalled();
    });

    it('should skip geocode when no postal code is provided', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '76001000', name: 'Cali', state: 'VA' },
        });

        const result = await resolveAddress(
            { country: 'CO', city: 'Cali', state: 'VAC' },
            client,
            MOCK_CONFIG,
        );

        expect(client.get).not.toHaveBeenCalled();
        expect(result.city).toBe('76001000');
        expect(result.postalCode).toBe('76001000');
    });

    it('should return only country when no postal code and no city/state', async () => {
        const result = await resolveAddress(
            { country: 'MX' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toEqual({ country: 'MX' });
        expect(client.get).not.toHaveBeenCalled();
        expect(client.post).not.toHaveBeenCalled();
    });

    it('should skip CO locate when city is missing', async () => {
        const result = await resolveAddress(
            { country: 'CO', state: 'DC' },
            client,
            MOCK_CONFIG,
        );

        expect(client.post).not.toHaveBeenCalled();
        expect(result.state).toBe('DC');
    });

    it('should attempt CO locate when city is provided but state is missing', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '11001000', name: 'Bogotá', state: 'DC' },
        });

        const result = await resolveAddress(
            { country: 'CO', city: 'Bogota' },
            client,
            MOCK_CONFIG,
        );

        expect(client.post).toHaveBeenCalledWith(
            expect.stringContaining('/locate'),
            expect.objectContaining({ city: 'Bogota', state: '', country: 'CO' }),
        );
        expect(result.city).toBe('11001000');
        expect(result.state).toBe('DC');
        expect(result.postalCode).toBe('11001000');
    });

    it('should fall back to original city when CO locate fails without state', async () => {
        vi.mocked(client.post).mockResolvedValue({
            ok: false,
            status: 500,
            data: null,
        } as ApiResponse<null>);

        const result = await resolveAddress(
            { country: 'CO', city: 'Bogota' },
            client,
            MOCK_CONFIG,
        );

        expect(result.city).toBe('Bogota');
    });

    it('should uppercase lowercase country codes', async () => {
        vi.mocked(client.get).mockResolvedValue({ ok: true, status: 200, data: [] });

        const result = await resolveAddress(
            { postalCode: '64000', country: 'mx' },
            client,
            MOCK_CONFIG,
        );

        expect(result.country).toBe('MX');
    });

    it('should handle CO with postal code and city — geocode then locate', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{ locality: 'Bogotá', state: { code: { '2digit': 'DC' } } }],
        });
        vi.mocked(client.post).mockResolvedValue({
            ok: true,
            status: 200,
            data: { city: '11001000', name: 'Bogotá', state: 'DC' },
        });

        const result = await resolveAddress(
            { postalCode: '110111', country: 'CO', city: 'Bogota', state: 'DC' },
            client,
            MOCK_CONFIG,
        );

        expect(client.get).toHaveBeenCalled();
        expect(client.post).toHaveBeenCalled();
        expect(result.city).toBe('11001000');
        expect(result.postalCode).toBe('110111');
    });

    it('should fall back gracefully when geocodes locate fails for CL', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: false,
            status: 500,
            data: {},
            error: 'Server error',
        });

        const result = await resolveAddress(
            { country: 'CL', city: 'Santiago' },
            client,
            MOCK_CONFIG,
        );

        expect(result.city).toBe('Santiago');
        expect(result.state).toBeUndefined();
        expect(result.postalCode).toBeUndefined();
    });

    it('should not overwrite explicit postal code with geocodes result for CL', async () => {
        vi.mocked(client.get).mockResolvedValue({
            ok: true,
            status: 200,
            data: [{
                state: { code: { '2digit': 'RM' } },
                zip_codes: [{ zip_code: '8320000', locality: 'Santiago' }],
            }],
        });

        const result = await resolveAddress(
            { country: 'CL', city: 'Santiago', postalCode: '9999999' },
            client,
            MOCK_CONFIG,
        );

        expect(result.postalCode).toBe('9999999');
        expect(result.state).toBe('RM');
    });
});
