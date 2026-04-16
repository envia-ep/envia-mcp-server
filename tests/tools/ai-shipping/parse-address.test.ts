/**
 * Unit tests for envia_ai_parse_address — formatter + tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerAiParseAddress, formatParsedAddress } from '../../../src/tools/ai-shipping/parse-address.js';

const SAMPLE_ADDRESS = {
    street: 'Av Insurgentes Sur 1458',
    number: '',
    postal_code: '03100',
    district: 'Del Valle Centro',
    city: 'Ciudad de México',
    state: 'CX',
    country: 'MX',
    name: 'Juan Pérez',
};

describe('formatParsedAddress', () => {
    it('should include the name when populated', () => {
        const output = formatParsedAddress(SAMPLE_ADDRESS);

        expect(output).toContain('Juan Pérez');
    });

    it('should include the postal code', () => {
        const output = formatParsedAddress(SAMPLE_ADDRESS);

        expect(output).toContain('03100');
    });

    it('should omit rows for empty fields', () => {
        const output = formatParsedAddress(SAMPLE_ADDRESS);

        expect(output).not.toContain('Company:');
        expect(output).not.toContain('Email:');
    });

    it('should include suggested districts when multiple suburbs are returned', () => {
        const output = formatParsedAddress({
            ...SAMPLE_ADDRESS,
            suburbs: ['Del Valle Centro', 'Insurgentes San Borja'],
        });

        expect(output).toContain('Suggested districts');
    });

    it('should NOT include suggested districts when only one suburb is returned', () => {
        const output = formatParsedAddress({ ...SAMPLE_ADDRESS, suburbs: ['Del Valle Centro'] });

        expect(output).not.toContain('Suggested districts');
    });
});

describe('envia_ai_parse_address handler', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerAiParseAddress(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_ai_parse_address')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should POST to /ai/shipping/parse-address with the trimmed text', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, data: SAMPLE_ADDRESS }),
        });

        await handler({ api_key: 'test-key', text: '  Juan Pérez, Insurgentes 1458, CDMX  ' });

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.queriesBase}/ai/shipping/parse-address`);
        expect(JSON.parse(opts.body).text).toBe('Juan Pérez, Insurgentes 1458, CDMX');
    });

    it('should uppercase the country hint when provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, data: SAMPLE_ADDRESS }),
        });

        await handler({ api_key: 'test-key', text: 'something', country: 'mx' });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.country).toBe('MX');
    });

    it('should omit the country field when not provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, data: SAMPLE_ADDRESS }),
        });

        await handler({ api_key: 'test-key', text: 'something' });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.country).toBeUndefined();
    });

    it('should return the formatted address on success', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, data: SAMPLE_ADDRESS }),
        });

        const result = await handler({ api_key: 'test-key', text: 'something' });

        expect(result.content[0].text).toContain('Parsed address');
    });

    it('should return mapped error text when backend fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Bad request' }),
        });

        const result = await handler({ api_key: 'test-key', text: 'something' });

        expect(result.content[0].text).toContain('Failed to parse address');
    });

    it('should treat success=false as an error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: false }),
        });

        const result = await handler({ api_key: 'test-key', text: 'something' });

        expect(result.content[0].text).toContain('Failed to parse address');
    });
});
