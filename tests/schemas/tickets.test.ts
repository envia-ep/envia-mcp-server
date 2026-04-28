/**
 * Schema tests for src/schemas/tickets.ts
 *
 * NOTE: /company/tickets returned 404 in the queries-test sandbox (auth scope).
 * CreateTicketResponseSchema is derived from src/types/tickets.ts (synthetic).
 * Mark fixture as synthetic until verified against live production.
 */

import { describe, it, expect } from 'vitest';
import { CreateTicketResponseSchema } from '../../src/schemas/tickets.js';

describe('CreateTicketResponseSchema', () => {
    // Synthetic fixture — derived from src/types/tickets.ts CreateTicketResponse.
    // Verify against live production when sandbox /company/tickets is accessible.
    const syntheticFixture = { id: 3186 };

    it('parses the expected shape (synthetic fixture — verify against live production)', () => {
        const result = CreateTicketResponseSchema.safeParse(syntheticFixture);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe(3186);
        }
    });

    it('rejects when id is missing', () => {
        const result = CreateTicketResponseSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { id: 100, new_backend_field: 'hello', another_field: 42 };
        const result = CreateTicketResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('rejects when id is a string instead of number', () => {
        const result = CreateTicketResponseSchema.safeParse({ id: '3186' });
        expect(result.success).toBe(false);
    });
});
