/**
 * Tests for the carrier service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { fetchAvailableCarriers } from '../../src/services/carrier.js';

describe('fetchAvailableCarriers', () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return CarrierInfo objects with name, import, and third_party flags', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    { name: 'fedex', import: 0, third_party: 1 },
                    { name: 'dhl', import: 1, third_party: 0 },
                    { name: 'estafeta', import: 0, third_party: 0 },
                ],
            }),
        });

        const result = await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG);

        expect(result).toEqual([
            { name: 'fedex', import: 0, third_party: 1 },
            { name: 'dhl', import: 1, third_party: 0 },
            { name: 'estafeta', import: 0, third_party: 0 },
        ]);
    });

    it('should default import and third_party to 0 when absent from response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [{ name: 'dhl' }] }),
        });

        const result = await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG);

        expect(result).toEqual([{ name: 'dhl', import: 0, third_party: 0 }]);
    });

    it('should preserve distinct entries for the same carrier with different routing flags', async () => {
        // e.g. DHL appears twice for AR→MX: once as standard export, once as import service
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    { name: 'dhl', import: 0, third_party: 0 },
                    { name: 'dhl', import: 1, third_party: 0 },
                ],
            }),
        });

        const result = await fetchAvailableCarriers('AR', true, client, MOCK_CONFIG, 'MX');

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'dhl', import: 0, third_party: 0 });
        expect(result[1]).toEqual({ name: 'dhl', import: 1, third_party: 0 });
    });

    it('should call the correct URL for domestic shipments', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [{ name: 'fedex' }] }),
        });

        await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/available-carrier/MX/0/1');
        expect(url).not.toContain('destination_country');
    });

    it('should call the correct URL for international shipments without destination country', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [{ name: 'fedex' }] }),
        });

        await fetchAvailableCarriers('MX', true, client, MOCK_CONFIG);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/available-carrier/MX/1/1');
        expect(url).not.toContain('destination_country');
    });

    it('should append destination_country query param for international shipments when provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [{ name: 'dhl' }, { name: 'ups' }] }),
        });

        await fetchAvailableCarriers('AR', true, client, MOCK_CONFIG, 'MX');

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/available-carrier/AR/1/1');
        expect(url).toContain('destination_country=MX');
    });

    it('should not append destination_country for domestic shipments even when provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [{ name: 'estafeta' }] }),
        });

        await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG, 'MX');

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).not.toContain('destination_country');
    });

    it('should return empty array when API call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Server error' }),
        });

        const result = await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG);

        expect(result).toEqual([]);
    });

    it('should return empty array when response data is not an array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'not an array' }),
        });

        const result = await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG);

        expect(result).toEqual([]);
    });

    it('should filter out entries with empty names', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    { name: 'fedex', import: 0, third_party: 0 },
                    { name: '', import: 0, third_party: 0 },
                    { name: 'dhl', import: 0, third_party: 0 },
                ],
            }),
        });

        const result = await fetchAvailableCarriers('MX', false, client, MOCK_CONFIG);

        expect(result).toEqual([
            { name: 'fedex', import: 0, third_party: 0 },
            { name: 'dhl', import: 0, third_party: 0 },
        ]);
    });
});
