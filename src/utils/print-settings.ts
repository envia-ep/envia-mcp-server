/**
 * Print Settings Resolver
 *
 * Fetches carrier-specific print format and size from the Envia
 * pickup-limits API. These values are required by the generate
 * endpoint (`POST /ship/generate`) in the `settings` section.
 *
 * The pickup-limits endpoint lives on the Queries API:
 *   GET {queriesBase}/pickup-limits/{carrier}/{service}/{country}?carrier_id={carrierId}
 *
 * When the carrier ID is unavailable (manual mode) or the API call
 * fails, sensible defaults (PDF / STOCK_4X6) are returned so label
 * creation can proceed without interruption.
 */

import type { EnviaApiClient } from './api-client.js';
import type { EnviaConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Resolved print settings for the generate payload. */
export interface PrintSettings {
    printFormat: string;
    printSize: string;
}

/** Single entry in the pickup-limits `print` array. */
interface PrintLimitEntry {
    type_id: string;
    size_id: string;
}

/** Shape returned by the pickup-limits endpoint. */
interface PickupLimitsResponse {
    print: PrintLimitEntry[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Fallback format when the API does not return print rules. */
const DEFAULT_PRINT_FORMAT = 'PDF';

/** Fallback size when the API does not return print rules. */
const DEFAULT_PRINT_SIZE = 'STOCK_4X6';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch print settings for a carrier / service / country combination.
 *
 * Calls `GET {queriesBase}/pickup-limits/{carrier}/{service}/{country}?carrier_id={carrierId}`.
 * When the response includes a non-empty `print` array, the first entry's
 * `type_id` and `size_id` are returned as `printFormat` / `printSize`.
 *
 * Falls back to `PDF` / `STOCK_4X6` when:
 *  - `carrierId` is not provided (manual mode — skip the API call entirely)
 *  - The API returns an error or empty print array
 *
 * @param carrier   - Carrier slug (e.g. "fedex", "dhl")
 * @param service   - Service code (e.g. "express", "ground")
 * @param country   - ISO 3166-1 alpha-2 origin country code
 * @param carrierId - Numeric carrier ID from the order quote (optional)
 * @param client    - Authenticated Envia API client
 * @param config    - Server configuration with API base URLs
 * @returns Resolved print format and size
 */
export async function fetchPrintSettings(
    carrier: string,
    service: string,
    country: string,
    carrierId: number | null | undefined,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<PrintSettings> {
    if (carrierId == null) {
        return { printFormat: DEFAULT_PRINT_FORMAT, printSize: DEFAULT_PRINT_SIZE };
    }

    const encodedCarrier = encodeURIComponent(carrier);
    const encodedService = encodeURIComponent(service);
    const encodedCountry = encodeURIComponent(country.toUpperCase());

    const url =
        `${config.queriesBase}/pickup-limits/${encodedCarrier}/${encodedService}/${encodedCountry}` +
        `?carrier_id=${carrierId}`;

    try {
        const res = await client.get<PickupLimitsResponse>(url);

        if (res.ok && Array.isArray(res.data?.print) && res.data.print.length > 0) {
            const first = res.data.print[0];
            return {
                printFormat: first.type_id || DEFAULT_PRINT_FORMAT,
                printSize: first.size_id || DEFAULT_PRINT_SIZE,
            };
        }
    } catch {
        // Swallow — fallback to defaults below
    }

    return { printFormat: DEFAULT_PRINT_FORMAT, printSize: DEFAULT_PRINT_SIZE };
}
