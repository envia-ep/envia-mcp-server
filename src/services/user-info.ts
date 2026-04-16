/**
 * Envia MCP Server — User Info Service
 *
 * Fetches and decodes the `GET /user-information` JWT. The endpoint packs
 * the entire user + company context into a signed JWT payload. Decoding is
 * purely for payload extraction — no signature verification is required here
 * because Envia's API gateway already verified the caller's own bearer token
 * when issuing this JWT back to the caller.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { UserInfoPayload, UserInfoResponse } from '../types/user-info.js';

/** Structured outcome of a user-info fetch. */
export interface UserInfoResult {
    ok: boolean;
    status: number;
    payload?: UserInfoPayload;
    error?: string;
}

/**
 * Base64url-decode a string into UTF-8 text.
 *
 * JWT payloads use base64url (RFC 4648 §5): `-` instead of `+`, `_` instead
 * of `/`, and no padding. Node's `Buffer.from(..., 'base64')` accepts both
 * variants as long as we pad the input to a length divisible by 4.
 */
function base64UrlDecode(segment: string): string {
    const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
    const normalised = padded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalised, 'base64').toString('utf-8');
}

/**
 * Extract the `data` object from a JWT payload string.
 *
 * The Envia user-information JWT wraps the real fields under a `data` key:
 *   `{ "data": { user_id, company_id, ... }, "iat": 1234567890 }`
 *
 * @throws Error if the token is not a three-part JWT or the payload is not
 *   valid JSON. Callers should catch and surface a generic failure to agents.
 */
function decodeUserInfoJwt(token: string): UserInfoPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Malformed user-information token (expected 3 JWT segments).');
    }
    const json = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(json) as { data?: UserInfoPayload };
    if (!parsed.data || typeof parsed.data !== 'object') {
        throw new Error('Malformed user-information payload (missing `data` object).');
    }
    return parsed.data;
}

/**
 * Fetch the current user's information from the Queries API and return the
 * decoded JWT payload.
 *
 * This function never throws for network or API failures; callers check
 * `result.ok` and present `result.error` to the end user via the standard
 * error-mapper pipeline. A thrown error here would only indicate an
 * unrecoverable JWT decoding bug, which is logged but not surfaced.
 *
 * @param client - Authenticated Envia API client
 * @param config - Server configuration with queries base URL
 */
export async function fetchUserInfo(
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<UserInfoResult> {
    const url = `${config.queriesBase}/user-information`;
    const res: ApiResponse<UserInfoResponse> = await client.get<UserInfoResponse>(url);

    if (!res.ok) {
        return { ok: false, status: res.status, error: res.error };
    }

    const token = res.data?.token;
    if (!token) {
        return {
            ok: false,
            status: res.status,
            error: 'user-information response did not contain a token.',
        };
    }

    try {
        const payload = decodeUserInfoJwt(token);
        return { ok: true, status: res.status, payload };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown decoding error.';
        return { ok: false, status: res.status, error: message };
    }
}

/**
 * Format a monetary balance with its currency symbol.
 *
 * The backend returns balance as a string that may contain many decimals.
 * We round to 2 decimal places for display while preserving the numeric
 * nature.
 */
export function formatBalance(value: string | number | undefined, symbol?: string): string {
    if (value === undefined || value === null) return '—';
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(numeric)) return '—';
    const prefix = symbol ?? '$';
    return `${prefix}${numeric.toFixed(2)}`;
}

// Export the decode function for targeted unit testing.
export { decodeUserInfoJwt };
