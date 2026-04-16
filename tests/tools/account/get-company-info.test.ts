/**
 * Unit tests for envia_get_company_info — formatter + tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetCompanyInfo, formatCompanyInfo } from '../../../src/tools/account/get-company-info.js';

function buildUserInfoJwt(data: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ data, iat: 1 })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('formatCompanyInfo', () => {
    it('should include the company name and ID in the header row', () => {
        const output = formatCompanyInfo({ company_name: 'Acme', company_id: 99 });

        expect(output).toContain('Acme');
        expect(output).toContain('ID 99');
    });

    it('should mark international as enabled when flag is 1', () => {
        const output = formatCompanyInfo({ international: 1 });

        expect(output).toContain('International:  enabled');
    });

    it('should mark international as disabled when flag is 0', () => {
        const output = formatCompanyInfo({ international: 0 });

        expect(output).toContain('International:  disabled');
    });

    it('should list Shopify when has_shopify flag is 1', () => {
        const output = formatCompanyInfo({ has_shopify: 1 });

        expect(output).toContain('Shopify');
    });

    it('should list WooCommerce when has_woocommerce flag is 1', () => {
        const output = formatCompanyInfo({ has_woocommerce: 1 });

        expect(output).toContain('WooCommerce');
    });

    it('should omit integrations row when no integration flags are present', () => {
        const output = formatCompanyInfo({ company_name: 'NoShop' });

        expect(output).not.toContain('Integrations:');
    });

    it('should include the owner when owner_name is present', () => {
        const output = formatCompanyInfo({ owner_name: 'Jane Owner', owner_email: 'jane@example.com' });

        expect(output).toContain('Jane Owner');
        expect(output).toContain('jane@example.com');
    });
});

describe('envia_get_company_info handler', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetCompanyInfo(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_company_info')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call GET /user-information once with the configured base URL', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ token: buildUserInfoJwt({ company_name: 'Acme' }) }),
        });

        await handler({ api_key: 'test-key' });

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(mockFetch.mock.calls[0][0]).toBe(`${MOCK_CONFIG.queriesBase}/user-information`);
    });

    it('should return formatted company info on successful response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ token: buildUserInfoJwt({ company_name: 'Fedma CO', company_id: 254 }) }),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('Fedma CO');
    });

    it('should return mapped error text when backend fails with 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('Failed to fetch company information');
    });
});
