/**
 * Unit tests for envia_get_additional_service_prices — GET /additional-services/prices/{service_id}.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../helpers/mock-server.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { registerGetAdditionalServicePrices } from '../../src/tools/get-additional-service-prices.js';

// =============================================================================
// Factories
// =============================================================================

function makePriceRow(overrides: Partial<{
    service_id: number;
    id: number;
    name: string;
    description: string;
    currency: string;
    currency_symbol: string;
    apply_to: string;
    custom_id: number | null;
    amount: number;
    minimum_amount: number | null;
    operation_id: number;
    is_custom: boolean;
    operator: string;
}> = {}) {
    return {
        service_id: 42,
        id: 1,
        name: 'Insurance',
        description: 'Covers declared value',
        currency: 'MXN',
        currency_symbol: '$',
        apply_to: 'shipment',
        custom_id: null,
        amount: 50,
        minimum_amount: null,
        operation_id: 1,
        is_custom: false,
        operator: '%',
        ...overrides,
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

describe('envia_get_additional_service_prices', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse([makePriceRow()]));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetAdditionalServicePrices(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_additional_service_prices')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted price rows on success
    // -------------------------------------------------------------------------
    it('should return formatted price rows on success', async () => {
        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('Insurance');
        expect(text).toContain('$50');
        expect(text).toContain('Covers declared value');
    });

    // -------------------------------------------------------------------------
    // 2. should call the correct URL with service_id in the path
    // -------------------------------------------------------------------------
    it('should call the correct URL with service_id in path', async () => {
        await handler({ service_id: 42 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/additional-services/prices/42');
    });

    // -------------------------------------------------------------------------
    // 3. should call the queriesBase URL
    // -------------------------------------------------------------------------
    it('should call the queries service base URL', async () => {
        await handler({ service_id: 7 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(MOCK_CONFIG.queriesBase);
    });

    // -------------------------------------------------------------------------
    // 4. should include currency in the header line
    // -------------------------------------------------------------------------
    it('should include currency identifier in the output header', async () => {
        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('MXN');
    });

    // -------------------------------------------------------------------------
    // 5. should flag custom rows with [custom] badge
    // -------------------------------------------------------------------------
    it('should flag custom rows with [custom] badge', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse([makePriceRow({ is_custom: true, name: 'MyInsurance' })]),
        );

        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('[custom]');
    });

    // -------------------------------------------------------------------------
    // 6. should include minimum_amount when present
    // -------------------------------------------------------------------------
    it('should include minimum_amount in output when non-null', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse([makePriceRow({ minimum_amount: 20 })]),
        );

        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('min $20');
    });

    // -------------------------------------------------------------------------
    // 7. should return "no prices found" message when API returns empty array
    // -------------------------------------------------------------------------
    it('should return "no prices found" when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse([]));

        const result = await handler({ service_id: 99 });
        const text = result.content[0].text;

        expect(text).toContain('No additional service prices found');
        expect(text).toContain('99');
    });

    // -------------------------------------------------------------------------
    // 8. should return error text on API failure
    // -------------------------------------------------------------------------
    it('should return error text on API failure', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse({ message: 'Unauthorized' }, false, 401));

        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text.length).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------------------
    // 9. should handle API returning non-array gracefully
    // -------------------------------------------------------------------------
    it('should treat non-array API response as empty list', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse(null));

        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('No additional service prices found');
    });

    // -------------------------------------------------------------------------
    // 10. should include add-ons guidance in output
    // -------------------------------------------------------------------------
    it('should include guidance to use names via additional_services parameter', async () => {
        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('additional_services');
    });

    // -------------------------------------------------------------------------
    // 11. should display multiple rows when API returns multiple entries
    // -------------------------------------------------------------------------
    it('should display all rows when API returns multiple entries', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse([
                makePriceRow({ name: 'Insurance' }),
                makePriceRow({ id: 2, name: 'COD', amount: 30 }),
            ]),
        );

        const result = await handler({ service_id: 42 });
        const text = result.content[0].text;

        expect(text).toContain('Insurance');
        expect(text).toContain('COD');
    });
});
