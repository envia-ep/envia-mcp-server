/**
 * Mixed-auth tool access.
 *
 * Three access modes exist on HTTP:
 * - anonymous — no user OAuth and no ENVIA_API_KEY (public Envia endpoints such as tracking)
 * - publicCatalog — no user OAuth, but inherit ENVIA_API_KEY (catalogs behind Envia auth)
 * - authenticated — user OAuth required; never inherit ENVIA_API_KEY
 *
 * Mark a catalog tool with `asPublicCatalogTool(...)` on `registerTool` and
 * `resolvePublicCatalogClient(...)` in the handler. Quote, additional-services,
 * and address-validation tools also prepend `ANONYMOUS_FALLBACK_DISCLAIMER`
 * when they inherit ENVIA_API_KEY.
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';

/** ChatGPT mixed-auth: callable anonymously; OAuth is optional. */
export const PUBLIC_CATALOG_SECURITY_SCHEMES = [
    { type: 'noauth' },
    { type: 'oauth2', scopes: ['mcp:read'] },
];

/** ChatGPT authenticated tools: OAuth required. Scopes match default DCR (`mcp:read`). */
export const AUTHENTICATED_TOOL_SECURITY_SCHEMES = [
    { type: 'oauth2', scopes: ['mcp:read'] },
];

/**
 * Tools that may run on HTTP without a user credential.
 * Keep in sync with `documentation/tool-access.md`.
 */
export const PUBLIC_CATALOG_TOOL_NAMES: ReadonlySet<string> = new Set([
    'envia_track_package',
    'envia_list_carriers',
    'envia_list_additional_services',
    'envia_quote_shipment',
    'envia_get_carrier_constraints',
    'envia_get_additional_service_prices',
    'envia_validate_address',
    'envia_classify_hscode',
    'envia_get_branches_catalog',
    'envia_find_drop_off',
    'envia_ai_address_requirements',
]);

/**
 * True when `tools/call` for this name is allowed without a user credential.
 *
 * @param toolName - MCP tool name
 * @returns Whether the tool is public/anonymous catalog
 */
export function isPublicCatalogToolName(toolName: string): boolean {
    return PUBLIC_CATALOG_TOOL_NAMES.has(toolName);
}

/**
 * Options that make `resolveClient` fall back to `config.serverApiKey` (ENVIA_API_KEY)
 * when the request has no user credential.
 */
export const PUBLIC_CATALOG_CLIENT_OPTIONS = { inheritServerApiKey: true } as const;

/**
 * Mark a tool descriptor as a public catalog: ChatGPT can call it without OAuth.
 *
 * Pair with `resolvePublicCatalogClient` so unauthenticated calls still send ENVIA_API_KEY
 * to Envia catalog APIs that require auth.
 *
 * @param config - Tool descriptor passed to `server.registerTool`
 * @returns Descriptor with `noauth` + optional `oauth2` security schemes
 */
export function asPublicCatalogTool<T extends object>(config: T): T & {
    securitySchemes: typeof PUBLIC_CATALOG_SECURITY_SCHEMES;
    _meta: { securitySchemes: typeof PUBLIC_CATALOG_SECURITY_SCHEMES };
} {
    const existingMeta = '_meta' in config && config._meta !== null && typeof config._meta === 'object'
        ? (config._meta as Record<string, unknown>)
        : {};

    return {
        ...config,
        securitySchemes: PUBLIC_CATALOG_SECURITY_SCHEMES,
        _meta: {
            ...existingMeta,
            securitySchemes: PUBLIC_CATALOG_SECURITY_SCHEMES,
        },
    };
}

/**
 * Mark a tool descriptor as OAuth-required for ChatGPT (`oauth2` only, no `noauth`).
 *
 * Writes both the OpenAI-documented top-level field and the `_meta` mirror.
 *
 * @param config - Tool descriptor passed to `server.registerTool`
 * @returns Descriptor with authenticated `securitySchemes`
 */
export function asAuthenticatedTool<T extends object>(config: T): T & {
    securitySchemes: typeof AUTHENTICATED_TOOL_SECURITY_SCHEMES;
    _meta: { securitySchemes: typeof AUTHENTICATED_TOOL_SECURITY_SCHEMES };
} {
    const existingMeta = '_meta' in config && config._meta !== null && typeof config._meta === 'object'
        ? (config._meta as Record<string, unknown>)
        : {};

    return {
        ...config,
        securitySchemes: AUTHENTICATED_TOOL_SECURITY_SCHEMES,
        _meta: {
            ...existingMeta,
            securitySchemes: AUTHENTICATED_TOOL_SECURITY_SCHEMES,
        },
    };
}

/**
 * Resolve the API client for a public catalog tool.
 *
 * Uses a per-request override or user OAuth token when present; otherwise
 * inherits `config.serverApiKey` (ENVIA_API_KEY). Tracking must not use this.
 *
 * @param client - Default request client (may have an empty key)
 * @param apiKey - Optional per-request override from tool input
 * @param config - Server configuration including `serverApiKey`
 * @returns Client that can call Envia catalog endpoints
 */
export function resolvePublicCatalogClient(
    client: EnviaApiClient,
    apiKey: string | undefined,
    config: EnviaConfig,
): EnviaApiClient {
    return resolveClient(client, apiKey, config, PUBLIC_CATALOG_CLIENT_OPTIONS);
}

/**
 * Disclaimer prepended when a catalog/quote tool falls back to ENVIA_API_KEY
 * because the caller did not send a user credential.
 */
export const ANONYMOUS_FALLBACK_DISCLAIMER =
    'Disclaimer: Service availability and pricing may vary from the rates assigned to your account. ' +
    'Sign in or provide your API key to get your assigned rates.';

/**
 * True when the request has no user credential (OAuth or api_key) and the
 * server will inherit `config.serverApiKey` (ENVIA_API_KEY).
 *
 * @param apiKey - Optional per-request override from tool input
 * @param config - Server configuration including request `apiKey` and `serverApiKey`
 * @returns Whether the call uses ENVIA_API_KEY as an anonymous fallback
 */
export function isUsingServerApiKeyFallback(
    apiKey: string | undefined,
    config: EnviaConfig,
): boolean {
    if (apiKey?.trim()) {
        return false;
    }
    if (config.apiKey?.trim()) {
        return false;
    }
    return Boolean(config.serverApiKey?.trim());
}

/**
 * Prepend the anonymous-fallback disclaimer when the request used ENVIA_API_KEY
 * because no user auth was sent. Authenticated responses are unchanged.
 *
 * @param text - Tool response body
 * @param apiKey - Optional per-request override from tool input
 * @param config - Server configuration including request `apiKey` and `serverApiKey`
 * @returns Response text, with disclaimer prepended when falling back
 */
export function withAnonymousFallbackDisclaimer(
    text: string,
    apiKey: string | undefined,
    config: EnviaConfig,
): string {
    if (!isUsingServerApiKeyFallback(apiKey, config)) {
        return text;
    }
    return `${ANONYMOUS_FALLBACK_DISCLAIMER}\n\n${text}`;
}
