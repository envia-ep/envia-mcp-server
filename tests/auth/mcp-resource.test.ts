import { describe, it, expect } from 'vitest';

import { mcpAudienceCandidates, mcpResourceUris, normalizeResourceUri } from '../../src/auth/mcp-resource.js';

describe('mcpResourceUris', () => {
    it('should publish /mcp even when OAUTH_SERVER_URL is the origin', () => {
        expect(mcpResourceUris('https://mcp.envia.com')).toEqual({
            origin: 'https://mcp.envia.com',
            resource: 'https://mcp.envia.com/mcp',
        });
    });

    it('should not double the path when OAUTH_SERVER_URL already includes /mcp', () => {
        expect(mcpResourceUris('https://mcp.envia.com/mcp')).toEqual({
            origin: 'https://mcp.envia.com',
            resource: 'https://mcp.envia.com/mcp',
        });
    });
});

describe('mcpAudienceCandidates', () => {
    it('should accept origin and /mcp for the same host', () => {
        const candidates = mcpAudienceCandidates('https://mcp.envia.com');

        expect(candidates).toContain('https://mcp.envia.com');
        expect(candidates).toContain('https://mcp.envia.com/mcp');
    });
});

describe('normalizeResourceUri', () => {
    it('should strip a trailing slash', () => {
        expect(normalizeResourceUri('https://mcp.envia.com/')).toBe('https://mcp.envia.com');
    });
});
