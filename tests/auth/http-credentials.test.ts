import { describe, it, expect } from 'vitest';

import {
    extractBodyApiKey,
    hasHttpUserCredential,
    looksLikeJwt,
    readHeader,
    resolveHttpEnviaApiKey,
} from '../../src/auth/http-credentials.js';

describe('looksLikeJwt', () => {
    it('should return true when the token has three non-empty segments', () => {
        expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true);
    });

    it('should return false when the token is opaque', () => {
        expect(looksLikeJwt('heroku-legacy-token')).toBe(false);
    });

    it('should return false when a segment is empty', () => {
        expect(looksLikeJwt('aaa..ccc')).toBe(false);
    });
});

describe('readHeader', () => {
    it('should trim a string header', () => {
        expect(readHeader({ headers: { 'x-api-key': '  secret  ' } }, 'x-api-key')).toBe('secret');
    });

    it('should return empty string when the header is absent', () => {
        expect(readHeader({ headers: {} }, 'x-api-key')).toBe('');
    });
});

describe('extractBodyApiKey', () => {
    it('should read api_key from a tools/call body', () => {
        expect(
            extractBodyApiKey({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name: 'envia_list_shipments', arguments: { api_key: ' portal-key ' } },
            }),
        ).toBe('portal-key');
    });

    it('should return empty string when api_key is whitespace', () => {
        expect(
            extractBodyApiKey({
                params: { arguments: { api_key: '   ' } },
            }),
        ).toBe('');
    });

    it('should return empty string for a JSON-RPC batch', () => {
        expect(extractBodyApiKey([{ method: 'initialize' }])).toBe('');
    });
});

describe('resolveHttpEnviaApiKey', () => {
    it('should prefer a verified JWT extra over x-api-key and body api_key', () => {
        const key = resolveHttpEnviaApiKey({
            headers: { 'x-api-key': 'header-key' },
            body: { params: { arguments: { api_key: 'body-key' } } },
            auth: { extra: { enviaApiKey: 'jwt-key' } },
        });

        expect(key).toBe('jwt-key');
    });

    it('should use x-api-key when no JWT extra is present', () => {
        const key = resolveHttpEnviaApiKey({
            headers: { 'x-api-key': 'header-key' },
            body: { params: { arguments: { api_key: 'body-key' } } },
        });

        expect(key).toBe('header-key');
    });

    it('should fall back to body api_key for the portal transition', () => {
        const key = resolveHttpEnviaApiKey({
            headers: {},
            body: { params: { arguments: { api_key: 'body-key' } } },
        });

        expect(key).toBe('body-key');
    });

    it('should treat whitespace JWT extra as missing', () => {
        expect(
            hasHttpUserCredential({
                headers: {},
                auth: { extra: { enviaApiKey: '   ' } },
            }),
        ).toBe(false);
    });
});
