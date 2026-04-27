import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListShipments } from '../../../src/tools/shipments/list-shipments.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeShipment(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        tracking_number: 'TRACK001',
        status_id: 2,
        status: 'In Transit',
        carrier_name: 'dhl',
        service_name: 'express',
        origin: { name: 'Juan', city: 'Monterrey', state: 'NL', country: 'MX' },
        destination: { name: 'Maria', city: 'CDMX', state: 'DF', country: 'MX' },
        grand_total: 250.5,
        currency: 'MXN',
        created_at: '2026-03-01',
        ...overrides,
    };
}

function makeListResponse(shipments: unknown[], extras: Record<string, unknown> = {}) {
    return {
        data: shipments,
        total: shipments.length,
        ...extras,
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_list_shipments', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeShipment()])),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListShipments(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_shipments')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted shipment list when API returns data
    // -------------------------------------------------------------------------
    it('should return formatted shipment list when API returns data', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('TRACK001');
        expect(text).toContain('In Transit');
        expect(text).toContain('dhl');
    });

    // -------------------------------------------------------------------------
    // 2. should return count when count_only is true
    // -------------------------------------------------------------------------
    it('should return count when count_only is true', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [], total: 42 }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, count_only: true, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Total shipments matching filters: 42');
    });

    // -------------------------------------------------------------------------
    // 3. should return "no shipments found" when API returns empty array
    // -------------------------------------------------------------------------
    it('should return "no shipments found" when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('No shipments found matching the specified filters.');
    });

    // -------------------------------------------------------------------------
    // 4. should return error message when API call fails
    // -------------------------------------------------------------------------
    it('should return error message when API call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list shipments:');
    });

    // -------------------------------------------------------------------------
    // 5. should pass filters to queryShipmentsApi
    // -------------------------------------------------------------------------
    it('should pass filters to queryShipmentsApi', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            status_id: 3,
            carrier_name: 'fedex',
            date_from: '2026-01-01',
            limit: 10,
            page: 2,
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('status_id=3');
        expect(url).toContain('carrier_name=fedex');
        expect(url).toContain('date_from=2026-01-01');
        expect(url).toContain('limit=10');
        expect(url).toContain('page=2');
    });

    // -------------------------------------------------------------------------
    // 6. should use resolveClient with provided api_key
    // -------------------------------------------------------------------------
    it('should use resolveClient with provided api_key', async () => {
        await handler({ api_key: 'custom-api-key', limit: 20, page: 1 });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-api-key');
    });

    // -------------------------------------------------------------------------
    // 7. should include incident stats when present in response
    // -------------------------------------------------------------------------
    it('should include incident stats when present in response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeShipment()], {
                total_incidents: 5,
                total_reported: 2,
            })),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Incidents: 5');
        expect(text).toContain('Reported: 2');
    });

    // -------------------------------------------------------------------------
    // 8. should show "next step" guidance in output
    // -------------------------------------------------------------------------
    it('should show next step guidance in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('envia_get_shipment_detail');
    });

    // -------------------------------------------------------------------------
    // 9. should handle shipments without optional fields gracefully
    // -------------------------------------------------------------------------
    it('should handle shipments without optional fields gracefully', async () => {
        const minimalShipment = {
            id: 99,
            tracking_number: 'MINIMAL001',
            status_id: 1,
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([minimalShipment])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('MINIMAL001');
    });

    // -------------------------------------------------------------------------
    // 10. should format addresses using formatAddressSummary
    // -------------------------------------------------------------------------
    it('should format addresses using formatAddressSummary', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Juan, Monterrey, NL, MX');
        expect(text).toContain('Maria, CDMX, DF, MX');
    });

    // -------------------------------------------------------------------------
    // 11. Backend-shape verification (2026-04-27): /shipments returns
    //     `name` (slug), `carrier_description` + `service_description` for
    //     display, and FLAT sender_*/consignee_* fields. The fallback chain
    //     must surface the description fields when carrier_name/service_name
    //     are absent — and rebuild the address summary from sender_/consignee_.
    // -------------------------------------------------------------------------
    it('should fall back to carrier_description and service_description when carrier_name and service_name are absent', async () => {
        const realShape = makeShipment({
            tracking_number: 'REAL001',
            carrier_name: undefined,
            service_name: undefined,
            name: 'paquetexpress',
            carrier_description: 'Paquetexpress',
            service: 'ground_do',
            service_description: 'Paquetexpress Domicilio - ocurre',
            origin: undefined,
            destination: undefined,
            sender_name: 'Sender Co',
            sender_city: 'Guadalajara',
            sender_state: 'JAL',
            sender_country: 'MX',
            consignee_name: 'Consignee Inc',
            consignee_city: 'Mexico City',
            consignee_state: 'DF',
            consignee_country: 'MX',
        });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([realShape])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Paquetexpress');
        expect(text).toContain('Paquetexpress Domicilio - ocurre');
        expect(text).toContain('Sender Co, Guadalajara, JAL, MX');
        expect(text).toContain('Consignee Inc, Mexico City, DF, MX');
        expect(text).not.toContain('?  / ?');
    });
});
