import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import {
    handleAddTicketCommentV2,
    registerAddTicketCommentV2,
} from '../../../src/tools/tickets/add-ticket-comment-v2.js';

// =============================================================================
// Helpers
// =============================================================================

function makeOkResponse(data: unknown = true) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data }),
    };
}

function makeErrorResponse(status: number, body: unknown = {}) {
    return {
        ok: false,
        status,
        json: () => Promise.resolve(body),
    };
}

// =============================================================================
// handleAddTicketCommentV2
// =============================================================================

describe('handleAddTicketCommentV2', () => {
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

    it('should call POST /company/tickets/{ticket_id}/comments with the comment text', async () => {
        await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hello support' },
            client,
            MOCK_CONFIG,
        );

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/company/tickets/101/comments');
        expect(JSON.parse(opts.body)).toMatchObject({ comment: 'Hello support' });
    });

    it('should return success message with ticket id on successful comment', async () => {
        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hello support' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Comment added successfully to ticket #101');
    });

    it('should mention the In Review auto-transition to Follow-up in the success message', async () => {
        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('In Review(6)');
        expect(result).toContain('Follow-up(5)');
    });

    it('should reference envia_list_tickets_v2 in the success message', async () => {
        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('envia_list_tickets_v2');
        expect(result).not.toContain('envia_get_ticket_comments');
    });

    it('should use the provided api_key for authorization', async () => {
        await handleAddTicketCommentV2(
            { api_key: 'custom-key-xyz', ticket_id: 101, comment: 'test' },
            client,
            MOCK_CONFIG,
        );

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 422 — closed ticket
    // -------------------------------------------------------------------------

    it('should return closed-ticket message when API returns 422', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('ticket #101');
        expect(result).toContain('closed for new comments');
        expect(result).toContain('Accepted(2)');
        expect(result).toContain('Declined(3)');
    });

    it('should list allowed statuses in the 422 error message', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 55, comment: 'test' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Pending(1)');
        expect(result).toContain('Incomplete(4)');
        expect(result).toContain('Follow-up(5)');
        expect(result).toContain('In Review(6)');
    });

    // -------------------------------------------------------------------------
    // Other API errors
    // -------------------------------------------------------------------------

    it('should return mapped error message when API returns 401', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to add comment to ticket #101');
        expect(result).toContain('Suggestion:');
    });

    it('should return mapped error message when API returns 404', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(404));

        const result = await handleAddTicketCommentV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to add comment to ticket #101');
        expect(result).toContain('Suggestion:');
    });
});

// =============================================================================
// registerAddTicketCommentV2
// =============================================================================

describe('registerAddTicketCommentV2', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerAddTicketCommentV2(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_add_ticket_comment_v2')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should register the tool under envia_add_ticket_comment_v2 name', () => {
        expect(handler).toBeDefined();
    });

    it('should return a valid text response on success', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            ticket_id: 101,
            comment: 'Test comment',
        });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Comment added successfully');
    });

    it('should return a valid text response on 422 error', async () => {
        mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            ticket_id: 101,
            comment: 'Test comment',
        });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('closed for new comments');
    });
});
