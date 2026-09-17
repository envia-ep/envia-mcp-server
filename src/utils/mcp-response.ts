/**
 * MCP Response Helpers
 *
 * Shared helpers for constructing MCP tool response objects.
 * Used across all tool files to avoid repeating the content wrapper.
 */

/** Standard MCP text content response shape. */
export type McpTextResponse = { content: Array<{ type: 'text'; text: string }> };

/** MCP tool error: HTTP 200 JSON-RPC result with `isError` set. */
export type McpErrorResponse = McpTextResponse & {
    isError: true;
    _meta?: Record<string, unknown>;
};

/**
 * Wrap a string in the MCP text content structure.
 *
 * @param text - Output text to return to the caller
 * @returns MCP response object with a single text content block
 */
export function textResponse(text: string): McpTextResponse {
    return { content: [{ type: 'text' as const, text }] };
}

/**
 * Wrap a tool-level failure. Use for application errors once the handler runs.
 * Missing credentials on protected tools must be HTTP 401, not this helper.
 *
 * @param text - User-visible error text (must not include secrets)
 * @param meta - Optional `_meta` (e.g. `mcp/www_authenticate`)
 * @returns MCP error result
 */
export function errorResponse(text: string, meta?: Record<string, unknown>): McpErrorResponse {
    const response: McpErrorResponse = {
        content: [{ type: 'text' as const, text }],
        isError: true,
    };
    if (meta !== undefined) {
        response._meta = meta;
    }
    return response;
}
