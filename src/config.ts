/**
 * Envia MCP Server — Configuration
 *
 * Reads environment variables and exposes typed config for the rest of the
 * server.  Defaults to **sandbox** so developers can experiment safely.
 */

export type EnviaEnvironment = "sandbox" | "production";

export interface EnviaConfig {
    /** JWT bearer token for Envia APIs. */
    apiKey: string;
    /** "sandbox" (default) or "production". */
    environment: EnviaEnvironment;
    /** Base URL for the Shipping API (e.g. ship/rate, ship/generate). */
    shippingBase: string;
    /** Base URL for the Queries API (e.g. webhooks, carriers). */
    queriesBase: string;
    /** Base URL for the Geocodes API (e.g. zipcode validation). */
    geocodesBase: string;
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

/**
 * Build configuration from environment variables.
 *
 * Required:
 *   ENVIA_API_KEY  — your JWT token
 *
 * Optional:
 *   ENVIA_ENVIRONMENT — "sandbox" (default) | "production"
 */
export function loadConfig(): EnviaConfig {
    const apiKey = process.env.ENVIA_API_KEY?.trim();
    if (!apiKey) {
        throw new Error(
            "ENVIA_API_KEY is required. Set it as an environment variable.\n" +
            "  Sandbox dashboard:    https://shipping-test.envia.com/settings/developers\n" +
            "  Production dashboard: https://shipping.envia.com/settings/developers\n" +
            "  Sandbox signup:       https://accounts-sandbox.envia.com/signup\n" +
            "  Production signup:    https://accounts.envia.com/signup",
        );
    }

    const raw = (process.env.ENVIA_ENVIRONMENT ?? "sandbox").toLowerCase();
    const environment: EnviaEnvironment = raw === "production" ? "production" : "sandbox";

    const urls = BASES[environment];

    return {
        apiKey,
        environment,
        shippingBase: urls.shipping,
        queriesBase: urls.queries,
        geocodesBase: GEOCODES_BASE,
    };
}
