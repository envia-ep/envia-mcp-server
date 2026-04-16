import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCreateAddress } from '../../../src/tools/addresses/create-address.js';
import { clearFormCache } from '../../../src/services/generic-form.js';

/**
 * Default mock implementation that routes generic-form lookups to an empty
 * field array (so validation is a no-op) and mutations to a generated ID.
 * Tests that need specific backend errors override the mutation response
 * via `mockResolvedValueOnce` AFTER the first call to generic-form.
 */
function defaultMockResponse(url: string) {
    if (url.includes('/generic-form')) {
        return { ok: true, status: 200, json: () => Promise.resolve({ data: [] }) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve({ id: 42 }) };
}

describe('envia_create_address', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
        mockFetch = vi.fn().mockImplementation((url: string) => Promise.resolve(defaultMockResponse(url)));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCreateAddress(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_create_address')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create address and return ID', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type: 1,
            name: 'Test User',
            phone: '5512345678',
            street: 'Av. Reforma',
            city: 'CDMX',
            state: 'CX',
            country: 'MX',
            postal_code: '06600',
        });

        const text = result.content[0].text;
        expect(text).toContain('Address created successfully');
        expect(text).toContain('ID: 42');
        expect(text).toContain('origin');
    });

    it('should send correct body to API', async () => {
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            type: 2,
            name: 'Maria',
            phone: '5598765432',
            street: 'Calle 5',
            city: 'Monterrey',
            state: 'NL',
            country: 'MX',
            postal_code: '64000',
            district: 'Centro',
            identification_number: 'XAXX010101000',
        });

        // Skip the generic-form GET call; inspect the mutation POST.
        const mutationCall = mockFetch.mock.calls.find((call) => !call[0].includes('/generic-form'));
        expect(mutationCall).toBeDefined();
        const body = JSON.parse(mutationCall![1].body);
        expect(body.type).toBe(2);
        expect(body.name).toBe('Maria');
        expect(body.district).toBe('Centro');
        expect(body.identification_number).toBe('XAXX010101000');
    });

    it('should handle API errors', async () => {
        // Override only the mutation response (not the generic-form lookup).
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({
                ok: false,
                status: 422,
                json: () => Promise.resolve({ message: 'Validation failed' }),
            });
        });

        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type: 1,
            name: 'Test',
            phone: '123',
            street: 'St',
            city: 'City',
            state: 'ST',
            country: 'MX',
            postal_code: '00000',
        });

        expect(result.content[0].text).toContain('Failed to create address');
    });

    it('should label destination type correctly', async () => {
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            type: 2,
            name: 'Dest User',
            phone: '5500000000',
            street: 'St',
            city: 'City',
            state: 'ST',
            country: 'US',
            postal_code: '10001',
        });

        expect(result.content[0].text).toContain('destination');
    });
});
