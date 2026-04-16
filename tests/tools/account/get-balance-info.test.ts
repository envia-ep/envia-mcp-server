/**
 * Unit tests for envia_get_balance_info — formatter + tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerGetBalanceInfo, formatBalanceInfo } from '../../../src/tools/account/get-balance-info.js';

function buildUserInfoJwt(data: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ data, iat: 1 })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('formatBalanceInfo', () => {
    it('should format the balance with the currency symbol', () => {
        const output = formatBalanceInfo({ company_balance: '1000.00', company_currency: 'MXN', currency_symbol: '$' });

        expect(output).toContain('$1000.00 MXN');
    });

    it('should report credit line as not configured when credit_line_limit is null', () => {
        const output = formatBalanceInfo({ credit_line_limit: null });

        expect(output).toContain('not configured');
    });

    it('should format credit line with days when configured', () => {
        const output = formatBalanceInfo({ credit_line_limit: 50000, credit_line_days: 30, company_currency: 'MXN' });

        expect(output).toContain('30 days');
    });

    it('should mark auto-billing as enabled when flag is 1', () => {
        const output = formatBalanceInfo({ auto_billing: 1 });

        expect(output).toContain('Auto-billing:    enabled');
    });

    it('should mark auto-payment as disabled when flag is 0', () => {
        const output = formatBalanceInfo({ auto_payment: 0 });

        expect(output).toContain('Auto-payment:    disabled');
    });

    it('should include the EcartPay email when present', () => {
        const output = formatBalanceInfo({ ecartpay_email: 'jose@envia.com' });

        expect(output).toContain('jose@envia.com');
    });

    it('should omit EcartPay row when email is not configured', () => {
        const output = formatBalanceInfo({});

        expect(output).not.toContain('EcartPay');
    });
});

describe('envia_get_balance_info handler', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerGetBalanceInfo(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_get_balance_info')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return formatted balance on successful response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                token: buildUserInfoJwt({ company_balance: '9920988.48', company_currency: 'MXN', currency_symbol: '$' }),
            }),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('$9920988.48 MXN');
    });

    it('should return mapped error when backend returns 500', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
        });

        const result = await handler({ api_key: 'test-key' });

        expect(result.content[0].text).toContain('Failed to fetch balance information');
    });
});
