import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import {
    allowsUnauthenticatedMcpBody,
    createMcpAuthGate,
    jsonRpcMethod,
    jsonRpcToolName,
} from '../../src/auth/mcp-auth-gate.js';

const RESOURCE = 'https://mcp.envia.com/.well-known/oauth-protected-resource';

function mockRes(): Response & { statusCode: number; payload: unknown; headerValue: string | undefined } {
    const state = {
        statusCode: 200,
        payload: undefined as unknown,
        headerValue: undefined as string | undefined,
    };
    const res = {
        get statusCode() {
            return state.statusCode;
        },
        get payload() {
            return state.payload;
        },
        get headerValue() {
            return state.headerValue;
        },
        setHeader(name: string, value: string) {
            if (name.toLowerCase() === 'www-authenticate') {
                state.headerValue = value;
            }
            return res;
        },
        status(code: number) {
            state.statusCode = code;
            return res;
        },
        json(payload: unknown) {
            state.payload = payload;
            return res;
        },
    };
    return res as unknown as Response & { statusCode: number; payload: unknown; headerValue: string | undefined };
}

describe('jsonRpcMethod', () => {
    it('should read the method from an object body', () => {
        expect(jsonRpcMethod({ method: 'initialize' })).toBe('initialize');
    });

    it('should flag JSON-RPC batches', () => {
        expect(jsonRpcMethod([{ method: 'initialize' }])).toBe('__batch__');
    });
});

describe('jsonRpcToolName', () => {
    it('should read params.name from tools/call', () => {
        expect(jsonRpcToolName({ method: 'tools/call', params: { name: 'envia_list_shipments' } })).toBe(
            'envia_list_shipments',
        );
    });
});

describe('allowsUnauthenticatedMcpBody', () => {
    it('should allow initialize without a credential', () => {
        expect(allowsUnauthenticatedMcpBody({ method: 'initialize' })).toBe(true);
    });

    it('should allow tools/list without a credential', () => {
        expect(allowsUnauthenticatedMcpBody({ method: 'tools/list' })).toBe(true);
    });

    it('should allow a public catalog tools/call without a credential', () => {
        expect(
            allowsUnauthenticatedMcpBody({
                method: 'tools/call',
                params: { name: 'envia_quote_shipment', arguments: {} },
            }),
        ).toBe(true);
    });

    it('should allow tracking without a credential', () => {
        expect(
            allowsUnauthenticatedMcpBody({
                method: 'tools/call',
                params: { name: 'envia_track_package', arguments: {} },
            }),
        ).toBe(true);
    });

    it('should reject a protected tools/call without a credential', () => {
        expect(
            allowsUnauthenticatedMcpBody({
                method: 'tools/call',
                params: { name: 'envia_list_shipments', arguments: {} },
            }),
        ).toBe(false);
    });

    it('should reject JSON-RPC batches', () => {
        expect(allowsUnauthenticatedMcpBody([{ method: 'initialize' }, { method: 'tools/call' }])).toBe(false);
    });
});

describe('createMcpAuthGate', () => {
    it('should return 401 for a protected tool without a credential', () => {
        const gate = createMcpAuthGate({ resourceMetadataUrl: RESOURCE });
        const req = {
            headers: {},
            body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'envia_list_shipments' } },
        } as Request;
        const res = mockRes();
        const next = vi.fn() as NextFunction;

        gate(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.headerValue).toContain('resource_metadata=');
        expect(res.headerValue).toContain('error="invalid_token"');
        expect(res.headerValue).not.toContain('api_key');
        expect(res.payload).toEqual({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Authentication required' },
            id: 4,
        });
    });

    it('should call next when the portal sends api_key in the body', () => {
        const gate = createMcpAuthGate({ resourceMetadataUrl: RESOURCE });
        const req = {
            headers: {},
            body: {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name: 'envia_list_shipments', arguments: { api_key: 'portal-token' } },
            },
        } as Request;
        const res = mockRes();
        const next = vi.fn() as NextFunction;

        gate(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.statusCode).toBe(200);
    });

    it('should call next when x-api-key is present', () => {
        const gate = createMcpAuthGate({ resourceMetadataUrl: RESOURCE });
        const req = {
            headers: { 'x-api-key': 'header-token' },
            body: { jsonrpc: '2.0', method: 'tools/call', params: { name: 'envia_list_shipments' } },
        } as unknown as Request;
        const res = mockRes();
        const next = vi.fn() as NextFunction;

        gate(req, res, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it('should call next for tools/list without a credential', () => {
        const gate = createMcpAuthGate({ resourceMetadataUrl: RESOURCE });
        const req = {
            headers: {},
            body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        } as Request;
        const res = mockRes();
        const next = vi.fn() as NextFunction;

        gate(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.statusCode).toBe(200);
    });
});
