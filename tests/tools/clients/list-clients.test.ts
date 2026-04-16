import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListClients } from '../../../src/tools/clients/list-clients.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeClient(overrides: Record<string, unknown> = {}) {
    return {
        id: 18,
        client_type: 'business',
        name: 'Test Corp',
        company_name: 'Test Corporation',
        external_ref: 'EXT-001',
        contact: {
            id: 1,
            full_name: 'Juan Perez',
            email: 'juan@test.com',
            phone: '5512345678',
        },
        billing_address: {
            street: 'Av. Reforma',
            number: '222',
            city: 'CDMX',
            state: 'CX',
            country: 'MX',
            postal_code: '06600',
        },
        created_at: '2026-03-30 18:08:52',
        ...overrides,
    };
}

function makeListResponse(clients: unknown[], total?: number) {
    return {
        data: clients,
        total: total ?? clients.length,
        emptyState: clients.length === 0 ? 1 : 0,
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_list_clients', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeClient()])),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListClients(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_clients')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return formatted client list', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Test Corp');
        expect(text).toContain('business');
        expect(text).toContain('Test Corporation');
        expect(text).toContain('Juan Perez');
    });

    it('should show contact info', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('juan@test.com');
    });

    it('should show billing address summary', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Av. Reforma');
        expect(text).toContain('CDMX');
    });

    it('should show external ref when present', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });

        expect(result.content[0].text).toContain('EXT-001');
    });

    it('should return empty message when no clients found', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });

        expect(result.content[0].text).toContain('No clients found');
    });

    it('should pass filter params to API', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            search: 'Juan',
            client_type: 'business',
            sort_by: 'name',
            sort_direction: 'DESC',
            limit: 10,
            page: 2,
        });

        const fetchUrl = mockFetch.mock.calls[0][0] as string;
        expect(fetchUrl).toContain('search=Juan');
        expect(fetchUrl).toContain('client_type=business');
        expect(fetchUrl).toContain('sort_by=name');
        expect(fetchUrl).toContain('sort_direction=DESC');
    });

    it('should handle API errors gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: 'bad-key', limit: 20, page: 1 });

        expect(result.content[0].text).toContain('Failed to list clients');
    });
});
