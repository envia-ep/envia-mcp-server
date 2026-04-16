/**
 * Tool: envia_list_carriers
 *
 * Lists available carriers (and optionally their services) for a given country
 * and shipment type (domestic or international).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { countrySchema, requiredApiKeySchema } from '../utils/schemas.js';
import { mapCarrierError } from '../utils/error-mapper.js';

interface CarrierEntry {
    /** Carrier code used in API calls (e.g. "dhl", "fedex"). */
    name: string;
    /** Human-readable carrier name (e.g. "DHL", "FedEx"). */
    description?: string;
    country_code?: string;
    logo?: string;
}

interface ServiceEntry {
    /** Service code used in API calls (e.g. "ground", "express"). */
    name: string;
    /** Human-readable service name. */
    description?: string;
    /** Estimated delivery time as a string (e.g. "2-4 días"). */
    delivery_estimate?: string;
}

export function registerListCarriers(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        "envia_list_carriers",
        {
            description:
                "List available shipping carriers for a country. Optionally include their services. " +
                "Use this to find which carrier and service codes to pass to quote_shipment or create_shipment.",
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                country: countrySchema.describe("ISO 3166-1 alpha-2 country code (e.g. MX, US, CO)"),
                international: z
                    .boolean()
                    .default(false)
                    .describe("Set to true for international shipments, false (default) for domestic."),
                include_services: z
                    .boolean()
                    .default(false)
                    .describe("Set to true to also list available services per carrier."),
            }),
        },
        async (args) => {
            const { country, international, include_services } = args;
            const activeClient = resolveClient(client, args.api_key, config);
            const countryCode = country.trim().toUpperCase();
            const intl = international ? 1 : 0;

            const carriersUrl = `${config.queriesBase}/available-carrier/${encodeURIComponent(countryCode)}/${intl}`;
            const carriersRes = await activeClient.get<{ data: CarrierEntry[] }>(carriersUrl);

            if (!carriersRes.ok) {
                const mapped = mapCarrierError(carriersRes.status, carriersRes.error ?? '');
                return {
                    content: [{ type: "text", text: `Failed to list carriers: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}` }],
                };
            }

            const carriers: CarrierEntry[] = Array.isArray(carriersRes.data?.data)
                ? carriersRes.data.data
                : [];

            if (carriers.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No carriers found for ${countryCode} (${international ? "international" : "domestic"}). Verify the country code is correct.`,
                        },
                    ],
                };
            }

            // Build output
            const lines: string[] = [
                `Available carriers for ${countryCode} (${international ? "international" : "domestic"}):`,
                "",
            ];

            for (const c of carriers) {
                lines.push(`• ${c.name}${c.description ? ` — ${c.description}` : ""}`);

                if (include_services) {
                    // URL-encode carrier slug from API response (defense-in-depth)
                    const svcUrl = `${config.queriesBase}/service/${encodeURIComponent(c.name)}`;
                    const svcRes = await activeClient.get<{ data: ServiceEntry[] }>(svcUrl);

                    if (svcRes.ok && Array.isArray(svcRes.data?.data)) {
                        for (const s of svcRes.data.data) {
                            const estimate = s.delivery_estimate ? ` (${s.delivery_estimate})` : "";
                            lines.push(`    - ${s.name}${s.description ? `: ${s.description}` : ""}${estimate}`);
                        }
                    }
                }
            }

            return {
                content: [{ type: "text", text: lines.join("\n") }],
            };
        },
    );
}
