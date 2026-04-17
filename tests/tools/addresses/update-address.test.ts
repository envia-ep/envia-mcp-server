import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerUpdateAddress } from '../../../src/tools/addresses/update-address.js';
import { clearFormCache } from '../../../src/services/generic-form.js';

/**
 * Default mock: generic-form returns empty field array (validation no-op),
 * mutation PUT returns a successful boolean response.
 */
function defaultMockResponse(url: string) {
    if (url.includes('/generic-form')) {
        return { ok: true, status: 200, json: () => Promise.resolve({ data: [] }) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve({ data: true }) };
}

describe('envia_update_address', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
        mockFetch = vi.fn().mockImplementation((url: string) => Promise.resolve(defaultMockResponse(url)));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerUpdateAddress(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_update_address')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should update address and return success message with updated fields', async () => {
        // Arrange — partial update: change street only on address 99
        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            address_id: 99,
            street: 'Av. Insurgentes',
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain('Address 99 updated successfully');
        expect(text).toContain('street');
    });

    it('should PUT to /user-address/{address_id} with correct body', async () => {
        // Arrange — update address 77 with a new name
        // Act
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            address_id: 77,
            name: 'Maria Lopez',
        });

        // Assert — mutation call uses PUT to the correct path
        const mutationCall = mockFetch.mock.calls.find((call) => !call[0].includes('/generic-form'));
        expect(mutationCall).toBeDefined();
        expect(mutationCall![0]).toContain('/user-address/77');
        expect(mutationCall![1].method).toBe('PUT');
        const body = JSON.parse(mutationCall![1].body);
        expect(body.name).toBe('Maria Lopez');
    });

    it('should call generic-form GET before mutation when country is provided', async () => {
        // Arrange — country is present, so validation should fire
        // Act
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            address_id: 55,
            country: 'BR',
            postal_code: '01310-100',
        });

        // Assert — generic-form fetched with the correct country code
        const formCall = mockFetch.mock.calls.find((call) => call[0].includes('/generic-form'));
        expect(formCall).toBeDefined();
        expect(formCall![0]).toContain('country_code=BR');
    });

    it('should proceed with mutation even when generic-form returns empty fields', async () => {
        // Arrange — generic-form graceful degradation (empty data = no-op validation)
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: true }) });
        });

        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            address_id: 33,
            country: 'MX',
            city: 'Monterrey',
        });

        // Assert — mutation still ran and returned success
        expect(result.content[0].text).toContain('Address 33 updated successfully');
    });

    it('should return mapped error message when mutation API returns an error', async () => {
        // Arrange — mutation endpoint responds with 422
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

        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            address_id: 44,
            street: 'Bad Street',
        });

        // Assert — error surfaced as text, not thrown
        expect(result.content[0].text).toContain('Failed to update address 44');
    });
});
