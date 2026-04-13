/**
 * Additional Service — Service Layer
 *
 * Fetches the catalog of optional additional services available for a
 * given country, international flag, and shipment type from the Envia
 * Queries API.
 *
 * Endpoint: GET /additional-services/{country_code}/{international}/{shipment_type}
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

/** A single additional service child inside a category. */
interface RawAdditionalServiceChild {
    id: number;
    category_id: number;
    name: string;
    description: string;
    label: string;
    tooltip_amount: number | null;
    tooltip: string | null;
    json_structure: string | null;
    front_order_index: number | null;
}

/** A category grouping from the API response. */
interface RawAdditionalServiceCategory {
    name: string;
    description: string;
    label: string;
    child_type: string;
    childs: RawAdditionalServiceChild[];
}

/** Top-level response from the additional-services endpoint. */
interface RawAdditionalServicesResponse {
    data: RawAdditionalServiceCategory[];
}

// ---------------------------------------------------------------------------
// Normalized output
// ---------------------------------------------------------------------------

/** Flattened additional service with category context. */
export interface AdditionalServiceInfo {
    /** Unique catalog ID. */
    id: number;
    /** Internal service name used in payloads (e.g. "cash_on_delivery"). */
    name: string;
    /** Human-readable description. */
    description: string;
    /** Parent category name (e.g. "insurance", "delivery_options"). */
    category: string;
    /** Whether the service requires a `data.amount` field. */
    requiresAmount: boolean;
}

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

/**
 * Fetch available additional services for a shipment route.
 *
 * The Queries API groups services by category. This function flattens the
 * response into a simple array and determines whether each service
 * requires an `amount` in its `data` field (parsed from `json_structure`).
 *
 * @param countryCode      - ISO 3166-1 alpha-2 origin country code
 * @param international    - Whether the shipment crosses borders
 * @param shipmentType     - Shipment type ID (1 = parcel, 2 = LTL)
 * @param client           - Envia API client
 * @param config           - Server configuration
 * @param destinationCountry - Optional destination country (international only)
 * @returns Flat array of available services with metadata
 */
export async function fetchAvailableAdditionalServices(
    countryCode: string,
    international: boolean,
    shipmentType: number,
    client: EnviaApiClient,
    config: EnviaConfig,
    destinationCountry?: string,
): Promise<AdditionalServiceInfo[]> {
    const intl = international ? 1 : 0;
    let url = `${config.queriesBase}/additional-services/${encodeURIComponent(countryCode)}/${intl}/${shipmentType}`;

    if (international && destinationCountry) {
        url += `?destination_country=${encodeURIComponent(destinationCountry)}`;
    }

    const res = await client.get<RawAdditionalServicesResponse>(url);

    if (!res.ok || !Array.isArray(res.data?.data)) {
        return [];
    }

    return flattenCategories(res.data.data);
}

/**
 * Flatten the nested category/childs structure into a simple service list.
 *
 * @param categories - Raw categories from the API
 * @returns Flat array of AdditionalServiceInfo
 */
export function flattenCategories(categories: RawAdditionalServiceCategory[]): AdditionalServiceInfo[] {
    const services: AdditionalServiceInfo[] = [];

    for (const category of categories) {
        if (!Array.isArray(category.childs)) continue;

        for (const child of category.childs) {
            services.push({
                id: child.id,
                name: child.name,
                description: child.description,
                category: category.name,
                requiresAmount: parseRequiresAmount(child.json_structure),
            });
        }
    }

    return services;
}

/**
 * Determine if a service's form schema requires an `amount` field.
 *
 * The `json_structure` column stores a JSON string describing the form
 * fields the frontend renders. If it contains an "amount" field, the
 * service needs `data.amount` in the payload.
 *
 * @param jsonStructure - Raw json_structure string from the DB
 * @returns true when the service expects data.amount
 */
function parseRequiresAmount(jsonStructure: string | null): boolean {
    if (!jsonStructure) return false;

    try {
        const parsed = JSON.parse(jsonStructure);
        if (typeof parsed === 'object' && parsed !== null) {
            return 'amount' in parsed;
        }
    } catch {
        // malformed JSON — treat as no amount required
    }

    return false;
}
