import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerSubmitNdReport } from '../../../src/tools/carriers-advanced/submit-nd-report.js';

// NOTE: Sandbox always returns error 1115 for ndreport because no real shipment
// is in NDR status. Tests mock fetch completely.

// =============================================================================
// Factories
// =============================================================================

function makeNdReportResponse() {
    return {
        meta: 'ndreport',
        data: {
            carrier: 'dhl',
            trackingNumber: 'TRACKING123',
            actionCode: 'RD',
        },
    };
}

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    carrier: 'dhl',
    tracking_number: 'TRACKING123',
    action_code: 'RD',
};

// =============================================================================
// Suite
// =============================================================================

describe('envia_submit_nd_report', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(makeNdReportResponse()),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerSubmitNdReport(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_submit_nd_report')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. should return success message with ND report details
    // -------------------------------------------------------------------------
    it('should return success message with ND report details', async () => {
        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('ND report submitted successfully.');
        expect(text).toContain('dhl');
        expect(text).toContain('TRACKING123');
        expect(text).toContain('RD');
    });

    // -------------------------------------------------------------------------
    // 2. should POST to /ship/ndreport
    // -------------------------------------------------------------------------
    it('should POST to /ship/ndreport', async () => {
        await handler(BASE_ARGS);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/ndreport`);
        expect(opts.method).toBe('POST');
    });

    // -------------------------------------------------------------------------
    // 3. should send carrier, trackingNumber, and actionCode in body
    // -------------------------------------------------------------------------
    it('should send carrier, trackingNumber, and actionCode in body', async () => {
        await handler(BASE_ARGS);

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.carrier).toBe('dhl');
        expect(body.trackingNumber).toBe('TRACKING123');
        expect(body.actionCode).toBe('RD');
    });

    // -------------------------------------------------------------------------
    // 4. should lowercase carrier and uppercase action code
    // -------------------------------------------------------------------------
    it('should lowercase carrier and uppercase action code', async () => {
        await handler({ ...BASE_ARGS, carrier: 'DHL', action_code: 'rd' });

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);

        expect(body.carrier).toBe('dhl');
        expect(body.actionCode).toBe('RD');
    });

    // -------------------------------------------------------------------------
    // 5. should return error message when API fails
    // -------------------------------------------------------------------------
    it('should return error message when API fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Shipment not in NDR status' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('ND report submission failed:');
    });

    // -------------------------------------------------------------------------
    // 6. should return error message with suggestion on 401
    // -------------------------------------------------------------------------
    it('should return error message with suggestion on 401', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: 'Unauthorized' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('Suggestion:');
    });

    // -------------------------------------------------------------------------
    // 7. should use provided api_key as bearer token
    // -------------------------------------------------------------------------
    it('should use provided api_key as bearer token', async () => {
        await handler({ ...BASE_ARGS, api_key: 'ndr-custom-token' });

        const [, opts] = mockFetch.mock.calls[0];
        expect(opts.headers['Authorization']).toBe('Bearer ndr-custom-token');
    });

    // -------------------------------------------------------------------------
    // 8. should handle response without actionCode in data
    // -------------------------------------------------------------------------
    it('should handle response without actionCode in data', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                meta: 'ndreport',
                data: { carrier: 'dhl', trackingNumber: 'TRACKING123' },
            }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('ND report submitted successfully.');
        expect(text).toContain('TRACKING123');
    });

    // -------------------------------------------------------------------------
    // 9. should handle success response without data object
    // -------------------------------------------------------------------------
    it('should handle success response without data object', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ meta: 'ndreport' }),
        });

        const result = await handler(BASE_ARGS);
        const text = result.content[0].text;

        expect(text).toContain('ND report submitted successfully.');
    });

    // -------------------------------------------------------------------------
    // 10. should support all common NDR action codes
    // -------------------------------------------------------------------------
    it('should support all common NDR action codes', async () => {
        const codes = ['RD', 'DM', 'RE', 'AC', 'CP'];

        for (const code of codes) {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    meta: 'ndreport',
                    data: { carrier: 'dhl', trackingNumber: 'TRK', actionCode: code },
                }),
            });

            const result = await handler({ ...BASE_ARGS, action_code: code });
            const text = result.content[0].text;

            expect(text).toContain('ND report submitted successfully.');
        }
    });
});
