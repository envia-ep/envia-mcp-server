/**
 * Tool: envia_get_shipping_rates
 *
 * Compares shipping rates across one or more carriers for a route.
 * Returns prices sorted cheapest-first with delivery estimates.
 *
 * The Envia API accepts one carrier per request, so this tool fires parallel
 * requests when multiple carriers are provided.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";

interface RateEntry {
  carrier: string;
  service: string;
  serviceDescription?: string;
  deliveryEstimate?: string;
  totalPrice: string;
  currency?: string;
}

export function registerGetShippingRates(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_get_shipping_rates",
    "Get shipping rates from one or more carriers for a given route. " +
      "Returns available services sorted by price (cheapest first). " +
      "Tip: use envia_validate_address first to ensure origin and destination are correct, " +
      "and envia_list_carriers to find valid carrier codes.",
    {
      // Origin
      origin_name: z.string().describe("Sender full name"),
      origin_phone: z.string().describe("Sender phone number"),
      origin_street: z.string().describe("Sender street address"),
      origin_city: z.string().describe("Sender city"),
      origin_state: z.string().describe("Sender state / province code"),
      origin_country: z.string().describe("Sender country (ISO 3166-1 alpha-2, e.g. MX)"),
      origin_postal_code: z.string().describe("Sender postal / ZIP code"),

      // Destination
      destination_name: z.string().describe("Recipient full name"),
      destination_phone: z.string().describe("Recipient phone number"),
      destination_street: z.string().describe("Recipient street address"),
      destination_city: z.string().describe("Recipient city"),
      destination_state: z.string().describe("Recipient state / province code"),
      destination_country: z.string().describe("Recipient country (ISO 3166-1 alpha-2)"),
      destination_postal_code: z.string().describe("Recipient postal / ZIP code"),

      // Package
      package_weight: z.number().positive().describe("Package weight (default unit: KG)"),
      package_length: z.number().positive().describe("Package length in CM"),
      package_width: z.number().positive().describe("Package width in CM"),
      package_height: z.number().positive().describe("Package height in CM"),
      package_content: z.string().default("General merchandise").describe("Description of contents"),
      package_declared_value: z.number().default(0).describe("Declared value for insurance (in origin currency)"),

      // Shipment
      carriers: z
        .string()
        .describe(
          "Comma-separated carrier codes to compare (e.g. 'dhl,fedex,estafeta'). " +
            "Use envia_list_carriers to find available codes.",
        ),
      shipment_type: z
        .number()
        .default(1)
        .describe("Shipment type: 1 = parcel (default), 2 = LTL, 3 = FTL"),
    },
    async (args) => {
      const origin = {
        name: args.origin_name,
        phone: args.origin_phone,
        street: args.origin_street,
        city: args.origin_city,
        state: args.origin_state,
        country: args.origin_country.trim().toUpperCase(),
        postalCode: args.origin_postal_code,
      };

      const destination = {
        name: args.destination_name,
        phone: args.destination_phone,
        street: args.destination_street,
        city: args.destination_city,
        state: args.destination_state,
        country: args.destination_country.trim().toUpperCase(),
        postalCode: args.destination_postal_code,
      };

      const packages = [
        {
          type: "box",
          content: args.package_content,
          amount: 1,
          declaredValue: args.package_declared_value,
          weight: args.package_weight,
          weightUnit: "KG",
          lengthUnit: "CM",
          dimensions: {
            length: args.package_length,
            width: args.package_width,
            height: args.package_height,
          },
        },
      ];

      const carrierList = args.carriers
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);

      if (carrierList.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Provide at least one carrier code (e.g. 'dhl'). Use envia_list_carriers to find available carriers.",
            },
          ],
        };
      }

      // Fire parallel rate requests
      const rateUrl = `${config.shippingBase}/ship/rate/`;
      const promises = carrierList.map((carrier) =>
        client
          .post<{ data: RateEntry[] }>(rateUrl, {
            origin,
            destination,
            packages,
            shipment: { type: args.shipment_type, carrier },
          })
          .then((res) => ({ carrier, res })),
      );

      const settled = await Promise.allSettled(promises);

      // Collect all rates
      const allRates: RateEntry[] = [];
      const errors: string[] = [];

      for (const result of settled) {
        if (result.status === "rejected") {
          errors.push(`Unknown error: ${result.reason}`);
          continue;
        }
        const { carrier, res } = result.value;
        if (!res.ok) {
          errors.push(`${carrier}: ${res.error}`);
          continue;
        }
        if (Array.isArray(res.data?.data)) {
          allRates.push(...res.data.data);
        }
      }

      if (allRates.length === 0) {
        const msg = errors.length
          ? `No rates found. Errors:\n${errors.map((e) => `  • ${e}`).join("\n")}`
          : "No rates returned for the given route and carriers.";
        return { content: [{ type: "text", text: msg }] };
      }

      // Sort by price
      allRates.sort(
        (a, b) => parseFloat(a.totalPrice || "0") - parseFloat(b.totalPrice || "0"),
      );

      // Format output
      const lines: string[] = [
        `Found ${allRates.length} rate(s) — sorted cheapest first:`,
        "",
      ];

      for (const r of allRates) {
        const price = `$${r.totalPrice} ${r.currency ?? "MXN"}`;
        const delivery = r.deliveryEstimate ? ` | ${r.deliveryEstimate}` : "";
        const desc = r.serviceDescription ? ` (${r.serviceDescription})` : "";
        lines.push(`• ${r.carrier} / ${r.service}${desc}: ${price}${delivery}`);
      }

      if (errors.length) {
        lines.push("", "Carrier errors:", ...errors.map((e) => `  ⚠ ${e}`));
      }

      lines.push(
        "",
        "Next step: use envia_create_label with the chosen carrier and service to purchase the label.",
      );

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
