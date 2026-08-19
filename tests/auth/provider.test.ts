import { describe, it, expect } from 'vitest';

import { audiencesMatch, normalizeResourceUri } from '../../src/auth/provider.js';

describe('normalizeResourceUri', () => {
    it('should strip a trailing slash when metadata advertises one', () => {
        expect(normalizeResourceUri('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    });
});

describe('audiencesMatch', () => {
    it('should accept a trailing-slash aud when OAUTH_SERVER_URL has none', () => {
        expect(audiencesMatch('http://127.0.0.1:3000/', 'http://127.0.0.1:3000')).toBe(true);
    });

    it('should accept an array aud when one entry matches after normalization', () => {
        expect(audiencesMatch(['other', 'http://127.0.0.1:3000/'], 'http://127.0.0.1:3000')).toBe(true);
    });

    it('should reject an aud that points at a different resource', () => {
        expect(audiencesMatch('https://mcp.envia.com', 'http://127.0.0.1:3000')).toBe(false);
    });
});
