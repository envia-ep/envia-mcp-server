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

Available tools (11):
  1. envia_validate_address   — Validate postal codes and city names
  2. envia_list_carriers      — List carriers and services for a country
  3. quote_shipment           — Compare rates across carriers
  4. envia_create_label       — Purchase a label (charges balance). Dual-mode:
                                 manual (addresses + carrier) or ecommerce
                                 (order_identifier for one-step label creation).
                                 Auto-resolves city/state from postal codes and
                                 fetches print settings from carrier.
  5. envia_track_package      — Track one or more shipments
  6. envia_cancel_shipment    — Void a label and reclaim balance
  7. envia_schedule_pickup    — Schedule carrier pickup
  8. envia_get_shipment_history — List shipments by month
  9. envia_classify_hscode    — Classify product HS code for customs
 10. envia_create_commercial_invoice — Generate customs invoice PDF
 11. envia_get_ecommerce_order — Fetch ecommerce order and build shipment payloads

Typical domestic workflow:
  validate_address → list_carriers → quote_shipment → envia_create_label → track_package

Typical international workflow:
  validate_address → classify_hscode → quote_shipment → envia_create_commercial_invoice → envia_create_label → track_package

Ecommerce order workflow (one-step):
  envia_create_label (order_identifier) → track_package

Ecommerce order workflow (with rate comparison):
  envia_get_ecommerce_order → quote_shipment → envia_create_label (order_identifier + carrier override) → track_package

High-volume / warehouse workflow:
  (loop) envia_create_label → schedule_pickup → track_package

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

Generate Address (for POST /ship/generate — label creation):
Required fields:
  name            — Full name (string)
  street          — Street address (string)
  city            — City name (string)
  state           — State or province code (string, e.g. "NL", "CA")
  country         — ISO 3166-1 alpha-2 code (string, e.g. "MX", "US")
  postalCode      — Postal / ZIP code (string)
Optional fields:
  phone           — Phone number with country code (string)
  number          — Exterior house/building number (string)
  district        — Neighborhood / colonia (string)
  interior_number — Interior number / suite (string)
  company         — Company name (string)
  email           — Email address (string)
  reference       — Address reference / landmark (string)
  identificationNumber — Tax/national ID (RFC, CNPJ, NIT, etc.)

Rate Address (for POST /ship/rate — quoting):
Required fields:
  street          — Placeholder (auto-filled as "Calle 1 #100")
  country         — ISO 3166-1 alpha-2 code
Optional fields:
  city, state, postalCode — Geographic resolution fields

Types are defined in src/types/carriers-api.ts (GenerateAddress, RateAddress).
Builders are in src/builders/address.ts.

Tips:
  • Use envia_validate_address to verify postal codes before shipping
  • State codes vary by country (MX uses 2-letter codes like "NL", "CDMX")
  • Phone numbers should include country code (e.g. "+52 8180001234")
  • For quoting, only postal code + country are needed — city/state auto-resolve
`,
                },
            ],
        }),
    );
}
