/**
 * Envia MCP Server — HTTP API Client
 *
 * Thin wrapper around `fetch` that handles:
 *  - Bearer-token auth
 *  - JSON serialisation
 *  - Retries with exponential back-off for transient errors (429, 5xx)
 *  - Friendly error messages the agent can act on
 *  - URL domain allowlist (prevents SSRF)
 */

import type { EnviaConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiRequestOptions {
    /** Full URL (the caller is responsible for building it from config). */
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
    /** Override default timeout (ms). Default: 30 000. */
    timeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
    /** Human-readable error message when ok === false. */
    error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500; // doubles each retry
const DEFAULT_TIMEOUT_MS = 30_000;

/** Only these hostnames are allowed for authenticated requests. */
const ALLOWED_HOSTS = new Set([
    "api.envia.com",
    "api-test.envia.com",
    "queries.envia.com",
    "queries-test.envia.com",
    // Geocodes API only has a production endpoint — no sandbox version exists.
    "geocodes.envia.com",
]);

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class EnviaApiClient {
    private readonly config: EnviaConfig;

    constructor(config: EnviaConfig) {
        this.config = config;
    }

    /**
     * Perform an authenticated request against any Envia API.
     *
     * Retries automatically on 429 (rate-limited) and 5xx errors.
     * Blocks requests to non-Envia domains (SSRF prevention).
     */
    async request<T = unknown>(opts: ApiRequestOptions): Promise<ApiResponse<T>> {
        const { url, method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

        // --- SSRF prevention: only allow Envia domains ---
        try {
            const parsedUrl = new URL(url);
            if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
                return {
                    ok: false,
                    status: 0,
                    data: {} as T,
                    error: `Blocked: request to unauthorized host "${parsedUrl.hostname}". Only Envia API domains are allowed.`,
                };
            }
        } catch {
            return {
                ok: false,
                status: 0,
                data: {} as T,
                error: "Blocked: invalid URL.",
            };
        }

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);

                const headers: Record<string, string> = {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                };

                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });

                clearTimeout(timer);

                const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

                if (response.ok) {
                    return { ok: true, status: response.status, data: json as T };
                }

                // Decide whether to retry
                const retryable = response.status === 429 || response.status >= 500;
                if (retryable && attempt < MAX_RETRIES) {
                    const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
                    await sleep(delay);
                    continue;
                }

                // Non-retryable or exhausted retries — return the error
                return {
                    ok: false,
                    status: response.status,
                    data: json as T,
                    error: friendlyError(response.status, json),
                };
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));

                if (attempt < MAX_RETRIES) {
                    const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
                    await sleep(delay);
                    continue;
                }
            }
        }

        // All retries exhausted with a network-level error
        // Do NOT expose raw error details — they may contain infra info
        return {
            ok: false,
            status: 0,
            data: {} as T,
            error: `Network error after ${MAX_RETRIES + 1} attempts. Check your internet connection and try again.`,
        };
    }

    // ---- Convenience helpers ------------------------------------------------

    async get<T = unknown>(url: string): Promise<ApiResponse<T>> {
        return this.request<T>({ url, method: "GET" });
    }

    async post<T = unknown>(url: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
        return this.request<T>({ url, method: "POST", body });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map common HTTP status codes to messages an AI agent can act on.
 * Sanitises detail to avoid leaking internal API information.
 */
function friendlyError(status: number, body: Record<string, unknown>): string {
    // Extract only known safe fields, truncate, and never dump full body
    const detail =
        typeof body.message === "string"
            ? body.message.slice(0, 200)
            : typeof body.error === "string"
                ? body.error.slice(0, 200)
                : "No additional details available.";

    switch (status) {
        case 400:
            return `Bad request — check that all required parameters are correct. Detail: ${detail}`;
        case 401:
            return "Authentication failed — verify your ENVIA_API_KEY is valid and not expired.";
        case 402:
            return "Insufficient balance — add funds to your Envia account before retrying.";
        case 403:
            return "Forbidden — your API key does not have permission for this operation.";
        case 404:
            return `Not found — the requested resource does not exist. Detail: ${detail}`;
        case 422:
            return `Validation error — one or more fields are invalid. Detail: ${detail}`;
        case 429:
            return "Rate limited — too many requests. Wait a moment and try again.";
        default:
            if (status >= 500) {
                return `Envia server error (${status}). Try again shortly.`;
            }
            return `Unexpected error (${status}). Please try again.`;
    }
}
