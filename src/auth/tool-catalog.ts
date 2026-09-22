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

const LIST_TOOLS_METHOD = 'tools/list';

interface ListedTool {
    name: string;
    _meta?: { securitySchemes?: unknown };
    securitySchemes?: unknown;
}

type ListToolsHandler = (request: unknown, extra: unknown) => Promise<{ tools: ListedTool[] }>;

interface ProtocolInternals {
    _requestHandlers: Map<string, ListToolsHandler>;
}

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
 * Throws when the field is present but cannot be removed — a schema carrying
 * refinements rejects `.omit()`. Failing loudly at registration is deliberate:
 * returning the original schema would publish the credential field on HTTP and
 * the listing would be rejected with no local signal.
 *
 * @param schema - Tool `inputSchema`
 * @param toolName - Tool being registered, for the error message
 * @returns Schema without `api_key`, or the original value
 * @throws When `api_key` is present and `.omit()` fails
 */
export function omitApiKeyFromSchema(schema: unknown, toolName = 'unknown'): unknown {
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
    try {
        return candidate.omit({ api_key: true });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Cannot strip api_key from ${toolName}: ${reason}. ` +
            'Move business-rule refinements into the handler so the input schema stays a plain object.',
        );
    }
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
 * Publish `securitySchemes` as a top-level field on every advertised tool.
 *
 * The SDK builds each `tools/list` entry from a fixed set of fields and drops
 * anything it does not know, so the value passed to `registerTool` survives only
 * inside `_meta`. ChatGPT reads the top-level field — "Tools must declare
 * securitySchemes" was one of the listing rejections — so the mirror alone is
 * not enough. Call once after every tool is registered.
 *
 * @param server - MCP server with all tools already registered
 * @returns The same server
 * @throws When the SDK has not installed a `tools/list` handler to wrap
 */
export function publishToolSecuritySchemes(server: McpServer): McpServer {
    const protocol = server.server as unknown as ProtocolInternals;
    const original = protocol._requestHandlers.get(LIST_TOOLS_METHOD);
    if (!original) {
        throw new Error(
            'Cannot publish securitySchemes: no tools/list handler is registered. ' +
            'Call publishToolSecuritySchemes after the last registerTool.',
        );
    }

    protocol._requestHandlers.set(LIST_TOOLS_METHOD, async (request, extra) => {
        const result = await original(request, extra);
        return {
            ...result,
            tools: result.tools.map((tool) => {
                const schemes = tool._meta?.securitySchemes;
                return schemes === undefined ? tool : { ...tool, securitySchemes: schemes };
            }),
        };
    });

    return server;
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
        record['inputSchema'] = omitApiKeyFromSchema(record['inputSchema'], name);
    }

    return record as Parameters<RegisterToolFn>[1];
}
