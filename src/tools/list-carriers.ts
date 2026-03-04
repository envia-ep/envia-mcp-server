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

interface CarrierEntry {
  carrier: string;
  name?: string;
}

interface ServiceEntry {
  service: string;
  description?: string;
  deliveryDays?: number;
}

export function registerListCarriers(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_list_carriers",
    "List available shipping carriers for a country. Optionally include their services. " +
      "Use this to find which carrier and service codes to pass to envia_get_shipping_rates or envia_create_label.",
    {
      country: z.string().describe("ISO 3166-1 alpha-2 country code (e.g. MX, US, CO)"),
      international: z
        .boolean()
        .default(false)
        .describe("Set to true for international shipments, false (default) for domestic."),
      include_services: z
        .boolean()
        .default(false)
        .describe("Set to true to also list available services per carrier."),
    },
    async ({ country, international, include_services }) => {
      const countryCode = country.trim().toUpperCase();
      const intl = international ? 1 : 0;

      const carriersUrl = `${config.queriesBase}/available-carrier/${countryCode}/${intl}`;
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
        lines.push(`• ${c.carrier}${c.name ? ` — ${c.name}` : ""}`);

        if (include_services) {
          const svcUrl = `${config.queriesBase}/service/${c.carrier}`;
          const svcRes = await client.get<{ data: ServiceEntry[] }>(svcUrl);

          if (svcRes.ok && Array.isArray(svcRes.data?.data)) {
            for (const s of svcRes.data.data) {
              const days = s.deliveryDays ? ` (${s.deliveryDays} days)` : "";
              lines.push(`    - ${s.service}${s.description ? `: ${s.description}` : ""}${days}`);
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
