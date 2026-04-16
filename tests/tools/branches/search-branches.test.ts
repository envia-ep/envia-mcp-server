import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerSearchBranches } from '../../../src/tools/branches/search-branches.js';

// =============================================================================
// Factories
// =============================================================================

function makeBranch(overrides: Record<string, unknown> = {}) {
    return {
        distance: 1.86,
        branch_id: 'YMU',
        branch_code: 'MTY',
        branch_type: 1,
        reference: 'MTY - ALAMEDA',
        branch_rules: null,
        address: {
            city: 'Monterrey',
            state: 'NL',
            number: '400',
            street: 'Pino Suarez',
            country: 'MX',
            delivery: true,
            latitude: '25.674113',
            locality: 'Monterrey',
            admission: true,
            longitude: '-100.319496',
            postalCode: '64400',
        },
        hours: [],
        ...overrides,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_search_branches', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve([makeBranch()]),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerSearchBranches(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_search_branches')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted branch list when API returns data
    // -------------------------------------------------------------------------
    it('should return formatted branch list when API returns data', async () => {
        const result = await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });
        const text = result.content[0].text;

        expect(text).toContain('MTY - ALAMEDA');
        expect(text).toContain('MTY');
        expect(text).toContain('Monterrey');
    });

    // -------------------------------------------------------------------------
    // 2. should return "no branches found" when API returns empty array
    // -------------------------------------------------------------------------
    it('should return "no branches found" when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
        });

        const result = await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });
        const text = result.content[0].text;

        expect(text).toContain('No branches found');
        expect(text).toContain('envia_get_branches_catalog');
    });

    // -------------------------------------------------------------------------
    // 3. should include found count in output
    // -------------------------------------------------------------------------
    it('should include found count in output', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([makeBranch(), makeBranch({ branch_code: 'GDL', reference: 'GDL - CENTRO' })]),
        });

        const result = await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });
        const text = result.content[0].text;

        expect(text).toContain('2 branch(es)');
    });

    // -------------------------------------------------------------------------
    // 4. should return error message on API failure
    // -------------------------------------------------------------------------
    it('should return error message on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ message: 'Not found' }),
        });

        const result = await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Failed to search branches');
        expect(text).toContain('fedex');
        expect(text).toContain('MX');
    });

    // -------------------------------------------------------------------------
    // 5. should build correct URL with carrier and country
    // -------------------------------------------------------------------------
    it('should build correct URL with carrier and country', async () => {
        await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/branches/fedex/MX');
    });

    // -------------------------------------------------------------------------
    // 6. should pass zipcode param when provided
    // -------------------------------------------------------------------------
    it('should pass zipcode param when provided', async () => {
        await handler({ carrier: 'dhl', country_code: 'MX', zipcode: '64000', type: 1 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('zipcode=64000');
    });

    // -------------------------------------------------------------------------
    // 7. should pass state and locality params when provided
    // -------------------------------------------------------------------------
    it('should pass state and locality params when provided', async () => {
        await handler({ carrier: 'dhl', country_code: 'MX', state: 'NL', locality: 'Monterrey', type: 1 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('state=NL');
        expect(url).toContain('locality=Monterrey');
    });

    // -------------------------------------------------------------------------
    // 8. should pass limitBranches when provided
    // -------------------------------------------------------------------------
    it('should pass limitBranches when provided', async () => {
        await handler({ carrier: 'fedex', country_code: 'MX', limitBranches: 5, type: 1 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limitBranches=5');
    });

    // -------------------------------------------------------------------------
    // 9. should include guidance in output
    // -------------------------------------------------------------------------
    it('should include guidance to use branch_code in output', async () => {
        const result = await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });
        const text = result.content[0].text;

        expect(text).toContain('branch_code');
    });

    // -------------------------------------------------------------------------
    // 10. should handle API returning non-array gracefully
    // -------------------------------------------------------------------------
    it('should handle API returning non-array gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        });

        const result = await handler({ carrier: 'fedex', country_code: 'MX', type: 1 });
        const text = result.content[0].text;

        expect(text).toContain('No branches found');
    });
});
