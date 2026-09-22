import type { RequestHandler } from 'express';

import { looksLikeJwt } from './http-credentials.js';

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * Wraps Bearer-auth middleware so a request the verifier cannot possibly accept
 * continues anonymously instead of failing every method on the connection.
 *
 * A token with JWT shape is verified as before: expired or forged access tokens
 * still receive 401, which is how an OAuth client learns to refresh. Anything
 * else — an opaque legacy token, a non-Bearer scheme — is ignored. It never
 * authenticates, and the protected-tool gate still challenges, but `initialize`
 * and `tools/list` keep working for clients that send a stale header.
 *
 * Public tools such as `envia_track_package` can run anonymously. Protected tools
 * must not inherit `ENVIA_API_KEY` when this middleware skips verification.
 *
 * @param bearerAuth - Middleware that verifies Bearer tokens and populates req.auth
 * @returns Middleware that makes Bearer auth optional
 */
export function optionalBearerAuth(bearerAuth: RequestHandler): RequestHandler {
    return (req, res, next) => {
        const header = req.headers.authorization;
        if (typeof header !== 'string' || !BEARER_PREFIX.test(header)) {
            next();
            return;
        }
        if (!looksLikeJwt(header.replace(BEARER_PREFIX, '').trim())) {
            next();
            return;
        }
        return bearerAuth(req, res, next);
    };
}
