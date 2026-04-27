/**
 * Carrier Constraints — Service Layer
 *
 * Fetches carrier capability data from the carriers API endpoint:
 *   GET /carrier-constraints/{carrier_id}
 *
 * Backend ticket: C11 — endpoint not yet available. Until C11 ships,
 * any call to this service will receive a 404 from the backend.
 * The service handles that case with a clear user-friendly message.
 * No code changes are required once the backend ships — only the
 * ENVIA_ENVIRONMENT env var (which controls shippingBase) needs to
 * point to the live carriers service.
 *
 * Data source: ${config.shippingBase}/carrier-constraints/{carrier_id}
 * Spec: _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { CarrierConstraintsResponse } from '../types/carrier-constraints.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Valid values for the ?include= query parameter. */
export type ConstraintsInclude = 'additional_services' | 'coverage_summary';

/** Options passed to fetchCarrierConstraints. */
export interface FetchCarrierConstraintsOptions {
    /** Filter response to a single service. Optional. */
    serviceId?: number;
    /**
     * Sections to include in the response.
     * Defaults to ['additional_services'] if omitted (matches backend default).
     */
    include?: ConstraintsInclude[];
}

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

/**
 * Fetch carrier constraints from the carriers API.
 *
 * Calls GET /carrier-constraints/{carrier_id} with optional ?service_id=N
 * and ?include=... query parameters. Returns the strongly-typed response on
 * success, or throws an Error with a user-friendly message on any failure.
 *
 * Error mapping:
 *   - 401 → "Authentication failed — verify your ENVIA_API_KEY."
 *   - 404 (carrier not found / not active) → clear message + C11 note if applicable
 *   - 422 → propagates backend validation message
 *   - 5xx → "Backend error: {message}"
 *   - network → rethrows the network error from the client
 *
 * @param client    - Authenticated Envia API client
 * @param carrierId - Numeric carrier ID (must be a positive integer)
 * @param options   - Optional service filter and include sections
 * @param config    - Server configuration (provides shippingBase URL)
 * @returns Parsed CarrierConstraintsResponse
 * @throws Error with a user-friendly message on any non-200 response
 */
export async function fetchCarrierConstraints(
    client: EnviaApiClient,
    carrierId: number,
    options: FetchCarrierConstraintsOptions,
    config: EnviaConfig,
): Promise<CarrierConstraintsResponse> {
    const include = options.include ?? ['additional_services'];

    const params = new URLSearchParams();
    if (options.serviceId !== undefined) {
        params.set('service_id', String(options.serviceId));
    }
    if (include.length > 0) {
        params.set('include', include.join(','));
    }

    const base = `${config.shippingBase}/carrier-constraints/${carrierId}`;
    const url = params.toString().length > 0 ? `${base}?${params.toString()}` : base;

    const res = await client.get<CarrierConstraintsResponse>(url);

    if (res.ok) {
        return res.data;
    }

    // Map error codes to user-friendly messages.
    // The API client already extracts error text into res.error on non-2xx responses.
    // For extra safety, also probe the raw body via unknown intermediary.
    const rawBody = res.data as unknown as Record<string, unknown>;
    const rawError = typeof rawBody?.error === 'string'
        ? rawBody.error
        : (res.error ?? '');

    switch (res.status) {
        case 401:
            throw new Error(
                'Authentication failed — verify your ENVIA_API_KEY is valid and not expired.',
            );

        case 404: {
            // Distinguish between "carrier not found" (real 404) and the endpoint
            // not yet existing (C11 not shipped). The backend returns a plain-text
            // "Not Found" / empty body when the route doesn't exist, vs. a JSON
            // { error: "Carrier not found" } when the route exists but the carrier is missing.
            const isEndpointMissing =
                !rawError ||
                rawError.toLowerCase().includes('not found') === false ||
                res.status === 404 && rawError.trim() === '';

            if (isEndpointMissing && rawError.trim() === '') {
                throw new Error(
                    'Carrier constraints endpoint is not yet available (backend ticket C11 pending). ' +
                    'This tool will work automatically once the backend ships the endpoint.',
                );
            }

            throw new Error(
                rawError || 'Carrier not found.',
            );
        }

        case 422:
            throw new Error(
                rawError || 'Validation error — check that service_id belongs to the requested carrier.',
            );

        default:
            if (res.status >= 500) {
                throw new Error(`Backend error: ${rawError || 'Internal server error.'}`);
            }
            throw new Error(
                rawError || `Unexpected error (${res.status}). Please try again.`,
            );
    }
}
