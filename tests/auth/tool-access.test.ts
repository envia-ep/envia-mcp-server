import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    ANONYMOUS_FALLBACK_DISCLAIMER,
    asPublicCatalogTool,
    isUsingServerApiKeyFallback,
    PUBLIC_CATALOG_SECURITY_SCHEMES,
    resolvePublicCatalogClient,
    withAnonymousFallbackDisclaimer,
} from '../../src/auth/tool-access.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import type { EnviaConfig } from '../../src/config.js';

const anonymousConfig: EnviaConfig = {
    apiKey: '',
    serverApiKey: 'server-catalog-key',
    environment: 'sandbox',
    shippingBase: 'https://api-test.envia.com',
    queriesBase: 'https://queries-test.envia.com',
    geocodesBase: 'https://geocodes.envia.com',
};

describe('asPublicCatalogTool', () => {
    it('should advertise noauth so catalog tools work without OAuth', () => {
        const marked = asPublicCatalogTool({
            description: 'List carriers',
        });

        expect(marked.securitySchemes).toEqual(PUBLIC_CATALOG_SECURITY_SCHEMES);
        expect(marked._meta.securitySchemes).toEqual(PUBLIC_CATALOG_SECURITY_SCHEMES);
    });
});

describe('resolvePublicCatalogClient', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should inherit serverApiKey when the request has no user credential', async () => {
        const requestClient = new EnviaApiClient(anonymousConfig);
        const catalogClient = resolvePublicCatalogClient(requestClient, undefined, anonymousConfig);
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

        await catalogClient.get(`${anonymousConfig.queriesBase}/available-carrier/MX/0`);

        const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer server-catalog-key');
    });

    it('should prefer a per-request api_key override over serverApiKey', async () => {
        const requestClient = new EnviaApiClient(anonymousConfig);
        const catalogClient = resolvePublicCatalogClient(requestClient, 'user-override-key', anonymousConfig);
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

        await catalogClient.get(`${anonymousConfig.queriesBase}/available-carrier/MX/0`);

        const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer user-override-key');
    });
});

describe('isUsingServerApiKeyFallback', () => {
    it('should return true when the request has no user credential and ENVIA_API_KEY is set', () => {
        expect(isUsingServerApiKeyFallback(undefined, anonymousConfig)).toBe(true);
    });

    it('should return false when the user sends an api_key override', () => {
        expect(isUsingServerApiKeyFallback('user-override-key', anonymousConfig)).toBe(false);
    });

    it('should return false when the request already has a user OAuth token', () => {
        const authenticatedConfig: EnviaConfig = {
            ...anonymousConfig,
            apiKey: 'user-oauth-token',
        };

        expect(isUsingServerApiKeyFallback(undefined, authenticatedConfig)).toBe(false);
    });

    it('should return true when api_key is whitespace-only and ENVIA_API_KEY is set', () => {
        expect(isUsingServerApiKeyFallback('   ', anonymousConfig)).toBe(true);
    });

    it('should return false when there is no ENVIA_API_KEY to inherit', () => {
        const noServerKey: EnviaConfig = { ...anonymousConfig, serverApiKey: undefined };

        expect(isUsingServerApiKeyFallback(undefined, noServerKey)).toBe(false);
    });
});

describe('withAnonymousFallbackDisclaimer', () => {
    it('should mention that availability and pricing may vary and encourage authentication', () => {
        expect(ANONYMOUS_FALLBACK_DISCLAIMER).toContain('Service availability and pricing');
        expect(ANONYMOUS_FALLBACK_DISCLAIMER).toContain('assigned rates');
        expect(ANONYMOUS_FALLBACK_DISCLAIMER).toMatch(/Sign in|API key/i);
    });

    it('should prepend the disclaimer when the request falls back to ENVIA_API_KEY', () => {
        const result = withAnonymousFallbackDisclaimer('Found 2 rate(s).', undefined, anonymousConfig);

        expect(result.startsWith(ANONYMOUS_FALLBACK_DISCLAIMER)).toBe(true);
        expect(result).toContain('Found 2 rate(s).');
    });

    it('should leave the text unchanged when the user is authenticated', () => {
        const authenticatedConfig: EnviaConfig = {
            ...anonymousConfig,
            apiKey: 'user-oauth-token',
        };
        const body = 'Found 2 rate(s).';

        expect(withAnonymousFallbackDisclaimer(body, undefined, authenticatedConfig)).toBe(body);
    });
});
