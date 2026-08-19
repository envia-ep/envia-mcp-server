import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
    ChatOAuthSession,
    buildAuthorizeUrl,
    canonicalizeOrigin,
    createMemoryStorage,
    generatePkce,
    isAllowedRedirectOrigin,
    parseCallbackParams,
    redirectUriForOrigin,
    stripTrailingSlash,
    OAUTH_CLIENT_STORAGE_KEY,
    OAUTH_PKCE_STORAGE_KEY,
    OAUTH_TOKENS_STORAGE_KEY,
} from '../../src/chat/oauth-client.js';

const MCP_ORIGIN = 'http://127.0.0.1:3000';

const AS_METADATA = {
    issuer: 'http://127.0.0.1:3000/',
    authorization_endpoint: 'http://127.0.0.1:3000/authorize',
    token_endpoint: 'http://127.0.0.1:3000/token',
    registration_endpoint: 'http://127.0.0.1:3000/register',
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('canonicalizeOrigin', () => {
    it('should rewrite localhost to 127.0.0.1 when the host is localhost', () => {
        expect(canonicalizeOrigin('http://localhost:3000')).toBe('http://127.0.0.1:3000');
    });

    it('should leave a loopback origin unchanged when it is already 127.0.0.1', () => {
        expect(canonicalizeOrigin('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    });
});

describe('isAllowedRedirectOrigin', () => {
    it('should accept loopback http when the host is 127.0.0.1', () => {
        expect(isAllowedRedirectOrigin('http://127.0.0.1:3000')).toBe(true);
    });

    it('should reject localhost http when queries requires RFC 8252 loopback', () => {
        expect(isAllowedRedirectOrigin('http://localhost:3000')).toBe(false);
    });

    it('should accept https when the host is a public stage URL', () => {
        expect(isAllowedRedirectOrigin('https://mcp-test.envia.com')).toBe(true);
    });
});

describe('redirectUriForOrigin', () => {
    it('should omit a trailing slash so authorize and token send the same redirect_uri', () => {
        expect(redirectUriForOrigin(MCP_ORIGIN)).toBe('http://127.0.0.1:3000');
    });
});

describe('stripTrailingSlash', () => {
    it('should match JWT aud when the discovered resource has a trailing slash', () => {
        expect(stripTrailingSlash('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    });
});

describe('parseCallbackParams', () => {
    it('should return the code and state when the callback succeeded', () => {
        expect(parseCallbackParams('?code=abc&state=xyz')).toEqual({
            code: 'abc',
            state: 'xyz',
            error: undefined,
            error_description: undefined,
        });
    });

    it('should return the error when the user denied consent', () => {
        expect(parseCallbackParams('?error=access_denied&error_description=Denied')).toEqual({
            code: undefined,
            state: undefined,
            error: 'access_denied',
            error_description: 'Denied',
        });
    });
});

describe('buildAuthorizeUrl', () => {
    it('should include PKCE S256 and a slash-stripped resource when building the authorize URL', () => {
        const url = new URL(
            buildAuthorizeUrl('http://127.0.0.1:3000/authorize', {
                clientId: '11111111-1111-1111-1111-111111111111',
                redirectUri: 'http://127.0.0.1:3000/',
                challenge: 'challenge',
                state: 'state',
                scope: 'mcp:ship',
                resource: 'http://127.0.0.1:3000/',
            }),
        );

        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('code_challenge')).toBe('challenge');
        expect(url.searchParams.get('resource')).toBe('http://127.0.0.1:3000');
        expect(url.searchParams.get('scope')).toBe('mcp:ship');
    });
});

describe('generatePkce', () => {
    it('should return a 43-character S256 challenge when WebCrypto is available', async () => {
        const pkce = await generatePkce();

        expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
        expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(pkce.state.length).toBeGreaterThan(0);
        expect(pkce.challenge).not.toBe(pkce.verifier);
    });
});

describe('ChatOAuthSession', () => {
    let persistent: ReturnType<typeof createMemoryStorage>;
    let session: ReturnType<typeof createMemoryStorage>;
    let fetchImpl: ReturnType<typeof vi.fn>;
    let navigate: ReturnType<typeof vi.fn>;
    let now: number;

    beforeEach(() => {
        persistent = createMemoryStorage();
        session = createMemoryStorage();
        navigate = vi.fn();
        now = 1_700_000_000_000;
        fetchImpl = vi.fn();
    });

    function makeOauth(): ChatOAuthSession {
        return new ChatOAuthSession(MCP_ORIGIN, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            persistentStorage: persistent,
            sessionStore: session,
            now: () => now,
            navigate,
        });
    }

    it('should register a public client and redirect to /authorize when starting login', async () => {
        fetchImpl
            .mockResolvedValueOnce(jsonResponse(AS_METADATA))
            .mockResolvedValueOnce(
                jsonResponse({
                    client_id: 'client-1',
                    redirect_uris: ['http://127.0.0.1:3000'],
                    token_endpoint_auth_method: 'none',
                }),
            );

        await makeOauth().startLogin('mcp:ship');

        expect(fetchImpl).toHaveBeenNthCalledWith(
            2,
            'http://127.0.0.1:3000/register',
            expect.objectContaining({ method: 'POST' }),
        );
        const registerBody = JSON.parse((fetchImpl.mock.calls[1] as unknown[])[1].body as string);
        expect(registerBody.token_endpoint_auth_method).toBe('none');
        expect(registerBody.redirect_uris).toEqual(['http://127.0.0.1:3000']);

        expect(navigate).toHaveBeenCalledTimes(1);
        const authorizeUrl = new URL(navigate.mock.calls[0][0] as string);
        expect(authorizeUrl.pathname).toBe('/authorize');
        expect(authorizeUrl.searchParams.get('client_id')).toBe('client-1');
        expect(authorizeUrl.searchParams.get('resource')).toBe(MCP_ORIGIN);
        expect(session.getItem(OAUTH_PKCE_STORAGE_KEY)).toContain('"verifier"');
        expect(persistent.getItem(OAUTH_CLIENT_STORAGE_KEY)).toContain('client-1');
    });

    it('should reuse a stored client when the redirect_uri still matches', async () => {
        persistent.setItem(
            OAUTH_CLIENT_STORAGE_KEY,
            JSON.stringify({ client_id: 'cached', redirect_uris: ['http://127.0.0.1:3000'] }),
        );
        fetchImpl.mockResolvedValueOnce(jsonResponse(AS_METADATA));

        await makeOauth().startLogin();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(navigate.mock.calls[0][0]).toContain('client_id=cached');
    });

    it('should store tokens and drop PKCE state when the callback code is valid', async () => {
        session.setItem(
            OAUTH_PKCE_STORAGE_KEY,
            JSON.stringify({
                verifier: 'verifier',
                challenge: 'challenge',
                state: 'csrf',
                redirectUri: 'http://127.0.0.1:3000/',
                resource: MCP_ORIGIN,
                clientId: 'client-1',
            }),
        );
        fetchImpl
            .mockResolvedValueOnce(jsonResponse(AS_METADATA))
            .mockResolvedValueOnce(
                jsonResponse({
                    access_token: 'jwt-access',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_token: 'refresh-1',
                    scope: 'shipments:read rates:read',
                }),
            );

        const handled = await makeOauth().handleRedirect('?code=auth-code&state=csrf');

        expect(handled).toBe(true);
        expect(session.getItem(OAUTH_PKCE_STORAGE_KEY)).toBeNull();
        const tokens = JSON.parse(session.getItem(OAUTH_TOKENS_STORAGE_KEY) as string);
        expect(tokens.access_token).toBe('jwt-access');
        expect(tokens.expires_at).toBe(now + 3600_000);

        const tokenCall = fetchImpl.mock.calls[1] as unknown[];
        expect(tokenCall[0]).toBe('http://127.0.0.1:3000/token');
        const body = new URLSearchParams(tokenCall[1].body as string);
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('code_verifier')).toBe('verifier');
        expect(body.get('resource')).toBe(MCP_ORIGIN);
    });

    it('should reject the callback when the stored state does not match', async () => {
        session.setItem(
            OAUTH_PKCE_STORAGE_KEY,
            JSON.stringify({
                verifier: 'v',
                challenge: 'c',
                state: 'expected',
                redirectUri: 'http://127.0.0.1:3000/',
                resource: MCP_ORIGIN,
                clientId: 'c1',
            }),
        );

        await expect(makeOauth().handleRedirect('?code=x&state=other')).rejects.toThrow('state mismatch');
    });

    it('should refresh when the access token is inside the 60s skew window', async () => {
        persistent.setItem(
            OAUTH_CLIENT_STORAGE_KEY,
            JSON.stringify({ client_id: 'client-1', redirect_uris: ['http://127.0.0.1:3000/'] }),
        );
        session.setItem(
            OAUTH_TOKENS_STORAGE_KEY,
            JSON.stringify({
                access_token: 'old',
                token_type: 'Bearer',
                refresh_token: 'rt',
                expires_at: now + 10_000,
            }),
        );
        fetchImpl
            .mockResolvedValueOnce(jsonResponse(AS_METADATA))
            .mockResolvedValueOnce(
                jsonResponse({
                    access_token: 'new-jwt',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_token: 'rt-2',
                }),
            );

        const token = await makeOauth().refreshIfNeeded();

        expect(token).toBe('new-jwt');
        const body = new URLSearchParams((fetchImpl.mock.calls[1] as unknown[])[1].body as string);
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('rt');
    });

    it('should return the current access token when it is still fresh', async () => {
        session.setItem(
            OAUTH_TOKENS_STORAGE_KEY,
            JSON.stringify({
                access_token: 'fresh',
                token_type: 'Bearer',
                expires_at: now + 3_600_000,
            }),
        );

        await expect(makeOauth().refreshIfNeeded()).resolves.toBe('fresh');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
