import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListAddresses } from '../../../src/tools/addresses/list-addresses.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeAddress(overrides: Record<string, unknown> = {}) {
    return {
        address_id: 100,
        type: 1,
        name: 'Juan Perez',
        street: 'Av. Reforma',
        number: '222',
        district: 'Juárez',
        city: 'CDMX',
        state: 'CX',
        country: 'MX',
        postal_code: '06600',
        email: 'juan@test.com',
        phone: '5512345678',
        is_default: 0,
        is_favorite: 0,
        ...overrides,
    };
}

function makeListResponse(addresses: unknown[], total?: number) {
    return {
        data: addresses,
        total: total ?? addresses.length,
        emptyState: addresses.length === 0 ? 1 : 0,
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_list_addresses', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makeAddress()])),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListAddresses(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_addresses')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return formatted address list when API returns data', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, type: 'origin', limit: 20, page: 1, sort_direction: 'asc' });
        const text = result.content[0].text;

        expect(text).toContain('Juan Perez');
        expect(text).toContain('Av. Reforma 222');
        expect(text).toContain('CDMX');
        expect(text).toContain('[100]');
    });

    it('should show default and favorite flags', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([
                makeAddress({ is_default: 1, is_favorite: 1 }),
            ])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, type: 'origin', limit: 20, page: 1, sort_direction: 'asc' });
        const text = result.content[0].text;

        expect(text).toContain('★ default');
        expect(text).toContain('♥ favorite');
    });

    it('should return empty message when no addresses found', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, type: 'destination', limit: 20, page: 1, sort_direction: 'asc' });
        const text = result.content[0].text;

        expect(text).toContain('No destination addresses found');
    });

    it('should pass search and sort params to API', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type: 'origin',
            search: 'Juan',
            sort_by: 'name',
            sort_direction: 'desc',
            country: 'MX',
            limit: 10,
            page: 2,
        });

        const fetchUrl = mockFetch.mock.calls[0][0] as string;
        expect(fetchUrl).toContain('search=Juan');
        expect(fetchUrl).toContain('sort_by=name');
        expect(fetchUrl).toContain('sort_direction=desc');
        expect(fetchUrl).toContain('country=MX');
        expect(fetchUrl).toContain('limit=10');
        expect(fetchUrl).toContain('page=2');
    });

    it('should handle API errors gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: 'bad-key', type: 'origin', limit: 20, page: 1, sort_direction: 'asc' });
        const text = result.content[0].text;

        expect(text).toContain('Failed to list addresses');
    });

    it('should include contact info when available', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, type: 'origin', limit: 20, page: 1, sort_direction: 'asc' });
        const text = result.content[0].text;

        expect(text).toContain('juan@test.com');
        expect(text).toContain('5512345678');
    });
});
