import { describe, it, expect } from 'vitest';
import { validateToken, sanitizeToken } from '../../src/utils/token-validator.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, unknown>, validSeconds = 3600): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const fullPayload = { exp: Math.floor(Date.now() / 1000) + validSeconds, ...payload };
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    return `${header}.${body}.fake-signature`;
}

// ---------------------------------------------------------------------------
// validateToken
// ---------------------------------------------------------------------------

describe('validateToken', () => {
    it('should return valid claims for token with data.company_id and data.user_id', () => {
        const token = makeJwt({ data: { company_id: 42, user_id: 99 } });

        const result = validateToken(token);

        expect(result.valid).toBe(true);
        if (result.valid) {
            expect(result.claims.companyId).toBe('42');
            expect(result.claims.userId).toBe('99');
            expect(result.claims.exp).toBeGreaterThan(0);
            expect(result.claims.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
    });

    it('should return valid claims for token with top-level companyId and userId (camelCase)', () => {
        const token = makeJwt({ companyId: 'abc', userId: 'def' });

        const result = validateToken(token);

        expect(result.valid).toBe(true);
        if (result.valid) {
            expect(result.claims.companyId).toBe('abc');
            expect(result.claims.userId).toBe('def');
        }
    });

    it('should return valid claims for token with top-level company_id and user_id (snake_case)', () => {
        const token = makeJwt({ company_id: 10, user_id: 20 });

        const result = validateToken(token);

        expect(result.valid).toBe(true);
        if (result.valid) {
            expect(result.claims.companyId).toBe('10');
            expect(result.claims.userId).toBe('20');
        }
    });

    it('should fail for expired token with readable timestamp', () => {
        const token = makeJwt({ data: { company_id: 1, user_id: 1 } }, -3600);

        const result = validateToken(token);

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toContain('Session expired at');
            expect(result.error).toContain('Please log in again');
            expect(result.error).toMatch(/\d{4}-\d{2}-\d{2}T/);
        }
    });

    it('should fail for token missing exp claim', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const body = Buffer.from(JSON.stringify({ data: { company_id: 1, user_id: 1 } })).toString('base64url');
        const token = `${header}.${body}.fake-signature`;

        const result = validateToken(token);

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Token missing expiration claim');
        }
    });

    it('should fail for token missing company_id', () => {
        const token = makeJwt({ data: { user_id: 1 } });

        const result = validateToken(token);

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Token missing company context. Please log in again.');
        }
    });

    it('should fail for token missing user_id', () => {
        const token = makeJwt({ data: { company_id: 1 } });

        const result = validateToken(token);

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Token missing user context. Please log in again.');
        }
    });

    it('should fail for malformed base64 payload', () => {
        const result = validateToken('header.!!!invalid-base64!!!.signature');

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Malformed token: unable to decode JWT payload');
        }
    });

    it('should fail for non-JSON payload', () => {
        const header = Buffer.from('{"alg":"HS256"}').toString('base64url');
        const body = Buffer.from('this is not json').toString('base64url');
        const token = `${header}.${body}.signature`;

        const result = validateToken(token);

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Malformed token: unable to decode JWT payload');
        }
    });

    it('should fail for token with fewer than 3 segments', () => {
        const result = validateToken('only.two');

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Malformed token: expected 3 JWT segments');
        }
    });

    it('should fail for empty string', () => {
        const result = validateToken('');

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.error).toBe('Malformed token: expected 3 JWT segments');
        }
    });
});

// ---------------------------------------------------------------------------
// sanitizeToken
// ---------------------------------------------------------------------------

describe('sanitizeToken', () => {
    it('should mask all but last 6 characters', () => {
        const result = sanitizeToken('eyJhbGciOiJIUzI1NiJ9.payload.signature');

        expect(result).toBe('***nature');
    });

    it('should return *** for short tokens', () => {
        const result = sanitizeToken('abc');

        expect(result).toBe('***');
    });

    it('should handle 6-char token', () => {
        const result = sanitizeToken('abcdef');

        expect(result).toBe('***');
    });
});
