/**
 * Unit tests for envia_get_shipment_detail.
 *
 * Backend: GET /guide/{tracking}. Verified live 2026-04-27.
 * Shape: `{ data: [record], total_rows }` — single record wrapped in a
 * one-element array. Carrier slug is `name` (no `carrier_name` here);
 * service slug is `service`. Addresses are flat `sender_*` / `consignee_*`
 * (no nested origin/destination on this endpoint).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetShipmentDetail } from '../../../src/tools/shipments/get-shipment-detail.js';

// =============================================================================
// Factories
// =============================================================================

/** Build a /guide/{tracking} record matching the live sandbox shape. */
function makeDetailRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: 170617,
        tracking_number: '9824458744',
        folio: null,
        status_id: 4,
        status: 'Canceled',
        carrier_id: 2,
        name: 'dhl',
        service_id: 7,
        service: 'express',
        sender_name: 'Almacen Test',
        sender_company_name: '-',
        sender_email: 'test@envia.com',
        sender_phone: '5512345678',
        sender_street: 'Insurgentes Sur',
        sender_number: '1602',
        sender_district: 'Credito Constructor',
        sender_city: 'Benito Juarez',
        sender_state: 'DF',
        sender_country: 'MX',
        sender_postalcode: '03940',
        consignee_name: 'Cliente Test',
        consignee_company_name: '-',
        consignee_email: 'cliente@test.com',
        consignee_phone: '3312345678',
        consignee_street: 'Vallarta',
        consignee_number: '100',
        consignee_district: 'Americana',
        consignee_city: 'Guadalajara',
        consignee_state: 'JAL',
        consignee_country: 'MX',
        consignee_postalcode: '44100',
        total: 10.43,
        currency: 'EUR',
        insurance_cost: 0,
        additional_services_cost: 0,
        grand_total: 14.28,
        created_at: '2026-04-27 13:27:18',
        shipped_at: null,
        delivered_at: null,
        label_file: 'https://s3.us-east-2.amazonaws.com/envia-staging/uploads/dhl/abc.pdf',
        created_by_name: 'Jose Vidrio',
        created_by_email: 'jose.vidrio@envia.com',
        ...overrides,
    };
}

function makeApiResponse(record: unknown | null) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(record === null ? { data: [], total_rows: 0 } : { data: [record], total_rows: 1 }),
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_get_shipment_detail', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse(makeDetailRecord()));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetShipmentDetail(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_shipment_detail')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Happy path: extracts the wrapped record and renders the tracking number
    // -------------------------------------------------------------------------
    it('should extract the wrapped record from data[0] and render the tracking number', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Shipment Detail: 9824458744');
    });

    // -------------------------------------------------------------------------
    // 2. Status (textual) and status_id are both rendered
    // -------------------------------------------------------------------------
    it('should render status text and status_id together', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Status:    Canceled (ID: 4)');
    });

    // -------------------------------------------------------------------------
    // 3. Carrier and service render from `name` / `service` slugs (NOT carrier_name)
    // -------------------------------------------------------------------------
    it('should render carrier and service from `name` and `service` slugs', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Carrier:   dhl / express');
    });

    // -------------------------------------------------------------------------
    // 4. Sender (origin) is read from FLAT sender_* fields
    // -------------------------------------------------------------------------
    it('should read origin from flat sender_* fields', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Almacen Test');
        expect(text).toContain('Insurgentes Sur 1602');
        expect(text).toContain('Benito Juarez, DF 03940');
        expect(text).toContain('5512345678');
    });

    // -------------------------------------------------------------------------
    // 5. Destination (consignee) is read from FLAT consignee_* fields
    // -------------------------------------------------------------------------
    it('should read destination from flat consignee_* fields', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Cliente Test');
        expect(text).toContain('Vallarta 100');
        expect(text).toContain('Guadalajara, JAL 44100');
        expect(text).toContain('3312345678');
    });

    // -------------------------------------------------------------------------
    // 6. Costs render with currency
    // -------------------------------------------------------------------------
    it('should render shipping, insurance, additional and grand total costs', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Grand Total');
        expect(text).toMatch(/14\.28/);
        expect(text).toContain('EUR');
    });

    // -------------------------------------------------------------------------
    // 7. Dates render with — for null fields
    // -------------------------------------------------------------------------
    it('should render dates and use — for null delivered_at and shipped_at', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Created:   2026-04-27 13:27:18');
        expect(text).toContain('Shipped:   —');
        expect(text).toContain('Delivered: —');
    });

    // -------------------------------------------------------------------------
    // 8. Label URL renders when present
    // -------------------------------------------------------------------------
    it('should render the label URL when label_file is present', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Label: https://s3.us-east-2.amazonaws.com');
    });

    // -------------------------------------------------------------------------
    // 9. Creator info renders from flat created_by_name / created_by_email
    // -------------------------------------------------------------------------
    it('should render creator info from flat created_by_name / created_by_email', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Created by: Jose Vidrio (jose.vidrio@envia.com)');
    });

    // -------------------------------------------------------------------------
    // 10. URL is built from queriesBase + /guide/{encoded tracking}
    // -------------------------------------------------------------------------
    it('should call queriesBase + /guide/{tracking_number}', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(MOCK_CONFIG.queriesBase);
        expect(url).toContain('/guide/9824458744');
    });

    // -------------------------------------------------------------------------
    // 11. Tracking number is URL-encoded so special characters are safe
    // -------------------------------------------------------------------------
    it('should URL-encode the tracking number', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: 'TRK 001' });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/guide/TRK%20001');
    });

    // -------------------------------------------------------------------------
    // 12. Empty data array returns the not-found message (NOT all-undefined)
    // -------------------------------------------------------------------------
    it('should return a not-found message when data array is empty', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse(null));

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: 'BOGUS' });
        const text = result.content[0].text;

        expect(text).toContain('No shipment found');
        expect(text).toContain('BOGUS');
        expect(text).not.toContain('undefined');
    });

    // -------------------------------------------------------------------------
    // 13. API failure (4xx, non-retryable) returns a mapped error with suggestion
    // -------------------------------------------------------------------------
    it('should return a mapped error message when the API fails with 4xx', async () => {
        // 404 is not retryable by the api-client; 5xx triggers retries which would
        // consume the default mock as a fallthrough — see carrier-constraints test note.
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ message: 'Not found' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to get shipment detail');
        expect(text).toContain('Suggestion:');
    });

    // -------------------------------------------------------------------------
    // 14. Folio renders as — when null (regression: prior version showed `null` literal)
    // -------------------------------------------------------------------------
    it('should render — when folio is null', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: '9824458744' });
        const text = result.content[0].text;

        expect(text).toContain('Folio:     —');
    });
});
