/**
 * Transport-level auth gate for `POST /mcp`.
 *
 * Cuts `tools/call` to protected tools when the request has no user credential.
 * `initialize`, `tools/list`, notifications, and public catalog tools still pass.
 *
 * A refused `tools/call` answers 200 with `_meta["mcp/www_authenticate"]`, which is
 * what opens ChatGPT's sign-in prompt; any other method gets 401. See DECISIONS.md.
 */

import type { NextFunction, Request, Response } from 'express';

import { errorResponse } from '../utils/mcp-response.js';
import { hasHttpUserCredential, type HttpCredentialRequest } from './http-credentials.js';
import { isPublicCatalogToolName } from './tool-access.js';
import { buildWwwAuthenticateHeader } from './www-authenticate.js';

/** Shown to the end user when a protected tool is called without a credential. */
const SIGN_IN_MESSAGE = 'Sign in to your Envia account to use this tool.';

export interface McpAuthGateOptions {
    /** Absolute PRM URL included in WWW-Authenticate. */
    resourceMetadataUrl: string;
}

interface JsonRpcRequest {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
}

/**
 * Read the JSON-RPC method from a parsed body.
 *
 * @param body - `req.body`
 * @returns Method string, `'__batch__'` for arrays, or empty when unknown
 */
export function jsonRpcMethod(body: unknown): string {
    if (Array.isArray(body)) {
        return '__batch__';
    }
    if (body === null || typeof body !== 'object') {
        return '';
    }
    const method = (body as JsonRpcRequest).method;
    return typeof method === 'string' ? method : '';
}

/**
 * Read `params.name` from a `tools/call` body.
 *
 * @param body - `req.body`
 * @returns Tool name or empty string
 */
export function jsonRpcToolName(body: unknown): string {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return '';
    }
    const params = (body as JsonRpcRequest).params;
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
        return '';
    }
    const name = (params as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
}

/**
 * True when this JSON-RPC message may proceed without a user credential.
 *
 * A batch passes only when every entry does.
 *
 * @param body - Parsed body
 * @returns Whether the gate should call `next()`
 */
export function allowsUnauthenticatedMcpBody(body: unknown): boolean {
    if (Array.isArray(body)) {
        return body.every((entry) => allowsUnauthenticatedMcpBody(entry));
    }
    const method = jsonRpcMethod(body);
    if (method !== 'tools/call') {
        return true;
    }
    const toolName = jsonRpcToolName(body);
    return toolName !== '' && isPublicCatalogToolName(toolName);
}

/**
 * Express middleware: 401 protected `tools/call` without a user credential.
 *
 * @param options - PRM URL for the challenge header
 * @returns Middleware
 */
export function createMcpAuthGate(options: McpAuthGateOptions) {
    /**
     * Refuse protected tool calls that have no JWT, x-api-key, or body api_key.
     *
     * @param req - Express request (`req.body` already parsed)
     * @param res - Express response
     * @param next - Next middleware
     * @returns void
     */
    return function mcpAuthGate(req: Request, res: Response, next: NextFunction): void {
        const credentialReq = req as Request & HttpCredentialRequest;
        if (hasHttpUserCredential(credentialReq)) {
            next();
            return;
        }
        if (allowsUnauthenticatedMcpBody(req.body)) {
            next();
            return;
        }

        const id = jsonRpcId(req.body);
        const challenge = buildWwwAuthenticateHeader({
            resourceMetadataUrl: options.resourceMetadataUrl,
            error: 'invalid_token',
            errorDescription: 'Authentication required',
            scope: 'mcp:read',
        });
        res.setHeader('WWW-Authenticate', challenge);

        if (jsonRpcMethod(req.body) === 'tools/call') {
            res.status(200).json({
                jsonrpc: '2.0',
                result: errorResponse(SIGN_IN_MESSAGE, { 'mcp/www_authenticate': [challenge] }),
                id,
            });
            return;
        }

        res.status(401).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Authentication required' },
            id,
        });
    };
}

/**
 * JSON-RPC `id` for error responses. Notifications have no id.
 *
 * @param body - Parsed body
 * @returns JSON-RPC id or null
 */
function jsonRpcId(body: unknown): unknown {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }
    if (!('id' in body)) {
        return null;
    }
    return (body as JsonRpcRequest).id ?? null;
}
