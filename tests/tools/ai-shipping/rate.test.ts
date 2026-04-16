/**
 * Unit tests for envia_ai_rate — body builder + tool handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerAiRate, buildRateBody } from '../../../src/tools/ai-shipping/rate.js';

const BASE_ARGS = {
    origin_zip: '64000',
    destination_zip: '03100',
    weight: 2.5,
    origin_country: 'mx',
    destination_country: 'us',
};

describe('buildRateBody', () => {
    it('should uppercase both country codes', () => {
        const body = buildRateBody(BASE_ARGS);

        expect(body.origin_country).toBe('MX');
        expect(body.destination_country).toBe('US');
    });

    it('should include carriers only when the array has elements', () => {
        const body = buildRateBody(BASE_ARGS);

        expect(body.carriers).toBeUndefined();
    });

    it('should lowercase and trim individual carrier codes', () => {
        const body = buildRateBody({ ...BASE_ARGS, carriers: ['  FedEx  ', 'DHL'] });

        expect(body.carriers).toEqual(['fedex', 'dhl']);
    });

    it('should pass through the numeric weight unchanged', () => {
        const body = buildRateBody(BASE_ARGS);

        expect(body.weight).toBe(2.5);
    });

    it('should trim postal codes', () => {
        const body = buildRateBody({ ...BASE_ARGS, origin_zip: ' 64000 ' });

        expect(body.origin_zip).toBe('64000');
    });
});

describe('envia_ai_rate handler', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerAiRate(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_ai_rate')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should POST to /ai/shipping/rate', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ carriers_considered: [], results: [] }),
        });

        await handler({ api_key: 'test-key', ...BASE_ARGS });

        expect(mockFetch.mock.calls[0][0]).toBe(`${MOCK_CONFIG.queriesBase}/ai/shipping/rate`);
    });

    it('should summarise successful results and skip errored carriers', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                carriers_considered: ['fedex', 'dhl', 'ups'],
                results: [
                    { carrier: 'fedex', ok: true, data: { meta: 'rate', data: { totalPrice: 200, currency: 'MXN', service: 'ground' } } },
                    { carrier: 'dhl', ok: true, data: { meta: 'error', error: { code: 1300, description: 'x', message: 'no coverage' } } },
                    { carrier: 'ups', ok: true, data: { meta: 'rate', data: { totalPrice: 150, currency: 'MXN', service: 'express' } } },
                ],
            }),
        });

        const result = await handler({ api_key: 'test-key', ...BASE_ARGS });
        const text = result.content[0].text;

        expect(text).toContain('2 returned valid rates');
    });

    it('should present the cheapest carrier first', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                carriers_considered: ['fedex', 'ups'],
                results: [
                    { carrier: 'fedex', ok: true, data: { meta: 'rate', data: { totalPrice: 300, currency: 'MXN' } } },
                    { carrier: 'ups', ok: true, data: { meta: 'rate', data: { totalPrice: 150, currency: 'MXN' } } },
                ],
            }),
        });

        const result = await handler({ api_key: 'test-key', ...BASE_ARGS });
        const text = result.content[0].text;

        expect(text.indexOf('ups')).toBeLessThan(text.indexOf('fedex'));
    });

    it('should report zero valid rates when every carrier errored', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                carriers_considered: ['fedex'],
                results: [{ carrier: 'fedex', ok: true, data: { meta: 'error', error: { code: 1300, description: 'x', message: 'no' } } }],
            }),
        });

        const result = await handler({ api_key: 'test-key', ...BASE_ARGS });

        expect(result.content[0].text).toContain('0 returned valid rates');
    });

    it('should return mapped error when backend fails with 500', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal error' }),
        });

        const result = await handler({ api_key: 'test-key', ...BASE_ARGS });

        expect(result.content[0].text).toContain('Failed to run multi-carrier rate');
    });
});
