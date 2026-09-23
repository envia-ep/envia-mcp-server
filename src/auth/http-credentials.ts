/**
 * HTTP credential extraction for mixed-auth MCP requests.
 *
 * Authorization Bearer is reserved for MCP-audience OAuth JWTs (verified
 * upstream). Opaque Envia credentials travel as `x-api-key` or, during the
 * portal transition, as `api_key` in the JSON-RPC tool arguments.
 */

export interface HttpCredentialRequest {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    auth?: { extra?: Record<string, unknown> };
}

/**
 * True when `token` has three non-empty dot-separated segments (JWT shape).
 *
 * @param token - Candidate credential
 * @returns Whether the token looks like a JWT
 */
export function looksLikeJwt(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Read a single HTTP header, trimming whitespace. Arrays take the first value.
 *
 * @param req - Incoming request headers
 * @param name - Lower-case header name
 * @returns Trimmed value, or empty string when absent
 */
export function readHeader(req: HttpCredentialRequest, name: string): string {
    const raw = req.headers[name];
    if (typeof raw === 'string') {
        return raw.trim();
    }
    if (Array.isArray(raw) && typeof raw[0] === 'string') {
        return raw[0].trim();
    }
    return '';
}

/**
 * Read `api_key` from a JSON-RPC `tools/call` body. Empty or non-string values
 * are not credentials.
 *
 * A batch resolves to a credential only when every entry that carries one carries
 * the same value: the request builds a single client, so two identities in one
 * array cannot both be honoured.
 *
 * @param body - Parsed JSON-RPC body
 * @returns Trimmed api_key, or empty string
 */
export function extractBodyApiKey(body: unknown): string {
    if (Array.isArray(body)) {
        const keys = new Set(body.map((entry) => extractBodyApiKey(entry)).filter((key) => key !== ''));
        return keys.size === 1 ? [...keys][0]! : '';
    }
    if (body === null || typeof body !== 'object') {
        return '';
    }
    const params = (body as { params?: unknown }).params;
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
        return '';
    }
    const args = (params as { arguments?: unknown }).arguments;
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        return '';
    }
    const apiKey = (args as { api_key?: unknown }).api_key;
    return typeof apiKey === 'string' ? apiKey.trim() : '';
}

/**
 * Resolve the Envia credential for this HTTP request.
 *
 * Precedence: verified OAuth JWT extra → `x-api-key` → tool-argument `api_key`.
 * An Authorization header that failed JWT verification never reaches this
 * function (the bearer middleware already returned 401).
 *
 * @param req - Request after optional Bearer verification
 * @returns Credential to pass to `createEnviaServer`, or empty string
 */
export function resolveHttpEnviaApiKey(req: HttpCredentialRequest): string {
    const fromJwt = req.auth?.extra?.['enviaApiKey'];
    if (typeof fromJwt === 'string' && fromJwt.trim() !== '') {
        return fromJwt.trim();
    }
    const fromHeader = readHeader(req, 'x-api-key');
    if (fromHeader !== '') {
        return fromHeader;
    }
    return extractBodyApiKey(req.body);
}

/**
 * True when the request already carries a user credential on any accepted
 * HTTP channel.
 *
 * @param req - Request after optional Bearer verification
 * @returns Whether a non-empty credential is present
 */
export function hasHttpUserCredential(req: HttpCredentialRequest): boolean {
    return resolveHttpEnviaApiKey(req) !== '';
}
