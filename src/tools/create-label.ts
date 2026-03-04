/**
 * Tool: envia_create_label
 *
 * Purchases a shipping label from a carrier. Returns the tracking number
 * and a PDF label URL.
 *
 * The caller should have already used envia_get_shipping_rates to choose
 * a carrier + service, and envia_validate_address to verify the addresses.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";

interface LabelData {
  carrier: string;
  service: string;
  shipmentId?: number;
  trackingNumber: string;
  trackingNumbers?: string[];
  trackUrl?: string;
  label: string;
  totalPrice?: number;
  currency?: string;
}

export function registerCreateLabel(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_create_label",
    "Purchase a shipping label. This charges your Envia account balance. " +
      "Before calling this, use envia_get_shipping_rates to pick a carrier and service, " +
      "and envia_validate_address to verify addresses. " +
      "Returns: tracking number, label PDF URL, and tracking URL.",
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
      package_weight: z.number().positive().describe("Package weight in KG"),
      package_length: z.number().positive().describe("Package length in CM"),
      package_width: z.number().positive().describe("Package width in CM"),
      package_height: z.number().positive().describe("Package height in CM"),
      package_content: z.string().default("General merchandise").describe("Description of contents"),
      package_declared_value: z.number().default(0).describe("Declared value for insurance"),

      // Shipment
      carrier: z.string().describe("Carrier code from envia_get_shipping_rates (e.g. 'dhl')"),
      service: z.string().describe("Service code from envia_get_shipping_rates (e.g. 'express')"),
      shipment_type: z.number().default(1).describe("1 = parcel (default), 2 = LTL, 3 = FTL"),
    },
    async (args) => {
      const body = {
        origin: {
          name: args.origin_name,
          phone: args.origin_phone,
          street: args.origin_street,
          city: args.origin_city,
          state: args.origin_state,
          country: args.origin_country.trim().toUpperCase(),
          postalCode: args.origin_postal_code,
        },
        destination: {
          name: args.destination_name,
          phone: args.destination_phone,
          street: args.destination_street,
          city: args.destination_city,
          state: args.destination_state,
          country: args.destination_country.trim().toUpperCase(),
          postalCode: args.destination_postal_code,
        },
        packages: [
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
        ],
        shipment: {
          type: args.shipment_type,
          carrier: args.carrier.trim().toLowerCase(),
          service: args.service.trim(),
        },
      };

      const url = `${config.shippingBase}/ship/generate/`;
      const res = await client.post<{ data: LabelData[] }>(url, body);

      if (!res.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Label creation failed: ${res.error}\n\nTip: Verify addresses with envia_validate_address, or check your Envia account balance.`,
            },
          ],
        };
      }

      const shipment = res.data?.data?.[0];
      if (!shipment?.trackingNumber) {
        return {
          content: [
            {
              type: "text",
              text: "Label creation returned an unexpected response. No tracking number found.",
            },
          ],
        };
      }

      const lines: string[] = [
        "Label created successfully!",
        "",
        `  Carrier:          ${shipment.carrier}`,
        `  Service:          ${shipment.service}`,
        `  Tracking number:  ${shipment.trackingNumber}`,
      ];

      if (shipment.trackingNumbers && shipment.trackingNumbers.length > 1) {
        lines.push(`  All tracking #s:  ${shipment.trackingNumbers.join(", ")}`);
      }

      if (shipment.label) {
        lines.push(`  Label PDF:        ${shipment.label}`);
      }
      if (shipment.trackUrl) {
        lines.push(`  Tracking page:    ${shipment.trackUrl}`);
      }
      if (shipment.totalPrice) {
        lines.push(`  Price charged:    $${shipment.totalPrice} ${shipment.currency ?? "MXN"}`);
      }

      lines.push(
        "",
        "Next steps:",
        "  • Download and print the label PDF",
        "  • Use envia_track_package to monitor delivery status",
        "  • Use envia_schedule_pickup if you need carrier pickup",
      );

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
