import { describe, it, expect } from 'vitest';

import {
    audiencesMatch,
    normalizeResourceUri,
    sanitizeDcrPayload,
    sanitizeDcrRequestBody,
    selectEnviaApiKey,
} from '../../src/auth/provider.js';

describe('normalizeResourceUri', () => {
    it('should strip a trailing slash when metadata advertises one', () => {
        expect(normalizeResourceUri('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    });
});

describe('audiencesMatch', () => {
    it('should accept a trailing-slash aud when OAUTH_SERVER_URL has none', () => {
        expect(audiencesMatch('http://127.0.0.1:3000/', 'http://127.0.0.1:3000')).toBe(true);
    });

    it('should accept an array aud when one entry matches after normalization', () => {
        expect(audiencesMatch(['other', 'http://127.0.0.1:3000/'], 'http://127.0.0.1:3000')).toBe(true);
    });

    it('should reject an aud that points at a different resource', () => {
        expect(audiencesMatch('https://mcp.envia.com', 'http://127.0.0.1:3000')).toBe(false);
    });
});

describe('sanitizeDcrPayload', () => {
    it('should drop MCP SDK keys queries rejects while keeping the register schema', () => {
        expect(
            sanitizeDcrPayload({
                client_name: 'Envia MCP Chat Demo',
                redirect_uris: ['http://127.0.0.1:3000'],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                client_id: 'should-not-forward',
                client_id_issued_at: 1,
            }),
        ).toEqual({
            client_name: 'Envia MCP Chat Demo',
            redirect_uris: ['http://127.0.0.1:3000'],
            grant_types: ['authorization_code'],
            token_endpoint_auth_method: 'none',
        });
    });
});

describe('sanitizeDcrRequestBody', () => {
    it('should sanitize a JSON object body that has leading whitespace', () => {
        const body = '  {"client_name":"demo","response_types":["code"]}';
        expect(JSON.parse(sanitizeDcrRequestBody(body))).toEqual({
            client_name: 'demo',
            token_endpoint_auth_method: 'none',
        });
    });

    it('should leave malformed JSON unchanged when the proxy cannot parse it', () => {
        expect(sanitizeDcrRequestBody('{not-json')).toBe('{not-json');
    });
});

describe('selectEnviaApiKey', () => {
    it('should use embedded api key when present in JWT payload', () => {
        expect(selectEnviaApiKey({ envia_api_key: 'permanent-key-abc123' }, 'jwt-token')).toBe('permanent-key-abc123');
    });

    it('should fall back to jwt token when envia_api_key claim is absent', () => {
        expect(selectEnviaApiKey({}, 'jwt-token')).toBe('jwt-token');
    });

    it('should fall back to jwt token when envia_api_key is whitespace only', () => {
        expect(selectEnviaApiKey({ envia_api_key: '   ' }, 'jwt-token')).toBe('jwt-token');
    });

    it('should fall back to jwt token when envia_api_key is not a string', () => {
        expect(selectEnviaApiKey({ envia_api_key: 42 }, 'jwt-token')).toBe('jwt-token');
    });

    it('should trim whitespace from the embedded key', () => {
        expect(selectEnviaApiKey({ envia_api_key: '  trimmed-key  ' }, 'jwt-token')).toBe('trimmed-key');
    });
});
