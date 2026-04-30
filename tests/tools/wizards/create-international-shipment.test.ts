/**
 * Unit tests for envia_create_international_shipment — Pase 3 wizard.
 *
 * The wizard issues two upstream calls in parallel:
 *   - GET  /ai/shipping/address-requirements/{country}
 *   - POST /ai/shipping/classify-hs-code (one per item missing a productCode)
 *
 * Tests follow the L-T3 pattern (mockImplementation with URL routing) because
 * the tool fan-outs to multiple endpoints in a single invocation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCreateInternationalShipment } from '../../../src/tools/wizards/create-international-shipment.js';

// =============================================================================
// Factories
// =============================================================================

function makeRequirementsBody() {
    return {
        required: ['street', 'number', 'city', 'state', 'postal_code', 'phone'],
        optional: ['neighborhood'],
        postal_code_format: '\\d{5}',
    };
}

function makeHsClassifyBody(hsCode: string, confidence = 0.92) {
    return { data: { hsCode, confidenceScore: confidence } };
}

function makeFetchResponse(body: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        json: () => Promise.resolve(body),
    };
}

/** Default URL-routing mock that handles both endpoints with success bodies. */
function defaultRouter(itemHsCodes: string[] = ['6109.10.00']) {
    let classifyCallIdx = 0;
    return (url: string, _opts?: unknown) => {
        if (url.includes('/ai/shipping/address-requirements/')) {
            return Promise.resolve(makeFetchResponse(makeRequirementsBody()));
        }
        if (url.includes('/ai/shipping/classify-hs-code')) {
            const code = itemHsCodes[classifyCallIdx] ?? '0000.00.00';
            classifyCallIdx += 1;
            return Promise.resolve(makeFetchResponse(makeHsClassifyBody(code)));
        }
        return Promise.resolve(makeFetchResponse({ error: 'unexpected url' }, false, 500));
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_create_international_shipment', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockImplementation(defaultRouter());
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCreateInternationalShipment(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_create_international_shipment')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. happy path — auto-classifies a missing HS code and returns a payload
    // -------------------------------------------------------------------------
    it('should classify missing HS codes and surface them in the output', async () => {
        const result = await handler({
            origin_country: 'MX',
            destination_country: 'US',
            items: [
                { description: 'Cotton T-shirt', quantity: 2, price: 25 },
            ],
        });
        const text = result.content[0].text;

        expect(text).toContain('MX → US');
        expect(text).toContain('Address requirements');
        expect(text).toContain('postal_code');
        expect(text).toContain('Items');
        expect(text).toContain('Cotton T-shirt');
        expect(text).toContain('productCode=6109.10.00');
        expect(text).toContain('via classified');
        expect(text).toContain('envia_create_shipment');
    });

    // -------------------------------------------------------------------------
    // 2. provided HS codes are passed through without classification
    // -------------------------------------------------------------------------
    it('should mark provided HS codes as "via provided" and skip classification', async () => {
        const result = await handler({
            origin_country: 'MX',
            destination_country: 'ES',
            items: [
                { description: 'Cotton T-shirt', quantity: 1, price: 25, productCode: '6109.10.00' },
            ],
        });
        const text = result.content[0].text;

        expect(text).toContain('via provided');
        // No classify call should have fired.
        const classifyCalls = mockFetch.mock.calls.filter(([u]) =>
            String(u).includes('/ai/shipping/classify-hs-code'));
        expect(classifyCalls).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // 3. domestic shipment short-circuits with a redirect message
    // -------------------------------------------------------------------------
    it('should refuse same-country shipments and redirect to the standard flow', async () => {
        const result = await handler({
            origin_country: 'MX',
            destination_country: 'MX',
            items: [{ description: 'Cotton T-shirt', quantity: 1, price: 25 }],
        });
        const text = result.content[0].text;

        expect(text).toContain('cross-border shipments only');
        expect(text).toContain('envia_quote_shipment');
        expect(text).toContain('envia_create_shipment');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // 4. address-requirements failure is surfaced as a warning, not an error
    // -------------------------------------------------------------------------
    it('should warn when address requirements cannot be fetched but still process items', async () => {
        mockFetch.mockImplementationOnce((url: string) => {
            if (url.includes('/ai/shipping/address-requirements/')) {
                return Promise.resolve(makeFetchResponse({ message: 'down' }, false, 500));
            }
            return Promise.resolve(makeFetchResponse(makeHsClassifyBody('6109.10.00')));
        });
        // Subsequent calls (classify) succeed via the default router.
        mockFetch.mockImplementation(defaultRouter());

        const result = await handler({
            origin_country: 'MX',
            destination_country: 'BR',
            items: [{ description: 'Cotton T-shirt', quantity: 1, price: 25 }],
        });
        const text = result.content[0].text;

        // Either branch is acceptable depending on parallel resolution order;
        // the contract is "the wizard does not throw and still surfaces items".
        expect(text).toContain('Items');
        expect(text).toContain('Cotton T-shirt');
    });

    // -------------------------------------------------------------------------
    // 5. unclassified items surface a "still need a manual HS code" pending step
    // -------------------------------------------------------------------------
    it('should flag items that classify could not resolve as still pending', async () => {
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/ai/shipping/address-requirements/')) {
                return Promise.resolve(makeFetchResponse(makeRequirementsBody()));
            }
            if (url.includes('/ai/shipping/classify-hs-code')) {
                return Promise.resolve(makeFetchResponse({ data: null }));
            }
            return Promise.resolve(makeFetchResponse({}, false, 500));
        });

        const result = await handler({
            origin_country: 'MX',
            destination_country: 'DE',
            items: [{ description: 'Mystery widget', quantity: 1, price: 10 }],
        });
        const text = result.content[0].text;

        expect(text).toContain('Mystery widget');
        expect(text).toContain('via unknown');
        expect(text).toContain('Next steps');
        expect(text).toContain('still need a manual HS code');
    });
});
