import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import {
    handleUpdateTicketV2,
    registerUpdateTicketV2,
} from '../../../src/tools/tickets/update-ticket-v2.js';

// =============================================================================
// Factories
// =============================================================================

function makeOkResponse(body: unknown = { data: true }) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
    };
}

function makeErrorResponse(status: number, body: unknown = {}) {
    return {
        ok: false,
        status,
        json: () => Promise.resolve(body),
    };
}

function makeFileUploadResponse(id: number, name: string, url: string) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { id, name, url } }),
    };
}

/** Builds a minimal fake JWT so fetchUserInfo can decode company_id. */
function makeUserInfoJwt(companyId: number, userId: number = 1): string {
    const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64');
    const payload = Buffer.from(JSON.stringify({ data: { company_id: companyId, user_id: userId } })).toString('base64');
    return `${header}.${payload}.fakesig`;
}

function makeUserInfoResponse(companyId: number) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: makeUserInfoJwt(companyId) }),
    };
}

// =============================================================================
// Suite: handleUpdateTicketV2
// =============================================================================

describe('handleUpdateTicketV2', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // Pre-flight validation
    // -------------------------------------------------------------------------

    it('should throw McpError when no action fields are provided', async () => {
        await expect(
            handleUpdateTicketV2({ api_key: MOCK_CONFIG.apiKey, ticket_id: 101 }, client, MOCK_CONFIG),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should throw McpError when files is an empty array and no other action', async () => {
        await expect(
            handleUpdateTicketV2({ api_key: MOCK_CONFIG.apiKey, ticket_id: 101, files: [] }, client, MOCK_CONFIG),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    // -------------------------------------------------------------------------
    // Comment only (no status change)
    // -------------------------------------------------------------------------

    it('should call POST /company/tickets/:id/comments when only comment is provided', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Adding evidence' },
            client,
            MOCK_CONFIG,
        );

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/company/tickets/101/comments');
        expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should return success message with ticket_id when comment is added', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'Adding evidence' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('ticket #101');
        expect(result).toContain('Comment added');
    });

    it('should mention the In Review auto-transition side effect in comment-only success message', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'test' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('In Review(6)');
        expect(result).toContain('Follow-up(5)');
    });

    it('should return closed-ticket message when comment POST returns 422', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(422));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('closed for new comments');
        expect(result).toContain('ticket #101');
    });

    it('should return mapped error for non-422 comment failure', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(404));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'hi' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to add comment to ticket #101');
        expect(result).toContain('Suggestion:');
    });

    // -------------------------------------------------------------------------
    // Status change (PUT)
    // -------------------------------------------------------------------------

    it('should call PUT /company/tickets/:id when ticket_status_id is provided', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 200, ticket_status_id: 5 },
            client,
            MOCK_CONFIG,
        );

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/company/tickets/200');
        expect(opts.method).toBe('PUT');
        expect(JSON.parse(opts.body)).toMatchObject({ ticket_status_id: 5 });
    });

    it('should include status label in the success message on status change', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 200, ticket_status_id: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Follow-up(5)');
        expect(result).toContain('ticket #200');
    });

    it('should embed comment in PUT payload when both status and comment are provided', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        await handleUpdateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                ticket_id: 200,
                ticket_status_id: 10,
                comment: 'escalating claim',
            },
            client,
            MOCK_CONFIG,
        );

        // Should be only ONE call (PUT with embedded comment), not two
        expect(mockFetch).toHaveBeenCalledOnce();
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.ticket_status_id).toBe(10);
        expect(body.comments).toBe('escalating claim');
    });

    it('should return closed-ticket message when PUT returns 422', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(422));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 300, ticket_status_id: 5 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('ticket is closed');
        expect(result).toContain('ticket #300');
    });

    it('should return mapped error for non-422 PUT failure', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(401));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 300, ticket_status_id: 1 },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Failed to update ticket #300');
        expect(result).toContain('Suggestion:');
    });

    // -------------------------------------------------------------------------
    // File uploads
    // -------------------------------------------------------------------------

    it('should upload files and include URLs in the response', async () => {
        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeUserInfoResponse(42))
            .mockResolvedValueOnce(makeFileUploadResponse(1, 'ev.jpg', 'https://s3.example.com/ev.jpg'));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                ticket_id: 400,
                files: [{ name: 'ev.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' }],
            },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('File uploads:');
        expect(result).toContain('✓ ev.jpg');
        expect(result).toContain('https://s3.example.com/ev.jpg');
    });

    it('should report upload failure gracefully without aborting other actions', async () => {
        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeUserInfoResponse(42))
            .mockResolvedValueOnce(makeErrorResponse(422));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                ticket_id: 400,
                files: [{ name: 'bad.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' }],
            },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('✗ bad.jpg');
    });

    it('should report error when fetchUserInfo fails and files were provided', async () => {
        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeErrorResponse(401));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                ticket_id: 400,
                files: [{ name: 'ev.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' }],
            },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('could not resolve company_id');
    });

    // -------------------------------------------------------------------------
    // Combined actions
    // -------------------------------------------------------------------------

    it('should execute comment + file upload in a single call', async () => {
        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeOkResponse())                                          // POST /comments
            .mockResolvedValueOnce(makeUserInfoResponse(42))                                  // GET /user-information
            .mockResolvedValueOnce(makeFileUploadResponse(2, 'doc.pdf', 'https://s3.example.com/doc.pdf')); // POST /files
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                ticket_id: 500,
                comment: 'Here is the additional evidence',
                files: [{ name: 'doc.pdf', content_base64: 'd29ybGQ=', content_type: 'application/pdf' }],
            },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('Comment added');
        expect(result).toContain('File uploads:');
        expect(result).toContain('✓ doc.pdf');
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should use the provided api_key for authorization', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        await handleUpdateTicketV2(
            { api_key: 'custom-key-xyz', ticket_id: 101, comment: 'test' },
            client,
            MOCK_CONFIG,
        );

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    it('should include a reference to envia_list_tickets_v2 in every success response', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleUpdateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, ticket_id: 101, comment: 'test' },
            client,
            MOCK_CONFIG,
        );

        expect(result).toContain('envia_list_tickets_v2');
    });
});

// =============================================================================
// Suite: registerUpdateTicketV2
// =============================================================================

describe('registerUpdateTicketV2', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeOkResponse());
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerUpdateTicketV2(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_update_ticket_v2')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should register the tool under envia_update_ticket_v2 name', () => {
        expect(handler).toBeDefined();
    });

    it('should return a text content response on successful comment', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            ticket_id: 101,
            comment: 'Test comment',
        });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Comment added');
    });

    it('should return a text content response on 422 error', async () => {
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
