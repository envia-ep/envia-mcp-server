/**
 * Unit tests for envia_get_shipment_invoices.
 *
 * Backend: GET /shipments/invoices. Verified live 2026-04-27. Notes:
 *   - Response uses DataTables-style `recordsTotal` / `recordsFiltered`,
 *     NOT the `total` field that other list endpoints use.
 *   - Field for shipment count is `total_shipments`, NOT `shipments_amount`.
 *
 * These tests guard the regression where the formatter rendered "—" for
 * shipment counts because it read the wrong field name and the wrong
 * total wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetShipmentInvoices } from '../../../src/tools/shipments/get-shipment-invoices.js';

// =============================================================================
// Factories
// =============================================================================

/** Build an invoice record matching the live sandbox shape (2026-04-27). */
function makeInvoice(overrides: Record<string, unknown> = {}) {
    return {
        id: 1234,
        month: '04',
        year: '2026',
        total: 1500.75,
        invoice_id: 'INV-2026-04-001',
        invoice_url: 'https://s3.example.com/inv-2026-04-001.pdf',
        total_shipments: 87,
        invoice_type_amount: 1450.00,
        tax_intermediacio_total: 50.75,
        invoiced_by: 'Envia',
        status: 'invoiced',
        ...overrides,
    };
}

/** Wrap with DataTables-style envelope (live shape). */
function makeListResponse(invoices: unknown[], extras: Record<string, unknown> = {}) {
    return {
        data: invoices,
        recordsTotal: invoices.length,
        recordsFiltered: invoices.length,
        ...extras,
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

describe('envia_get_shipment_invoices', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(
            makeApiResponse(makeListResponse([makeInvoice()])),
        );
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetShipmentInvoices(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_shipment_invoices')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Renders invoice header with id and period
    // -------------------------------------------------------------------------
    it('should render invoice id and period', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('INV-2026-04-001');
        expect(text).toContain('04/2026');
    });

    // -------------------------------------------------------------------------
    // 2. Renders shipments count from `total_shipments` (NOT shipments_amount)
    // -------------------------------------------------------------------------
    it('should render shipments count from total_shipments', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Shipments: 87');
    });

    // -------------------------------------------------------------------------
    // 3. Falls back to `shipments_amount` for legacy fixtures
    // -------------------------------------------------------------------------
    it('should fall back to shipments_amount when total_shipments is absent (legacy fixtures)', async () => {
        const legacy = {
            ...makeInvoice(),
            total_shipments: undefined,
            shipments_amount: 42,
        };
        mockFetch.mockResolvedValueOnce(makeApiResponse(makeListResponse([legacy])));

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Shipments: 42');
    });

    // -------------------------------------------------------------------------
    // 4. Renders "—" when both total_shipments and shipments_amount are absent
    // -------------------------------------------------------------------------
    it('should render — when neither shipment-count field is present', async () => {
        const noCount = { ...makeInvoice(), total_shipments: undefined, shipments_amount: undefined };
        mockFetch.mockResolvedValueOnce(makeApiResponse(makeListResponse([noCount])));

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Shipments: —');
    });

    // -------------------------------------------------------------------------
    // 5. Reads total count from `recordsTotal` (DataTables-style)
    // -------------------------------------------------------------------------
    it('should read total count from recordsTotal', async () => {
        mockFetch.mockResolvedValueOnce(
            makeApiResponse(
                makeListResponse([makeInvoice(), makeInvoice({ id: 2, invoice_id: 'INV-002' })], {
                    recordsTotal: 47,
                    recordsFiltered: 12,
                }),
            ),
        );

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Found 47 invoice(s)');
    });

    // -------------------------------------------------------------------------
    // 6. Falls back to recordsFiltered when recordsTotal is absent
    // -------------------------------------------------------------------------
    it('should fall back to recordsFiltered when recordsTotal is absent', async () => {
        const fixture = makeListResponse([makeInvoice()]) as Record<string, unknown>;
        delete fixture.recordsTotal;
        fixture.recordsFiltered = 3;
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Found 3 invoice(s)');
    });

    // -------------------------------------------------------------------------
    // 7. Falls back to records.length when neither total field is present
    // -------------------------------------------------------------------------
    it('should fall back to records.length when neither recordsTotal nor recordsFiltered is present', async () => {
        const fixture = { data: [makeInvoice(), makeInvoice({ id: 2 })] };
        mockFetch.mockResolvedValueOnce(makeApiResponse(fixture));

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Found 2 invoice(s)');
    });

    // -------------------------------------------------------------------------
    // 8. Empty data array → "no invoices found" message
    // -------------------------------------------------------------------------
    it('should return "no invoices found" message when data array is empty', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse(makeListResponse([])));

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('No invoices found');
    });

    // -------------------------------------------------------------------------
    // 9. Includes PDF URL when invoice_url is present
    // -------------------------------------------------------------------------
    it('should include the PDF URL when invoice_url is present', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('PDF: https://s3.example.com/inv-2026-04-001.pdf');
    });

    // -------------------------------------------------------------------------
    // 10. URL is queriesBase + /shipments/invoices
    // -------------------------------------------------------------------------
    it('should call queriesBase + /shipments/invoices', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(MOCK_CONFIG.queriesBase);
        expect(url).toContain('/shipments/invoices');
    });
});
