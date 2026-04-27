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
    applyCanaryIslandsOverride,
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

    it('should override ES → IC when destination postal code starts with 35 (Las Palmas)', () => {
        const out = normaliseLocationPair({
            country_code: 'ES',
            state_code: 'ES-CN',
            postal_code: '35001',
        });

        expect(out.country_code).toBe('IC');
        expect(out.postal_code).toBe('35001');
    });

    it('should override ES → IC when destination postal code starts with 38 (Tenerife)', () => {
        const out = normaliseLocationPair({
            country_code: 'ES',
            state_code: 'ES-TF',
            postal_code: '38001',
        });

        expect(out.country_code).toBe('IC');
    });

    // --- MX state remap integration ---

    it('should remap legacy MX state code DF → CX before sending to geocodes', () => {
        const out = normaliseLocationPair({ country_code: 'MX', state_code: 'DF' });

        expect(out.state_code).toBe('CX');
        expect(out.country_code).toBe('MX');
    });

    it('should remap legacy MX state code BN → BC', () => {
        const out = normaliseLocationPair({ country_code: 'MX', state_code: 'BN' });

        expect(out.state_code).toBe('BC');
    });

    it('should NOT remap state codes for non-MX countries (GJ stays GJ for GT country)', () => {
        const out = normaliseLocationPair({ country_code: 'GT', state_code: 'GJ' });

        expect(out.state_code).toBe('GJ');
    });

    it('should leave canonical MX state codes unchanged (NL stays NL)', () => {
        const out = normaliseLocationPair({ country_code: 'MX', state_code: 'NL' });

        expect(out.state_code).toBe('NL');
    });
});

describe('applyCanaryIslandsOverride', () => {
    it('should return IC for ES + Las Palmas postal codes (35xxx)', () => {
        expect(applyCanaryIslandsOverride('ES', '35001')).toBe('IC');
    });

    it('should return IC for ES + Tenerife postal codes (38xxx)', () => {
        expect(applyCanaryIslandsOverride('ES', '38001')).toBe('IC');
    });

    it('should return ES for ES + Madrid postal codes (28xxx)', () => {
        expect(applyCanaryIslandsOverride('ES', '28001')).toBe('ES');
    });

    it('should return ES for ES + Ceuta postal codes (51xxx)', () => {
        // Ceuta is an exceptional territory but the carriers backend
        // override only handles Canarias (CP 35/38). Ceuta/Melilla
        // are tracked separately in EXCEPTIONAL_TERRITORIES — not part
        // of this override.
        expect(applyCanaryIslandsOverride('ES', '51001')).toBe('ES');
    });

    it('should leave non-ES countries untouched even with 35xxx postal codes', () => {
        // CP 35xxx exists in many countries (e.g. Mexico Coahuila,
        // Italy Padova). The override is gated on country='ES'.
        expect(applyCanaryIslandsOverride('MX', '35020')).toBe('MX');
        expect(applyCanaryIslandsOverride('IT', '35100')).toBe('IT');
    });

    it('should return ES when postal code is undefined', () => {
        expect(applyCanaryIslandsOverride('ES', undefined)).toBe('ES');
    });

    it('should return ES when postal code is shorter than 2 chars', () => {
        expect(applyCanaryIslandsOverride('ES', '3')).toBe('ES');
    });

    it('should not match ES + a 35-prefix that lives in a longer postal (e.g. 35XXX continental)', () => {
        // Defensive: the carriers backend rule is "starts with 35 or 38",
        // not "is 5 chars long". Continental Spain has no 35xxx/38xxx
        // postal codes today (per official Correos numbering plan), so
        // this is purely a regression guard against future numbering
        // changes.
        expect(applyCanaryIslandsOverride('ES', '35999')).toBe('IC');
        expect(applyCanaryIslandsOverride('ES', '38500')).toBe('IC');
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

    it('should send country=IC when destination is ES + Canarias postal code', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                applyTaxes: false, includeBOL: true,
                isInternalEU: false, isInternalGB: false, isInternalUK: false,
            }),
        });

        await getAddressRequirements(client, {
            origin: { country_code: 'ES', state_code: 'ES-MD', postal_code: '28001' },
            destination: { country_code: 'ES', state_code: 'ES-CN', postal_code: '35001' },
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.origin.country_code).toBe('ES');
        expect(body.destination.country_code).toBe('IC');
    });

    it('should also override origin when origin is ES + Canarias postal code', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                applyTaxes: false, includeBOL: true,
                isInternalEU: false, isInternalGB: false, isInternalUK: false,
            }),
        });

        await getAddressRequirements(client, {
            origin: { country_code: 'ES', state_code: 'ES-CN', postal_code: '35001' },
            destination: { country_code: 'ES', state_code: 'ES-MD', postal_code: '28001' },
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.origin.country_code).toBe('IC');
        expect(body.destination.country_code).toBe('ES');
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
