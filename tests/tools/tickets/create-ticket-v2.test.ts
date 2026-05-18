import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import {
    handleCreateTicketV2,
    resolveAndValidateShipment,
    registerCreateTicketV2,
} from '../../../src/tools/tickets/create-ticket-v2.js';
import type { TicketTypesCache, CachedTicketType, TicketTypeRule } from '../../../src/services/ticket-types.cache.js';
import type { ShipmentStatusesCache, ShipmentStatus } from '../../../src/services/shipment-statuses.cache.js';

// =============================================================================
// Factories
// =============================================================================

function makeRules(overrides: Partial<TicketTypeRule> = {}): TicketTypeRule {
    return {
        reference: 'guide',
        inputs: [],
        conditions: { avaliable_status: [3, 11, 13] },
        mcp_context: {
            use_case: 'Carrier charged extra weight.',
            is_blocked: false,
            requires_guide: true,
        },
        ...overrides,
    };
}

function makeBlockedRules(): TicketTypeRule {
    return {
        reference: '',
        inputs: [],
        mcp_context: {
            use_case: 'Internal only.',
            is_blocked: true,
            requires_guide: false,
        },
    };
}

function makeCacheWith(rules: TicketTypeRule | null): TicketTypesCache {
    return {
        getAll: vi.fn().mockResolvedValue([] as CachedTicketType[]),
        getRulesForType: vi.fn().mockResolvedValue(rules),
    } as unknown as TicketTypesCache;
}

const MOCK_STATUSES: ShipmentStatus[] = [
    { id: 1, name: 'Creado' },
    { id: 2, name: 'En tránsito' },
    { id: 3, name: 'En camino' },
    { id: 5, name: 'Entregado' },
    { id: 7, name: 'Devuelto' },
    { id: 11, name: 'En espera de recolección' },
    { id: 13, name: 'Pendiente' },
];

function makeStatusesCache(statuses: ShipmentStatus[] = MOCK_STATUSES): ShipmentStatusesCache {
    return {
        getAll: vi.fn().mockResolvedValue(statuses),
        getNameById: vi.fn().mockImplementation(async (id: number) => {
            return statuses.find((s) => s.id === id)?.name;
        }),
    } as unknown as ShipmentStatusesCache;
}

function makeShipmentApiResponse(id: number, status_id: number) {
    return {
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                data: [{ id, tracking_number: 'TRACK123', status_id }],
            }),
    };
}

function makeCreateTicketApiResponse(ticketId: number) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: ticketId }),
    };
}

function makeApiErrorResponse(status: number) {
    return {
        ok: false,
        status,
        json: () => Promise.resolve({}),
    };
}

/**
 * Builds a minimal fake JWT so fetchUserInfo can decode company_id without real crypto.
 */
function makeUserInfoJwt(companyId: number, userId: number = 1): string {
    const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64');
    const payload = Buffer.from(JSON.stringify({ data: { company_id: companyId, user_id: userId } })).toString('base64');
    return `${header}.${payload}.fakesig`;
}

function makeUserInfoApiResponse(companyId: number) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: makeUserInfoJwt(companyId) }),
    };
}

function makeFileUploadApiResponse(id: number, name: string, url: string) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { id, name, url } }),
    };
}

// =============================================================================
// Suite: resolveAndValidateShipment
// =============================================================================

describe('resolveAndValidateShipment', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return shipment id when tracking is found and status is eligible', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 3));
        vi.stubGlobal('fetch', mockFetch);

        const rules = makeRules({ conditions: { avaliable_status: [3, 11, 13] } });
        const result = await resolveAndValidateShipment('TRACK123', rules, client, MOCK_CONFIG, makeStatusesCache());

        expect(result).toBe(170633);
    });

    it('should return shipment id when no eligible statuses are defined (no status restriction)', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 99));
        vi.stubGlobal('fetch', mockFetch);

        const rules = makeRules({ conditions: { avaliable_status: [] } });
        const result = await resolveAndValidateShipment('TRACK123', rules, client, MOCK_CONFIG, makeStatusesCache());

        expect(result).toBe(170633);
    });

    it('should throw McpError when tracking number is not found (API returns not ok)', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeApiErrorResponse(404));
        vi.stubGlobal('fetch', mockFetch);

        await expect(
            resolveAndValidateShipment('NOTFOUND', null, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should throw McpError when shipment status is not in eligible list', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 5));
        vi.stubGlobal('fetch', mockFetch);

        const rules = makeRules({ conditions: { avaliable_status: [3, 11, 13] } });

        await expect(
            resolveAndValidateShipment('TRACK123', rules, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should include human-readable status names in the error message', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 5));
        vi.stubGlobal('fetch', mockFetch);

        const rules = makeRules({ conditions: { avaliable_status: [3, 11, 13] } });

        const err = await resolveAndValidateShipment('TRACK123', rules, client, MOCK_CONFIG, makeStatusesCache())
            .catch((e: unknown) => e as { message: string });

        expect(err.message).toContain('Entregado');
        expect(err.message).toContain('En camino');
        expect(err.message).toContain('En espera de recolección');
        expect(err.message).toContain('Pendiente');
    });

    it('should fall back to "ID X" format when status is not in the catalog', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 99));
        vi.stubGlobal('fetch', mockFetch);

        const rules = makeRules({ conditions: { avaliable_status: [3] } });

        const err = await resolveAndValidateShipment('TRACK123', rules, client, MOCK_CONFIG, makeStatusesCache())
            .catch((e: unknown) => e as { message: string });

        expect(err.message).toContain('ID 99');
    });

    it('should skip status validation when rules are null', async () => {
        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 99));
        vi.stubGlobal('fetch', mockFetch);

        const result = await resolveAndValidateShipment('TRACK123', null, client, MOCK_CONFIG, makeStatusesCache());

        expect(result).toBe(170633);
    });
});

// =============================================================================
// Suite: handleCreateTicketV2
// =============================================================================

describe('handleCreateTicketV2', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // Pre-flight validation — type availability
    // -------------------------------------------------------------------------

    it('should throw McpError when type has no mcp_context (rules is null)', async () => {
        const cache = makeCacheWith(null);

        await expect(
            handleCreateTicketV2({ api_key: MOCK_CONFIG.apiKey, type_id: 22, comments: 'test' }, cache, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should throw McpError when type is blocked', async () => {
        const cache = makeCacheWith(makeBlockedRules());

        await expect(
            handleCreateTicketV2({ api_key: MOCK_CONFIG.apiKey, type_id: 10, comments: 'test' }, cache, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    // -------------------------------------------------------------------------
    // Pre-flight validation — reference fields
    // -------------------------------------------------------------------------

    it('should throw McpError when guide type receives neither tracking_number nor shipment_id', async () => {
        const cache = makeCacheWith(makeRules({ reference: 'guide' }));

        await expect(
            handleCreateTicketV2({ api_key: MOCK_CONFIG.apiKey, type_id: 3, comments: 'overweight' }, cache, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should throw McpError when credit type receives no credit_id', async () => {
        const cache = makeCacheWith(makeRules({ reference: 'credit' }));

        await expect(
            handleCreateTicketV2({ api_key: MOCK_CONFIG.apiKey, type_id: 7, comments: 'refund' }, cache, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should throw McpError when type has reference="warehouse-package" (not available through MCP)', async () => {
        const cache = makeCacheWith({ ...makeRules({ reference: 'warehouse-package' }), mcp_context: undefined });

        await expect(
            handleCreateTicketV2({ api_key: MOCK_CONFIG.apiKey, type_id: 15, comments: 'package issue' }, cache, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    // -------------------------------------------------------------------------
    // Pre-flight validation — required variables
    // -------------------------------------------------------------------------

    it('should throw McpError when a required input variable is missing', async () => {
        const rules = makeRules({
            reference: '',
            inputs: [
                { name: 'payment_method_id', el: 'select', required: true, type: 'source' },
            ],
        });
        const cache = makeCacheWith(rules);

        await expect(
            handleCreateTicketV2({ api_key: MOCK_CONFIG.apiKey, type_id: 9, comments: 'pending' }, cache, client, MOCK_CONFIG, makeStatusesCache()),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('should not throw when required input is present in variables', async () => {
        const rules = makeRules({
            reference: 'guide',
            inputs: [
                { name: 'payment_method_id', el: 'select', required: true, type: 'source' },
            ],
            conditions: { avaliable_status: [] },
        });
        const cache = makeCacheWith(rules);

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeShipmentApiResponse(170633, 5))
            .mockResolvedValueOnce(makeCreateTicketApiResponse(101));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey, type_id: 9,
                comments: 'payment pending',
                shipment_id: 170633,
                variables: { payment_method_id: '3' },
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Ticket created successfully');
    });

    it('should skip inputs with name "undefined" when validating required fields', async () => {
        const rules = makeRules({
            reference: 'guide',
            inputs: [
                { name: 'undefined', el: 'input', required: true },
            ],
            conditions: { avaliable_status: [] },
        });
        const cache = makeCacheWith(rules);

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeShipmentApiResponse(170633, 5))
            .mockResolvedValueOnce(makeCreateTicketApiResponse(102));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 3, comments: 'test', shipment_id: 170633 },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Ticket created successfully');
    });

    // -------------------------------------------------------------------------
    // Tracking resolution and status validation
    // -------------------------------------------------------------------------

    it('should resolve tracking_number to shipment_id when reference is guide', async () => {
        const cache = makeCacheWith(makeRules({ conditions: { avaliable_status: [3] } }));

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeShipmentApiResponse(170633, 3))
            .mockResolvedValueOnce(makeCreateTicketApiResponse(200));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 3, comments: 'overweight', tracking_number: 'TRACK123' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('shipment_id: 170633');
        expect(result).toContain('tracking: TRACK123');
    });

    it('should skip tracking resolution when shipment_id is already provided', async () => {
        const cache = makeCacheWith(makeRules({ conditions: { avaliable_status: [] } }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(201));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 3, comments: 'overweight', shipment_id: 999 },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(result).toContain('shipment_id: 999');
    });

    it('should throw McpError when shipment status is ineligible during tracking resolution', async () => {
        const cache = makeCacheWith(makeRules({ conditions: { avaliable_status: [3, 11] } }));

        mockFetch = vi.fn().mockResolvedValue(makeShipmentApiResponse(170633, 7));
        vi.stubGlobal('fetch', mockFetch);

        await expect(
            handleCreateTicketV2(
                { type_id: 3, comments: 'overweight', tracking_number: 'TRACK123' },
                cache,
                client,
                MOCK_CONFIG,
                makeStatusesCache(),
            ),
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    // -------------------------------------------------------------------------
    // Payload construction
    // -------------------------------------------------------------------------

    it('should serialize variables to JSON string in the request body', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(300));
        vi.stubGlobal('fetch', mockFetch);

        await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey, type_id: 9,
                comments: 'payment issue',
                variables: { payment_method_id: '3', bank_account: '123456' },
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
        expect(typeof callBody.data).toBe('string');
        const parsed = JSON.parse(callBody.data as string) as Record<string, unknown>;
        expect(parsed.payment_method_id).toBe('3');
        expect(parsed.bank_account).toBe('123456');
    });

    it('should not include data field when variables is empty', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(301));
        vi.stubGlobal('fetch', mockFetch);

        await handleCreateTicketV2(
            { type_id: 9, comments: 'payment issue' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
        expect('data' in callBody).toBe(false);
    });

    it('should include optional fields in payload when provided', async () => {
        const cache = makeCacheWith(makeRules({ reference: 'credit', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(302));
        vi.stubGlobal('fetch', mockFetch);

        await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey, type_id: 7,
                comments: 'refund request',
                credit_id: 55,
                carrier_id: 2,
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
        expect(callBody.credit_id).toBe(55);
        expect(callBody.carrier_id).toBe(2);
    });

    // -------------------------------------------------------------------------
    // API responses
    // -------------------------------------------------------------------------

    it('should return success message with ticket id on creation', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(777));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 3, comments: 'test' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Ticket created successfully');
        expect(result).toContain('Ticket ID: 777');
    });

    it('should return "not linked" message when no shipment reference is given', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(778));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 9, comments: 'payment issue' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Not linked to any shipment');
    });

    it('should return conflict message on 409 response', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeApiErrorResponse(409));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 9, comments: 'payment issue' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('active ticket already exists');
    });

    it('should return error message on non-409 API failure', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeApiErrorResponse(500));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { type_id: 9, comments: 'payment issue' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Failed to create ticket');
    });

    // -------------------------------------------------------------------------
    // File uploads
    // -------------------------------------------------------------------------

    it('should upload files after ticket creation and include URLs in the response', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeCreateTicketApiResponse(500))       // POST /company/tickets
            .mockResolvedValueOnce(makeUserInfoApiResponse(42))             // GET /user-information
            .mockResolvedValueOnce(makeFileUploadApiResponse(1, 'ev.jpg', 'https://s3.example.com/ev.jpg')); // POST .../files
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                type_id: 9,
                comments: 'damage claim',
                files: [{ name: 'ev.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' }],
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Ticket created successfully');
        expect(result).toContain('File uploads:');
        expect(result).toContain('ev.jpg');
        expect(result).toContain('https://s3.example.com/ev.jpg');
    });

    it('should report upload error gracefully when file upload API call fails', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeCreateTicketApiResponse(501))       // POST /company/tickets
            .mockResolvedValueOnce(makeUserInfoApiResponse(42))             // GET /user-information
            .mockResolvedValueOnce(makeApiErrorResponse(422));              // POST .../files — fails
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                type_id: 9,
                comments: 'damage claim',
                files: [{ name: 'bad.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' }],
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Ticket created successfully');
        expect(result).toContain('bad.jpg');
        // The error line uses ✗ prefix to indicate failure
        expect(result).toContain('✗ bad.jpg');
    });

    it('should not attempt file upload when no files are provided', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(502));
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            { api_key: MOCK_CONFIG.apiKey, type_id: 9, comments: 'no files' },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        // Only one fetch call: the ticket creation itself
        expect(mockFetch).toHaveBeenCalledOnce();
        expect(result).not.toContain('File uploads:');
    });

    it('should report error when fetchUserInfo fails and files were provided', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeCreateTicketApiResponse(503))       // POST /company/tickets
            .mockResolvedValueOnce(makeApiErrorResponse(401));              // GET /user-information — fails
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                type_id: 9,
                comments: 'damage claim',
                files: [{ name: 'ev.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' }],
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('Ticket created successfully');
        expect(result).toContain('Could not resolve company_id');
    });

    it('should upload multiple files and report all results independently', async () => {
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi
            .fn()
            .mockResolvedValueOnce(makeCreateTicketApiResponse(504))       // POST /company/tickets
            .mockResolvedValueOnce(makeUserInfoApiResponse(42))             // GET /user-information
            .mockResolvedValueOnce(makeFileUploadApiResponse(10, 'a.jpg', 'https://s3.example.com/a.jpg'))  // file 1
            .mockResolvedValueOnce(makeFileUploadApiResponse(11, 'b.pdf', 'https://s3.example.com/b.pdf')); // file 2
        vi.stubGlobal('fetch', mockFetch);

        const result = await handleCreateTicketV2(
            {
                api_key: MOCK_CONFIG.apiKey,
                type_id: 9,
                comments: 'damage claim',
                files: [
                    { name: 'a.jpg', content_base64: 'aGVsbG8=', content_type: 'image/jpeg' },
                    { name: 'b.pdf', content_base64: 'd29ybGQ=', content_type: 'application/pdf' },
                ],
            },
            cache,
            client,
            MOCK_CONFIG,
            makeStatusesCache(),
        );

        expect(result).toContain('a.jpg');
        expect(result).toContain('b.pdf');
        expect(result).toContain('https://s3.example.com/a.jpg');
        expect(result).toContain('https://s3.example.com/b.pdf');
    });
});

// =============================================================================
// Suite: registerCreateTicketV2
// =============================================================================

describe('registerCreateTicketV2', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should register the tool under the envia_create_ticket_v2 name', () => {
        const { server, handlers } = createMockServer();
        const cache = makeCacheWith(makeRules());

        registerCreateTicketV2(server, cache, client, MOCK_CONFIG, makeStatusesCache());

        expect(handlers.has('envia_create_ticket_v2')).toBe(true);
    });

    it('should return a text response with success message when ticket is created', async () => {
        const { server, handlers } = createMockServer();
        const cache = makeCacheWith(makeRules({ reference: '', conditions: {} }));

        mockFetch = vi.fn().mockResolvedValue(makeCreateTicketApiResponse(999));
        vi.stubGlobal('fetch', mockFetch);

        registerCreateTicketV2(server, cache, client, MOCK_CONFIG, makeStatusesCache());

        const handler = handlers.get('envia_create_ticket_v2') as ToolHandler;
        const result = await handler({ api_key: MOCK_CONFIG.apiKey, type_id: 9, comments: 'test issue' });

        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Ticket ID: 999');
    });
});
