/**
 * Unit tests for envia_get_my_salesman — formatter + tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetMySalesman, formatSalesman } from '../../../src/tools/account/get-my-salesman.js';

function buildUserInfoJwt(data: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ data, iat: 1 })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('formatSalesman', () => {
    it('should include the salesman name when assigned', () => {
        const output = formatSalesman({ salesman_name: 'Juan Perez', salesman_email: 'juan@envia.com' });

        expect(output).toContain('Juan Perez');
    });

    it('should include the salesman email when assigned', () => {
        const output = formatSalesman({ salesman_name: 'Juan', salesman_email: 'juan@envia.com' });

        expect(output).toContain('juan@envia.com');
    });

    it('should include the salesman phone when assigned', () => {
        const output = formatSalesman({ salesman_name: 'Juan', salesman_phone: '+525512345678' });

        expect(output).toContain('+525512345678');
    });

    it('should return an unassigned message when no fields are present', () => {
        const output = formatSalesman({});

        expect(output).toContain('No salesman is currently assigned');
    });

    it('should suggest opening a ticket when no salesman is assigned', () => {
        const output = formatSalesman({});

        expect(output).toContain('envia_create_ticket');
    });
});

describe('envia_get_my_salesman handler', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetMySalesman(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_my_salesman')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return the assigned salesman details when present', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                token: buildUserInfoJwt({ salesman_name: 'Test Agent', salesman_email: 'agent@envia.com' }),
            }),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('Test Agent');
    });

    it('should return unassigned message when backend returns empty salesman fields', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                token: buildUserInfoJwt({ user_id: 1, salesman_name: null, salesman_email: null, salesman_phone: null }),
            }),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('No salesman is currently assigned');
    });

    it('should return mapped error when user-information call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal error' }),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('Failed to fetch salesman information');
    });
});
