import { describe, it, expect, vi, afterEach } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import {
    handleGetTicketTypesV2,
    registerGetTicketTypesV2,
} from '../../../src/tools/tickets/get-ticket-types-v2.js';
import type { TicketTypesCache, CachedTicketType } from '../../../src/services/ticket-types.cache.js';

// =============================================================================
// Factories — mirror actual API data shapes
// =============================================================================

/** Active type with mcp_context.is_blocked = false (based on id:3 overweight from real API). */
function makeOverweightType(overrides: Partial<CachedTicketType> = {}): CachedTicketType {
    return {
        id: 3,
        name: 'overweight',
        description: 'Overweight',
        type: null,
        active: 1,
        rules: {
            error: 'settings.tickets.modal.overweight.error',
            files: [{
                name: 'Sobrepeso desconocido',
                path: 'uploads/shipments/overweights/',
                type: 'OVERWEIGHT',
                comment: 'guides.overweight.request.image',
                description: 'overweight-evidence',
            }],
            inputs: [],
            reference: 'guide',
            conditions: {
                validations: [{ type: 'default', field: 'overcharge_applied', value: '1', operator: '==' }],
                avaliable_status: [3, 11, 13],
            },
            mcp_context: {
                use_case: 'Carrier charged extra weight on a shipment. Use ONLY for weight surcharges.',
                is_blocked: false,
                agent_notes: ['Use ONLY for weight surcharges. Do NOT use for tracking movement or delay issues.'],
                requires_guide: true,
            },
            comment_template: '',
        },
        ...overrides,
    };
}

/** Active type with dynamic inputs and no files (based on id:9 payment_pending from real API). */
function makePaymentPendingType(overrides: Partial<CachedTicketType> = {}): CachedTicketType {
    return {
        id: 9,
        name: 'payment_pending',
        description: 'Payment Pending',
        type: null,
        active: 1,
        rules: {
            files: [{
                name: 'Comprobante de pago',
                path: 'uploads/clients/payments/',
                type: 'PAYMENT_PENDING',
                comment: 'paymentHistory.refund.paymentReceipt',
                description: 'payment-pending-receipt',
            }],
            inputs: [
                { name: 'payment_method_id', el: 'select', required: true, type: 'source', label: 'recharges.paymentPending.request.method' },
                { name: 'bank_account', el: 'input', required: false, type: 'text' },
            ],
            reference: '',
            conditions: { validations: [], avaliable_status: [] },
            mcp_context: {
                use_case: 'Company has a pending payment to resolve.',
                is_blocked: false,
                requires_guide: false,
            },
            comment_template: '',
        },
        ...overrides,
    };
}

/** Blocked type (based on id:10 pobox_package_pending from real API). */
function makeBlockedType(overrides: Partial<CachedTicketType> = {}): CachedTicketType {
    return {
        id: 10,
        name: 'pobox_package_pending',
        description: 'PO Box Package Pending',
        type: null,
        active: 0,
        rules: {
            inputs: [],
            reference: '',
            conditions: { validations: [], avaliable_status: [] },
            mcp_context: {
                use_case: 'PO Box package arrived and is pending pickup. Managed internally.',
                is_blocked: true,
                requires_guide: false,
            },
            comment_template: [],
        },
        ...overrides,
    };
}

/** Type with no rules at all (like id:22 rating_tickets or id:2 carrier from real API). */
function makeNoRulesType(overrides: Partial<CachedTicketType> = {}): CachedTicketType {
    return {
        id: 22,
        name: 'rating_tickets',
        description: 'Rating Tickets',
        type: null,
        active: 1,
        rules: null,
        ...overrides,
    };
}

function makeCacheWith(types: CachedTicketType[]): TicketTypesCache {
    return {
        getAll: vi.fn().mockResolvedValue(types),
        getRulesForType: vi.fn().mockImplementation(async (id: number) => {
            return types.find((t) => t.id === id)?.rules ?? null;
        }),
    } as unknown as TicketTypesCache;
}

// =============================================================================
// Suite: handleGetTicketTypesV2
// =============================================================================

describe('handleGetTicketTypesV2', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // MODE 1 — no arguments
    // -------------------------------------------------------------------------

    describe('MODE 1 — no arguments', () => {
        it('should return only non-blocked types that have mcp_context', async () => {
            const cache = makeCacheWith([
                makeOverweightType(),   // available
                makeBlockedType(),      // blocked → excluded
                makeNoRulesType(),      // no mcp_context → excluded
            ]);

            const result = await handleGetTicketTypesV2({}, cache);
            const parsed = JSON.parse(result) as unknown[];

            expect(parsed).toHaveLength(1);
        });

        it('should include use_case and requires_guide from mcp_context in summary', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({}, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>[];

            expect(parsed[0]).toMatchObject({
                id: 3,
                name: 'overweight',
                description: 'Overweight',
                use_case: 'Carrier charged extra weight on a shipment. Use ONLY for weight surcharges.',
                requires_guide: true,
                requires: 'tracking number (guide)',
            });
        });

        it('should set requires to null when reference is an empty string', async () => {
            const cache = makeCacheWith([makePaymentPendingType()]);

            const result = await handleGetTicketTypesV2({}, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>[];

            expect(parsed[0].requires).toBeNull();
        });

        it('should return empty array when all types are unavailable', async () => {
            const cache = makeCacheWith([makeBlockedType(), makeNoRulesType()]);

            const result = await handleGetTicketTypesV2({}, cache);
            const parsed = JSON.parse(result) as unknown[];

            expect(parsed).toEqual([]);
        });

        it('should map reference "credit" to human-readable description', async () => {
            const creditType = makeOverweightType({ rules: {
                reference: 'credit',
                mcp_context: { use_case: 'Refund', is_blocked: false, requires_guide: false },
            }});
            const cache = makeCacheWith([creditType]);

            const result = await handleGetTicketTypesV2({}, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>[];

            expect(parsed[0].requires).toBe('credit ID');
        });
    });

    // -------------------------------------------------------------------------
    // MODE 2 — match by type_id
    // -------------------------------------------------------------------------

    describe('MODE 2 — match by type_id', () => {
        it('should return full detail including use_case and requires_guide when type_id matches', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect(parsed.id).toBe(3);
            expect(parsed.use_case).toBe('Carrier charged extra weight on a shipment. Use ONLY for weight surcharges.');
            expect(parsed.requires_guide).toBe(true);
        });

        it('should include agent_notes when present in mcp_context', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
            const parsed = JSON.parse(result) as Record<string, string[]>;

            expect(parsed.agent_notes).toEqual([
                'Use ONLY for weight surcharges. Do NOT use for tracking movement or delay issues.',
            ]);
        });

        it('should not include agent_notes when absent from mcp_context', async () => {
            const cache = makeCacheWith([makePaymentPendingType()]);

            const result = await handleGetTicketTypesV2({ type_id: 9 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect('agent_notes' in parsed).toBe(false);
        });

        it('should separate required and optional input variables', async () => {
            const cache = makeCacheWith([makePaymentPendingType()]);

            const result = await handleGetTicketTypesV2({ type_id: 9 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown[]>;

            expect(parsed.required_variables).toHaveLength(1);
            expect((parsed.required_variables[0] as Record<string, unknown>).name).toBe('payment_method_id');
            expect(parsed.optional_variables).toHaveLength(1);
            expect((parsed.optional_variables[0] as Record<string, unknown>).name).toBe('bank_account');
        });

        it('should include required_files with name and description only', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown[]>;
            const file = parsed.required_files[0] as Record<string, unknown>;

            expect(file.name).toBe('Sobrepeso desconocido');
            expect(file.description).toBe('overweight-evidence');
            // Internal fields should not be exposed
            expect('path' in file).toBe(false);
            expect('comment' in file).toBe(false);
        });

        it('should include eligible_shipment_status_ids from conditions', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect(parsed.eligible_shipment_status_ids).toEqual([3, 11, 13]);
        });

        it('should not include eligible_shipment_status_ids when conditions has empty array', async () => {
            const cache = makeCacheWith([makePaymentPendingType()]);

            const result = await handleGetTicketTypesV2({ type_id: 9 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect('eligible_shipment_status_ids' in parsed).toBe(false);
        });

        it('should not include comment_template when it is an empty string', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect('comment_template' in parsed).toBe(false);
        });

        it('should include comment_template when it is a non-empty array', async () => {
            const typeWithTemplate = makeOverweightType({
                rules: {
                    reference: 'guide',
                    comment_template: ['settings.tickets.modal.package.description', 'settings.tickets.modal.content.description'],
                    mcp_context: { use_case: 'Test', is_blocked: false, requires_guide: true },
                },
            });
            const cache = makeCacheWith([typeWithTemplate]);

            const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
            const parsed = JSON.parse(result) as Record<string, string[]>;

            expect(parsed.comment_template).toHaveLength(2);
        });

        it('should throw McpError InvalidParams when type_id is not found', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            await expect(handleGetTicketTypesV2({ type_id: 999 }, cache)).rejects.toMatchObject({
                code: ErrorCode.InvalidParams,
            });
        });

        it('should throw McpError InvalidParams when matched type is blocked', async () => {
            const cache = makeCacheWith([makeBlockedType({ id: 10 })]);

            await expect(handleGetTicketTypesV2({ type_id: 10 }, cache)).rejects.toMatchObject({
                code: ErrorCode.InvalidParams,
            });
        });

        it('should throw McpError InvalidParams when matched type has no mcp_context', async () => {
            const cache = makeCacheWith([makeNoRulesType({ id: 22 })]);

            await expect(handleGetTicketTypesV2({ type_id: 22 }, cache)).rejects.toMatchObject({
                code: ErrorCode.InvalidParams,
            });
        });
    });

    // -------------------------------------------------------------------------
    // MODE 2 — match by type_name
    // -------------------------------------------------------------------------

    describe('MODE 2 — match by type_name', () => {
        it('should find available type by partial name match (case-insensitive)', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_name: 'OVER' }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect(parsed.id).toBe(3);
        });

        it('should find available type by partial description match', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_name: 'Overweight' }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect(parsed.id).toBe(3);
        });

        it('should find available type by use_case match', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            const result = await handleGetTicketTypesV2({ type_name: 'weight surcharge' }, cache);
            const parsed = JSON.parse(result) as Record<string, unknown>;

            expect(parsed.id).toBe(3);
        });

        it('should throw McpError when no available type matches the keyword', async () => {
            const cache = makeCacheWith([makeOverweightType()]);

            await expect(handleGetTicketTypesV2({ type_name: 'xyz_nonexistent' }, cache)).rejects.toMatchObject({
                code: ErrorCode.InvalidParams,
            });
        });

        it('should not match blocked types by name', async () => {
            const cache = makeCacheWith([makeBlockedType()]);

            await expect(handleGetTicketTypesV2({ type_name: 'pobox' }, cache)).rejects.toMatchObject({
                code: ErrorCode.InvalidParams,
            });
        });
    });

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    it('should skip inputs with literally "undefined" as name', async () => {
        const typeWithBadInput = makeOverweightType({
            rules: {
                reference: 'guide',
                inputs: [
                    { name: 'undefined', el: 'input', required: true },
                    { name: 'valid_field', el: 'input', required: true },
                ],
                mcp_context: { use_case: 'Test', is_blocked: false, requires_guide: true },
            },
        });
        const cache = makeCacheWith([typeWithBadInput]);

        const result = await handleGetTicketTypesV2({ type_id: 3 }, cache);
        const parsed = JSON.parse(result) as Record<string, unknown[]>;

        expect(parsed.required_variables).toHaveLength(1);
        expect((parsed.required_variables[0] as Record<string, unknown>).name).toBe('valid_field');
    });

    it('should normalize "source" input type to "string (select)"', async () => {
        const typeWithSelect = makePaymentPendingType();
        const cache = makeCacheWith([typeWithSelect]);

        const result = await handleGetTicketTypesV2({ type_id: 9 }, cache);
        const parsed = JSON.parse(result) as Record<string, unknown[]>;
        const reqVar = parsed.required_variables[0] as Record<string, unknown>;

        expect(reqVar.type).toBe('string (select)');
    });
});

// =============================================================================
// Suite: registerGetTicketTypesV2
// =============================================================================

describe('registerGetTicketTypesV2', () => {
    it('should register the tool under the envia_get_ticket_types_v2 name', () => {
        const { server, handlers } = createMockServer();
        registerGetTicketTypesV2(server, makeCacheWith([makeOverweightType()]));

        expect(handlers.has('envia_get_ticket_types_v2')).toBe(true);
    });

    it('should return valid JSON text response when called with no args', async () => {
        const { server, handlers } = createMockServer();
        registerGetTicketTypesV2(server, makeCacheWith([makeOverweightType()]));

        const handler = handlers.get('envia_get_ticket_types_v2') as ToolHandler;
        const result = await handler({});

        expect(result.content[0].type).toBe('text');
        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should return valid JSON text response when called with type_id', async () => {
        const { server, handlers } = createMockServer();
        registerGetTicketTypesV2(server, makeCacheWith([makeOverweightType()]));

        const handler = handlers.get('envia_get_ticket_types_v2') as ToolHandler;
        const result = await handler({ type_id: 3 });

        const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
        expect(parsed.id).toBe(3);
        expect(parsed.use_case).toBeDefined();
    });
});
