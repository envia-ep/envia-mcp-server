/**
 * Ecommerce Order Service
 *
 * Fetches ecommerce orders from the Queries API (GET /v4/orders) and
 * orchestrates their transformation into payloads compatible with the
 * Envia carriers API for rate quoting and label generation.
 *
 * Construction of domain objects (addresses, packages, ecommerce
 * sections) is delegated to the shared builders in src/builders/.
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { ShipmentPackage } from '../types/carriers-api.js';
import type {
    V4OrdersResponse,
    V4Order,
    V4ShippingAddress,
    V4Location,
    V4Package,
    PayloadCarrier,
    LocationQuotePayload,
    LocationGeneratePayload,
    OrderSummary,
    TransformedLocation,
    TransformedOrder,
} from '../types/ecommerce-order.js';

import {
    buildRateAddressFromLocation,
    buildRateAddressFromShippingAddress,
    buildGenerateAddressFromLocation,
    buildGenerateAddressFromShippingAddress,
} from '../builders/address.js';
import { buildPackagesFromV4 } from '../builders/package.js';
import { buildEcommerceSection } from '../builders/ecommerce.js';

/**
 * Service for fetching and transforming ecommerce orders into
 * Envia Shipping API payloads.
 *
 * Stateless — each method receives all needed context via arguments.
 * The class holds only the API client and config references.
 */
export class EcommerceOrderService {
    private readonly client: EnviaApiClient;
    private readonly config: EnviaConfig;

    /**
     * @param client - Authenticated Envia API client
     * @param config - Server configuration with API base URLs
     */
    constructor(client: EnviaApiClient, config: EnviaConfig) {
        this.client = client;
        this.config = config;
    }

    // -----------------------------------------------------------------------
    // Order fetching
    // -----------------------------------------------------------------------

    /**
     * Fetch an order by its ecommerce platform identifier.
     *
     * Strategy:
     *  1. Query by `order_identifier` — the ecommerce-platform external ID.
     *  2. If nothing is found, fall back to the `search` parameter which
     *     matches across `order_name`, `order_number`, `order_identifier`,
     *     and more — covering the common case where the user provides a
     *     display-facing order name (e.g. "#1062") or order number ("1062")
     *     rather than the raw platform identifier.
     *
     * Both requests include `sort_by` to bypass the V4 endpoint's default
     * 6-month window, ensuring older orders are still discoverable.
     *
     * @param identifier - Order reference (identifier, name, or number)
     * @returns The first matching V4 order, or null if not found
     * @throws Error when the API request fails with a non-404 status
     */
    async fetchOrder(identifier: string): Promise<V4Order | null> {
        const trimmed = identifier.trim();
        const encoded = encodeURIComponent(trimmed);
        const sortParams = 'sort_by=created_at_ecommerce&sort_direction=DESC';

        const identifierUrl =
            `${this.config.queriesBase}/v4/orders?order_identifier=${encoded}&${sortParams}`;
        const order = await this.fetchFirstOrder(identifierUrl);
        if (order) return order;

        const searchUrl =
            `${this.config.queriesBase}/v4/orders?search=${encoded}&${sortParams}`;
        return this.fetchFirstOrder(searchUrl);
    }

    /**
     * Execute a GET request against the V4 orders endpoint and return
     * the first order from the response, or null.
     *
     * @param url - Fully-qualified URL with query parameters
     * @returns First order or null
     * @throws Error when the API returns a non-404 error
     */
    private async fetchFirstOrder(url: string): Promise<V4Order | null> {
        const res = await this.client.get<V4OrdersResponse>(url);

        if (!res.ok) {
            if (res.status === 404) {
                return null;
            }
            throw new Error(res.error ?? `Failed to fetch order: HTTP ${res.status}`);
        }

        const orders = res.data?.orders_info;
        if (!Array.isArray(orders) || orders.length === 0) {
            return null;
        }

        return orders[0];
    }

    // -----------------------------------------------------------------------
    // Order location and carrier resolution
    // -----------------------------------------------------------------------

    /**
     * Find the target location from an order, filtering to unfulfilled packages.
     *
     * Reusable across tools — used by create-label (ecommerce mode) and
     * potentially by envia_quote_shipment when quoting from an order.
     *
     * @param order - V4 order
     * @param locIndex - Zero-based location index
     * @returns The location and its active packages, or an error message
     */
    resolveLocation(
        order: V4Order,
        locIndex: number,
    ): { location: V4Location; activePackages: V4Package[] } | { error: string } {
        const locations = order.shipment_data.locations ?? [];
        if (locations.length === 0) {
            return { error: 'This order has no locations (origin warehouses). Cannot create a label.' };
        }
        if (locIndex < 0 || locIndex >= locations.length) {
            return {
                error: `location_index ${locIndex} is out of bounds. The order has ${locations.length} location(s) (0-${locations.length - 1}).`,
            };
        }

        const location = locations[locIndex];
        const activePackages = (location.packages ?? []).filter(
            (pkg) => !pkg.is_return && !pkg.shipment?.tracking_number,
        );

        if (activePackages.length === 0) {
            return {
                error:
                    'All packages in this location are already fulfilled or are returns. ' +
                    'Use envia_track_package to check delivery status.',
            };
        }

        return { location, activePackages };
    }

    /**
     * Determine the carrier to use for an ecommerce shipment.
     *
     * Prefers explicit overrides from tool params, falls back to the
     * pre-selected carrier from the package-level quote.
     *
     * Reusable across tools — used by create-label (ecommerce mode) and
     * potentially by envia_quote_shipment when quoting from an order.
     *
     * @param activePackages - Unfulfilled packages for the location
     * @param carrierParam - Carrier override from tool input
     * @param serviceParam - Service override from tool input
     * @returns Carrier info or an error message
     */
    resolveCarrier(
        activePackages: V4Package[],
        carrierParam: string | undefined,
        serviceParam: string | undefined,
    ): { carrier: string; service: string; carrierId: number | null } | { error: string } {
        if (carrierParam && serviceParam) {
            return {
                carrier: carrierParam.trim().toLowerCase(),
                service: serviceParam.trim(),
                carrierId: null,
            };
        }

        const extracted = this.extractCarrier(activePackages);
        if (!extracted) {
            return {
                error:
                    'No carrier pre-selected for this order and no carrier/service provided. ' +
                    'Use envia_quote_shipment to compare rates, then pass carrier and service to this tool.',
            };
        }

        return {
            carrier: extracted.carrier.trim().toLowerCase(),
            service: extracted.service.trim(),
            carrierId: extracted.carrierId,
        };
    }

    // -----------------------------------------------------------------------
    // Order transformation
    // -----------------------------------------------------------------------

    /**
     * Transform a V4 order into per-location payloads for quoting and generation.
     *
     * Each location (origin warehouse) produces an independent payload block
     * with its own packages. Multi-location orders yield multiple blocks.
     *
     * @param order - Raw V4 order from the API
     * @returns Transformed order with summary and per-location payloads
     */
    transformOrder(order: V4Order): TransformedOrder {
        const summary = this.buildSummary(order);
        const shippingAddress = order.shipment_data.shipping_address;
        const locations = order.shipment_data.locations ?? [];

        const transformedLocations: TransformedLocation[] = locations.map(
            (location, index) => this.transformLocation(location, index, shippingAddress, order),
        );

        return { summary, locations: transformedLocations };
    }

    /**
     * Build an order summary from the V4 response metadata.
     *
     * @param order - Raw V4 order
     * @returns Summary with identifiers, shop, platform, and fulfillment warnings
     */
    buildSummary(order: V4Order): OrderSummary {
        const warnings: string[] = [];

        const locations = order.shipment_data.locations ?? [];
        const allPackages = locations.flatMap((loc) => loc.packages ?? []);

        const fulfilledCount = allPackages.filter(
            (pkg) => pkg.shipment?.tracking_number,
        ).length;

        if (fulfilledCount === allPackages.length && allPackages.length > 0) {
            warnings.push('Order is fully fulfilled — all packages have tracking numbers.');
        } else if (fulfilledCount > 0) {
            warnings.push(
                `Partially fulfilled: ${fulfilledCount}/${allPackages.length} packages already have tracking numbers.`,
            );
        }

        // Plan V2 §5 — compact flags surfaced to the LLM so it can answer
        // questions like "which orders are still pending?" without fetching
        // extra detail. Derived deterministically from V4 fields.
        // cod_active/cod_value are absent from V4 response (see BACKEND_TEAM_BRIEF C10);
        // use order.order.cod as the authoritative COD indicator.
        const hasCod = order.order.cod > 0;

        return {
            orderId: order.id,
            orderIdentifier: order.order.identifier,
            orderName: order.order.name,
            orderNumber: order.order.number,
            shopName: order.shop.name,
            ecommercePlatform: order.ecommerce.name,
            currency: order.order.currency || 'MXN',
            statusPayment: order.order.status_payment,
            fulfillmentWarnings: warnings,
            fulfillmentStatus: order.fulfillment_status_name,
            hasCod,
            isFraudRisk: (order.order.fraud_risk ?? 0) > 0,
            isPartiallyAvailable: order.order.partial_available === 1,
            orderComment: order.order_comment?.comment ?? null,
        };
    }

    /**
     * Transform a single origin location into quote and generation payloads.
     *
     * @param location - Origin location with packages
     * @param index - Zero-based location index
     * @param shippingAddress - Customer shipping address (destination)
     * @param order - Parent V4 order for ecommerce metadata
     * @returns Transformed location with payloads and warnings
     */
    transformLocation(
        location: V4Location,
        index: number,
        shippingAddress: V4ShippingAddress,
        order: V4Order,
    ): TransformedLocation {
        const warnings: string[] = [];

        const activePackages = (location.packages ?? []).filter(
            (pkg) => !pkg.is_return && !pkg.shipment?.tracking_number,
        );

        if (activePackages.length === 0 && (location.packages ?? []).length > 0) {
            warnings.push('All packages in this location are already fulfilled or are returns.');
        }

        const carrier = this.extractCarrier(activePackages);
        if (!carrier && activePackages.length > 0) {
            warnings.push(
                'No carrier pre-selected for this location. ' +
                'Use envia_quote_shipment to compare rates, then pass carrier and service to envia_create_shipment.',
            );
        }

        const originLabel = [
            location.address_1,
            location.city,
            location.state_code,
        ].filter(Boolean).join(', ');

        const isInternational =
            (location.country_code ?? '').trim().toUpperCase() !==
            (shippingAddress.country_code ?? '').trim().toUpperCase();
        const packages = buildPackagesFromV4(activePackages, isInternational);

        const quotePayload = this.buildQuotePayload(location, shippingAddress, packages, carrier);
        const generatePayload = carrier
            ? this.buildGeneratePayload(location, shippingAddress, packages, carrier, order)
            : null;

        return {
            locationIndex: index,
            originLabel: originLabel || `Location ${index + 1}`,
            carrier,
            quotePayload,
            generatePayload,
            warnings,
        };
    }

    /**
     * Extract carrier information from package-level quotes.
     *
     * Only uses the package `quote` object — order-level `shipping_options`
     * are ignored per the Scan & Go specification.
     *
     * @param packages - Active packages for a location
     * @returns Carrier info from the first package with a valid quote, or null
     */
    extractCarrier(packages: V4Package[]): PayloadCarrier | null {
        for (const pkg of packages) {
            const quote = pkg.quote;
            if (quote?.carrier_id && quote?.service_id && quote?.carrier_name && quote?.service_name) {
                return {
                    carrier: quote.carrier_name,
                    service: quote.service_name,
                    carrierId: quote.carrier_id,
                    serviceId: quote.service_id,
                };
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Payload assembly (delegates to builders)
    // -----------------------------------------------------------------------

    /**
     * Build a rate quoting payload for a single location.
     *
     * @param location - Origin location
     * @param shippingAddress - Customer shipping address
     * @param packages - Transformed package payloads
     * @param carrier - Pre-selected carrier (if available)
     * @returns Quote payload ready for POST /ship/rate
     */
    buildQuotePayload(
        location: V4Location,
        shippingAddress: V4ShippingAddress,
        packages: ShipmentPackage[],
        carrier: PayloadCarrier | null,
    ): LocationQuotePayload {
        const payload: LocationQuotePayload = {
            origin: buildRateAddressFromLocation(location),
            destination: buildRateAddressFromShippingAddress(shippingAddress),
            packages,
        };

        if (carrier) {
            payload.carrier = carrier;
        }

        return payload;
    }

    /**
     * Build a label generation payload for a single location.
     *
     * Requires a pre-selected carrier — returns null if no carrier is available.
     *
     * @param location - Origin location
     * @param shippingAddress - Customer shipping address
     * @param packages - Transformed package payloads
     * @param carrier - Pre-selected carrier from package quote
     * @param order - Parent V4 order for ecommerce metadata
     * @returns Generation payload ready for POST /ship/generate
     */
    buildGeneratePayload(
        location: V4Location,
        shippingAddress: V4ShippingAddress,
        packages: ShipmentPackage[],
        carrier: PayloadCarrier,
        order: V4Order,
    ): LocationGeneratePayload {
        return {
            origin: buildGenerateAddressFromLocation(location),
            destination: buildGenerateAddressFromShippingAddress(shippingAddress),
            packages,
            shipment: {
                carrier: carrier.carrier,
                service: carrier.service,
                type: 1,
                orderReference: order.order.number,
            },
            settings: {
                currency: order.order.currency || 'MXN',
            },
            ecommerce: buildEcommerceSection(order),
        };
    }
}
