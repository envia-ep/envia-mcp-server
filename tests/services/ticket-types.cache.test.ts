import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TicketTypesCache } from '../../src/services/ticket-types.cache.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';

// =============================================================================
// Factories — mirror actual API response shapes
// =============================================================================

/** An active type with mcp_context.is_blocked = false (like id:3 overweight). */
function makeAvailableRawType(overrides: Record<string, unknown> = {}) {
    return {
        id: 3,
        name: 'overweight',
        description: 'Overweight',
        type: null,
        active: 1,
        rules: JSON.stringify({
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
                use_case: 'Carrier charged extra weight on a shipment.',
                is_blocked: false,
                agent_notes: ['Use ONLY for weight surcharges.'],
                requires_guide: true,
            },
            comment_template: '',
        }),
        ...overrides,
    };
}

/** An active type with mcp_context.is_blocked = true (like id:10 pobox_package_pending). */
function makeBlockedRawType(overrides: Record<string, unknown> = {}) {
    return {
        id: 10,
        name: 'pobox_package_pending',
        description: 'PO Box Package Pending',
        type: null,
        active: 0,
        rules: JSON.stringify({
            inputs: [],
            reference: '',
            conditions: { validations: [], avaliable_status: [] },
            mcp_context: {
                use_case: 'PO Box package arrived and is pending pickup. Managed internally.',
                is_blocked: true,
                requires_guide: false,
            },
            comment_template: [],
        }),
        ...overrides,
    };
}

/** An active type without any rules/mcp_context (like id:2 carrier or id:22 rating_tickets). */
function makeNoRulesRawType(overrides: Record<string, unknown> = {}) {
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

function makeApiResponse(types: unknown[]) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: types }),
    };
}

// =============================================================================
// Suite: TicketTypesCache
// =============================================================================

describe('TicketTypesCache', () => {
    let cache: TicketTypesCache;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse([makeAvailableRawType()]));
        vi.stubGlobal('fetch', mockFetch);
        cache = new TicketTypesCache(new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // getAll — fetching and caching
    // -------------------------------------------------------------------------

    it('should fetch from API on first call', async () => {
        const types = await cache.getAll();

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(types).toHaveLength(1);
        expect(types[0].id).toBe(3);
    });

    it('should return cached data on subsequent calls without re-fetching', async () => {
        await cache.getAll();
        await cache.getAll();

        expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should re-fetch after TTL expires', async () => {
        vi.useFakeTimers();

        await cache.getAll();
        expect(mockFetch).toHaveBeenCalledOnce();

        vi.advanceTimersByTime(13 * 60 * 60 * 1000); // 13 hours — past 12-hour TTL

        await cache.getAll();
        expect(mockFetch).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });

    it('should return empty array and not throw when API returns a server error', async () => {
        // The client retries 5xx errors up to MAX_RETRIES (3) times.
        // Override default mock for all attempts.
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
        });
        cache = new TicketTypesCache(new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);

        const types = await cache.getAll();

        expect(types).toEqual([]);
    });

    // -------------------------------------------------------------------------
    // getAll — rules parsing
    // -------------------------------------------------------------------------

    it('should parse rules JSON string into typed object', async () => {
        const types = await cache.getAll();
        const rules = types[0].rules;

        expect(rules).not.toBeNull();
        expect(rules?.reference).toBe('guide');
        expect(rules?.files).toHaveLength(1);
        expect(rules?.files?.[0].name).toBe('Sobrepeso desconocido');
        expect(rules?.conditions?.avaliable_status).toEqual([3, 11, 13]);
    });

    it('should parse mcp_context from rules', async () => {
        const types = await cache.getAll();
        const ctx = types[0].rules?.mcp_context;

        expect(ctx?.is_blocked).toBe(false);
        expect(ctx?.requires_guide).toBe(true);
        expect(ctx?.use_case).toBe('Carrier charged extra weight on a shipment.');
        expect(ctx?.agent_notes).toEqual(['Use ONLY for weight surcharges.']);
    });

    it('should store null rules when API returns null', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse([makeNoRulesRawType()]));
        cache = new TicketTypesCache(new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);

        const types = await cache.getAll();

        expect(types[0].rules).toBeNull();
    });

    it('should store null rules when rules JSON is malformed', async () => {
        mockFetch.mockResolvedValueOnce(makeApiResponse([makeAvailableRawType({ rules: '{broken json' })]));
        cache = new TicketTypesCache(new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);

        const types = await cache.getAll();

        expect(types[0].rules).toBeNull();
    });

    it('should store type as null when API returns null (always null in practice)', async () => {
        const types = await cache.getAll();

        expect(types[0].type).toBeNull();
    });

    // -------------------------------------------------------------------------
    // getRulesForType
    // -------------------------------------------------------------------------

    it('should return parsed rules for an existing type ID', async () => {
        const rules = await cache.getRulesForType(3);

        expect(rules).not.toBeNull();
        expect(rules?.reference).toBe('guide');
    });

    it('should return null when type ID does not exist in catalog', async () => {
        const rules = await cache.getRulesForType(999);

        expect(rules).toBeNull();
    });
});
