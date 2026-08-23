import type { RequestHandler } from 'express';

/**
 * Wraps Bearer-auth middleware so requests without an Authorization header continue.
 * Requests that include a token are still verified; invalid tokens receive 401.
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
        if (typeof header !== 'string' || header.trim() === '') {
            next();
            return;
        }
        return bearerAuth(req, res, next);
    };
}
