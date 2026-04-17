import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCreateClient } from '../../../src/tools/clients/create-client.js';
import { clearFormCache } from '../../../src/services/generic-form.js';

/**
 * Default mock: generic-form returns empty fields (validation no-op),
 * mutation POST returns a new client ID.
 */
function defaultMockResponse(url: string) {
    if (url.includes('/generic-form')) {
        return { ok: true, status: 200, json: () => Promise.resolve({ data: [] }) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve({ id: 55 }) };
}

describe('envia_create_client', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
        mockFetch = vi.fn().mockImplementation((url: string) => Promise.resolve(defaultMockResponse(url)));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCreateClient(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_create_client')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create client and return ID with contact name', async () => {
        // Arrange — minimal required fields
        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            name: 'Acme Corp',
            contact: { full_name: 'Juan Perez', email: 'juan@acme.com' },
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain('Client created successfully');
        expect(text).toContain('55');
        expect(text).toContain('Juan Perez');
    });

    it('should POST to /clients with correct body shape', async () => {
        // Arrange — include optional fields to verify serialization
        // Act
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            name: 'Beta LLC',
            company_name: 'Beta LLC Official',
            rfc: 'BET010101AAA',
            contact: { full_name: 'Ana Ruiz', phone: '5512345678' },
        });

        // Assert — mutation is POST to /clients
        const mutationCall = mockFetch.mock.calls.find((call) => !call[0].includes('/generic-form'));
        expect(mutationCall).toBeDefined();
        expect(mutationCall![1].method).toBe('POST');
        expect(mutationCall![0]).toContain('/clients');
        const body = JSON.parse(mutationCall![1].body);
        expect(body.name).toBe('Beta LLC');
        expect(body.rfc).toBe('BET010101AAA');
    });

    it('should call generic-form GET when billing_address has a country', async () => {
        // Arrange — billing_address with country triggers validation
        // Act
        await handler({
            api_key: MOCK_CONFIG.apiKey,
            name: 'Brazil Client',
            contact: { full_name: 'Carlos Silva' },
            billing_address: {
                country: 'BR',
                street: 'Rua das Flores',
                city: 'São Paulo',
                state: 'SP',
                postal_code: '01310-100',
            },
        });

        // Assert — generic-form called with the correct country
        const formCall = mockFetch.mock.calls.find((call) => call[0].includes('/generic-form'));
        expect(formCall).toBeDefined();
        expect(formCall![0]).toContain('country_code=BR');
    });

    it('should proceed with client creation when generic-form returns empty fields', async () => {
        // Arrange — graceful degradation: empty data array means no required fields to validate
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 55 }) });
        });

        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            name: 'Mexico Client',
            contact: { full_name: 'Luis Torres' },
            billing_address: { country: 'MX', city: 'Monterrey', state: 'NL' },
        });

        // Assert — client created despite degraded validation
        expect(result.content[0].text).toContain('Client created successfully');
    });

    it('should return mapped error message when the API create request fails', async () => {
        // Arrange — mutation endpoint returns 422
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({
                ok: false,
                status: 422,
                json: () => Promise.resolve({ message: 'name is required' }),
            });
        });

        // Act
        const result = await handler({
            api_key: MOCK_CONFIG.apiKey,
            name: '',
            contact: { full_name: 'Test User' },
        });

        // Assert — error text returned, not thrown
        expect(result.content[0].text).toContain('Failed to create client');
    });
});
