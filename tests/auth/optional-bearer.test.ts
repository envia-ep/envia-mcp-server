import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { optionalBearerAuth } from '../../src/auth/optional-bearer.js';

function makeRequest(authorization?: string): Request {
    return { headers: authorization ? { authorization } : {} } as Request;
}

describe('optionalBearerAuth', () => {
    it('should skip verification when Authorization is absent', () => {
        const bearerAuth = vi.fn();
        const next = vi.fn() as NextFunction;
        const middleware = optionalBearerAuth(bearerAuth);

        middleware(makeRequest(), {} as Response, next);

        expect(bearerAuth).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();
    });

    it('should skip verification when Authorization is blank', () => {
        const bearerAuth = vi.fn();
        const next = vi.fn() as NextFunction;
        const middleware = optionalBearerAuth(bearerAuth);

        middleware(makeRequest('   '), {} as Response, next);

        expect(bearerAuth).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();
    });

    it('should verify the token when Authorization is present', () => {
        const next = vi.fn() as NextFunction;
        const bearerAuth = vi.fn((_req: Request, _res: Response, innerNext: NextFunction) => {
            innerNext();
        });
        const middleware = optionalBearerAuth(bearerAuth);
        const req = makeRequest('Bearer access-token');

        middleware(req, {} as Response, next);

        expect(bearerAuth).toHaveBeenCalledOnce();
        expect(bearerAuth).toHaveBeenCalledWith(req, expect.anything(), next);
    });
});
