import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShipmentStatusesCache } from '../../src/services/shipment-statuses.cache.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';

// =============================================================================
// Factories
// =============================================================================

function makeApiResponse(statuses: unknown[]) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: statuses }),
    };
}

function makeErrorResponse() {
    return {
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
    };
}

const RAW_STATUSES = [
    { id: 1, name: 'Creado', order_index: 1, translation_tag: 'shipments.status.1', parent_id: 1, parent_name: 'Pendiente', parent_translation_tag: 'shipments.status.parent.1' },
    { id: 2, name: 'En tránsito', order_index: 2, translation_tag: 'shipments.status.2', parent_id: 2, parent_name: 'En tránsito', parent_translation_tag: 'shipments.status.parent.2' },
    { id: 3, name: 'En camino', order_index: 3, translation_tag: 'shipments.status.3', parent_id: 2, parent_name: 'En tránsito', parent_translation_tag: 'shipments.status.parent.2' },
    { id: 5, name: 'Entregado', order_index: 5, translation_tag: 'shipments.status.5', parent_id: 3, parent_name: 'Entregado', parent_translation_tag: 'shipments.status.parent.3' },
];

// =============================================================================
// Suite: ShipmentStatusesCache
// =============================================================================

describe('ShipmentStatusesCache', () => {
    let cache: ShipmentStatusesCache;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue(makeApiResponse(RAW_STATUSES));
        vi.stubGlobal('fetch', mockFetch);
        cache = new ShipmentStatusesCache(new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // getAll — fetching and caching
    // -------------------------------------------------------------------------

    it('should fetch from API on first call', async () => {
        const statuses = await cache.getAll();

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(statuses).toHaveLength(4);
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
        mockFetch.mockResolvedValue(makeErrorResponse());
        cache = new ShipmentStatusesCache(new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);

        const statuses = await cache.getAll();

        expect(statuses).toEqual([]);
    });

    it('should store only id and name from the API response (strips extra fields)', async () => {
        const statuses = await cache.getAll();

        expect(statuses[0]).toEqual({ id: 1, name: 'Creado' });
        expect('order_index' in statuses[0]).toBe(false);
        expect('translation_tag' in statuses[0]).toBe(false);
    });

    // -------------------------------------------------------------------------
    // getNameById
    // -------------------------------------------------------------------------

    it('should return the status name for a known ID', async () => {
        const name = await cache.getNameById(2);

        expect(name).toBe('En tránsito');
    });

    it('should return undefined for an ID not in the catalog', async () => {
        const name = await cache.getNameById(999);

        expect(name).toBeUndefined();
    });

    it('should trigger a fetch when getNameById is called on an empty cache', async () => {
        await cache.getNameById(1);

        expect(mockFetch).toHaveBeenCalledOnce();
    });
});
