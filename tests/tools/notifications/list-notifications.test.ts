import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListNotifications } from '../../../src/tools/notifications/list-notifications.js';

// =============================================================================
// Factories
// =============================================================================

function makeNotification(id = 1414826, type = 'balance_return', category = 'returns') {
    return {
        id,
        title: 'Reembolso de fondos',
        content: 'La etiqueta fue cancelada.',
        redirect_url: 'https://envia.com/shipments',
        status: {},
        category,
        active: 1,
        is_valid_html: true,
        created_at: '2026-04-14 21:26:44',
        rating: null,
        type,
        ticketInformation: null,
        comment: null,
        created_by: null,
        utc_created_at: null,
    };
}

function makeCompanyNotificationsResponse() {
    return {
        data: {
            all: {
                notifications: [makeNotification()],
                unreadCounter: 5,
            },
            payments: {
                notifications: [],
                unreadCounter: 0,
            },
            returns: {
                notifications: [makeNotification()],
                unreadCounter: 5,
            },
        },
        unreadCounter: 5,
    };
}

// =============================================================================
// Suite
// =============================================================================

describe('envia_list_notifications', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeCompanyNotificationsResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListNotifications(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_notifications')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return notifications grouped by category
    // -------------------------------------------------------------------------
    it('should return notifications grouped by category', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('All');
        expect(text).toContain('Returns');
    });

    // -------------------------------------------------------------------------
    // 2. should include unread counters in output
    // -------------------------------------------------------------------------
    it('should include unread counters in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('5 unread');
    });

    // -------------------------------------------------------------------------
    // 3. should include notification title and type in output
    // -------------------------------------------------------------------------
    it('should include notification title and type in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Reembolso de fondos');
        expect(text).toContain('balance_return');
    });

    // -------------------------------------------------------------------------
    // 4. should skip empty categories
    // -------------------------------------------------------------------------
    it('should skip categories with no notifications', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        // Payments category has 0 notifications — should not appear in output
        expect(text).not.toContain('Payments (0 unread)');
    });

    // -------------------------------------------------------------------------
    // 5. should pass limit param when provided
    // -------------------------------------------------------------------------
    it('should pass limit param when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 10 });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limit=10');
    });

    // -------------------------------------------------------------------------
    // 6. should not pass limit when not provided
    // -------------------------------------------------------------------------
    it('should not include limit param when not provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        const [url] = mockFetch.mock.calls[0];
        expect(url).not.toContain('limit=');
    });

    // -------------------------------------------------------------------------
    // 7. should return error message when API fails with 401
    // -------------------------------------------------------------------------
    it('should return error message when API fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list notifications:');
    });

    // -------------------------------------------------------------------------
    // 8. should use custom api_key in Authorization header
    // -------------------------------------------------------------------------
    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'custom-key-xyz' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer custom-key-xyz');
    });

    // -------------------------------------------------------------------------
    // 9. should call the correct company/notifications endpoint
    // -------------------------------------------------------------------------
    it('should call the correct company/notifications endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('company/notifications');
    });

    // -------------------------------------------------------------------------
    // 10. should handle empty data gracefully
    // -------------------------------------------------------------------------
    it('should handle empty data object gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: {}, unreadCounter: 0 }),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        const text = result.content[0].text;

        expect(text).toContain('No notifications found');
    });
});
