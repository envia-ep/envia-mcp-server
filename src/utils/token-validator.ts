/**
 * Envia MCP Server — JWT Token Validator
 *
 * Pre-flight validation of JWT tokens without requiring the server's secret key.
 * Decodes the payload to check expiration and required claims.
 * Used to fail fast on invalid/expired tokens before making API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenClaims {
    companyId: string;
    userId: string;
    exp: number;
    expiresAt: string;
}

export type TokenValidationResult =
    | { valid: true; claims: TokenClaims }
    | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/**
 * Decode a JWT and validate expiration + required claims without verifying
 * the cryptographic signature. Useful for failing fast on clearly invalid
 * tokens before making a network round-trip.
 *
 * @param token - Raw JWT string (header.payload.signature)
 * @returns Validation result with decoded claims or a human-readable error
 */
export function validateToken(token: string): TokenValidationResult {
    const segments = token.split('.');
    if (segments.length !== 3) {
        return { valid: false, error: 'Malformed token: expected 3 JWT segments' };
    }

    let payload: Record<string, unknown>;
    try {
        const json = Buffer.from(segments[1], 'base64url').toString('utf-8');
        payload = JSON.parse(json) as Record<string, unknown>;
    } catch {
        return { valid: false, error: 'Malformed token: unable to decode JWT payload' };
    }

    // --- Expiration ---
    const exp = payload.exp;
    if (exp === undefined || exp === null || typeof exp !== 'number') {
        return { valid: false, error: 'Token missing expiration claim' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) {
        const expiresAt = new Date(exp * 1000).toISOString();
        return { valid: false, error: `Session expired at ${expiresAt}. Please log in again.` };
    }

    // --- Company ID ---
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const companyId = data.company_id ?? payload.company_id ?? data.companyId ?? payload.companyId;
    if (companyId === undefined || companyId === null) {
        return { valid: false, error: 'Token missing company context. Please log in again.' };
    }

    // --- User ID ---
    const userId = data.user_id ?? payload.user_id ?? data.userId ?? payload.userId;
    if (userId === undefined || userId === null) {
        return { valid: false, error: 'Token missing user context. Please log in again.' };
    }

    return {
        valid: true,
        claims: {
            companyId: String(companyId),
            userId: String(userId),
            exp,
            expiresAt: new Date(exp * 1000).toISOString(),
        },
    };
}

// ---------------------------------------------------------------------------
// Token sanitisation
// ---------------------------------------------------------------------------

/**
 * Mask a JWT for safe logging, keeping only the last 6 characters visible.
 *
 * @param token - Raw token string
 * @returns Masked string (e.g. `***abc123`)
 */
export function sanitizeToken(token: string): string {
    if (token.length <= 6) {
        return '***';
    }
    return '***' + token.slice(-6);
}
