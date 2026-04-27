/**
 * Unit tests for envia_get_shipments_status.
 *
 * Backend: GET /shipments/packages-information-by-status. Verified live
 * 2026-04-27: returns a FLAT object at the top level (NO `data` wrapper).
 * This test guards against the regression that earlier shipped (the tool
 * unwrapped `res.data?.data` which was always undefined, masking real
 * stats behind a generic "no statistics" message).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetShipmentsStatus } from '../../../src/tools/shipments/get-shipments-status.js';

// =============================================================================
// Factories
// =============================================================================

/** Build a flat-shape stats response matching the live sandbox 2026-04-27. */
function makeStatsResponse(overrides: Record<string, unknown> = {}) {
    return {
        packagesPendingShip: 12,
        packagesPendingPickUp: 5,
        packagesPickup: 8,
        percentagePickup: 6.4,
        packagesShipped: 45,
        percentageShipped: 36.0,
        packagesOutForDelivery: 18,
        percentageOutForDelivery: 14.4,
        packagesDeliveryFilter: 38,
        percentagePackagesDeliveryFilter: 30.4,
        packagesActiveAndDeliveryFilter: 52,
        packagesIssue: 3,
        percentageIssue: 2.4,
        packagesReturned: 1,
        percentageReturned: 0.8,
        dateFromMiddleware: '2026-04-01',
        dateTo: '2026-04-30',
        ...overrides,
    };
}

function makeApiResponse(payload: unknown, status = 200, ok = true) {
    return {
        ok,
        status,
        json: () => Promise.resolve(payload),
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_shipments_status', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse(makeStatsResponse()));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetShipmentsStatus(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_shipments_status')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Reads stats directly from res.data (flat object), NOT from res.data.data
    // -------------------------------------------------------------------------
    it('should read stats from the flat top-level response (no data wrapper)', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            date_from: '2026-04-01',
            date_to: '2026-04-30',
        });
        const text = result.content[0].text;

        expect(text).toContain('Pending ship:     12');
        expect(text).toContain('Pickup:           8');
        expect(text).toContain('In transit:       45');
        expect(text).toContain('Out for delivery: 18');
        expect(text).toContain('Delivered:        38');
        expect(text).toContain('Issues:           3');
        expect(text).toContain('Returned:         1');
    });

    // -------------------------------------------------------------------------
    // 2. Percentages render alongside counts
    // -------------------------------------------------------------------------
    it('should render percentages alongside counts', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            date_from: '2026-04-01',
            date_to: '2026-04-30',
        });
        const text = result.content[0].text;

        expect(text).toContain('(6.4%)');
        expect(text).toContain('(36%)');
        expect(text).toContain('(0.8%)');
    });

    // -------------------------------------------------------------------------
    // 3. Header includes the date range and (optional) carrier filter
    // -------------------------------------------------------------------------
    it('should include the date range and carrier filter in the header', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            date_from: '2026-04-01',
            date_to: '2026-04-30',
            carrier_name: 'fedex',
        });
        const text = result.content[0].text;

        expect(text).toContain('Period: 2026-04-01 to 2026-04-30');
        expect(text).toContain('(carrier: fedex)');
    });

    // -------------------------------------------------------------------------
    // 4. Empty object response → "no statistics" message
    // -------------------------------------------------------------------------
    it('should return a "no statistics" message when the response is an empty object', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse({}));

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            date_from: '2026-04-01',
            date_to: '2026-04-30',
        });
        const text = result.content[0].text;

        expect(text).toContain('No status statistics available');
    });

    // -------------------------------------------------------------------------
    // 5. Regression guard: earlier broken version unwrapped res.data.data —
    //    if a future refactor reintroduces it, the test below would fail because
    //    a wrapped fixture should NOT yield a populated stats block.
    // -------------------------------------------------------------------------
    it('should treat a wrapped { data: stats } payload as empty (the wrapper is the bug)', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse({ data: makeStatsResponse() }));

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            date_from: '2026-04-01',
            date_to: '2026-04-30',
        });
        const text = result.content[0].text;

        // The flat keys would not be at the top level when wrapped, so the
        // formatter sees keys like `data` and renders 0 for each metric.
        // Verify it did NOT silently skip with the old "no statistics" path.
        expect(text).not.toContain('No status statistics available');
        expect(text).toContain('Pending ship:     0');
    });

    // -------------------------------------------------------------------------
    // 6. URL is queriesBase + /shipments/packages-information-by-status
    // -------------------------------------------------------------------------
    it('should call queriesBase + /shipments/packages-information-by-status', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            date_from: '2026-04-01',
            date_to: '2026-04-30',
        });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(MOCK_CONFIG.queriesBase);
        expect(url).toContain('/shipments/packages-information-by-status');
    });
});
