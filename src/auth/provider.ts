import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/**
 * Builds a ProxyOAuthServerProvider that delegates all OAuth flows to the
 * Envia queries API (the authoritative OAuth 2.0 Authorization Server).
 *
 * Required env vars:
 *   ENVIA_QUERIES_HOSTNAME — queries base URL / OAuth issuer
 *   OAUTH_JWT_KEY  — HS256 key shared with queries (= JWT_KEY in queries)
 *   OAUTH_SERVER_URL — public URL of this MCP server (JWT aud)
 */
export function createEnviaOAuthProvider(): ProxyOAuthServerProvider {
    const issuer = getOAuthIssuer();
    const jwtKey = getJwtKey();
    const resource = getResourceUri();

    const registrationUrl = `${issuer}/oauth/v2/register`;

    return new ProxyOAuthServerProvider({
        endpoints: {
            authorizationUrl: `${issuer}/oauth/v2/authorize`,
            tokenUrl: `${issuer}/oauth/v2/token`,
            revocationUrl: `${issuer}/oauth/v2/revoke`,
            registrationUrl,
        },
        verifyAccessToken: (token: string) => verifyAccessToken(token, issuer, jwtKey, resource),
        getClient: (clientId: string) => fetchClient(clientId, issuer),
        fetch: proxyOAuthFetch,
    });
}

const DCR_PAYLOAD_KEYS = [
    'client_name',
    'redirect_uris',
    'grant_types',
    'scope',
    'token_endpoint_auth_method',
    'client_uri',
    'logo_uri',
    'contacts',
    'description',
    'software_id',
    'software_version',
] as const;

/**
 * Queries `POST /oauth/v2/register` rejects unknown keys (Joi). The MCP SDK
 * forwards `response_types`, `client_id`, and `client_id_issued_at`.
 *
 * @param payload - Full DCR body from the MCP SDK
 * @returns Payload limited to queries' register schema
 */
export function sanitizeDcrPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const key of DCR_PAYLOAD_KEYS) {
        if (payload[key] !== undefined) sanitized[key] = payload[key];
    }
    // queries only supports public clients (PKCE); force auth method regardless of what the client requests
    sanitized['token_endpoint_auth_method'] = 'none';
    return sanitized;
}

/**
 * Proxies MCP SDK OAuth fetches to queries. DCR bodies are sanitized because
 * the SDK forwards keys queries' register schema rejects.
 *
 * @param input - Upstream URL
 * @param init - Fetch init
 * @returns Upstream response
 */
async function proxyOAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = String(input);
    let nextInit = init;
    if (url.includes('/oauth/v2/register') && typeof init?.body === 'string') {
        nextInit = { ...init, body: sanitizeDcrRequestBody(init.body) };
    }
    return fetch(input, nextInit);
}

/**
 * Strips MCP SDK DCR keys queries rejects. Malformed JSON is left unchanged
 * so a bad body still reaches queries instead of throwing in the proxy.
 *
 * @param body - Raw POST body
 * @returns Sanitized JSON, or the original string when it is not a JSON object
 */
export function sanitizeDcrRequestBody(body: string): string {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{')) return body;
    try {
        const original = JSON.parse(trimmed) as Record<string, unknown>;
        return JSON.stringify(sanitizeDcrPayload(original));
    } catch {
        return body;
    }
}

/**
 * Verifies the queries-issued JWT locally. The JWT itself is the credential
 * used against queries (token_user accepts OAuth JWTs). No API-key exchange.
 *
 * @param token - Bearer access token
 * @param issuer - ENVIA_QUERIES_HOSTNAME
 * @param jwtKey - HS256 secret
 * @param resource - This MCP server's canonical URI (aud)
 * @returns AuthInfo for the MCP SDK
 */
async function verifyAccessToken(
    token: string,
    issuer: string,
    jwtKey: string,
    resource: string,
): Promise<AuthInfo> {
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(jwtKey);

    let payload: Record<string, unknown>;
    try {
        const { payload: p } = await jwtVerify(token, secret, {
            algorithms: ['HS256'],
            issuer,
        });
        payload = p as Record<string, unknown>;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid or expired access token: ${msg}`);
    }

    if (!audiencesMatch(payload['aud'], resource)) {
        throw new Error('Invalid or expired access token: unexpected audience');
    }

    const jti = String(payload['jti'] ?? '');
    const sub = String(payload['sub'] ?? '');
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
    const scope = typeof payload['scope'] === 'string' ? payload['scope'] : '';

    return {
        token,
        clientId: String(payload['client_id'] ?? ''),
        scopes: scope.split(' ').filter(Boolean),
        expiresAt: exp > 0 ? exp * 1000 : undefined,
        extra: {
            sub,
            company_id: payload['company_id'],
            jti,
            enviaApiKey: token,
        },
    };
}

/**
 * Loads public client metadata from queries (no secret hash).
 *
 * @param clientId - OAuth client_id
 * @param issuer - queries base URL
 * @returns Client metadata or undefined
 */
async function fetchClient(clientId: string, issuer: string): Promise<OAuthClientInformationFull | undefined> {
    let resp: Response;
    try {
        resp = await fetch(`${issuer}/oauth/v2/clients/${encodeURIComponent(clientId)}`);
    } catch {
        return undefined;
    }
    if (!resp.ok) return undefined;

    const data = await resp.json() as Record<string, unknown>;
    return {
        client_id: String(data['client_id'] ?? data['id']),
        client_name: typeof data['client_name'] === 'string' ? data['client_name'] : undefined,
        redirect_uris: (data['redirect_uris'] as string[]) ?? [],
        grant_types: (data['grant_types'] as string[]) ?? [],
        token_endpoint_auth_method: String(data['token_endpoint_auth_method'] ?? 'none'),
        scope: typeof data['scope'] === 'string' ? data['scope'] : undefined,
    };
}

/**
 * Queries OAuth issuer. Hostnames without a scheme are treated as https
 * so Node fetch does not throw `Failed to parse URL`.
 *
 * @returns Absolute issuer URL, no trailing slash
 */
function getOAuthIssuer(): string {
    const raw = process.env['ENVIA_QUERIES_HOSTNAME']?.trim();
    if (!raw) {
        throw new Error(
            'ENVIA_QUERIES_HOSTNAME is required. Set it to the queries API base URL.\n' +
            '  Example: ENVIA_QUERIES_HOSTNAME=https://queries.envia.com',
        );
    }
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withScheme.replace(/\/$/, '');
}

function getJwtKey(): string {
    const key = process.env['OAUTH_JWT_KEY']?.trim();
    if (!key) {
        throw new Error('OAUTH_JWT_KEY is required. It must match the JWT_KEY used by the queries API.');
    }
    return key;
}

/**
 * Canonical MCP resource URI used as JWT `aud` (OAUTH_SERVER_URL, no trailing slash).
 *
 * @returns Resource URI
 */
function getResourceUri(): string {
    const raw = process.env['OAUTH_SERVER_URL']?.trim() || `http://127.0.0.1:${process.env['PORT'] ?? '3000'}`;
    return normalizeResourceUri(raw);
}

/**
 * Strips a trailing slash so `http://host:3000` and `http://host:3000/` compare equal.
 *
 * @param uri - Absolute URI
 * @returns URI without a trailing slash
 */
export function normalizeResourceUri(uri: string): string {
    return uri.replace(/\/$/, '');
}

/**
 * JWT `aud` may be a string or array; MCP metadata often appends a trailing slash
 * while queries stores the RFC 8707 resource without one.
 *
 * @param tokenAud - `aud` claim
 * @param expected - This MCP server's canonical URI
 * @returns True when any audience matches after slash-normalization
 */
export function audiencesMatch(tokenAud: unknown, expected: string): boolean {
    const want = normalizeResourceUri(expected);
    const values = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
    return values.some((value) => typeof value === 'string' && normalizeResourceUri(value) === want);
}

export { createEnviaOAuthProvider as EnviaOAuthProvider };
export type { ProxyOAuthServerProvider };
