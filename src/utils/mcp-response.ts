/**
 * MCP Response Helpers
 *
 * Shared helpers for constructing MCP tool response objects.
 * Used across all tool files to avoid repeating the content wrapper.
 */

/** Standard MCP text content response shape. */
export type McpTextResponse = { content: Array<{ type: 'text'; text: string }> };

/**
 * Wrap a string in the MCP text content structure.
 *
 * @param text - Output text to return to the caller
 * @returns MCP response object with a single text content block
 */
export function textResponse(text: string): McpTextResponse {
    return { content: [{ type: 'text' as const, text }] };
}
