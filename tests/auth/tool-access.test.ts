import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    asPublicCatalogTool,
    PUBLIC_CATALOG_SECURITY_SCHEMES,
    resolvePublicCatalogClient,
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
