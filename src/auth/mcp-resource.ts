/**
 * Canonical MCP resource URIs used in PRM documents and JWT `aud` checks.
 */

export interface McpResourceUris {
    /** Origin of the MCP server, no trailing slash (e.g. https://mcp.envia.com). */
    origin: string;
    /** RFC 8707 resource identifier including the /mcp path. */
    resource: string;
}

/**
 * Strips a trailing slash so `http://host:3000` and `http://host:3000/` compare equal.
 *
 * @param uri - Absolute URI
 * @returns URI without a trailing slash
 */
export function normalizeResourceUri(uri: string): string {
    return uri.replace(/\/$/, '');
}

/**
 * Derive origin and `/mcp` resource URIs from `OAUTH_SERVER_URL`.
 *
 * ChatGPT historically sends the origin as `resource`/`aud`. Claude and RFC 9728
 * expect the canonical path-suffixed resource. Token verification accepts both.
 *
 * @param serverUrl - Public MCP base URL (with or without `/mcp`)
 * @returns Origin and path-suffixed resource, no trailing slash
 */
export function mcpResourceUris(serverUrl: string): McpResourceUris {
    const parsed = new URL(serverUrl);
    const origin = parsed.origin;
    return {
        origin,
        resource: `${origin}/mcp`,
    };
}

/**
 * Audiences this MCP server accepts on access tokens.
 *
 * @param serverUrl - Public MCP base URL
 * @returns Unique normalized audience values (origin, `/mcp`, and the raw URL)
 */
export function mcpAudienceCandidates(serverUrl: string): string[] {
    const { origin, resource } = mcpResourceUris(serverUrl);
    const extra = normalizeResourceUri(serverUrl);
    return [...new Set([origin, resource, extra])];
}
