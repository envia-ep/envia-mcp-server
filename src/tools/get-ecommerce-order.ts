/**
 * Tool: envia_get_ecommerce_order
 *
 * Fetches an ecommerce order by its platform identifier and transforms it
 * into ready-to-use payloads for quoting (POST /ship/rate) and label
 * generation (POST /ship/generate).
 *
 * The tool replicates the order-to-payload transformation performed by
 * the envia-clients frontend (Scan & Go workflow) so that an AI assistant
 * can look up any order and immediately proceed to rate shopping or label
 * creation using the existing quote_shipment / envia_create_label tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { textResponse } from '../utils/mcp-response.js';
import { EcommerceOrderService } from '../services/ecommerce-order.js';
import type { TransformedOrder, TransformedLocation } from '../types/ecommerce-order.js';

/** Supported payload output modes. */
const PAYLOAD_TYPES = ['quote', 'generate', 'both'] as const;

// ---------------------------------------------------------------------------
// Tool-specific formatting
// ---------------------------------------------------------------------------

/**
 * Format a transformed order into human-readable text for the MCP response.
 *
 * @param transformed - Complete transformation result
 * @param payloadType - Which payload sections to include
 * @returns Formatted text output
 */
function formatOutput(
    transformed: TransformedOrder,
    payloadType: (typeof PAYLOAD_TYPES)[number],
): string {
    const { summary, locations } = transformed;
    const lines: string[] = [];

    lines.push('Order found successfully!');
    lines.push('');
    lines.push('=== Order Summary ===');
    lines.push(`  Identifier:  ${summary.orderIdentifier}`);
    lines.push(`  Name:        ${summary.orderName}`);
    lines.push(`  Number:      ${summary.orderNumber}`);
    lines.push(`  Shop:        ${summary.shopName}`);
    lines.push(`  Platform:    ${summary.ecommercePlatform}`);
    lines.push(`  Currency:    ${summary.currency}`);
    lines.push(`  Payment:     ${summary.statusPayment}`);
    lines.push(`  Locations:   ${locations.length}`);

    if (summary.fulfillmentWarnings.length > 0) {
        lines.push('');
        lines.push('--- Fulfillment Warnings ---');
        for (const warning of summary.fulfillmentWarnings) {
            lines.push(`  ⚠ ${warning}`);
        }
    }

    for (const loc of locations) {
        lines.push('');
        lines.push(`=== Location ${loc.locationIndex + 1}: ${loc.originLabel} ===`);

        if (loc.carrier) {
            lines.push(`  Carrier:     ${loc.carrier.carrier} / ${loc.carrier.service}`);
        } else {
            lines.push('  Carrier:     Not selected');
        }

        lines.push(`  Packages:    ${loc.quotePayload.packages.length}`);

        if (loc.warnings.length > 0) {
            for (const warning of loc.warnings) {
                lines.push(`  ⚠ ${warning}`);
            }
        }

        if (payloadType === 'quote' || payloadType === 'both') {
            lines.push('');
            lines.push(...formatQuotePayload(loc));
        }

        if (payloadType === 'generate' || payloadType === 'both') {
            lines.push('');
            lines.push(...formatGeneratePayload(loc));
        }
    }

    lines.push('');
    lines.push(...formatNextSteps(transformed, payloadType));

    return lines.join('\n');
}

/**
 * Format the quote payload section for a location.
 *
 * @param loc - Transformed location
 * @returns Lines of formatted text
 */
function formatQuotePayload(loc: TransformedLocation): string[] {
    const lines: string[] = [];
    const q = loc.quotePayload;

    lines.push('--- Quote Payload (for quote_shipment) ---');
    lines.push(`  Origin:      ${q.origin.postalCode}, ${q.origin.city}, ${q.origin.state}, ${q.origin.country}`);
    lines.push(`  Destination: ${q.destination.postalCode}, ${q.destination.city}, ${q.destination.state}, ${q.destination.country}`);

    for (let i = 0; i < q.packages.length; i++) {
        const pkg = q.packages[i];
        lines.push(`  Package ${i + 1}: ${pkg.weight}${pkg.weightUnit} — ${pkg.dimensions.length}x${pkg.dimensions.width}x${pkg.dimensions.height}${pkg.lengthUnit} — "${pkg.content}"`);
    }

    if (loc.carrier) {
        lines.push(`  Pre-selected: ${loc.carrier.carrier} / ${loc.carrier.service} — you can skip quoting and go directly to label creation.`);
    }

    return lines;
}

/**
 * Format the generation payload section for a location.
 *
 * @param loc - Transformed location
 * @returns Lines of formatted text
 */
function formatGeneratePayload(loc: TransformedLocation): string[] {
    const lines: string[] = [];

    if (!loc.generatePayload) {
        lines.push('--- Generate Payload (for envia_create_label) ---');
        lines.push('  Not available — no carrier pre-selected. Use quote_shipment first to choose a carrier and service.');
        return lines;
    }

    const g = loc.generatePayload;

    lines.push('--- Generate Payload (for envia_create_label) ---');
    lines.push(`  Origin name:    ${g.origin.name}`);
    lines.push(`  Origin address: ${g.origin.street}, ${g.origin.city}, ${g.origin.state} ${g.origin.postalCode}, ${g.origin.country}`);
    lines.push(`  Origin phone:   ${g.origin.phone}`);
    lines.push(`  Dest name:      ${g.destination.name}`);
    lines.push(`  Dest address:   ${g.destination.street}, ${g.destination.city}, ${g.destination.state} ${g.destination.postalCode}, ${g.destination.country}`);
    lines.push(`  Dest phone:     ${g.destination.phone}`);
    lines.push(`  Carrier:        ${g.shipment.carrier} / ${g.shipment.service}`);
    lines.push(`  Currency:       ${g.settings.currency}`);

    for (let i = 0; i < g.packages.length; i++) {
        const pkg = g.packages[i];
        lines.push(`  Package ${i + 1}: ${pkg.weight}${pkg.weightUnit} — ${pkg.dimensions.length}x${pkg.dimensions.width}x${pkg.dimensions.height}${pkg.lengthUnit} — declared $${pkg.declaredValue}`);
    }

    return lines;
}

/**
 * Generate contextual next-step guidance based on the order state.
 *
 * @param transformed - Complete transformation result
 * @param payloadType - Which payload type was requested
 * @returns Lines of formatted guidance
 */
function formatNextSteps(
    transformed: TransformedOrder,
    payloadType: (typeof PAYLOAD_TYPES)[number],
): string[] {
    const lines: string[] = ['Next steps:'];

    const hasCarrier = transformed.locations.some((loc) => loc.carrier !== null);
    const hasPackages = transformed.locations.some((loc) => loc.quotePayload.packages.length > 0);
    const allFulfilled = !hasPackages && transformed.locations.length > 0;

    if (allFulfilled) {
        lines.push('  • All packages are already fulfilled. Use envia_track_package to check delivery status.');
        return lines;
    }

    if (!hasCarrier) {
        lines.push('  • No carrier pre-selected. Use quote_shipment with the origin/destination postal codes and package weight to compare rates.');
        lines.push('  • Once you choose a carrier and service, use envia_create_label with the full address details above.');
    } else if (payloadType === 'quote') {
        lines.push('  • A carrier is already pre-selected. You can proceed directly to envia_create_label.');
        lines.push('  • Or use quote_shipment to compare other carriers first.');
    } else {
        lines.push('  • Use envia_create_label with the carrier, service, and address details shown above to purchase a label.');
        lines.push('  • Or use quote_shipment first to compare other carriers.');
    }

    return lines;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_get_ecommerce_order tool on the given MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerGetEcommerceOrder(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    const orderService = new EcommerceOrderService(client, config);

    server.registerTool(
        'envia_get_ecommerce_order',
        {
            description:
                'Fetch an ecommerce order by its platform identifier and get ready-to-use shipment payloads. ' +
                'Returns order details, origin/destination addresses, package dimensions, and carrier info ' +
                'formatted for use with quote_shipment and envia_create_label. ' +
                'Use this when the user provides an order number from their ecommerce platform (Shopify, Tiendanube, WooCommerce, etc.).',
            inputSchema: z.object({
                order_identifier: z.string().min(1).describe(
                    'The ecommerce platform order identifier (e.g. Shopify order number, Tiendanube ID). ' +
                    'This is the external identifier visible to merchants, not an internal database ID.',
                ),
                payload_type: z.enum(PAYLOAD_TYPES).default('both').describe(
                    'Which payload format to return: "quote" for rate comparison, "generate" for label creation, ' +
                    'or "both" (default) for both formats.',
                ),
            }),
        },
        async ({ order_identifier, payload_type }) => {
            let order;
            try {
                order = await orderService.fetchOrder(order_identifier as string);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                return textResponse(
                    `Failed to fetch order "${order_identifier}": ${message}\n\n` +
                    'Verify the order identifier is correct and that your API key has access to this order.',
                );
            }

            if (!order) {
                return textResponse(
                    `No order found with identifier "${order_identifier}".\n\n` +
                    'Tips:\n' +
                    '  • Check the identifier matches exactly (case-sensitive)\n' +
                    '  • Ensure the order exists in the connected ecommerce platform\n' +
                    '  • Verify your API key has access to the store that owns this order',
                );
            }

            const transformed = orderService.transformOrder(order);
            const output = formatOutput(transformed, payload_type as (typeof PAYLOAD_TYPES)[number]);

            return textResponse(output);
        },
    );
}
