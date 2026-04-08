/**
 * Mock McpServer for testing tool handlers.
 *
 * Captures handlers registered via server.registerTool() so they can be
 * called directly with test arguments.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ToolHandler = (
    args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

export function createMockServer() {
    const handlers = new Map<string, ToolHandler>();

    const server = {
        registerTool: (
            name: string,
            _config: { description?: string; inputSchema?: unknown },
            cb: ToolHandler,
        ) => {
            handlers.set(name, cb);
            return {
                enabled: true,
                enable: () => { },
                disable: () => { },
                update: () => { },
                remove: () => { },
            };
        },
        registerResource: (
            _name: string,
            _uri: string,
            _opts: unknown,
            _cb: unknown,
        ) => ({
            enabled: true,
            enable: () => { },
            disable: () => { },
            update: () => { },
            remove: () => { },
        }),
    };

    return { server: server as unknown as McpServer, handlers };
}
