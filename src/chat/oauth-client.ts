/**
 * Browser OAuth 2.0 client for the MCP chat demo.
 *
 * Talks to this MCP server's proxy endpoints (/register, /authorize, /token),
 * which delegate to the queries authorization server. PKCE S256 is mandatory.
 * Redirect URIs must be https or loopback http (127.0.0.1 / [::1]) — never localhost.
 */

export const OAUTH_CLIENT_STORAGE_KEY = 'envia_mcp_oauth_client';
export const OAUTH_PKCE_STORAGE_KEY = 'envia_mcp_oauth_pkce';
export const OAUTH_TOKENS_STORAGE_KEY = 'envia_mcp_oauth_tokens';
export const DEFAULT_OAUTH_SCOPE = 'mcp:ship';
export const DEFAULT_CLIENT_NAME = 'Envia MCP Chat Demo';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);

export interface OAuthStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface OAuthClientRegistration {
    client_id: string;
    redirect_uris: string[];
    token_endpoint_auth_method?: string;
    scope?: string;
}

export interface OAuthTokens {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    /** Epoch ms when the access token should be treated as expired. */
    expires_at: number;
}

export interface OAuthServerMetadata {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
}

export interface ProtectedResourceMetadata {
    resource: string;
    authorization_servers?: string[];
    scopes_supported?: string[];
}

export interface PkcePair {
    verifier: string;
    challenge: string;
    state: string;
}

export interface ChatOAuthDeps {
    fetchImpl?: typeof fetch;
    persistentStorage?: OAuthStorage;
    sessionStore?: OAuthStorage;
    now?: () => number;
    navigate?: (url: string) => void;
}

/**
 * In-memory Storage stand-in for Node tests (no localStorage).
 *
 * @returns A Map-backed OAuthStorage
 */
export function createMemoryStorage(): OAuthStorage {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}

/**
 * Strips a trailing slash so JWT `aud` and RFC 8707 `resource` compare equal.
 *
 * @param uri - Absolute URI
 * @returns URI without a trailing slash
 */
export function stripTrailingSlash(uri: string): string {
    return uri.replace(/\/$/, '');
}

/**
 * Rewrites `localhost` to `127.0.0.1`. queries rejects `http://localhost` redirect URIs.
 *
 * @param origin - window.location.origin
 * @returns Origin safe to register as a redirect_uri
 */
export function canonicalizeOrigin(origin: string): string {
    const url = new URL(origin);
    if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1';
    }
    return stripTrailingSlash(url.origin);
}

/**
 * True when the origin is loopback http or any https — the queries redirect policy.
 *
 * @param origin - Canonical origin
 * @returns Whether the origin may be registered
 */
export function isAllowedRedirectOrigin(origin: string): boolean {
    const url = new URL(origin);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Redirect URI registered for this chat page (document origin, no trailing slash).
 * queries compares redirect_uri with string equality; `http://host:port/` and
 * `http://host:port` are different strings even though Express serves both as `/`.
 *
 * @param origin - Canonical origin
 * @returns redirect_uri without a trailing slash
 */
export function redirectUriForOrigin(origin: string): string {
    return stripTrailingSlash(origin);
}

/**
 * Encodes bytes as base64url without padding.
 *
 * @param bytes - Raw bytes
 * @returns base64url string
 */
export function base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a PKCE S256 verifier/challenge pair and a CSRF state.
 *
 * @returns PKCE values
 */
export async function generatePkce(): Promise<PkcePair> {
    const verifier = base64UrlEncode(randomBytes(32));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return {
        verifier,
        challenge: base64UrlEncode(new Uint8Array(digest)),
        state: base64UrlEncode(randomBytes(16)),
    };
}

/**
 * Builds the MCP /authorize URL (which redirects to queries).
 *
 * @param authorizationEndpoint - From AS metadata
 * @param params - Authorize query
 * @returns Absolute authorize URL
 */
export function buildAuthorizeUrl(
    authorizationEndpoint: string,
    params: {
        clientId: string;
        redirectUri: string;
        challenge: string;
        state: string;
        scope: string;
        resource: string;
    },
): string {
    const url = new URL(authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('code_challenge', params.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', params.state);
    url.searchParams.set('scope', params.scope);
    url.searchParams.set('resource', stripTrailingSlash(params.resource));
    return url.href;
}

/**
 * Reads OAuth callback query parameters.
 *
 * @param search - location.search including the leading `?`
 * @returns Parsed callback fields
 */
export function parseCallbackParams(search: string): {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
} {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const code = params.get('code') ?? undefined;
    const state = params.get('state') ?? undefined;
    const error = params.get('error') ?? undefined;
    const errorDescription = params.get('error_description') ?? undefined;
    return { code, state, error, error_description: errorDescription };
}

/**
 * Orchestrates DCR + PKCE + token exchange against the MCP OAuth proxy.
 */
export class ChatOAuthSession {
    private readonly mcpOrigin: string;
    private readonly fetchImpl: typeof fetch;
    private readonly persistentStorage: OAuthStorage;
    private readonly sessionStore: OAuthStorage;
    private readonly now: () => number;
    private readonly navigate: (url: string) => void;

    /**
     * @param mcpOrigin - Public origin of this MCP server (must match OAUTH_SERVER_URL)
     * @param deps - Injectable fetch, storage, clock, and navigation
     */
    constructor(mcpOrigin: string, deps: ChatOAuthDeps = {}) {
        this.mcpOrigin = stripTrailingSlash(mcpOrigin);
        this.fetchImpl = deps.fetchImpl ?? fetch.bind(globalThis);
        this.persistentStorage = deps.persistentStorage ?? browserStorage('local');
        this.sessionStore = deps.sessionStore ?? browserStorage('session');
        this.now = deps.now ?? Date.now;
        this.navigate = deps.navigate ?? ((url) => {
            window.location.assign(url);
        });
    }

    /**
     * @returns Stored access token when it is still unexpired; otherwise null.
     * Does not refresh. Call {@link ChatOAuthSession.refreshIfNeeded} for a usable token.
     */
    getAccessToken(): string | null {
        const tokens = this.readTokens();
        if (!tokens) return null;
        if (tokens.expires_at > this.now()) return tokens.access_token;
        return null;
    }

    /**
     * @returns True when a usable or refreshable token is stored
     */
    isSignedIn(): boolean {
        const tokens = this.readTokens();
        return Boolean(tokens && (tokens.expires_at > this.now() || tokens.refresh_token));
    }

    /**
     * @returns Granted scope string, if any
     */
    getGrantedScope(): string | null {
        return this.readTokens()?.scope ?? null;
    }

    /**
     * Starts the authorization-code + PKCE flow.
     *
     * @param scope - Space-delimited scopes (default mcp:ship)
     */
    async startLogin(scope: string = DEFAULT_OAUTH_SCOPE): Promise<void> {
        if (!isAllowedRedirectOrigin(this.mcpOrigin)) {
            throw new Error(
                `Redirect origin must be https or loopback http (127.0.0.1). Open this page at ${canonicalizeOrigin(this.mcpOrigin)} instead of localhost.`,
            );
        }

        const metadata = await this.discover();
        const redirectUri = redirectUriForOrigin(this.mcpOrigin);
        const client = await this.ensureClient(metadata, redirectUri, scope);
        const pkce = await generatePkce();

        this.sessionStore.setItem(
            OAUTH_PKCE_STORAGE_KEY,
            JSON.stringify({ ...pkce, redirectUri, resource: this.mcpOrigin, clientId: client.client_id }),
        );

        this.navigate(
            buildAuthorizeUrl(metadata.authorization_endpoint, {
                clientId: client.client_id,
                redirectUri,
                challenge: pkce.challenge,
                state: pkce.state,
                scope,
                resource: this.mcpOrigin,
            }),
        );
    }

    /**
     * Completes the flow when the page loaded with ?code= or ?error=.
     *
     * @param search - location.search
     * @returns True when a callback was handled
     */
    async handleRedirect(search: string): Promise<boolean> {
        const callback = parseCallbackParams(search);
        if (!callback.code && !callback.error) return false;

        const rawPkce = this.sessionStore.getItem(OAUTH_PKCE_STORAGE_KEY);
        this.sessionStore.removeItem(OAUTH_PKCE_STORAGE_KEY);

        if (callback.error) {
            throw new Error(callback.error_description || callback.error);
        }
        if (!rawPkce) {
            throw new Error('OAuth callback is missing the PKCE session. Sign in again.');
        }

        const pkce = JSON.parse(rawPkce) as PkcePair & { redirectUri: string; resource: string; clientId: string };
        if (callback.state !== pkce.state) {
            throw new Error('OAuth state mismatch. Sign in again.');
        }

        const metadata = await this.discover();
        const tokens = await this.exchangeCode(metadata.token_endpoint, {
            clientId: pkce.clientId,
            code: callback.code as string,
            verifier: pkce.verifier,
            redirectUri: pkce.redirectUri,
            resource: pkce.resource,
        });
        this.writeTokens(tokens);
        return true;
    }

    /**
     * Refreshes when the access token is missing or within 60 seconds of expiry.
     *
     * @returns A usable access token
     */
    async refreshIfNeeded(): Promise<string> {
        const tokens = this.readTokens();
        if (!tokens) {
            throw new Error('Not signed in. Click Sign in with Envia.');
        }
        if (tokens.expires_at > this.now() + 60_000) {
            return tokens.access_token;
        }
        if (!tokens.refresh_token) {
            this.signOut();
            throw new Error('Session expired. Sign in with Envia again.');
        }

        const metadata = await this.discover();
        const client = this.readClient();
        if (!client) {
            this.signOut();
            throw new Error('OAuth client registration is missing. Sign in again.');
        }

        const refreshed = await this.refresh(metadata.token_endpoint, client.client_id, tokens.refresh_token);
        this.writeTokens(refreshed);
        return refreshed.access_token;
    }

    /** Drops tokens. Keeps the DCR client_id so the next login can reuse it. */
    signOut(): void {
        this.sessionStore.removeItem(OAUTH_TOKENS_STORAGE_KEY);
        this.sessionStore.removeItem(OAUTH_PKCE_STORAGE_KEY);
    }

    /**
     * @returns AS metadata from this MCP server
     */
    async discover(): Promise<OAuthServerMetadata> {
        const res = await this.fetchImpl(`${this.mcpOrigin}/.well-known/oauth-authorization-server`);
        if (!res.ok) {
            throw new Error(`OAuth discovery failed (${res.status}). Is the MCP server in HTTP mode?`);
        }
        return (await res.json()) as OAuthServerMetadata;
    }

    /**
     * @returns Protected-resource metadata (resource = JWT aud)
     */
    async discoverResource(): Promise<ProtectedResourceMetadata> {
        const res = await this.fetchImpl(`${this.mcpOrigin}/.well-known/oauth-protected-resource`);
        if (!res.ok) {
            throw new Error(`Protected-resource discovery failed (${res.status})`);
        }
        return (await res.json()) as ProtectedResourceMetadata;
    }

    /**
     * Registers a public client once and reuses it while the redirect_uri matches.
     *
     * @param metadata - AS metadata
     * @param redirectUri - Registered callback
     * @param scope - Requested allowlist
     * @returns Stored or newly registered client
     */
    async ensureClient(
        metadata: OAuthServerMetadata,
        redirectUri: string,
        scope: string,
    ): Promise<OAuthClientRegistration> {
        const existing = this.readClient();
        const wantRedirect = stripTrailingSlash(redirectUri);
        if (
            existing?.client_id &&
            existing.redirect_uris?.some((uri) => stripTrailingSlash(uri) === wantRedirect)
        ) {
            return existing;
        }
        if (!metadata.registration_endpoint) {
            throw new Error('Authorization server does not advertise a registration_endpoint');
        }

        const res = await this.fetchImpl(metadata.registration_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_name: DEFAULT_CLIENT_NAME,
                redirect_uris: [redirectUri],
                token_endpoint_auth_method: 'none',
                grant_types: ['authorization_code', 'refresh_token'],
                scope,
            }),
        });
        const body = await res.text();
        if (!res.ok) {
            throw new Error(`Client registration failed (${res.status}): ${body}`);
        }

        const client = JSON.parse(body) as OAuthClientRegistration;
        this.persistentStorage.setItem(OAUTH_CLIENT_STORAGE_KEY, JSON.stringify(client));
        return client;
    }

    /**
     * @param tokenEndpoint - MCP /token (proxied to queries)
     * @param params - Authorization-code grant
     * @returns Stored token record
     */
    async exchangeCode(
        tokenEndpoint: string,
        params: { clientId: string; code: string; verifier: string; redirectUri: string; resource: string },
    ): Promise<OAuthTokens> {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: params.clientId,
            code: params.code,
            code_verifier: params.verifier,
            redirect_uri: params.redirectUri,
            resource: stripTrailingSlash(params.resource),
        });
        return this.postToken(tokenEndpoint, body);
    }

    /**
     * @param tokenEndpoint - MCP /token
     * @param clientId - Public client_id
     * @param refreshToken - Current refresh token
     * @returns Rotated token record
     */
    async refresh(tokenEndpoint: string, clientId: string, refreshToken: string): Promise<OAuthTokens> {
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
            resource: this.mcpOrigin,
        });
        return this.postToken(tokenEndpoint, body);
    }

    private async postToken(tokenEndpoint: string, body: URLSearchParams): Promise<OAuthTokens> {
        const res = await this.fetchImpl(tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Token request failed (${res.status}): ${text}`);
        }
        const json = (await res.json()) as Omit<OAuthTokens, 'expires_at'> & { expires_in?: number };
        const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
        return {
            access_token: json.access_token,
            token_type: json.token_type,
            expires_in: json.expires_in,
            refresh_token: json.refresh_token,
            scope: json.scope,
            expires_at: this.now() + expiresIn * 1000,
        };
    }

    private readClient(): OAuthClientRegistration | null {
        const raw = this.persistentStorage.getItem(OAUTH_CLIENT_STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as OAuthClientRegistration;
        } catch {
            return null;
        }
    }

    private readTokens(): OAuthTokens | null {
        const raw = this.sessionStore.getItem(OAUTH_TOKENS_STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as OAuthTokens;
        } catch {
            return null;
        }
    }

    private writeTokens(tokens: OAuthTokens): void {
        this.sessionStore.setItem(OAUTH_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    }
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

/**
 * @param kind - Browser storage bucket
 * @returns localStorage or sessionStorage, or an in-memory fallback
 */
function browserStorage(kind: 'local' | 'session'): OAuthStorage {
    try {
        if (kind === 'local' && typeof localStorage !== 'undefined') {
            return localStorage;
        }
        if (kind === 'session' && typeof sessionStorage !== 'undefined') {
            return sessionStorage;
        }
    } catch {
        /* private mode / SSR */
    }
    return createMemoryStorage();
}
