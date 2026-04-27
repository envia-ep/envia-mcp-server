/**
 * Unit tests for envia_ai_address_requirements — GET /ai/shipping/address-requirements/{country}.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerAiAddressRequirements } from '../../../src/tools/ai-shipping/address-requirements.js';

// =============================================================================
// Factories
// =============================================================================

function makeRequirementsResponse() {
    return {
        required: ['street', 'number', 'city', 'state', 'postal_code'],
        optional: ['neighborhood', 'references'],
        postal_code_format: '\\d{5}',
    };
}

function makeApiResponse(data: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        json: () => Promise.resolve(data),
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_ai_address_requirements', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse(makeRequirementsResponse()));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerAiAddressRequirements(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_ai_address_requirements')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return requirements JSON in formatted output
    // -------------------------------------------------------------------------
    it('should return address requirements JSON in formatted output', async () => {
        const result = await handler({ country: 'MX' });
        const text = result.content[0].text;

        expect(text).toContain('Address requirements for MX');
        expect(text).toContain('street');
        expect(text).toContain('postal_code');
    });

    // -------------------------------------------------------------------------
    // 2. should uppercase the country code in the URL
    // -------------------------------------------------------------------------
    it('should uppercase the country code and include it in the URL', async () => {
        await handler({ country: 'mx' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/ai/shipping/address-requirements/MX');
    });

    // -------------------------------------------------------------------------
    // 3. should hit the queriesBase URL
    // -------------------------------------------------------------------------
    it('should call the queries service base URL', async () => {
        await handler({ country: 'CO' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(MOCK_CONFIG.queriesBase);
    });

    // -------------------------------------------------------------------------
    // 4. should return error text on API failure
    // -------------------------------------------------------------------------
    it('should return error text on API failure', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse({ message: 'Not found' }, false, 404));

        const result = await handler({ country: 'XX' });
        const text = result.content[0].text;

        expect(text.length).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------------------
    // 5. should return a fallback message when API returns null data
    // -------------------------------------------------------------------------
    it('should return fallback message when API returns null', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse(null));

        const result = await handler({ country: 'MX' });
        const text = result.content[0].text;

        expect(text).toContain('No address requirements returned');
        expect(text).toContain('MX');
    });

    // -------------------------------------------------------------------------
    // 6. should return string data as-is (not double-serialised)
    // -------------------------------------------------------------------------
    it('should return string API response without re-serialising', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse('required: [street, city]'));

        const result = await handler({ country: 'BR' });
        const text = result.content[0].text;

        expect(text).toContain('required: [street, city]');
    });

    // -------------------------------------------------------------------------
    // 7. should encode the country code in the URL path
    // -------------------------------------------------------------------------
    it('should URL-encode the country code in the path', async () => {
        await handler({ country: 'US' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/address-requirements/US');
    });
});
