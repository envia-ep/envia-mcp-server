import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetCarrierConfig } from '../../../src/tools/config/get-carrier-config.js';

function makeService(name = 'ground', cod = 1) {
    return { id: 1, carrier_id: 1, service: 'Nacional', name, description: 'FedEx Ground', delivery_estimate: '2-4 días', active: 1, cash_on_delivery: cod, international: 0, blocked: 0, blocked_admin: 0 };
}

function makeCarrier(overrides: Record<string, unknown> = {}) {
    return {
        id: 1, name: 'fedex', description: 'FedEx',
        has_custom_key: 0, logo: 'https://img/fedex.svg',
        country_code: 'MX', blocked: 0, blocked_admin: 0,
        services: [makeService()],
        ...overrides,
    };
}

describe('envia_get_carrier_config', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeCarrier()] }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const { server, handlers } = createMockServer();
        registerGetCarrierConfig(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        handler = handlers.get('envia_get_carrier_config')!;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('should return carrier description in output', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('FedEx');
    });

    it('should show active service count', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('1 active service');
    });

    it('should show COD: Yes when carrier has COD service', async () => {
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('COD: Yes');
    });

    it('should show COD: No when no COD service', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeCarrier({ services: [makeService('express', 0)] })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('COD: No');
    });

    it('should show BLOCKED for blocked carriers', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [makeCarrier({ blocked: 1 })] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('[BLOCKED]');
    });

    it('should return "No carrier configuration found" when empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ data: [] }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('No carrier configuration found.');
    });

    it('should pass limit param when provided', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey, limit: 10 });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('limit=10');
    });

    it('should return error message on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const result = await handler({ api_key: MOCK_CONFIG.apiKey });
        expect(result.content[0].text).toContain('Failed to get carrier config:');
    });

    it('should use custom api_key in Authorization header', async () => {
        await handler({ api_key: 'my-key' });
        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should call carrier-company/config endpoint', async () => {
        await handler({ api_key: MOCK_CONFIG.apiKey });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('carrier-company/config');
    });
});
