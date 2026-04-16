/**
 * Unit tests for geocodes helpers — address requirements, DANE resolver,
 * Brazil ICMS lookup. These are internal helpers not exposed as MCP tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getAddressRequirements,
    resolveDaneCode,
    getBrazilIcms,
    normaliseLocationPair,
    DANE_CODE_PATTERN,
} from '../../src/services/geocodes-helpers.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';

const GEOCODES_BASE = 'https://geocodes.envia.com';

describe('normaliseLocationPair', () => {
    it('should uppercase country and state codes', () => {
        const out = normaliseLocationPair({ country_code: 'mx', state_code: 'nl' });

        expect(out).toEqual({ country_code: 'MX', state_code: 'NL' });
    });

    it('should include postal_code when provided and non-empty', () => {
        const out = normaliseLocationPair({ country_code: 'es', state_code: '35', postal_code: '35001' });

        expect(out.postal_code).toBe('35001');
    });

    it('should omit postal_code when empty string', () => {
        const out = normaliseLocationPair({ country_code: 'mx', state_code: 'nl', postal_code: '' });

        expect(out.postal_code).toBeUndefined();
    });

    it('should trim postal_code whitespace', () => {
        const out = normaliseLocationPair({ country_code: 'mx', state_code: 'nl', postal_code: ' 64000 ' });

        expect(out.postal_code).toBe('64000');
    });
});

describe('getAddressRequirements', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should POST to /location-requirements with normalised input', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ applyTaxes: true, includeBOL: false, isInternalEU: false, isInternalGB: false, isInternalUK: false }),
        });

        await getAddressRequirements(client, {
            origin: { country_code: 'mx', state_code: 'nl' },
            destination: { country_code: 'mx', state_code: 'cx' },
        });

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${GEOCODES_BASE}/location-requirements`);
        const body = JSON.parse(opts.body);
        expect(body.origin.country_code).toBe('MX');
    });

    it('should return the parsed requirements on success', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ applyTaxes: false, includeBOL: true, isInternalEU: false, isInternalGB: false, isInternalUK: false }),
        });

        const res = await getAddressRequirements(client, {
            origin: { country_code: 'MX', state_code: 'NL' },
            destination: { country_code: 'US', state_code: 'TX' },
        });

        expect(res.data).toEqual({ applyTaxes: false, includeBOL: true, isInternalEU: false, isInternalGB: false, isInternalUK: false });
    });

    it('should surface ok=false when backend rejects input', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Invalid payload' }),
        });

        const res = await getAddressRequirements(client, {
            origin: { country_code: 'XX', state_code: 'YY' },
            destination: { country_code: 'XX', state_code: 'YY' },
        });

        expect(res.ok).toBe(false);
    });
});

describe('resolveDaneCode', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return the input unchanged when it already looks like a DANE code', async () => {
        const result = await resolveDaneCode(client, '11001000');

        expect(result).toBe('11001000');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call /locate/CO/{city} when no state hint is provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ zip: '11001000', locality: 'Bogotá' }]),
        });

        await resolveDaneCode(client, 'Bogotá');

        expect(mockFetch.mock.calls[0][0]).toBe(`${GEOCODES_BASE}/locate/CO/Bogot%C3%A1`);
    });

    it('should call /locate/CO/{state}/{city} when state hint is provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ zip: '05001000' }]),
        });

        await resolveDaneCode(client, 'Medellin', 'ANT');

        expect(mockFetch.mock.calls[0][0]).toBe(`${GEOCODES_BASE}/locate/CO/ANT/Medellin`);
    });

    it('should return the DANE code from the first match in an array response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ zip: '76001000', locality: 'Cali' }, { zip: '76002000' }]),
        });

        const result = await resolveDaneCode(client, 'Cali');

        expect(result).toBe('76001000');
    });

    it('should return null when the response is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
        });

        const result = await resolveDaneCode(client, 'Unknownville');

        expect(result).toBeNull();
    });

    it('should return null when the backend call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
        });

        const result = await resolveDaneCode(client, 'Bogotá');

        expect(result).toBeNull();
    });

    it('should return null for an empty input', async () => {
        const result = await resolveDaneCode(client, '   ');

        expect(result).toBeNull();
    });
});

describe('getBrazilIcms', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call GET /brazil/icms/{origin}/{destination} uppercased', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ value: '12.00' }),
        });

        await getBrazilIcms(client, 'sp', 'rj');

        expect(mockFetch.mock.calls[0][0]).toBe(`${GEOCODES_BASE}/brazil/icms/SP/RJ`);
    });

    it('should parse the numeric ICMS rate from the string response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ value: '12.00' }),
        });

        const result = await getBrazilIcms(client, 'SP', 'RJ');

        expect(result).toBe(12);
    });

    it('should return null when origin state code is not 2 letters', async () => {
        const result = await getBrazilIcms(client, 'SPP', 'RJ');

        expect(result).toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null when backend returns ok=false', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
        });

        const result = await getBrazilIcms(client, 'SP', 'XX');

        expect(result).toBeNull();
    });

    it('should return null when value cannot be parsed as number', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ value: 'not-a-number' }),
        });

        const result = await getBrazilIcms(client, 'SP', 'RJ');

        expect(result).toBeNull();
    });
});

describe('DANE_CODE_PATTERN', () => {
    it('should match a 5-digit code', () => {
        expect(DANE_CODE_PATTERN.test('11001')).toBe(true);
    });

    it('should match an 8-digit code', () => {
        expect(DANE_CODE_PATTERN.test('11001000')).toBe(true);
    });

    it('should NOT match a city name', () => {
        expect(DANE_CODE_PATTERN.test('Bogota')).toBe(false);
    });

    it('should NOT match a 4-digit code', () => {
        expect(DANE_CODE_PATTERN.test('1100')).toBe(false);
    });
});
