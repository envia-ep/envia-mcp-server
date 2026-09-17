/**
 * HTTP/stdio tool catalog decoration.
 *
 * Applied once at server construction so every `registerTool` call gets a
 * human `title`, ChatGPT `securitySchemes` when missing, and (HTTP only)
 * `api_key` stripped from the advertised input schema.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { asAuthenticatedTool } from './tool-access.js';

type RegisterToolFn = McpServer['registerTool'];

interface CatalogDecoratedServer extends McpServer {
    __toolCatalogDecorated?: boolean;
}

export interface ToolCatalogOptions {
    /**
     * When true, remove `api_key` from advertised Zod input schemas.
     * HTTP listing must not publish secrets; stdio keeps the field.
     */
    omitApiKeyFromSchema: boolean;
}

/**
 * Derive a human title from an `envia_*` tool name.
 *
 * @param name - Registered tool name
 * @returns Title ≤64 characters (Anthropic limit)
 */
export function titleFromToolName(name: string): string {
    const withoutPrefix = name.replace(/^envia_/, '');
    const words = withoutPrefix.split('_').filter((word) => word.length > 0);
    if (words.length === 0) {
        return name.slice(0, 64);
    }
    const titled = words
        .map((word, index) => (index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
        .join(' ');
    return titled.slice(0, 64);
}

/**
 * Remove `api_key` from a Zod object schema when present. Non-Zod values pass through.
 *
 * @param schema - Tool `inputSchema`
 * @returns Schema without `api_key`, or the original value
 */
export function omitApiKeyFromSchema(schema: unknown): unknown {
    if (schema === null || typeof schema !== 'object') {
        return schema;
    }
    const candidate = schema as {
        omit?: (mask: { api_key: true }) => unknown;
        shape?: Record<string, unknown>;
    };
    if (typeof candidate.omit !== 'function' || !candidate.shape || !('api_key' in candidate.shape)) {
        return schema;
    }
    return candidate.omit({ api_key: true });
}

/**
 * Decorate `registerTool` so subsequently registered tools meet the listing catalog.
 *
 * Idempotent. Call after `decorateServerWithLogging` so handlers stay logged.
 *
 * @param server - MCP server
 * @param options - Catalog flags
 * @returns The same server
 */
export function decorateToolCatalog(server: McpServer, options: ToolCatalogOptions): McpServer {
    const decorated = server as CatalogDecoratedServer;
    if (decorated.__toolCatalogDecorated) {
        return decorated;
    }
    decorated.__toolCatalogDecorated = true;

    const original = decorated.registerTool.bind(decorated) as RegisterToolFn;

    const patched = function patchedCatalogRegisterTool(
        this: CatalogDecoratedServer,
        ...args: Parameters<RegisterToolFn>
    ): ReturnType<RegisterToolFn> {
        const [name, config, handler] = args as [
            Parameters<RegisterToolFn>[0],
            Parameters<RegisterToolFn>[1],
            Parameters<RegisterToolFn>[2],
        ];
        const nextConfig = applyCatalogConfig(name, config, options);
        return original(name, nextConfig, handler);
    } as RegisterToolFn;

    decorated.registerTool = patched;
    return decorated;
}

/**
 * Apply title, securitySchemes, and optional api_key omission to a tool descriptor.
 *
 * @param name - Tool name
 * @param config - Original registerTool config
 * @param options - Catalog flags
 * @returns Config safe to pass to the SDK
 */
export function applyCatalogConfig(
    name: string,
    config: Parameters<RegisterToolFn>[1],
    options: ToolCatalogOptions,
): Parameters<RegisterToolFn>[1] {
    const record = { ...(config as Record<string, unknown>) };

    if (typeof record['title'] !== 'string' || record['title'].trim() === '') {
        record['title'] = titleFromToolName(name);
    }

    if (!Array.isArray(record['securitySchemes'])) {
        const authenticated = asAuthenticatedTool(record);
        record['securitySchemes'] = authenticated.securitySchemes;
        record['_meta'] = authenticated._meta;
    }

    if (options.omitApiKeyFromSchema && 'inputSchema' in record) {
        record['inputSchema'] = omitApiKeyFromSchema(record['inputSchema']);
    }

    return record as Parameters<RegisterToolFn>[1];
}
