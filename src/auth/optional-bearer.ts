import type { RequestHandler } from 'express';

import { looksLikeJwt } from './http-credentials.js';

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * Wraps Bearer-auth middleware so a token the verifier could never accept — opaque,
 * or another scheme — is ignored instead of failing every method on the connection.
 * JWT-shaped tokens are still verified, so an expired one gets its 401.
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
