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

const BASES: Record<EnviaEnvironment, { shipping: string; queries: string; geocodes: string }> = {
  sandbox: {
    shipping: "https://api-test.envia.com",
    queries: "https://queries-test.envia.com",
    geocodes: "https://geocodes-test.envia.com",
  },
  production: {
    shipping: "https://api.envia.com",
    queries: "https://queries.envia.com",
    geocodes: "https://geocodes.envia.com",
  },
};

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
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ENVIA_API_KEY is required. Set it as an environment variable.\n" +
        "  Sandbox:    https://app.envia.com → Settings → API Keys\n" +
        "  Production: https://app-production.envia.com → Settings → API Keys",
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
    geocodesBase: urls.geocodes,
  };
}
