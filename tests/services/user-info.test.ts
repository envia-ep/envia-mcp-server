/**
 * Unit tests for the user-info service — JWT decoding and fetch orchestration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUserInfo, decodeUserInfoJwt, formatBalance } from '../../src/services/user-info.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';

/**
 * Build a valid unsigned JWT with the given payload data.
 *
 * The decoder only reads the payload segment; signature verification is not
 * performed here (the gateway already verified the caller's bearer token).
 */
function buildJwt(data: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ data, iat: 1776381239 })).toString('base64url');
    const signature = 'test-signature';
    return `${header}.${payload}.${signature}`;
}

describe('decodeUserInfoJwt', () => {
    it('should decode a well-formed user-information JWT payload', () => {
        const token = buildJwt({ user_id: 4521, company_name: 'Fedma CO' });

        const payload = decodeUserInfoJwt(token);

        expect(payload.user_id).toBe(4521);
    });

    it('should preserve string fields like salesman_name exactly', () => {
        const token = buildJwt({ salesman_name: 'Juan Perez', salesman_phone: '3221597534' });

        const payload = decodeUserInfoJwt(token);

        expect(payload.salesman_name).toBe('Juan Perez');
    });

    it('should throw when the token is not a three-segment JWT', () => {
        expect(() => decodeUserInfoJwt('not.a.jwt.token')).toThrow(/3 JWT segments/);
    });

    it('should throw when the payload is missing the data object', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ iat: 123 })).toString('base64url');
        const malformed = `${header}.${payload}.sig`;

        expect(() => decodeUserInfoJwt(malformed)).toThrow(/missing `data` object/);
    });
});

describe('fetchUserInfo', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return decoded payload on successful response', async () => {
        const token = buildJwt({ user_id: 4521, company_id: 254, salesman_name: 'Test Agent' });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ token }),
        });
        const client = new EnviaApiClient(MOCK_CONFIG);

        const result = await fetchUserInfo(client, MOCK_CONFIG);

        expect(result.ok).toBe(true);
        expect(result.payload?.user_id).toBe(4521);
    });

    it('should surface backend error when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });
        const client = new EnviaApiClient(MOCK_CONFIG);

        const result = await fetchUserInfo(client, MOCK_CONFIG);

        expect(result.ok).toBe(false);
    });

    it('should fail gracefully when token is missing from response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        });
        const client = new EnviaApiClient(MOCK_CONFIG);

        const result = await fetchUserInfo(client, MOCK_CONFIG);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('did not contain a token');
    });

    it('should fail gracefully when token cannot be decoded', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ token: 'malformed-token' }),
        });
        const client = new EnviaApiClient(MOCK_CONFIG);

        const result = await fetchUserInfo(client, MOCK_CONFIG);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('JWT segments');
    });
});

describe('formatBalance', () => {
    it('should format a string balance with 2 decimals and currency symbol', () => {
        expect(formatBalance('9920988.48', '$')).toBe('$9920988.48');
    });

    it('should format a numeric balance with 2 decimals', () => {
        expect(formatBalance(100.5, '$')).toBe('$100.50');
    });

    it('should return em-dash for undefined balance', () => {
        expect(formatBalance(undefined, '$')).toBe('—');
    });

    it('should return em-dash when value cannot be parsed as number', () => {
        expect(formatBalance('not-a-number', '$')).toBe('—');
    });

    it('should default to dollar sign when symbol is not provided', () => {
        expect(formatBalance(50)).toBe('$50.00');
    });
});
