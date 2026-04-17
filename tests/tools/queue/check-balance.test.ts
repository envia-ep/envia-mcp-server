/**
 * Unit tests for envia_check_balance — helpers + tool handler.
 *
 * The tool reads balance from user-information JWT (via fetchUserInfo) rather
 * than calling the TMS queue directly. All fetch mocks simulate the
 * GET /user-information response from the Queries API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerCheckBalance, parseBalance, formatCheckResult } from '../../../src/tools/queue/check-balance.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildUserInfoJwt(data: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ data, iat: 1 })).toString('base64url');
    return `${header}.${payload}.sig`;
}

function mockUserInfo(data: Record<string, unknown>): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: buildUserInfoJwt(data) }),
    });
}

// ---------------------------------------------------------------------------
// parseBalance
// ---------------------------------------------------------------------------

describe('parseBalance', () => {
    it('should parse a decimal string into a finite number', () => {
        expect(parseBalance('9920988.48')).toBe(9920988.48);
    });

    it('should parse an integer string', () => {
        expect(parseBalance('1000')).toBe(1000);
    });

    it('should accept a number directly', () => {
        expect(parseBalance(500.5)).toBe(500.5);
    });

    it('should return NaN for undefined', () => {
        expect(parseBalance(undefined)).toBeNaN();
    });

    it('should return NaN for a non-numeric string', () => {
        expect(parseBalance('not-a-number')).toBeNaN();
    });

    it('should return NaN for an empty string', () => {
        expect(parseBalance('')).toBeNaN();
    });
});

// ---------------------------------------------------------------------------
// formatCheckResult
// ---------------------------------------------------------------------------

describe('formatCheckResult', () => {
    it('should report sufficient when balance exceeds requested amount', () => {
        const output = formatCheckResult(1000, 100, '$', 'MXN');

        expect(output).toContain('✓ Sufficient');
        expect(output).toContain('$900.00 MXN');
    });

    it('should report insufficient when balance is less than requested amount', () => {
        const output = formatCheckResult(50, 200, '$', 'MXN');

        expect(output).toContain('✗ Insufficient');
        expect(output).toContain('$150.00 MXN');
    });

    it('should report sufficient when balance equals requested amount exactly', () => {
        const output = formatCheckResult(100, 100, '$', 'MXN');

        expect(output).toContain('✓ Sufficient');
    });

    it('should include the billing tip when balance is insufficient', () => {
        const output = formatCheckResult(0, 50, '$', 'USD');

        expect(output).toContain('Add funds');
    });

    it('should display current balance and requested amount in the output', () => {
        const output = formatCheckResult(2500, 800, '$', 'MXN');

        expect(output).toContain('$2500.00 MXN');
        expect(output).toContain('$800.00 MXN');
    });
});

// ---------------------------------------------------------------------------
// envia_check_balance handler
// ---------------------------------------------------------------------------

describe('envia_check_balance handler', () => {
    let handler: ToolHandler;

    beforeEach(() => {
        vi.restoreAllMocks();
        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerCheckBalance(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_check_balance')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should report sufficient balance when account covers the requested amount', async () => {
        vi.stubGlobal('fetch', mockUserInfo({ company_balance: '9920988.48', company_currency: 'MXN', currency_symbol: '$' }));

        const result = await handler({ api_key: 'test-key', amount: 500 });

        expect(result.content[0].text).toContain('✓ Sufficient');
        expect(result.content[0].text).toContain('$9920988.48 MXN');
    });

    it('should report insufficient balance and show shortfall amount', async () => {
        vi.stubGlobal('fetch', mockUserInfo({ company_balance: '30.00', company_currency: 'MXN', currency_symbol: '$' }));

        const result = await handler({ api_key: 'test-key', amount: 150 });

        expect(result.content[0].text).toContain('✗ Insufficient');
        expect(result.content[0].text).toContain('$120.00 MXN');
    });

    it('should return error message when user-info fetch fails (500)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
        }));

        const result = await handler({ api_key: 'test-key', amount: 100 });

        expect(result.content[0].text).toContain('Failed to fetch account balance');
    });

    it('should return error message when user-info fetch fails (401)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({}),
        }));

        const result = await handler({ api_key: 'test-key', amount: 100 });

        expect(result.content[0].text).toContain('Failed to fetch account balance');
    });

    it('should return error when balance field is missing from payload', async () => {
        vi.stubGlobal('fetch', mockUserInfo({ company_currency: 'MXN', currency_symbol: '$' }));

        const result = await handler({ api_key: 'test-key', amount: 100 });

        expect(result.content[0].text).toContain('not a valid number');
    });

    it('should use the currency symbol from the account payload', async () => {
        vi.stubGlobal('fetch', mockUserInfo({ company_balance: '500.00', company_currency: 'USD', currency_symbol: 'US$' }));

        const result = await handler({ api_key: 'test-key', amount: 200 });

        expect(result.content[0].text).toContain('USD');
    });
});
