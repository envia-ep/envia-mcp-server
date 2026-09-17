import { describe, it, expect } from 'vitest';

import { errorResponse, textResponse } from '../../src/utils/mcp-response.js';

describe('textResponse', () => {
    it('should wrap text in a single content block', () => {
        expect(textResponse('hello')).toEqual({
            content: [{ type: 'text', text: 'hello' }],
        });
    });
});

describe('errorResponse', () => {
    it('should set isError without requiring a meta object', () => {
        expect(errorResponse('Authentication required')).toEqual({
            content: [{ type: 'text', text: 'Authentication required' }],
            isError: true,
        });
    });

    it('should attach _meta when provided', () => {
        const meta = { 'mcp/www_authenticate': ['Bearer realm="mcp"'] };
        const result = errorResponse('Authentication required', meta);

        expect(result.isError).toBe(true);
        expect(result._meta).toEqual(meta);
    });
});
