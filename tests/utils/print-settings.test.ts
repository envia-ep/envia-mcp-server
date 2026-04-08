import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { fetchPrintSettings } from '../../src/utils/print-settings.js';

describe('fetchPrintSettings', () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return defaults when carrierId is null', async () => {
        const result = await fetchPrintSettings('dhl', 'express', 'MX', null, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X6' });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return defaults when carrierId is undefined', async () => {
        const result = await fetchPrintSettings('dhl', 'express', 'MX', undefined, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X6' });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch print settings from pickup-limits endpoint', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                print: [{ type_id: 'ZPL', size_id: 'STOCK_4X8' }],
            }),
        });

        const result = await fetchPrintSettings('fedex', 'ground', 'MX', 42, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'ZPL', printSize: 'STOCK_4X8' });
        expect(mockFetch).toHaveBeenCalledOnce();
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe(
            'https://queries-test.envia.com/pickup-limits/fedex/ground/MX?carrier_id=42',
        );
    });

    it('should use first entry when print array has multiple entries', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                print: [
                    { type_id: 'PNG', size_id: 'PAPER_4X6' },
                    { type_id: 'PDF', size_id: 'STOCK_4X6' },
                ],
            }),
        });

        const result = await fetchPrintSettings('estafeta', 'standard', 'MX', 7, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PNG', printSize: 'PAPER_4X6' });
    });

    it('should return defaults when print array is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ print: [] }),
        });

        const result = await fetchPrintSettings('dhl', 'express', 'MX', 10, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X6' });
    });

    it('should return defaults when API responds with error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Server error' }),
        });

        const result = await fetchPrintSettings('dhl', 'express', 'MX', 10, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X6' });
    });

    it('should return defaults when fetch throws a network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await fetchPrintSettings('dhl', 'express', 'MX', 10, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X6' });
    });

    it('should return defaults when response has no print field', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ additional_services: [] }),
        });

        const result = await fetchPrintSettings('dhl', 'express', 'MX', 10, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X6' });
    });

    it('should fall back individual fields to defaults when type_id or size_id is empty', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                print: [{ type_id: '', size_id: 'STOCK_4X8' }],
            }),
        });

        const result = await fetchPrintSettings('dhl', 'express', 'MX', 10, client, MOCK_CONFIG);

        expect(result).toEqual({ printFormat: 'PDF', printSize: 'STOCK_4X8' });
    });

    it('should encode carrier, service, and country in the URL', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ print: [{ type_id: 'PDF', size_id: 'STOCK_4X6' }] }),
        });

        await fetchPrintSettings('paquete express', 'next day', 'mx', 5, client, MOCK_CONFIG);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('paquete%20express');
        expect(url).toContain('next%20day');
        expect(url).toContain('/MX?');
    });
});
