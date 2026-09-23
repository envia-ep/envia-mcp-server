/**
 * RFC 6750 WWW-Authenticate header for MCP Bearer challenges.
 */

export interface WwwAuthenticateOptions {
    /** Absolute URL of the OAuth protected-resource metadata document. */
    resourceMetadataUrl: string;
    /** RFC 6750 error code. Omit when the challenge is only a discovery hint. */
    error?: 'invalid_request' | 'invalid_token' | 'insufficient_scope';
    /** Human-readable error. Must not name API keys or other secrets. */
    errorDescription?: string;
    /** Space-delimited scopes the client should request. */
    scope?: string;
}

/**
 * Build a Bearer WWW-Authenticate value pointing at this MCP server's PRM.
 *
 * @param options - Challenge fields
 * @returns Header value, including realm and resource_metadata
 */
export function buildWwwAuthenticateHeader(options: WwwAuthenticateOptions): string {
    const parts = [
        'Bearer realm="mcp"',
        `resource_metadata="${options.resourceMetadataUrl}"`,
    ];
    if (options.error) {
        parts.push(`error="${options.error}"`);
    }
    if (options.errorDescription) {
        parts.push(`error_description="${options.errorDescription}"`);
    }
    if (options.scope) {
        parts.push(`scope="${options.scope}"`);
    }
    return parts.join(', ');
}
