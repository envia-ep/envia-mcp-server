/**
 * Unit tests for envia_create_ticket.
 *
 * Verifies the tracking_number → shipment_id resolution flow that prevents
 * tickets from being created orphan when the user references a shipment by
 * its user-visible tracking number ("guía"). See create-ticket.ts JSDoc and
 * the 2026-04-27 cross-service investigation that surfaced this bug.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCreateTicket } from '../../../src/tools/tickets/create-ticket.js';
import { logger } from '../../../src/utils/logger.js';

// =============================================================================
// Factories
// =============================================================================

/** Mock the GET /guide/{tracking} response (verified shape 2026-04-27). */
function makeGuideLookupResponse(shipmentId: number, trackingNumber: string) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            data: [{ id: shipmentId, tracking_number: trackingNumber, status: 'Created', status_id: 1 }],
            total_rows: 1,
        }),
    };
}

/** Mock the POST /company/tickets success response. */
function makeCreateTicketResponse(ticketId: number) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: ticketId }),
    };
}

/** Mock the POST /company/tickets/autoassign/{ticketId} success response. */
function makeAutoassignTicketResponse() {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_create_ticket', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCreateTicket(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_create_ticket')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Happy path: tracking_number resolves to shipment_id and ticket is linked
    // -------------------------------------------------------------------------
    it('should resolve tracking_number to shipment_id and link the ticket', async () => {
        mockFetch
            .mockResolvedValueOnce(makeGuideLookupResponse(170617, '8200000000112T00021665'))
            .mockResolvedValueOnce(makeCreateTicketResponse(3177))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 25,
            tracking_number: '8200000000112T00021665',
            comments: 'Delivery without movement',
        });
        const text = result.content[0].text;

        expect(text).toContain('Ticket created successfully');
        expect(text).toContain('Ticket ID: 3177');
        expect(text).toContain('Linked to shipment_id: 170617');
        expect(text).toContain('tracking 8200000000112T00021665');

        const [createUrl, createOptions] = mockFetch.mock.calls[1];
        const [autoassignUrl, autoassignOptions] = mockFetch.mock.calls[2];
        expect(createUrl).toBe(`${MOCK_CONFIG.queriesBase}/company/tickets`);
        expect(createOptions.method).toBe('POST');
        expect(autoassignUrl).toBe(`${MOCK_CONFIG.queriesBase}/company/tickets/autoassign/3177`);
        expect(autoassignOptions.method).toBe('POST');
        expect(JSON.parse(autoassignOptions.body as string)).toEqual({});
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    // -------------------------------------------------------------------------
    // 2. The resolved shipment_id is sent in the POST body, not the tracking_number
    // -------------------------------------------------------------------------
    it('should send shipment_id (not tracking_number) in the POST body', async () => {
        mockFetch
            .mockResolvedValueOnce(makeGuideLookupResponse(170617, 'TRK001'))
            .mockResolvedValueOnce(makeCreateTicketResponse(1))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 25,
            tracking_number: 'TRK001',
            comments: 'x',
        });

        // Second call is the POST /company/tickets — inspect its body.
        const [, postOptions] = mockFetch.mock.calls[1];
        const body = JSON.parse(postOptions.body as string);

        expect(body.shipment_id).toBe(170617);
        expect(body.tracking_number).toBeUndefined();
        expect(body.type_id).toBe(25);
    });

    // -------------------------------------------------------------------------
    // 3. URL for lookup is queriesBase + /guide/{encoded tracking}
    // -------------------------------------------------------------------------
    it('should call /guide/{tracking_number} for lookup with URL encoding', async () => {
        mockFetch
            .mockResolvedValueOnce(makeGuideLookupResponse(1, 'TRK 001'))
            .mockResolvedValueOnce(makeCreateTicketResponse(1))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 25,
            tracking_number: 'TRK 001',
        });

        const [lookupUrl] = mockFetch.mock.calls[0];
        expect(lookupUrl).toContain(MOCK_CONFIG.queriesBase);
        expect(lookupUrl).toContain('/guide/TRK%20001');
    });

    // -------------------------------------------------------------------------
    // 4. Lookup returns empty → tool aborts with actionable message and does NOT POST
    // -------------------------------------------------------------------------
    it('should abort and NOT create the ticket when tracking_number lookup returns empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [], total_rows: 0 }),
        });

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 25,
            tracking_number: 'BOGUS_TRACK',
        });
        const text = result.content[0].text;

        expect(text).toContain('was not found for your company');
        expect(text).toContain('BOGUS_TRACK');
        expect(mockFetch).toHaveBeenCalledTimes(1); // only the lookup, no POST
    });

    // -------------------------------------------------------------------------
    // 5. Lookup fails (404) → abort, no POST, actionable message
    // -------------------------------------------------------------------------
    it('should abort and NOT create the ticket when /guide/ lookup fails with 404', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ message: 'Not found' }),
        });

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 25,
            tracking_number: 'GHOST_TRACK',
        });
        const text = result.content[0].text;

        expect(text).toContain('was not found for your company');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // 6. Backwards compatibility: shipment_id-only flow (no tracking_number) skips lookup
    // -------------------------------------------------------------------------
    it('should skip lookup and POST directly when only shipment_id is provided', async () => {
        mockFetch
            .mockResolvedValueOnce(makeCreateTicketResponse(42))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            shipment_id: 999,
            comments: 'Delay reported',
        });
        const text = result.content[0].text;

        expect(text).toContain('Ticket created successfully');
        expect(text).toContain('Linked to shipment_id: 999');
        expect(mockFetch).toHaveBeenCalledTimes(2); // create and autoassign; no lookup
    });

    // -------------------------------------------------------------------------
    // 7. Both shipment_id and tracking_number provided → shipment_id wins, no lookup
    // -------------------------------------------------------------------------
    it('should use shipment_id directly when both shipment_id and tracking_number are provided', async () => {
        mockFetch
            .mockResolvedValueOnce(makeCreateTicketResponse(50))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            shipment_id: 12345,
            tracking_number: 'WHATEVER',
        });

        // Two POST calls — no lookup.
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const [, postOptions] = mockFetch.mock.calls[0];
        const body = JSON.parse(postOptions.body as string);
        expect(body.shipment_id).toBe(12345);
    });

    // -------------------------------------------------------------------------
    // 8. Neither shipment_id nor tracking_number → orphan ticket allowed (back-compat)
    // -------------------------------------------------------------------------
    it('should allow creating an orphan ticket when neither shipment_id nor tracking_number is provided', async () => {
        mockFetch
            .mockResolvedValueOnce(makeCreateTicketResponse(7))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 9, // payment_pending — does not need a shipment
            comments: 'Payment issue',
        });
        const text = result.content[0].text;

        expect(text).toContain('Ticket created successfully');
        expect(text).toContain('Not linked to any shipment');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // -------------------------------------------------------------------------
    // 9. 409 Conflict (duplicate) renders the actionable message
    // -------------------------------------------------------------------------
    it('should render the duplicate-ticket message on 409 Conflict', async () => {
        mockFetch
            .mockResolvedValueOnce(makeGuideLookupResponse(170617, 'TRK001'))
            .mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: () => Promise.resolve({ message: 'Duplicate' }),
            });

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            tracking_number: 'TRK001',
        });
        const text = result.content[0].text;

        expect(text).toContain('an active ticket already exists');
        expect(text).toContain('envia_list_tickets');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // -------------------------------------------------------------------------
    // 10. Other ticket fields (carrier_id, comments, data) are forwarded as-is
    // -------------------------------------------------------------------------
    it('should forward carrier_id, comments, and data fields to the POST body', async () => {
        mockFetch
            .mockResolvedValueOnce(makeGuideLookupResponse(170617, 'TRK001'))
            .mockResolvedValueOnce(makeCreateTicketResponse(99))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 6,
            tracking_number: 'TRK001',
            carrier_id: 4,
            comments: 'Address looks wrong',
            data: '{"address_field":"city"}',
        });

        const [, postOptions] = mockFetch.mock.calls[1];
        const body = JSON.parse(postOptions.body as string);
        expect(body.carrier_id).toBe(4);
        expect(body.comments).toBe('Address looks wrong');
        expect(body.data).toBe('{"address_field":"city"}');
        expect(body.shipment_id).toBe(170617);
    });

    it('should not autoassign when ticket creation fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Invalid ticket' }),
        });

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            shipment_id: 999,
        });

        expect(result.content[0].text).toContain('Failed to create ticket');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not autoassign when the creation response has no valid ticket ID', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ created: true }),
        });

        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            shipment_id: 999,
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should keep the successful creation response and log when autoassignment fails', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
        mockFetch
            .mockResolvedValueOnce(makeCreateTicketResponse(3177))
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ message: 'sensitive internal autoassign failure' }),
            });

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            shipment_id: 999,
        });
        const text = result.content[0].text;

        expect(text).toContain('Ticket created successfully');
        expect(text).toContain('Ticket ID: 3177');
        expect(text).not.toContain('sensitive internal autoassign failure');
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(
            {
                event: 'ticket_autoassignment_failed',
                tool: 'envia_create_ticket',
                ticketId: 3177,
                status: 400,
            },
            'Ticket autoassignment failed after successful creation',
        );
    });

    it('should reuse the same authenticated client for creation and autoassignment', async () => {
        const postSpy = vi.spyOn(EnviaApiClient.prototype, 'post');
        mockFetch
            .mockResolvedValueOnce(makeCreateTicketResponse(73))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        await handler({
            api_key: 'per-request-api-key',
            type_id: 8,
            shipment_id: 999,
        });

        expect(postSpy.mock.instances).toHaveLength(2);
        expect(postSpy.mock.instances[0]).toBe(postSpy.mock.instances[1]);
        expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer per-request-api-key');
        expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer per-request-api-key');
    });

    it('should build the autoassignment endpoint only from the validated response ID', async () => {
        mockFetch
            .mockResolvedValueOnce(makeCreateTicketResponse(73))
            .mockResolvedValueOnce(makeAutoassignTicketResponse());

        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type_id: 8,
            shipment_id: 999,
            comments: '../../autoassign/9999',
            data: '{"ticketId":"9999"}',
        });

        expect(mockFetch.mock.calls[1][0]).toBe(`${MOCK_CONFIG.queriesBase}/company/tickets/autoassign/73`);
    });
});
