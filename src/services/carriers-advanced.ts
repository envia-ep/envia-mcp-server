/**
 * Envia MCP Server — Carriers Advanced Service
 *
 * Thin HTTP helpers for advanced carrier operations:
 * manifest, bill of lading, city lookup, pickup management,
 * ND reports, and SAT complement.
 *
 * All endpoints use shippingBase (api-test.envia.com in sandbox).
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type {
    ManifestResponse,
    BillOfLadingResponse,
    PickupCancelResponse,
    TrackResponse,
    NdReportResponse,
    PickupTrackResponse,
    ComplementEntry,
    ComplementResponse,
} from '../types/carriers-advanced.js';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * Generate a manifest PDF for the given tracking numbers.
 * Shipments must be in "Created" status (status_id=1).
 *
 * @param client  - authenticated API client
 * @param config  - environment config
 * @param trackingNumbers - list of tracking numbers to include
 */
export async function generateManifest(
    client: EnviaApiClient,
    config: EnviaConfig,
    trackingNumbers: string[],
): Promise<ApiResponse<ManifestResponse>> {
    const url = `${config.shippingBase}/ship/manifest`;
    return client.post<ManifestResponse>(url, { trackingNumbers });
}

// ---------------------------------------------------------------------------
// Bill of Lading
// ---------------------------------------------------------------------------

/**
 * Generate a bill of lading PDF for a shipment.
 *
 * @param client  - authenticated API client
 * @param config  - environment config
 * @param body    - complete bill of lading request body
 */
export async function generateBillOfLading(
    client: EnviaApiClient,
    config: EnviaConfig,
    body: Record<string, unknown>,
): Promise<ApiResponse<BillOfLadingResponse>> {
    const url = `${config.shippingBase}/ship/billoflading`;
    return client.post<BillOfLadingResponse>(url, body);
}

// ---------------------------------------------------------------------------
// Cancel pickup
// ---------------------------------------------------------------------------

/**
 * Cancel a scheduled pickup by confirmation number.
 *
 * @param client        - authenticated API client
 * @param config        - environment config
 * @param carrier       - carrier code
 * @param confirmation  - pickup confirmation number (string)
 * @param locale        - locale/region ID (1=MX, 2=US)
 */
export async function cancelPickup(
    client: EnviaApiClient,
    config: EnviaConfig,
    carrier: string,
    confirmation: string,
    locale: number,
): Promise<ApiResponse<PickupCancelResponse>> {
    const url = `${config.shippingBase}/ship/pickupcancel`;
    return client.post<PickupCancelResponse>(url, { carrier, confirmation, locale });
}

// ---------------------------------------------------------------------------
// Track (authenticated)
// ---------------------------------------------------------------------------

/**
 * Track shipments using the authenticated endpoint.
 * Returns more data than the public /ship/generaltrack endpoint.
 *
 * @param client          - authenticated API client
 * @param config          - environment config
 * @param carrier         - carrier code
 * @param trackingNumbers - array of tracking numbers
 */
export async function trackAuthenticated(
    client: EnviaApiClient,
    config: EnviaConfig,
    carrier: string,
    trackingNumbers: string[],
): Promise<ApiResponse<TrackResponse>> {
    const url = `${config.shippingBase}/ship/track`;
    return client.post<TrackResponse>(url, { carrier, trackingNumber: trackingNumbers });
}

// ---------------------------------------------------------------------------
// ND report
// ---------------------------------------------------------------------------

/**
 * Submit a non-delivery (NDR) action report for a shipment.
 *
 * @param client        - authenticated API client
 * @param config        - environment config
 * @param carrier       - carrier code
 * @param trackingNumber - tracking number of the shipment with exception
 * @param actionCode    - NDR action code (e.g. "RD", "DM", "RE", "AC", "CP")
 */
export async function submitNdReport(
    client: EnviaApiClient,
    config: EnviaConfig,
    carrier: string,
    trackingNumber: string,
    actionCode: string,
): Promise<ApiResponse<NdReportResponse>> {
    const url = `${config.shippingBase}/ship/ndreport`;
    return client.post<NdReportResponse>(url, { carrier, trackingNumber, actionCode });
}

// ---------------------------------------------------------------------------
// Track pickup
// ---------------------------------------------------------------------------

/**
 * Track one or more pickups by confirmation numbers.
 *
 * @param client        - authenticated API client
 * @param config        - environment config
 * @param carrier       - carrier code
 * @param confirmations - array of pickup confirmation numbers
 * @param locale        - locale/region ID (1=MX, 2=US)
 */
export async function trackPickup(
    client: EnviaApiClient,
    config: EnviaConfig,
    carrier: string,
    confirmations: string[],
    locale: number,
): Promise<ApiResponse<PickupTrackResponse>> {
    const url = `${config.shippingBase}/ship/pickuptrack`;
    return client.post<PickupTrackResponse>(url, { carrier, confirmation: confirmations, locale });
}

// ---------------------------------------------------------------------------
// SAT Complement
// ---------------------------------------------------------------------------

/**
 * Add SAT Carta Porte complement data to one or more shipments.
 * The body sent to the API is a top-level ARRAY, not a wrapped object.
 *
 * @param client   - authenticated API client
 * @param config   - environment config
 * @param entries  - array of complement entries (one per shipment)
 */
export async function generateComplement(
    client: EnviaApiClient,
    config: EnviaConfig,
    entries: ComplementEntry[],
): Promise<ApiResponse<ComplementResponse>> {
    const url = `${config.shippingBase}/ship/complement`;
    return client.post<ComplementResponse>(url, entries as unknown as Record<string, unknown>);
}
