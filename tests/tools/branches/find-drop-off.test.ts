/**
 * Unit tests for envia_find_drop_off — POST /ship/branches wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerFindDropOff } from '../../../src/tools/branches/find-drop-off.js';

// =============================================================================
// Factories
// =============================================================================

function makeBranchResult(overrides: Record<string, unknown> = {}) {
    return {
        name: 'FedEx Centro MTY',
        code: 'MTY01',
        address: 'Pino Suarez 400',
        city: 'Monterrey',
        state: 'NL',
        country: 'MX',
        zipCode: '64400',
        capacity: 3,
        distance: 1.5,
        phone: '+52 81 1234 5678',
        ...overrides,
    };
}

function makeApiResponse(branches: unknown[] = [makeBranchResult()]) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(branches),
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_find_drop_off', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse());
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerFindDropOff(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_find_drop_off')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted branch list when API returns array
    // -------------------------------------------------------------------------
    it('should return formatted branch list when API returns array', async () => {
        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('FedEx Centro MTY');
        expect(text).toContain('MTY01');
        expect(text).toContain('Monterrey');
    });

    // -------------------------------------------------------------------------
    // 2. should handle { data: [...] } response shape
    // -------------------------------------------------------------------------
    it('should handle wrapped { data: [...] } response shape', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [makeBranchResult({ name: 'DHL HUB' })] }),
        });

        const result = await handler({ carrier: 'dhl' });
        const text = result.content[0].text;

        expect(text).toContain('DHL HUB');
    });

    // -------------------------------------------------------------------------
    // 3. should display capacity label for capacity=3
    // -------------------------------------------------------------------------
    it('should display "Receiving & Delivering" for capacity 3', async () => {
        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('Receiving & Delivering');
    });

    // -------------------------------------------------------------------------
    // 4. should display "Receiving" label for capacity=1
    // -------------------------------------------------------------------------
    it('should display "Receiving" label for capacity 1', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse([makeBranchResult({ capacity: 1 })]));

        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('Receiving');
        expect(text).not.toContain('Delivering');
    });

    // -------------------------------------------------------------------------
    // 5. should display distance when present
    // -------------------------------------------------------------------------
    it('should display distance in the formatted output', async () => {
        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('1.5 km');
    });

    // -------------------------------------------------------------------------
    // 6. should include found count header
    // -------------------------------------------------------------------------
    it('should include branch count in the header', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse([makeBranchResult(), makeBranchResult({ name: 'FedEx Norte', code: 'MTY02' })]),
        );

        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('2 branch(es)');
    });

    // -------------------------------------------------------------------------
    // 7. should return "no branches found" when API returns empty array
    // -------------------------------------------------------------------------
    it('should return "no branches found" when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse([]));

        const result = await handler({ carrier: 'fedex', country_code: 'MX', zip_code: '64000' });
        const text = result.content[0].text;

        expect(text).toContain('No branches found');
        expect(text).toContain('FEDEX');
        expect(text).toContain('MX');
        expect(text).toContain('64000');
    });

    // -------------------------------------------------------------------------
    // 8. should return error text on API failure
    // -------------------------------------------------------------------------
    it('should return error text on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ message: 'Unprocessable Entity' }),
        });

        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text.length).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------------------
    // 9. should POST to /ship/branches with carrier in body
    // -------------------------------------------------------------------------
    it('should POST to the correct URL with carrier in request body', async () => {
        await handler({ carrier: 'FedEx' });

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain('/ship/branches');
        expect(init.method).toBe('POST');

        const body = JSON.parse(init.body as string);
        expect(body.carrier).toBe('fedex');
    });

    // -------------------------------------------------------------------------
    // 10. should send capacity as a number when provided
    // -------------------------------------------------------------------------
    it('should send capacity as a number in the request body', async () => {
        await handler({ carrier: 'fedex', capacity: '1' });

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init.body as string);

        expect(body.capacity).toBe(1);
        expect(typeof body.capacity).toBe('number');
    });

    // -------------------------------------------------------------------------
    // 11. should include country_code when provided
    // -------------------------------------------------------------------------
    it('should send countryCodeCoverage in body when country_code is given', async () => {
        await handler({ carrier: 'fedex', country_code: 'mx' });

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init.body as string);

        expect(body.countryCodeCoverage).toBe('MX');
    });

    // -------------------------------------------------------------------------
    // 12. should include guidance to use branch_code in create_shipment
    // -------------------------------------------------------------------------
    it('should include branch_code guidance in output', async () => {
        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('branch_code');
    });

    // -------------------------------------------------------------------------
    // 13. should handle API returning non-array non-object gracefully
    // -------------------------------------------------------------------------
    it('should treat null response as empty branches', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(null),
        });

        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('No branches found');
    });

    // -------------------------------------------------------------------------
    // 14. Coverage gap audit: capacity outside the known table → "Type N" fallback
    // -------------------------------------------------------------------------
    it('should fall back to "Type N" label when capacity is not in the known map', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ name: 'Branch X', capacity: 99 }]),
        });

        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        expect(text).toContain('Type 99');
    });

    // -------------------------------------------------------------------------
    // 15. Coverage gap audit: missing name field renders the "—" placeholder
    // -------------------------------------------------------------------------
    it('should render "—" placeholder when branch name is missing', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ code: 'XYZ-001', city: 'Mexico City' }]),
        });

        const result = await handler({ carrier: 'fedex' });
        const text = result.content[0].text;

        // Index "1." precedes the name dash; the bracketed code follows it
        expect(text).toContain('1. —');
        expect(text).toContain('[XYZ-001]');
    });
});
