import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnviaApiClient, resolveClient } from '../../src/utils/api-client.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';

describe('resolveClient', () => {
    let defaultClient: EnviaApiClient;

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        defaultClient = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return the default client when apiKey is undefined', () => {
        const result = resolveClient(defaultClient, undefined, MOCK_CONFIG);

        expect(result).toBe(defaultClient);
    });

    it('should return the default client when apiKey is empty string', () => {
        const result = resolveClient(defaultClient, '', MOCK_CONFIG);

        expect(result).toBe(defaultClient);
    });

    it('should return the default client when apiKey matches the config key', () => {
        const result = resolveClient(defaultClient, MOCK_CONFIG.apiKey, MOCK_CONFIG);

        expect(result).toBe(defaultClient);
    });

    it('should return the default client when trimmed apiKey matches the config key', () => {
        const result = resolveClient(defaultClient, `  ${MOCK_CONFIG.apiKey}  `, MOCK_CONFIG);

        expect(result).toBe(defaultClient);
    });

    it('should return a new client when apiKey differs from the config key', () => {
        const result = resolveClient(defaultClient, 'override-key-99999', MOCK_CONFIG);

        expect(result).not.toBe(defaultClient);
        expect(result).toBeInstanceOf(EnviaApiClient);
    });

    it('should use the overridden key in the new client Authorization header', async () => {
        const overrideKey = 'override-key-99999';
        const newClient = resolveClient(defaultClient, overrideKey, MOCK_CONFIG);
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

        await newClient.get(`${MOCK_CONFIG.shippingBase}/test`);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [, init] = mockFetch.mock.calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${overrideKey}`);
    });

    it('should trim whitespace from the override key', async () => {
        const overrideKey = '  padded-key-12345  ';
        const newClient = resolveClient(defaultClient, overrideKey, MOCK_CONFIG);
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

        await newClient.get(`${MOCK_CONFIG.shippingBase}/test`);

        const [, init] = mockFetch.mock.calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer padded-key-12345');
    });
});
