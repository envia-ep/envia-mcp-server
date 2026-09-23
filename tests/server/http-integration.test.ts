import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';

import { _resetLoggerForTesting } from '../../src/utils/logger.js';

/**
 * Drives the real Express chain: discovery routes, optional Bearer, the auth
 * gate, and `POST /mcp`. Unit tests cover the gate helper in isolation, so a
 * wiring or route-ordering regression would not show up there — this file is
 * what fails when the gate stops being reached or a route gets shadowed.
 */

const RPC_HEADERS = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
};

let baseUrl: string;
let httpServer: Server;

async function rpc(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { ...RPC_HEADERS, ...headers },
        body: JSON.stringify(body),
    });
}

/** The transport answers either plain JSON or a single SSE frame. */
async function rpcBody(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    const frame = /^data: (\{.*\})$/m.exec(text);
    return JSON.parse(frame ? frame[1]! : text) as Record<string, unknown>;
}

beforeAll(async () => {
    process.env.LOG_LEVEL = 'fatal';
    process.env.LOG_PRETTY = 'false';
    _resetLoggerForTesting();
    process.env.ENVIA_API_KEY = 'test-key';
    process.env.ENVIA_QUERIES_HOSTNAME = 'https://queries.envia.com';
    process.env.OAUTH_JWT_KEY = 'test-signing-key';
    process.env.OAUTH_SERVER_URL = 'http://127.0.0.1:3999';
    process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL = 'true';
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;

    const { createHttpApp } = await import('../../src/http-app.js');
    httpServer = createHttpApp().listen(0);
    await new Promise((resolve) => httpServer.once('listening', resolve));
    const address = httpServer.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
});

describe('POST /mcp without a credential', () => {
    it('should serve initialize', async () => {
        const response = await rpc({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
        });

        expect(response.status).toBe(200);
    });

    it('should serve the catalog', async () => {
        const response = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        const body = await rpcBody(response);

        expect((body['result'] as { tools: unknown[] }).tools.length).toBeGreaterThan(0);
    });

    it('should answer a protected tool call with the ChatGPT challenge', async () => {
        const response = await rpc({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'envia_get_company_info', arguments: {} },
        });
        const result = (await rpcBody(response))['result'] as { isError?: boolean; _meta?: Record<string, unknown> };

        expect(response.status).toBe(200);
        expect(result.isError).toBe(true);
        expect(result._meta?.['mcp/www_authenticate']).toBeDefined();
    });

    it('should send WWW-Authenticate on the challenge response', async () => {
        const response = await rpc({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'envia_get_company_info', arguments: {} },
        });

        expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    });

    it('should let a public tool through the gate', async () => {
        const response = await rpc({
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'envia_list_carriers', arguments: {} },
        });
        const result = (await rpcBody(response))['result'] as { content: Array<{ text: string }> };

        // Reaches the SDK and fails argument validation instead of being challenged.
        expect(result.content[0]!.text).toContain('Input validation error');
    });

    it('should refuse a batch that carries a protected call', async () => {
        const response = await rpc([
            { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'envia_get_company_info', arguments: {} } },
        ]);

        expect(response.status).toBe(401);
    });

    it('should expose WWW-Authenticate to cross-origin clients', async () => {
        const response = await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} });

        expect(response.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
    });
});

describe('POST /mcp with a credential', () => {
    it('should let the portal body api_key through the gate', async () => {
        const response = await rpc({
            jsonrpc: '2.0',
            id: 8,
            method: 'tools/call',
            params: { name: 'envia_get_company_info', arguments: { api_key: 'portal-key' } },
        });
        const result = (await rpcBody(response))['result'] as { _meta?: Record<string, unknown> };

        expect(result._meta?.['mcp/www_authenticate']).toBeUndefined();
    });

    it('should serve the catalog when a Bearer token cannot be a JWT', async () => {
        const response = await rpc(
            { jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} },
            { Authorization: 'Bearer legacy-opaque-token' },
        );

        expect(response.status).toBe(200);
    });

    it('should reject a JWT-shaped token that does not verify', async () => {
        const response = await rpc(
            { jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} },
            { Authorization: 'Bearer header.payload.signature' },
        );

        expect(response.status).toBe(401);
    });
});

describe('discovery routes', () => {
    it('should serve the same protected-resource document on both paths', async () => {
        const root = await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource`)).json();
        const suffixed = await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`)).json();

        expect(root).toEqual(suffixed);
    });

    it('should advertise the canonical /mcp resource', async () => {
        const document = await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource`)).json();

        expect((document as { resource: string }).resource).toMatch(/\/mcp$/);
    });

    it('should name an authorization server that matches the issuer metadata', async () => {
        const prm = await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource`)).json();
        const as = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json();

        expect((prm as { authorization_servers: string[] }).authorization_servers[0]).toBe((as as { issuer: string }).issuer);
    });

    it('should advertise public PKCE clients only', async () => {
        const as = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json();

        expect((as as { token_endpoint_auth_methods_supported: string[] }).token_endpoint_auth_methods_supported).toEqual(['none']);
    });

    it('should 404 the domain challenge when its token is unset', async () => {
        const response = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`);

        expect(response.status).toBe(404);
    });

    it('should refuse GET on the MCP endpoint', async () => {
        const response = await fetch(`${baseUrl}/mcp`);

        expect(response.status).toBe(405);
    });
});
