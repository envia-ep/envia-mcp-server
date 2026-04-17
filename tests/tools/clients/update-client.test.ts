import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerUpdateClient } from '../../../src/tools/clients/update-client.js';
import { clearFormCache } from '../../../src/services/generic-form.js';

/**
 * Default mock: generic-form returns empty fields (validation no-op),
 * mutation PUT returns a successful boolean response.
 */
function defaultMockResponse(url: string) {
    if (url.includes('/generic-form')) {
        return { ok: true, status: 200, json: () => Promise.resolve({ data: [] }) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve({ data: true }) };
}

describe('envia_update_client', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
        mockFetch = vi.fn().mockImplementation((url: string) => Promise.resolve(defaultMockResponse(url)));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerUpdateClient(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_update_client')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should update client and return success message with client ID', async () => {
        // Arrange — update client 88 with a new name
        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            client_id: 88,
            name: 'Updated Corp',
        });

        // Assert
        expect(result.content[0].text).toContain('Client 88 updated successfully');
    });

    it('should PUT to /clients/{client_id} with correct body', async () => {
        // Arrange — update client 42 with name and external reference
        // Act
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            client_id: 42,
            name: 'New Name',
            external_ref: 'EXT-999',
        });

        // Assert — mutation uses PUT and targets the correct client path
        const mutationCall = mockFetch.mock.calls.find((call) => !call[0].includes('/generic-form'));
        expect(mutationCall).toBeDefined();
        expect(mutationCall![0]).toContain('/clients/42');
        expect(mutationCall![1].method).toBe('PUT');
        const body = JSON.parse(mutationCall![1].body);
        expect(body.name).toBe('New Name');
        expect(body.external_ref).toBe('EXT-999');
    });

    it('should call generic-form GET when billing_address contains a country', async () => {
        // Arrange — billing_address with country triggers validation
        // Act
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            client_id: 11,
            name: 'Colombia Client',
            billing_address: {
                country: 'CO',
                city: 'Bogotá',
                state: 'DC',
            },
        });

        // Assert — generic-form fetched for the correct country
        const formCall = mockFetch.mock.calls.find((call) => call[0].includes('/generic-form'));
        expect(formCall).toBeDefined();
        expect(formCall![0]).toContain('country_code=CO');
    });

    it('should proceed with mutation when generic-form returns no fields', async () => {
        // Arrange — empty form data = graceful degradation (no validation applied)
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: true }) });
        });

        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            client_id: 22,
            name: 'Graceful Corp',
            billing_address: { country: 'MX', street: 'Av. Test', city: 'CDMX' },
        });

        // Assert — update succeeded despite degraded validation
        expect(result.content[0].text).toContain('Client 22 updated successfully');
    });

    it('should return mapped error message when the update API call fails', async () => {
        // Arrange — PUT endpoint returns 404 (client not found)
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ message: 'Client not found' }),
            });
        });

        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            client_id: 9999,
            name: 'Ghost Corp',
        });

        // Assert — error surfaced as text, not thrown
        expect(result.content[0].text).toContain('Failed to update client 9999');
    });
});
