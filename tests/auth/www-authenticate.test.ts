import { describe, it, expect } from 'vitest';

import { buildWwwAuthenticateHeader } from '../../src/auth/www-authenticate.js';

describe('buildWwwAuthenticateHeader', () => {
    it('should include realm and resource_metadata', () => {
        const header = buildWwwAuthenticateHeader({
            resourceMetadataUrl: 'https://mcp.envia.com/.well-known/oauth-protected-resource',
        });

        expect(header).toContain('Bearer realm="mcp"');
        expect(header).toContain('resource_metadata="https://mcp.envia.com/.well-known/oauth-protected-resource"');
    });

    it('should include error fields without naming api_key', () => {
        const header = buildWwwAuthenticateHeader({
            resourceMetadataUrl: 'https://mcp.envia.com/.well-known/oauth-protected-resource',
            error: 'invalid_token',
            errorDescription: 'Authentication required',
            scope: 'mcp:read',
        });

        expect(header).toContain('error="invalid_token"');
        expect(header).toContain('error_description="Authentication required"');
        expect(header).toContain('scope="mcp:read"');
        expect(header).not.toContain('api_key');
    });
});
