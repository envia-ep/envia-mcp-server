/**
 * Carrier Service
 *
 * Fetches carrier availability information from the Envia Queries API.
 * Used by quote_shipment to fan out rate requests across all available
 * carriers for a country.
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';

/** Shape of a single carrier entry from the available-carrier endpoint. */
interface CarrierEntry {
    name: string;
    import: number;
    third_party: number;
}

/**
 * Carrier with the routing flags required by the Envia rate API.
 *
 * Each unique `(name, import, third_party)` combination represents a distinct
 * service routing and must be sent as a separate rate request. For example,
 * DHL may appear twice for AR→MX: once as a standard export (`import: 0`) and
 * once as an import service (`import: 1`).
 */
export interface CarrierInfo {
    name: string;
    /** 1 when the carrier is operating as an import service on the destination side. */
    import: number;
    /** 1 when the carrier is operating as a third-party billing arrangement. */
    third_party: number;
}

/**
 * Fetch available carriers for a country and shipment type.
 *
 * Endpoint: `GET /available-carrier/{originCountry}/{intl}/{shipmentType}`
 *
 * For international shipments, pass `destinationCountry` so the API returns
 * only carriers that serve the full origin→destination route (e.g. AR→MX).
 * Without it, the API may return carriers that serve the origin country but
 * cannot deliver to the requested destination.
 *
 * The returned entries preserve `import` and `third_party` flags so callers
 * can include them verbatim in each rate-request `shipment` object.
 *
 * @param countryCode - ISO 3166-1 alpha-2 origin country code
 * @param international - Whether the shipment crosses borders
 * @param client - Envia API client
 * @param config - Server configuration
 * @param destinationCountry - ISO 3166-1 alpha-2 destination country code (international only)
 * @returns Array of CarrierInfo objects ready for rate requests
 */
export async function fetchAvailableCarriers(
    countryCode: string,
    international: boolean,
    client: EnviaApiClient,
    config: EnviaConfig,
    destinationCountry?: string,
): Promise<CarrierInfo[]> {
    const intl = international ? 1 : 0;
    const shipmentType = 1;
    let url = `${config.queriesBase}/available-carrier/${encodeURIComponent(countryCode)}/${intl}/${shipmentType}`;

    if (international && destinationCountry) {
        url += `?destination_country=${encodeURIComponent(destinationCountry)}`;
    }

    const res = await client.get<{ data: CarrierEntry[] }>(url);

    if (!res.ok || !Array.isArray(res.data?.data)) {
        return [];
    }

    return res.data.data
        .filter((c) => Boolean(c.name))
        .map((c) => ({ name: c.name, import: c.import ?? 0, third_party: c.third_party ?? 0 }));
}
