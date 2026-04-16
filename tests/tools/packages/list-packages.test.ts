import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerListPackages } from '../../../src/tools/packages/list-packages.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makePackage(overrides: Record<string, unknown> = {}) {
    return {
        id: 50,
        name: 'Standard Box',
        content: 'Electronics',
        package_type_id: 1,
        weight: 2.5,
        weight_unit: 'KG',
        height: 15,
        length: 30,
        width: 20,
        length_unit: 'CM',
        declared_value: 500,
        is_default: 0,
        is_favorite: 0,
        ...overrides,
    };
}

function makeListResponse(packages: unknown[], total?: number) {
    return {
        data: packages,
        total: total ?? packages.length,
        emptyState: packages.length === 0 ? 1 : 0,
    };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('envia_list_packages', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([makePackage()])),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListPackages(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_packages')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return formatted package list', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('Standard Box');
        expect(text).toContain('Box');
        expect(text).toContain('Electronics');
        expect(text).toContain('2.5 KG');
        expect(text).toContain('30×20×15 CM');
    });

    it('should show declared value when present', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('$500');
    });

    it('should return empty message when no packages found', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });

        expect(result.content[0].text).toContain('No saved packages found');
    });

    it('should handle API errors gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });

        expect(result.content[0].text).toContain('Failed to list packages');
    });

    it('should show favorite and default flags', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeListResponse([
                makePackage({ is_default: 1, is_favorite: 1 }),
            ])),
        });

        const result = await handler({ api_key: MOCK_CONFIG.apiKey, limit: 20, page: 1 });
        const text = result.content[0].text;

        expect(text).toContain('★ default');
        expect(text).toContain('♥ favorite');
    });
});
