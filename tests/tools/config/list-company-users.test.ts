import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListCompanyUsers } from '../../../src/tools/config/list-company-users.js';

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 2802,
        email: 'alaciel@envia.com',
        phone: '8125700000',
        role_id: 1,
        role_description: 'Super Admin',
        status: 1,
        name: 'Alaciel Arteaga',
        invitation_status: 'accepted',
        invitation_status_translation_tag: 'users.invitation.accepted',
        expiration_date: null,
        is_new_user: false,
        ...overrides,
    };
}

describe('envia_list_company_users', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeUser()] }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerListCompanyUsers(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_list_company_users')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return user name and email in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Alaciel Arteaga');
        expect(result.content[0].text).toContain('alaciel@envia.com');
    });

    it('should show role description', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Super Admin');
    });

    it('should show Active for status=1', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Active');
    });

    it('should show Inactive for status=0', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeUser({ status: 0 })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Inactive');
    });

    it('should show total member count in heading', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('1 member');
    });

    it('should return "No users found" when data is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No users found.');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Failed to list company users:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-custom-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-custom-key');
    });

    it('should call /company/users endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('company/users');
    });

    it('should show invitation status in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Accepted');
    });
});
