import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListTickets } from '../../../src/tools/tickets/list-tickets.js';

// =============================================================================
// Factories
// =============================================================================

function makeTicket(overrides: Record<string, unknown> = {}) {
    return {
        id: 101,
        ticket_status_id: 1,
        ticket_status_name: 'pending',
        ticket_type_id: 5,
        ticket_type_name: 'damaged',
        carrier: 'DHL',
        tracking_number: 'TRACK12345',
        created_at: '2026-04-10 10:00:00',
        ...overrides,
    };
}

function makeListResponse(tickets: unknown[], totalRows?: number) {
    return {
        data: tickets,
        total_rows: totalRows ?? tickets.length,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_list_tickets', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket()])),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListTickets(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_tickets')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return formatted ticket list when API returns data
    // -------------------------------------------------------------------------
    it('should return formatted ticket list when API returns data', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('#101');
        expect(text).toContain('damaged');
        expect(text).toContain('TRACK12345');
    });

    // -------------------------------------------------------------------------
    // 2. should return "no tickets found" when API returns empty array
    // -------------------------------------------------------------------------
    it('should return "no tickets found" when API returns empty array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('No tickets found matching the specified filters.');
    });

    // -------------------------------------------------------------------------
    // 3. should surface honest 422 message including status, body, and environment
    // -------------------------------------------------------------------------
    it('should surface honest 422 message including status, body, and environment', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ message: 'Unprocessable Entity' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('HTTP 422');
        expect(text).toContain('sandbox');
        expect(text).toContain('Unprocessable Entity');
        expect(text).toContain('envia_get_ticket_detail');
        expect(text).not.toContain('works correctly in production');
        expect(text).not.toContain('known sandbox issue');
    });

    // -------------------------------------------------------------------------
    // 3b. should include the raw backend body snippet when no `message` field
    // -------------------------------------------------------------------------
    it('should include raw body snippet when backend returns 422 without a message field', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ statusCode: 422, error: 'Bad Data' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('HTTP 422');
        expect(text).toContain('Bad Data');
    });

    // -------------------------------------------------------------------------
    // 4. should return error message when API call fails with 401
    // -------------------------------------------------------------------------
    it('should return error message when API call fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list tickets:');
    });

    // -------------------------------------------------------------------------
    // 5. should pass filters to queryTicketsApi
    // -------------------------------------------------------------------------
    it('should pass filters to queryTicketsApi', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            ticket_status_id: 2,
            carrier_id: 5,
            date_from: '2026-01-01',
            limit: 10,
            page: 2,
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('ticket_status_id=2');
        expect(url).toContain('carrier_id=5');
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
    // 7. should include total count in output
    // -------------------------------------------------------------------------
    it('should include total count in output', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket()], 42)),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('42');
    });

    // -------------------------------------------------------------------------
    // 8. should include next-step guidance in output
    // -------------------------------------------------------------------------
    it('should include next-step guidance in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('envia_get_ticket_detail');
    });

    // -------------------------------------------------------------------------
    // 9. should pass tracking_number filter when provided
    // -------------------------------------------------------------------------
    it('should pass tracking_number filter when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, tracking_number: 'MYTRACK999', limit: 20, page: 1 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('tracking_number=MYTRACK999');
    });

    // -------------------------------------------------------------------------
    // 10. should handle tickets without carrier gracefully
    // -------------------------------------------------------------------------
    it('should handle tickets without carrier gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket({ carrier: null, tracking_number: null })])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('#101');
        expect(text).toContain('Carrier: —');
        expect(text).toContain('Tracking: —');
    });
});
