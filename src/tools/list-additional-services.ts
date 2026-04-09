/**
 * Tool: list_additional_services
 *
 * Lists the optional additional services available for a shipment route
 * (insurance types, cash on delivery, signatures, etc.). Call this before
 * quoting or creating a shipment to know which services can be requested.
 *
 * Queries API endpoint:
 *   GET /additional-services/{country_code}/{international}/{shipment_type}
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { countrySchema } from '../utils/schemas.js';
import { textResponse } from '../utils/mcp-response.js';
import { fetchAvailableAdditionalServices, type AdditionalServiceInfo } from '../services/additional-service.js';

/**
 * Register the list_additional_services tool on the given MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerListAdditionalServices(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'list_additional_services',
        {
            description:
                'List optional additional services available for a shipment route. ' +
                'Use this before quoting or creating a shipment to discover which services ' +
                '(insurance, cash on delivery, signatures, etc.) can be requested. ' +
                'Results depend on the origin country, whether the shipment is international, ' +
                'and the shipment type.',
            inputSchema: z.object({
                origin_country: countrySchema.describe(
                    'Origin country (ISO 3166-1 alpha-2, e.g. MX, CO, BR). Required.',
                ),
                destination_country: countrySchema.optional().describe(
                    'Destination country (ISO 3166-1 alpha-2). ' +
                    'Required for international shipments to get accurate service availability.',
                ),
                shipment_type: z.number().int().min(1).default(1).describe(
                    'Shipment type: 1 = parcel (default), 2 = LTL.',
                ),
            }),
        },
        async (args) => {
            const originCountry = args.origin_country.toUpperCase();
            const destinationCountry = args.destination_country?.toUpperCase();
            const international = !!destinationCountry && destinationCountry !== originCountry;

            const services = await fetchAvailableAdditionalServices(
                originCountry,
                international,
                args.shipment_type,
                client,
                config,
                international ? destinationCountry : undefined,
            );

            if (services.length === 0) {
                return textResponse(
                    `No additional services found for ${originCountry}` +
                    (international ? ` → ${destinationCountry}` : '') +
                    ` (shipment type ${args.shipment_type}).`,
                );
            }

            return textResponse(formatServiceList(services, originCountry, destinationCountry));
        },
    );
}

/**
 * Format the service list into a human-readable grouped output.
 *
 * @param services           - Flat list of available services
 * @param originCountry      - Origin country code for the header
 * @param destinationCountry - Destination country code (if international)
 * @returns Formatted multi-line string
 */
function formatServiceList(
    services: AdditionalServiceInfo[],
    originCountry: string,
    destinationCountry?: string,
): string {
    const route = destinationCountry && destinationCountry !== originCountry
        ? `${originCountry} → ${destinationCountry}`
        : originCountry;

    const lines: string[] = [
        `Available additional services for ${route}:`,
        '',
    ];

    const grouped = new Map<string, AdditionalServiceInfo[]>();
    for (const svc of services) {
        const existing = grouped.get(svc.category) ?? [];
        existing.push(svc);
        grouped.set(svc.category, existing);
    }

    for (const [category, categoryServices] of grouped) {
        lines.push(`[${category}]`);
        for (const svc of categoryServices) {
            const amountHint = svc.requiresAmount ? ' (requires amount)' : '';
            lines.push(`  • ${svc.name}: ${svc.description}${amountHint}`);
        }
        lines.push('');
    }

    lines.push(
        'Usage: pass these service names in the additional_services parameter of quote_shipment or create_shipment.',
        'Example: additional_services: [{ "service": "cash_on_delivery", "amount": 500 }]',
        '',
        'Insurance rules:',
        '  - Only one insurance type at a time: envia_insurance, insurance, or high_value_protection.',
        '  - For CO and BR, "insurance" is the carrier-native option (mandatory when declared_value > 0).',
    );

    return lines.join('\n');
}
