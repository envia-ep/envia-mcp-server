# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Ecommerce order integration** — New `envia_get_ecommerce_order` tool fetches V4 orders and builds ready-to-use rate/generate payloads. Supports multi-location orders with fulfillment status detection.
- **Dual-mode `create_shipment`** — Label creation now supports both manual mode (addresses + carrier) and ecommerce mode (pass `order_identifier` for one-step label creation from an order).
- **International shipment items** — `create_shipment` accepts an `items` array for customs documentation on international shipments. Automatically detects international routes and validates that items are provided.
- **Address auto-resolution** — City, state, and district (colonia) are auto-resolved from postal codes via the geocodes API. Colombia DANE codes are translated automatically. Both `quote_shipment` and `create_shipment` use this.
- **Country-specific address handling** — MX addresses send the exterior number as a separate field; all other countries embed it in the street. Controlled via a configurable `SEPARATE_NUMBER_COUNTRIES` set.
- **Print settings auto-fetch** — `create_shipment` fetches `printFormat` and `printSize` from the carrier's pickup-limits API, with user overrides supported.
- **Transport switching** — `MCP_TRANSPORT` env var selects between `http` (default, Streamable HTTP with browser chat UI) and `stdio` (for Claude Desktop, Cursor, VS Code). Convenience script: `npm run start:stdio`.
- **Browser chat UI** — HTTP mode serves an interactive chat interface at `/` for testing tools in the browser.
- **`classify_hscode` tool** — AI-powered HS code classification for customs (renamed from `envia_classify_hscode`).

### Changed

- **Architecture refactor** — Extracted shared logic into domain-specific builders (`src/builders/`), services (`src/services/`), and utilities (`src/utils/`). Tool files now contain only registration and tool-specific formatting.
  - `src/builders/address.ts` — Address construction for rate and generate APIs
  - `src/builders/package.ts` — Package construction with items and V4 order support
  - `src/builders/ecommerce.ts` — Ecommerce metadata section builder
  - `src/services/ecommerce-order.ts` — V4 order fetching and transformation
  - `src/services/carrier.ts` — Carrier list fetching
  - `src/utils/mcp-response.ts` — Shared MCP text response helper
  - `src/utils/print-settings.ts` — Carrier print settings lookup
  - `src/types/carriers-api.ts` — Single source of truth for carriers API payload types
- **`quote_shipment` improvements** — Address resolution, multi-carrier quoting, carrier list fetching from API.
- **Error reporting** — `create_shipment` now surfaces raw carrier API error messages and troubleshooting tips when label generation fails.
- **Test suite expanded** — 460+ unit tests covering tools, builders, services, security, and integration.

### Fixed

- Order fetching reliability — Two-step lookup (by `order_identifier`, then fallback to `search`) bypasses the 6-month data restriction.
- MX district/colonia auto-resolution from postal code geocodes.
- Required `number` field for generate payloads — always included per carrier schema requirements.
- No invented data — address fields default to empty strings instead of placeholders like `'S/N'` when not provided.
- Improved error messages when tracking number is missing from carrier response.

## 1.0.0 (2026-03-21)

### Bug Fixes

* align handler interfaces with real API response shapes ([727114c](https://github.com/envia-ep/envia-mcp-server/commit/727114c4f587f6e96c1498277e0db95feabcdb41))
* correct dashboard URLs and navigation path references ([ee3960f](https://github.com/envia-ep/envia-mcp-server/commit/ee3960f04c06f78293ac716c03f0855a6033ad27))
* geocodes uses production-only endpoint, rewrite validate-address handler ([c904ec0](https://github.com/envia-ep/envia-mcp-server/commit/c904ec01681818d9806a40742d0de4c5d4e551e2))

## [0.1.0] - 2026-03-04

### Added

- Initial release of `@envia/envia-mcp`
- 10 MCP tools for Envia shipping APIs:
  - `envia_validate_address` — Validate postal codes and city lookup
  - `envia_list_carriers` — List carriers and services by country
  - `quote_shipment` — Multi-carrier rate comparison
  - `create_shipment` — Purchase shipping labels
  - `envia_track_package` — Track one or more shipments
  - `envia_cancel_shipment` — Void labels and reclaim balance
  - `envia_schedule_pickup` — Schedule carrier pickups
  - `envia_get_shipment_history` — List shipments by month
  - `envia_classify_hscode` — AI-powered HS code classification
  - `envia_create_commercial_invoice` — Generate customs invoice PDFs
- 2 MCP resources: API overview and address format guide
- Sandbox/production environment switching via `ENVIA_ENVIRONMENT`
- Security hardening: SSRF prevention, input validation, error sanitization
- 50 unit tests (including 17 security-focused tests)
- IDE setup examples for Claude Desktop, Cursor, and VS Code

[Unreleased]: https://github.com/envia-ep/envia-mcp-server/compare/v1.0.0...HEAD
[0.1.0]: https://github.com/envia-ep/envia-mcp-server/releases/tag/v0.1.0
