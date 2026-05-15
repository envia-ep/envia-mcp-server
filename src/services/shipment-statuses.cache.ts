/**
 * Shipment Statuses Cache
 *
 * In-memory TTL cache for the shipment status catalog.
 * Fetches from GET /shipments-status on first use and refreshes every 12 hours.
 * Used to resolve status IDs to human-readable names in tool error messages
 * (e.g. when a ticket type requires a specific shipment status).
 *
 * Source endpoint: GET /shipments-status (queries service, auth: token_user)
 * Response shape: { data: ShipmentStatusRecord[] }
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { queryShipmentsApi } from './shipments.js';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A shipment status entry as stored in the in-memory cache. */
export interface ShipmentStatus {
    id: number;
    /** Human-readable name e.g. "En tránsito", "Entregado". */
    name: string;
}

interface ShipmentStatusesResponse {
    data: Array<{
        id: number;
        name: string;
        [key: string]: unknown;
    }>;
}

// ---------------------------------------------------------------------------
// Cache class
// ---------------------------------------------------------------------------

/**
 * In-memory cache for the shipment statuses catalog.
 *
 * Usage:
 *   const cache = new ShipmentStatusesCache(client, config);
 *   const name = await cache.getNameById(3); // "En tránsito"
 */
export class ShipmentStatusesCache {
    private cache: ShipmentStatus[] = [];
    private lastFetchedAt = 0;

    constructor(
        private readonly client: EnviaApiClient,
        private readonly config: EnviaConfig,
    ) {}

    /**
     * Return all shipment statuses from cache.
     * Triggers a refresh from the API when the cache is empty or expired.
     */
    async getAll(): Promise<ShipmentStatus[]> {
        if (this.cache.length > 0 && Date.now() - this.lastFetchedAt < CACHE_TTL_MS) {
            return this.cache;
        }
        await this.refresh();
        return this.cache;
    }

    /**
     * Return the human-readable name for a shipment status ID.
     * Returns undefined when the ID is not found in the catalog.
     */
    async getNameById(id: number): Promise<string | undefined> {
        const statuses = await this.getAll();
        return statuses.find((s) => s.id === id)?.name;
    }

    private async refresh(): Promise<void> {
        const res = await queryShipmentsApi<ShipmentStatusesResponse>(
            this.client,
            this.config,
            '/shipments-status',
        );

        if (!res.ok || !Array.isArray(res.data?.data)) {
            return;
        }

        this.cache = res.data.data.map((item) => ({
            id: item.id,
            name: item.name,
        }));
        this.lastFetchedAt = Date.now();
    }
}
