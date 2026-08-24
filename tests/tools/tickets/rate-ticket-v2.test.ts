import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import {
    handleRateTicketV2,
    registerRateTicketV2,
} from '../../../src/tools/tickets/rate-ticket-v2.js';

// =============================================================================
// Helpers
// =============================================================================

function makeOkResponse() {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: true, message: 'Successful.' }),
    };
}

function makeErrorResponse(status: number) {
    return {
        ok: false,
        status,
        json: () => Promise.resolve({}),
    };
}

// =============================================================================
// handleRateTicketV2
// =============================================================================

describe('handleRateTicketV2', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    it('should call POST /tickets/ratings/{ticket_id} with rating in body', async () => {
        await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/tickets/ratings/101');
        expect(JSON.parse(opts.body)).toMatchObject({ rating: 5 });
    });

    it('should include comment in body when provided', async () => {
        await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 4, comment: 'Good service' },
            client,
            MOCK_CONFIG,
        );

        const [, opts] = mockFetch.mock.calls[0];
        expect(JSON.parse(opts.body)).toMatchObject({ rating: 4, comment: 'Good service' });
    });

    it('should not include comment in body when not provided', async () => {
        await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 3 },
            client,
            MOCK_CONFIG,
        );

        const [, opts] = mockFetch.mock.calls[0];
        expect('comment' in JSON.parse(opts.body)).toBe(false);
    });

    it('should return success message with ticket id and score', async () => {
        const result = await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Ticket #101 rated successfully');
        expect(result).toContain('5/5');
    });

    it('should include comment in success message when provided', async () => {
        const result = await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 4, comment: 'Quick resolution' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Quick resolution');
    });

    it('should not include comment line in success message when not provided', async () => {
        const result = await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).not.toContain('Comment:');
    });

    it('should use the provided api_key for authorization', async () => {
        await handleRateTicketV2(
            { api_key: 'custom-key-xyz', ticket_id: 101, rating: 3 },
            client,
            MOCK_CONFIG,
        );

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 422 — already rated
    // -------------------------------------------------------------------------

    it('should return already-rated message when API returns 422', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

        const result = await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('ticket #101');
        expect(result).toContain('already been evaluated');
        expect(result).toContain('one-time');
    });

    // -------------------------------------------------------------------------
    // Other API errors
    // -------------------------------------------------------------------------

    it('should return mapped error message when API returns 401', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

        const result = await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to rate ticket #101');
        expect(result).toContain('Suggestion:');
    });

    it('should return mapped error message when API returns 404', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(404));

        const result = await handleRateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, rating: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to rate ticket #101');
        expect(result).toContain('Suggestion:');
    });
});

// =============================================================================
// registerRateTicketV2
// =============================================================================

describe('registerRateTicketV2', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerRateTicketV2(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_rate_ticket_v2')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should register the tool under envia_rate_ticket_v2 name', () => {
        expect(handler).toBeDefined();
    });

    it('should return a valid text response on success', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            ticket_id: 101,
            rating: 5,
        });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('rated successfully');
    });

    it('should return a valid text response on 422 error', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            ticket_id: 101,
            rating: 5,
        });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('already been evaluated');
    });
});
