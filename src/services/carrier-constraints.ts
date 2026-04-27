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
 * Results reflect availability for the company associated with the JWT
 * (not a global catalog). Four tables are applied server-side:
 *   - company_private_carriers   — carriers enabled for the company
 *   - company_private_services   — services enabled for the company (D2)
 *   - config_disabled_carriers   — carriers disabled for the company (D3)
 *   - config_disabled_services   — services disabled for the company (D3)
 * The MCP receives only the filtered result — no client-side filtering needed.
 *
 * Data source: ${config.shippingBase}/carrier-constraints/{carrier_id}
 * Spec: _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md (v2)
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
 * Results reflect the company identified by the JWT (D1-D3): filters for
 * company_private_carriers, company_private_services, config_disabled_carriers,
 * and config_disabled_services are applied server-side.
 *
 * D11 — Empty services (200 + services: []): when the carrier exists but has
 * no services available for the requesting company, the backend returns HTTP 200
 * with `services: []` and `meta._note` set. This is NOT an error — return the
 * response normally. The tool formatter renders `meta._note` prominently.
 *
 * Error mapping:
 *   - 400 (malformed carrier_id or invalid include) → propagates backend message
 *   - 401 → "Authentication failed — verify your ENVIA_API_KEY."
 *   - 404 (carrier not found) → "Carrier not found." or C11 note if endpoint missing
 *   - 422 (service_id valid but does not belong to this carrier) → propagates backend message
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
        // D11: 200 + empty services[] + meta._note is a valid response, not an error.
        // Return it normally; the formatter handles the _note rendering.
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
        case 400:
            // D12: 400 = malformed input (bad carrier_id, unknown include value, etc.)
            throw new Error(
                rawError || 'Bad request — check that carrier_id is a positive integer and include values are valid.',
            );

        case 401:
            throw new Error(
                'Authentication failed — verify your ENVIA_API_KEY is valid and not expired.',
            );

        case 404: {
            // Distinguish between "carrier not found" (real 404) and the endpoint
            // not yet existing (C11 not shipped). The backend returns a plain-text
            // "Not Found" / empty body when the route doesn't exist, vs. a JSON
            // { error: "Carrier not found" } when the route exists but the carrier is missing.
            // D11: "Carrier not active" has been removed — backend now returns 200 + empty services.
            if (rawError.trim() === '') {
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
            // D12: 422 = business mismatch (service_id valid but does not belong to this carrier).
            throw new Error(
                rawError || 'Validation error — service_id does not belong to the requested carrier.',
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
