/**
 * MCP Resources — Envia API Documentation
 *
 * Exposes API reference information as MCP resources so the agent can
 * look up endpoint details, address structures, and supported carriers
 * without making live API calls.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaConfig } from "../config.js";

export function registerResources(server: McpServer, config: EnviaConfig): void {
    // ---- Quickstart / overview -----------------------------------------------
    server.registerResource(
        "envia-overview",
        "envia://docs/overview",
        {
            description:
                "Overview of Envia APIs and how the MCP tools map to shipping workflows.",
            mimeType: "text/plain",
        },
        async () => ({
            contents: [
                {
                    uri: "envia://docs/overview",
                    mimeType: "text/plain",
                    text: `Envia MCP Server — Overview
============================================================
Environment: ${config.environment}
Shipping API: ${config.shippingBase}
Queries API:  ${config.queriesBase}
Geocodes API: ${config.geocodesBase}

Available tools (10):
  1. envia_validate_address   — Validate postal codes and city names
  2. envia_list_carriers      — List carriers and services for a country
  3. quote_shipment           — Compare rates across carriers
  4. envia_create_label       — Purchase a label (charges balance)
  5. envia_track_package      — Track one or more shipments
  6. envia_cancel_shipment    — Void a label and reclaim balance
  7. envia_schedule_pickup    — Schedule carrier pickup
  8. envia_get_shipment_history — List shipments by month
  9. envia_classify_hscode    — Classify product HS code for customs
 10. envia_create_commercial_invoice — Generate customs invoice PDF

Typical domestic workflow:
  validate_address → list_carriers → get_shipping_rates → create_label → track_package

Typical international workflow:
  validate_address → classify_hscode → get_shipping_rates → create_commercial_invoice → create_label → track_package

High-volume / warehouse workflow:
  (loop) create_label → schedule_pickup → track_package

Full docs: https://docs.envia.com
`,
                },
            ],
        }),
    );

    // ---- Address structure ---------------------------------------------------
    server.registerResource(
        "envia-address-format",
        "envia://docs/address-format",
        {
            description:
                "Required and optional address fields for Envia API requests.",
            mimeType: "text/plain",
        },
        async () => ({
            contents: [
                {
                    uri: "envia://docs/address-format",
                    mimeType: "text/plain",
                    text: `Envia Address Format
============================================================
Required fields:
  name        — Full name (string)
  phone       — Phone number with country code (string)
  street      — Street address including number (string)
  city        — City name (string)
  state       — State or province code (string, e.g. "NL", "CA")
  country     — ISO 3166-1 alpha-2 code (string, e.g. "MX", "US")
  postalCode  — Postal / ZIP code (string)

Optional fields:
  company     — Company name (string)
  email       — Email address (string)
  reference   — Address reference / landmark (string)
  district    — District / neighbourhood (string)

Tips:
  • Use envia_validate_address to verify postal codes before shipping
  • State codes vary by country (MX uses 2-letter codes like "NL", "CDMX")
  • Phone numbers should include country code (e.g. "+52 8180001234")
`,
                },
            ],
        }),
    );
}
