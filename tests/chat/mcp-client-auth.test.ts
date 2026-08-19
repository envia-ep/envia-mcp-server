import { describe, it, expect, vi, afterEach } from 'vitest';

import { McpClient } from '../../src/chat/chat-client.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('McpClient OAuth bearer', () => {
    it('should send Authorization Bearer when an access token is configured', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ jsonrpc: '2.0', result: { tools: [] } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new McpClient('http://127.0.0.1:3000', 'jwt-from-oauth');
        await client.callTool('envia_list_carriers', {});

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer jwt-from-oauth');
    });

    it('should omit Authorization when no access token is set', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ jsonrpc: '2.0', result: { tools: [] } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new McpClient('http://127.0.0.1:3000');
        await client.callTool('envia_list_carriers', {});

        const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Authorization']).toBeUndefined();
    });

    it('should throw a sign-in error when /mcp returns 401', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                headers: { get: () => null },
            }),
        );

        const client = new McpClient('http://127.0.0.1:3000', 'expired');
        await expect(client.callTool('envia_list_carriers', {})).rejects.toThrow('Sign in with Envia');
    });
});
