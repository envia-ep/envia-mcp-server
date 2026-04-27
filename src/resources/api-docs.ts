/**
 * MCP Resources — Envia API Documentation
 *
 * Exposes API reference information as MCP resources so the agent can
 * look up endpoint details, address structures, and supported carriers
 * without making live API calls.
 *
 * Keep the tool inventory below in sync with the registered tools in
 * `src/index.ts` (the source of truth). The list is grouped by domain
 * to stay readable for an agent consuming it as context.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaConfig } from '../config.js';

export function registerResources(server: McpServer, config: EnviaConfig): void {
    // ---- Quickstart / overview -----------------------------------------------
    server.registerResource(
        'envia-overview',
        'envia://docs/overview',
        {
            description:
                'Overview of Envia APIs and how the MCP tools map to shipping workflows.',
            mimeType: 'text/plain',
        },
        async () => ({
            contents: [
                {
                    uri: 'envia://docs/overview',
                    mimeType: 'text/plain',
                    text: `Envia MCP Server — Overview
============================================================
Environment: ${config.environment}
Shipping API: ${config.shippingBase}
Queries API:  ${config.queriesBase}
Geocodes API: ${config.geocodesBase}

Deployment model (v1): portal-embedded. The MCP is intended to run inside
the Envia portal's authenticated session. The HTTP transport is for
server-to-server calls from the portal backend; the stdio transport is
the standard path for IDE integrations.

Available tools (72) — grouped by domain:

Core shipping (7)
  - envia_quote_shipment
  - envia_create_label
  - envia_validate_address
  - envia_list_carriers
  - envia_list_additional_services
  - envia_classify_hscode
  - envia_create_commercial_invoice

Shipments — read (8)
  - envia_list_shipments
  - envia_get_shipment_detail
  - envia_get_shipments_status
  - envia_get_shipments_cod
  - envia_get_cod_counters
  - envia_get_shipments_surcharges
  - envia_get_shipments_ndr
  - envia_get_shipment_invoices

Tracking, cancel & pickup (6)
  - envia_track_package
  - envia_get_shipment_history
  - envia_cancel_shipment
  - envia_schedule_pickup
  - envia_track_pickup
  - envia_cancel_pickup

Tickets (7)
  - envia_list_tickets
  - envia_get_ticket_detail
  - envia_get_ticket_comments
  - envia_create_ticket
  - envia_add_ticket_comment
  - envia_rate_ticket
  - envia_get_ticket_types

Ecommerce orders (12)
  - envia_list_orders
  - envia_get_orders_count
  - envia_list_shops
  - envia_get_ecommerce_order
  - envia_update_order_address
  - envia_update_order_packages
  - envia_select_order_service
  - envia_fulfill_order
  - envia_get_order_filter_options
  - envia_manage_order_tags
  - envia_generate_packing_slip
  - envia_generate_picking_list

Orders analytics (1)
  - envia_get_orders_analytics

Addresses / packages / clients (15)
  - envia_list_addresses, envia_create_address, envia_update_address,
    envia_delete_address, envia_set_default_address, envia_get_default_address
  - envia_list_packages, envia_create_package, envia_delete_package
  - envia_list_clients, envia_get_client_detail, envia_create_client,
    envia_update_client, envia_delete_client, envia_get_clients_summary

Company / settings (read-only) (7)
  - envia_list_company_users
  - envia_list_company_shops
  - envia_get_carrier_config
  - envia_get_notification_settings
  - envia_list_api_tokens
  - envia_list_webhooks
  - envia_get_company_info

Analytics (5)
  - envia_get_monthly_analytics
  - envia_get_carriers_stats
  - envia_get_packages_module
  - envia_get_issues_analytics
  - envia_get_shipments_by_status

Notifications / buyer experience (3)
  - envia_get_notification_prices
  - envia_list_notifications
  - envia_get_notification_config

Products / billing / DCe (4)
  - envia_list_products
  - envia_get_billing_info
  - envia_check_billing_info
  - envia_get_dce_status

Carriers advanced (4)
  - envia_generate_manifest
  - envia_submit_nd_report
  - envia_generate_complement
  - envia_cancel_pickup (listed above; grouped under pickup for clarity)

Account & balance (3)
  - envia_get_my_salesman
  - envia_get_balance_info
  - envia_check_balance

AI shipping (2)
  - envia_ai_parse_address
  - envia_ai_rate

Typical domestic workflow:
  envia_validate_address → envia_list_carriers → envia_quote_shipment
  → envia_create_label → envia_track_package

Typical international workflow:
  envia_validate_address → envia_classify_hscode → envia_quote_shipment
  → envia_create_label → envia_track_package
  (commercial invoice and bill of lading are generated automatically by the
   carriers backend when the route requires them — they come back inside the
   create_label response. Manual regeneration helpers exist as internal
   functions but are not exposed as conversational tools.)

Ecommerce workflows:
  one-step:      envia_create_label (with order_identifier) → envia_track_package
  with compare:  envia_get_ecommerce_order → envia_quote_shipment
                 → envia_create_label (order_identifier + carrier override)
                 → envia_track_package

High-volume / warehouse workflow:
  (loop) envia_create_label → envia_schedule_pickup → envia_track_package

Balance / payments workflow:
  envia_get_balance_info or envia_check_balance (sufficiency check)
  before envia_create_label on large batches.

Full docs: https://docs.envia.com
`,
                },
            ],
        }),
    );

    // ---- Address structure ---------------------------------------------------
    server.registerResource(
        'envia-address-format',
        'envia://docs/address-format',
        {
            description:
                'Required and optional address fields for Envia API requests.',
            mimeType: 'text/plain',
        },
        async () => ({
            contents: [
                {
                    uri: 'envia://docs/address-format',
                    mimeType: 'text/plain',
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

Country-specific rules are applied transparently by internal helpers
(see COUNTRY_RULES_REFERENCE.md in the repo). Notable transforms:
  - BR: postal code "12345678" -> "12345-678"; CPF/CNPJ detection.
  - AR: strips leading letter prefix (e.g. "C1425" -> "1425").
  - US: ZIP+4 format / truncate to 5 digits.
  - CO: city name resolved to DANE code before rate.
  - FR: phone normalised to +33XXXXXXXXX.
  - BR/IN: domestic shipments are processed as international (items[] required).

Pre-validation of required fields per country is performed against the
backend /generic-form endpoint. min/max/validationType constraints are
enforced by the backend — the MCP surfaces mapped errors rather than
replicating those rules client-side.

Types are defined in src/types/carriers-api.ts (GenerateAddress, RateAddress).
Builders are in src/builders/address.ts.

Tips:
  - Use envia_validate_address to verify postal codes before shipping.
  - State codes vary by country (MX uses 2-letter codes like "NL", "CDMX").
  - Phone numbers should include country code (e.g. "+52 8180001234").
  - For quoting, only postal code + country are needed — city/state auto-resolve.
`,
                },
            ],
        }),
    );
}
