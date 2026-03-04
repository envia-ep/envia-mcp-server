/**
 * Tool: envia_get_shipment_history
 *
 * Retrieves all shipments created in a given month and year.
 * Useful for auditing, reconciliation, and reporting.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";

interface ShipmentEntry {
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  createdAt?: string;
  originCity?: string;
  destinationCity?: string;
}

export function registerGetShipmentHistory(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_get_shipment_history",
    "List all shipments created in a given month. " +
      "Returns tracking numbers, carriers, statuses, and route summaries. " +
      "Useful for reports and reconciliation.",
    {
      month: z
        .number()
        .int()
        .min(1)
        .max(12)
        .describe("Month number (1–12)"),
      year: z
        .number()
        .int()
        .min(2020)
        .describe("Four-digit year (e.g. 2026)"),
    },
    async ({ month, year }) => {
      const mm = String(month).padStart(2, "0");
      const url = `${config.queriesBase}/guide/${mm}/${year}`;
      const res = await client.get<{ data: ShipmentEntry[] }>(url);

      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Failed to retrieve shipment history: ${res.error}` }],
        };
      }

      const shipments = Array.isArray(res.data?.data) ? res.data.data : [];

      if (shipments.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No shipments found for ${mm}/${year}. Verify the month/year or check your Envia account.`,
            },
          ],
        };
      }

      const lines: string[] = [
        `Shipment history for ${mm}/${year}: ${shipments.length} shipment(s)`,
        "",
      ];

      for (const s of shipments.slice(0, 50)) {
        const route =
          s.originCity && s.destinationCity
            ? `${s.originCity} → ${s.destinationCity}`
            : "";
        lines.push(
          `• ${s.trackingNumber ?? "—"} | ${s.carrier ?? "—"} | ${s.status ?? "—"}${route ? ` | ${route}` : ""}`,
        );
      }

      if (shipments.length > 50) {
        lines.push(`\n... and ${shipments.length - 50} more shipments.`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
