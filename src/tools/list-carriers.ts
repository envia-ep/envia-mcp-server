/**
 * Tool: envia_list_carriers
 *
 * Lists available carriers (and optionally their services) for a given country
 * and shipment type (domestic or international).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";
import { countrySchema } from "../utils/schemas.js";

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
        async ({ country, international, include_services }) => {
            const countryCode = country.trim().toUpperCase();
            const intl = international ? 1 : 0;

            const carriersUrl = `${config.queriesBase}/available-carrier/${encodeURIComponent(countryCode)}/${intl}`;
            const carriersRes = await client.get<{ data: CarrierEntry[] }>(carriersUrl);

            if (!carriersRes.ok) {
                return {
                    content: [{ type: "text", text: `Failed to list carriers: ${carriersRes.error}` }],
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
                    const svcRes = await client.get<{ data: ServiceEntry[] }>(svcUrl);

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
