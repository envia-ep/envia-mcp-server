import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import {
    handleListTicketsV2,
    renderTicketDetail,
    renderTicketListItem,
    format422Error,
    registerListTicketsV2,
} from '../../../src/tools/tickets/list-tickets-v2.js';
import type { TicketRecord } from '../../../src/types/tickets.js';

// =============================================================================
// Factories
// =============================================================================

function makeTicket(overrides: Partial<TicketRecord> = {}): TicketRecord {
    return {
        id: 101,
        company_id: 1,
        carrier_id: 2,
        shipment_id: 555,
        credit_id: null,
        warehouse_package_id: null,
        comments: 'Package arrived damaged.',
        created_by: 10,
        created_at: '2026-04-10 10:00:00',
        updated_at: '2026-04-11 09:00:00',
        utc_created_at: '2026-04-10 16:00:00',
        ticket_status_id: 1,
        ticket_status_name: 'pending',
        ticket_status_color: '#FFB136',
        ticket_class_name: 'warning',
        ticket_type_id: 5,
        ticket_type_name: 'damaged',
        reference: null,
        ticket_type_active: 1,
        tracking_number: 'TRACK12345',
        service: 'Express',
        carrier: 'DHL',
        carrier_description: 'DHL Express',
        file_quantity: 0,
        files: [],
        last_comment: {},
        allComments: [],
        data: null,
        name: 'John Doe',
        company: 'Acme',
        email: 'john@acme.com',
        phone: '555-1234',
        street: 'Main St',
        number: '1',
        district: 'Centro',
        city: 'Monterrey',
        state: 'NL',
        postal_code: '64000',
        country: 'MX',
        consignee: {
            consignee_name: 'John Doe',
            consignee_company_name: 'Acme',
            consignee_email: 'john@acme.com',
            consignee_phone: '555-1234',
            consignee_street: 'Main St',
            consignee_number: '1',
            consignee_district: 'Centro',
            consignee_city: 'Monterrey',
            consignee_state: 'NL',
            consignee_postal_code: '64000',
            consignee_country: 'MX',
        },
        payment_method: {},
        rating: { evaluated: 0, rating: null, comment: null },
        additional_services: [],
        ...overrides,
    } as TicketRecord;
}

function makeComment(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        type: 'user',
        description: 'Hello from user',
        created_at: '2026-04-10 11:00:00',
        utc_created_at: '2026-04-10 17:00:00',
        created_by_name: 'Jane Smith',
        status_id: 1,
        status_name: 'pending',
        status_color: '#FFB136',
        class_name: 'warning',
        tracking_number: 'TRACK12345',
        ...overrides,
    };
}

function makeListResponse(tickets: unknown[], totalRows?: number) {
    return { data: tickets, total_rows: totalRows ?? tickets.length };
}

// =============================================================================
// renderTicketDetail
// =============================================================================

describe('renderTicketDetail', () => {
    it('should include ticket id, type, and status', () => {
        const result = renderTicketDetail(makeTicket());

        expect(result).toContain('Ticket #101');
        expect(result).toContain('damaged');
        expect(result).toContain('Pending');
    });

    it('should include shipment section when shipment_id is present', () => {
        const result = renderTicketDetail(makeTicket({ shipment_id: 555, tracking_number: 'T123', carrier: 'FedEx' }));

        expect(result).toContain('--- Shipment ---');
        expect(result).toContain('555');
        expect(result).toContain('T123');
        expect(result).toContain('FedEx');
    });

    it('should omit shipment section when no shipment data', () => {
        const result = renderTicketDetail(makeTicket({ shipment_id: null, tracking_number: null, carrier: null }));

        expect(result).not.toContain('--- Shipment ---');
    });

    it('should include consignee section when consignee_name is present', () => {
        const result = renderTicketDetail(makeTicket());

        expect(result).toContain('--- Consignee ---');
        expect(result).toContain('John Doe');
        expect(result).toContain('Monterrey');
    });

    it('should include description when comments field is present', () => {
        const result = renderTicketDetail(makeTicket({ comments: 'Package was crushed.' }));

        expect(result).toContain('--- Description ---');
        expect(result).toContain('Package was crushed.');
    });

    it('should include comment thread when allComments is populated', () => {
        const ticket = makeTicket({ allComments: [makeComment()] as never });
        const result = renderTicketDetail(ticket);

        expect(result).toContain('--- Comments (1) ---');
        expect(result).toContain('Hello from user');
        expect(result).toContain('Jane Smith');
    });

    it('should omit comments section when allComments is empty', () => {
        const result = renderTicketDetail(makeTicket({ allComments: [] }));

        expect(result).not.toContain('--- Comments');
    });

    it('should include rating section when rating is evaluated', () => {
        const ticket = makeTicket({
            ticket_status_id: 2,
            rating: { evaluated: 1, rating: 4, comment: 'Good service' },
        });
        const result = renderTicketDetail(ticket);

        expect(result).toContain('--- Rating ---');
        expect(result).toContain('4/5');
        expect(result).toContain('Good service');
    });

    it('should prompt to rate when ticket is Accepted but not yet rated', () => {
        const ticket = makeTicket({
            ticket_status_id: 2,
            rating: { evaluated: 0, rating: null, comment: null },
        });
        const result = renderTicketDetail(ticket);

        expect(result).toContain('envia_rate_ticket');
    });

    it('should include files section when file_quantity > 0', () => {
        const ticket = makeTicket({
            file_quantity: 1,
            files: [{ file_url: 'https://s3.example.com/photo.jpg' }] as never,
        });
        const result = renderTicketDetail(ticket);

        expect(result).toContain('--- Files (1) ---');
        expect(result).toContain('https://s3.example.com/photo.jpg');
    });

    it('should include additional services when present', () => {
        const ticket = makeTicket({
            additional_services: [
                { additionalService: 'Insurance', value: 50, cost: 10 },
            ] as never,
        });
        const result = renderTicketDetail(ticket);

        expect(result).toContain('--- Additional Services ---');
        expect(result).toContain('Insurance');
        expect(result).toContain('$50');
    });

    it('should use TICKET_STATUS_NAMES map for human-readable status', () => {
        const result = renderTicketDetail(makeTicket({ ticket_status_id: 6, ticket_status_name: 'in_review' }));

        expect(result).toContain('In Review');
        expect(result).not.toContain('in_review');
    });

    it('should fall back to ticket_status_name when status id is unknown', () => {
        const result = renderTicketDetail(makeTicket({ ticket_status_id: 99, ticket_status_name: 'custom_status' }));

        expect(result).toContain('custom_status');
    });
});

// =============================================================================
// renderTicketListItem
// =============================================================================

describe('renderTicketListItem', () => {
    it('should return a one-line summary with ticket id, type, status, carrier, tracking, and date', () => {
        const result = renderTicketListItem(makeTicket(), false);

        expect(result).toContain('#101');
        expect(result).toContain('damaged');
        expect(result).toContain('Pending');
        expect(result).toContain('DHL');
        expect(result).toContain('TRACK12345');
        expect(result).toContain('2026-04-10');
    });

    it('should use dashes for null carrier and tracking_number', () => {
        const result = renderTicketListItem(makeTicket({ carrier: null, tracking_number: null }), false);

        expect(result).toContain('Carrier: —');
        expect(result).toContain('Tracking: —');
    });

    it('should append comments when showComments is true and allComments is populated', () => {
        const ticket = makeTicket({ allComments: [makeComment()] as never });
        const result = renderTicketListItem(ticket, true);

        expect(result).toContain('Hello from user');
        expect(result).toContain('Jane Smith');
    });

    it('should not append comments when showComments is false', () => {
        const ticket = makeTicket({ allComments: [makeComment()] as never });
        const result = renderTicketListItem(ticket, false);

        expect(result).not.toContain('Hello from user');
    });

    it('should not append comments when allComments is empty even with showComments true', () => {
        const result = renderTicketListItem(makeTicket({ allComments: [] }), true);

        expect(result.split('\n')).toHaveLength(1);
    });
});

// =============================================================================
// format422Error
// =============================================================================

describe('format422Error', () => {
    it('should include environment, friendly error, and backend note', () => {
        const result = format422Error('Unprocessable Entity', { message: 'Unprocessable Entity' }, 'sandbox');

        expect(result).toContain('HTTP 422');
        expect(result).toContain('sandbox');
        expect(result).toContain('Unprocessable Entity');
        expect(result).toContain('Boom.badData');
    });

    it('should include body snippet from error field when message is absent', () => {
        const result = format422Error(undefined, { error: 'Bad Data' }, 'production');

        expect(result).toContain('Bad Data');
        expect(result).toContain('production');
    });

    it('should show fallback message when friendlyError is undefined and body is empty', () => {
        const result = format422Error(undefined, {}, 'sandbox');

        expect(result).toContain('No friendly error available.');
    });

    it('should include retry suggestions', () => {
        const result = format422Error('error', {}, 'sandbox');

        expect(result).toContain('Retry without optional filters');
        expect(result).toContain('ticket_id');
    });
});

// =============================================================================
// handleListTicketsV2 — detail mode
// =============================================================================

describe('handleListTicketsV2 — detail mode', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket()])),
        });
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call /company/tickets with filter={ticket_id}&limit=1&getComments=true when ticket_id is provided', async () => {
        await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/company/tickets');
        expect(url).not.toContain('/company/tickets/101');
        expect(url).toContain('filter=101');
        expect(url).toContain('limit=1');
        expect(url).toContain('getComments=true');
    });

    it('should return full structured detail when ticket_id matches a ticket', async () => {
        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Ticket #101');
        expect(result).toContain('damaged');
        expect(result).toContain('--- Shipment ---');
        expect(result).toContain('--- Description ---');
    });

    it('should include comments in detail response when allComments is populated', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket({ allComments: [makeComment()] as never })])),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('--- Comments (1) ---');
        expect(result).toContain('Hello from user');
    });

    it('should return not-found message when API returns empty data array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 999, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('not found or does not belong to your account');
    });

    it('should return error message when API fails for a specific ticket_id', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to get ticket #101');
    });
});

// =============================================================================
// handleListTicketsV2 — list mode
// =============================================================================

describe('handleListTicketsV2 — list mode', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket()])),
        });
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call /company/tickets with pagination params when no ticket_id', async () => {
        await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 10, page: 2, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/company/tickets');
        expect(url).toContain('limit=10');
        expect(url).toContain('page=2');
        expect(url).not.toContain('/company/tickets/');
    });

    it('should include formatted summary for each ticket', async () => {
        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('#101');
        expect(result).toContain('damaged');
        expect(result).toContain('TRACK12345');
    });

    it('should include comment threads in list when getComments is true', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(makeListResponse([makeTicket({ allComments: [makeComment()] as never })])),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: true },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Hello from user');
    });

    it('should not show comments in list when getComments is false even if allComments is present', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve(makeListResponse([makeTicket({ allComments: [makeComment()] as never })])),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).not.toContain('Hello from user');
    });

    it('should pass ticket_status_id filter to the API when provided', async () => {
        await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_status_id: 3, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('ticket_status_id=3');
    });

    it('should accept any ticket_status_id without validation restriction', async () => {
        await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_status_id: 10, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('ticket_status_id=10');
    });

    it('should pass date_from and date_to filters when provided', async () => {
        await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, date_from: '2026-05-01', date_to: '2026-05-31', limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('date_from=2026-05-01');
        expect(url).toContain('date_to=2026-05-31');
    });

    it('should pass tracking_number filter when provided', async () => {
        await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, tracking_number: 'MYTRACK999', limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('tracking_number=MYTRACK999');
    });

    it('should return no-tickets message when API returns empty data', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('No tickets found matching the specified filters.');
    });

    it('should include total count in output', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket()], 42)),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('42');
    });

    it('should return 422 error message with body snippet when API returns 422', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ message: 'Unprocessable Entity' }),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('HTTP 422');
        expect(result).toContain('Unprocessable Entity');
    });

    it('should return generic error message when API fails with non-422 status', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({}),
        });

        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to list tickets:');
    });

    it('should use the provided api_key for authorization', async () => {
        await handleListTicketsV2(
            { api_key: 'custom-key-xyz', limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    it('should include guidance to use ticket_id or add comment in output footer', async () => {
        const result = await handleListTicketsV2(
            { api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('envia_list_tickets_v2');
        expect(result).toContain('envia_add_ticket_comment');
    });
});

// =============================================================================
// registerListTicketsV2
// =============================================================================

describe('registerListTicketsV2', () => {
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
        registerListTicketsV2(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_tickets_v2')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should register the tool under envia_list_tickets_v2 name', () => {
        expect(handler).toBeDefined();
    });

    it('should return a valid text response when called in list mode', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1, getComments: false });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('#101');
    });

    it('should return a valid text response when called in detail mode', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeTicket()])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, ticket_id: 101, limit: 20, page: 1, getComments: false });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Ticket #101');
    });
});
