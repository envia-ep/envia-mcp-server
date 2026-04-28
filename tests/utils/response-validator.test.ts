import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('../../src/utils/logger.js', () => ({
    logger: { warn: mockWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    getLogger: () => ({ warn: mockWarn }),
    childLogger: () => ({ warn: mockWarn }),
    _resetLoggerForTesting: vi.fn(),
}));

import { parseToolResponse, SchemaValidationError } from '../../src/utils/response-validator.js';

const SimpleSchema = z.object({ id: z.number(), name: z.string() });

describe('parseToolResponse', () => {
    beforeEach(() => {
        mockWarn.mockClear();
    });

    it('returns parsed data on success', () => {
        const data = { id: 1, name: 'test' };
        const result = parseToolResponse(SimpleSchema, data, 'envia_test_tool');
        expect(result).toEqual({ id: 1, name: 'test' });
    });

    it('returns raw data on failure in warn mode (default)', () => {
        const data = { id: 1 }; // missing 'name'
        const result = parseToolResponse(SimpleSchema, data, 'envia_test_tool');
        expect(result).toEqual({ id: 1 });
    });

    it('logs schema_validation_failed event on failure', () => {
        parseToolResponse(SimpleSchema, { id: 1 }, 'envia_some_tool');
        expect(mockWarn).toHaveBeenCalledOnce();
        const [obj, msg] = mockWarn.mock.calls[0];
        expect(obj.event).toBe('schema_validation_failed');
        expect(obj.tool).toBe('envia_some_tool');
        expect(typeof obj.issue_count).toBe('number');
        expect(obj.issue_count).toBeGreaterThan(0);
        expect(typeof msg).toBe('string');
        expect(msg).toContain('envia_some_tool');
    });

    it('throws SchemaValidationError in strict mode', () => {
        const err = new SchemaValidationError('envia_test', [
            { path: ['x'], code: 'invalid_type', message: 'bad' } as z.ZodIssue,
        ]);
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(SchemaValidationError);
        expect(err.tool).toBe('envia_test');
        expect(err.issues).toHaveLength(1);
    });

    it('includes the tool name in the SchemaValidationError message', () => {
        const err = new SchemaValidationError('envia_specific_tool', [
            { path: ['field'], code: 'invalid_type', message: 'expected string' } as z.ZodIssue,
        ]);
        expect(err.message).toContain('envia_specific_tool');
        expect(err.name).toBe('SchemaValidationError');
    });

    it('truncates issues to 5 in the log', () => {
        const BigSchema = z.object({
            f1: z.string(), f2: z.string(), f3: z.string(), f4: z.string(), f5: z.string(),
            f6: z.string(), f7: z.string(), f8: z.string(), f9: z.string(), f10: z.string(),
        });
        parseToolResponse(BigSchema, {}, 'envia_big_tool');
        expect(mockWarn).toHaveBeenCalledOnce();
        const [obj] = mockWarn.mock.calls[0];
        expect(obj.issues).toHaveLength(5);
        expect(obj.issue_count).toBeGreaterThanOrEqual(10);
    });
});
