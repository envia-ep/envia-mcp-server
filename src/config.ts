/**
 * Envia MCP Server — Configuration
 *
 * Reads environment variables and exposes typed config for the rest of the
 * server.  Defaults to **sandbox** so developers can experiment safely.
 */

export type EnviaEnvironment = "sandbox" | "production";

export interface EnviaConfig {
    /** JWT bearer token for Envia APIs. Empty when the request is unauthenticated. */
    apiKey: string;
    /**
     * Process-level ENVIA_API_KEY. Public catalog tools inherit this when the
     * request has no user credential. Anonymous tools (tracking) must not use it.
     */
    serverApiKey?: string;
    /** "sandbox" (default) or "production". */
    environment: EnviaEnvironment;
    /** Base URL for the Shipping API (e.g. ship/rate, ship/generate). */
    shippingBase: string;
    /** Base URL for the Queries API (e.g. webhooks, carriers). */
    queriesBase: string;
    /** Base URL for the Geocodes API (e.g. zipcode validation). */
    geocodesBase: string;
    /** Base URL for the EcartAPI (used to construct fulfillment URLs). Optional — sync is skipped when absent. */
    ecartApiBase?: string;
}

const BASES: Record<EnviaEnvironment, { shipping: string; queries: string }> = {
    sandbox: {
        shipping: "https://api-test.envia.com",
        queries: "https://queries-test.envia.com",
    },
    production: {
        shipping: "https://api.envia.com",
        queries: "https://queries.envia.com",
    },
};

/**
 * The Geocodes API is only available as a production endpoint.
 * There is no sandbox version — both environments use the same URL.
 */
const GEOCODES_BASE = "https://geocodes.envia.com";

export interface LoadConfigOptions {
    /**
     * When true, a missing API key is allowed so public tools (tracking) can run.
     * Combined with an explicit `apiKeyOverride` (including `''`), the process
     * `ENVIA_API_KEY` is not used — unauthenticated HTTP requests must not inherit it.
     */
    allowMissingApiKey?: boolean;
}

/**
 * Build configuration from environment variables.
 *
 * Required (unless `allowMissingApiKey` is true):
 *   ENVIA_API_KEY  — your JWT token
 *
 * Optional:
 *   ENVIA_ENVIRONMENT — "sandbox" (default) | "production"
 *
 * @param apiKeyOverride - Per-request key. Empty string with `allowMissingApiKey` skips the env fallback.
 * @param options - Loader flags
 * @returns Typed Envia configuration
 * @throws When no API key is available and `allowMissingApiKey` is not set
 */
export function loadConfig(apiKeyOverride?: string, options: LoadConfigOptions = {}): EnviaConfig {
    const envKey = process.env.ENVIA_API_KEY?.trim() || '';
    const skipEnvFallback = options.allowMissingApiKey === true && apiKeyOverride !== undefined;
    const apiKey = skipEnvFallback
        ? apiKeyOverride.trim()
        : (apiKeyOverride?.trim() || envKey);

    if (!apiKey && !options.allowMissingApiKey) {
        throw new Error(
            "ENVIA_API_KEY is required. Set it as an environment variable.\n" +
            "  Sandbox dashboard:    https://shipping-test.envia.com/settings/developers\n" +
            "  Production dashboard: https://shipping.envia.com/settings/developers\n" +
            "  Sandbox signup:       https://accounts-sandbox.envia.com/signup\n" +
            "  Production signup:    https://accounts.envia.com/signup",
        );
    }

    // Per-request keys always target production — only local/stdio dev sets sandbox via env var.
    const defaultEnv = apiKeyOverride?.trim() ? "production" : "sandbox";
    const raw = (process.env.ENVIA_ENVIRONMENT ?? defaultEnv).toLowerCase();
    const environment: EnviaEnvironment = raw === "production" ? "production" : "sandbox";

    const urls = BASES[environment];
    const ecartApiBase = process.env.ENVIA_ECART_HOSTNAME?.trim() || undefined;

    return {
        apiKey,
        serverApiKey: envKey || undefined,
        environment,
        shippingBase: urls.shipping,
        queriesBase: urls.queries,
        geocodesBase: GEOCODES_BASE,
        ecartApiBase,
    };
}
