# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/envia-ep/envia-mcp-server/compare/v1.0.0...v1.1.0) (2026-04-29)


### Features

* **mcp:** pre-implement envia_get_carrier_constraints (backend C11 pending) ([9d5bfa8](https://github.com/envia-ep/envia-mcp-server/commit/9d5bfa8193839da4fe420c84861e2421e81d6cce))
* portal agent v1 — expansion phases 0-10 + Sprint 0 consolidation ([616cd60](https://github.com/envia-ep/envia-mcp-server/commit/616cd60f757412dd605f5ee949d6d519f9d27bf4))
* **schemas:** add runtime validation infrastructure (Phase 1 of 2) ([cfe70f6](https://github.com/envia-ep/envia-mcp-server/commit/cfe70f602adab857d5b522a5dc8799f1b78bd62e))
* **schemas:** migrate envia_create_shipment to runtime validation (8/10) ([1b1fb51](https://github.com/envia-ep/envia-mcp-server/commit/1b1fb512179b804aa823db8293bfb5e719f096e4))
* **schemas:** migrate envia_create_ticket to runtime validation (5/10) ([2f05764](https://github.com/envia-ep/envia-mcp-server/commit/2f05764299ca80ae65241434e56da2b86e30668f))
* **schemas:** migrate envia_get_carrier_constraints to runtime validation (6/10) ([13f02c2](https://github.com/envia-ep/envia-mcp-server/commit/13f02c20832e7102b895a1b9556d89b64be46558))
* **schemas:** migrate envia_get_shipment_detail to runtime validation (1/10) ([8a50c4b](https://github.com/envia-ep/envia-mcp-server/commit/8a50c4bfa92de706887cb53baeee3011f0f75a77))
* **schemas:** migrate envia_list_orders to runtime validation (10/10) ([f1cde0a](https://github.com/envia-ep/envia-mcp-server/commit/f1cde0a6b994b076167174461f989739bc62e03b))
* **schemas:** migrate envia_list_shipments to runtime validation (2/10) ([24875f3](https://github.com/envia-ep/envia-mcp-server/commit/24875f3a0a46d86b394ad1af37d886e9772783e8))
* **schemas:** migrate envia_quote_shipment to runtime validation (7/10) ([2305cdd](https://github.com/envia-ep/envia-mcp-server/commit/2305cddffa0185a05d424e2fa74ecb7336a11eff))
* **schemas:** migrate envia_track_package to runtime validation (9/10) ([1941c3f](https://github.com/envia-ep/envia-mcp-server/commit/1941c3ffbc509d3039e5abb45746e91872ce731a))
* scripts/verify-carriers-ref.sh — automated doc verification (37 checks) ([a8350b6](https://github.com/envia-ep/envia-mcp-server/commit/a8350b63848a9be9303e9341a92b6589fc95f277))
* Sprint 1 — fulfillmentSync + Session B analysis + test gaps ([ae7407b](https://github.com/envia-ep/envia-mcp-server/commit/ae7407b5d0d925ca0ebec3c4bca668247108b4a5))
* Sprint 2 — envia_check_balance + deploy checklist + auth blockers documented ([ed4cf6c](https://github.com/envia-ep/envia-mcp-server/commit/ed4cf6c39ce829d2dbb11bc2d80570960f9c0d37))
* Sprint 3 — error-map enrichment + textResponse migration + ESLint guard + smoke playbook ([e231e58](https://github.com/envia-ep/envia-mcp-server/commit/e231e584a49217e9f2691b05f00d373b30a344d1))
* Sprint 5 steps 3+5 — MX state remap + country-specific test coverage ([3cb399d](https://github.com/envia-ep/envia-mcp-server/commit/3cb399da4cae83eeb7c2bc8e7ab52a0abda2c4b5))
* Sprint 6 — V4 type fixes, service bug corrections, enriched formatOrderSummary ([b8d47ec](https://github.com/envia-ep/envia-mcp-server/commit/b8d47ec1b3a518918ce8e3b0e13e6eaf3f5f4c8a))
* **sprint-4a:** observability layer — pino + correlation IDs + structured tool-call events ([af71e0b](https://github.com/envia-ep/envia-mcp-server/commit/af71e0b02249cba8034a6ca3136a389fb5f497ce))
* **sprint-4a:** retire list_checkout_rules + reclassify generate_bill_of_lading INTERNAL ([53ae225](https://github.com/envia-ep/envia-mcp-server/commit/53ae2254dabd127d586abf0750d35480fdbc6b98))
* **sprint-5:** align EXCEPTIONAL_TERRITORIES with geocodes source-of-truth ([b4818d4](https://github.com/envia-ep/envia-mcp-server/commit/b4818d451b22dca7d3724a51d6185875fb76700a))
* **sprint-5:** apply Canarias country override in getAddressRequirements (γ) ([9020dfc](https://github.com/envia-ep/envia-mcp-server/commit/9020dfc2228b4c8cb92c1ef7fa9deb36fd05ac83))
* **sprint-7:** add 3 new LLM-visible tools + Gap 10 multi-field support ([a7ff142](https://github.com/envia-ep/envia-mcp-server/commit/a7ff1422aed2d66b4309a3336e36521d0f8e3fcd))
* verification scripts for queries + geocodes (parity with carriers) ([1d052d1](https://github.com/envia-ep/envia-mcp-server/commit/1d052d17a614103590c95df171b74b1428a58647))


### Bug Fixes

* **carrier-constraints:** allow null category_id, render safely ([5368227](https://github.com/envia-ep/envia-mcp-server/commit/536822724418c2d85ea7dc9e6c0c3b2b9d002439))
* **carrier-constraints:** null-safe rendering for limits and pickup max ([96925ce](https://github.com/envia-ep/envia-mcp-server/commit/96925cea43391112c7076dfe83cedd0546144a59))
* **chat:** restore chat layout broken by demo banner ([2c3c885](https://github.com/envia-ep/envia-mcp-server/commit/2c3c8851de1f6d38bb0eb430b064946c46fa56ff))
* **list-additional-services:** redirect carrier-specific questions to get_carrier_constraints ([f7d809f](https://github.com/envia-ep/envia-mcp-server/commit/f7d809f94183f8c77a251352e7b80fa358f0c3ff))
* **mcp:** generic-form form name was 'address_form', backend uses 'address_info' ([0193936](https://github.com/envia-ep/envia-mcp-server/commit/0193936ef4277818bc064481ca352c70cecfb5b9))
* **mcp:** generic-form parses RAW ARRAY response (was expecting `{data:[...]}` wrapper) ([d7ce2ce](https://github.com/envia-ep/envia-mcp-server/commit/d7ce2ce159787163456f074b5643994eeaab5234))
* pass HOST to createMcpExpressApp to allow Heroku host-header validation ([2eb87a4](https://github.com/envia-ep/envia-mcp-server/commit/2eb87a4dec920daafdfc63b5641f7de22fafa49b))
* **schemas:** align schemas with live API shapes (§7.1 verification pass) ([6524610](https://github.com/envia-ep/envia-mcp-server/commit/652461068754fc07d1b17d868a7bf0a4873f5571))
* **schemas:** keep QuoteShipmentResponseSchema.meta required, update fixtures ([9e2da30](https://github.com/envia-ep/envia-mcp-server/commit/9e2da303c820726e3a68bb166c5770204a6035f9))
* **shipments-status:** stop appending % to pre-formatted percentage strings ([1af57ad](https://github.com/envia-ep/envia-mcp-server/commit/1af57add726d487f67860dc316075ff989eebc8e))
* **shipments:** align tool formatters to live backend shape (3 bugs) ([a99736a](https://github.com/envia-ep/envia-mcp-server/commit/a99736a2d2bc7781e178c175313d81ed3aeb6560))
* **shipments:** close 2 of 3 audit findings — status flat shape + invoices fields ([9007a5d](https://github.com/envia-ep/envia-mcp-server/commit/9007a5df1456ab42fa83152637163e3d4fa1fad9))
* **tickets:** resolve tracking_number → shipment_id so tickets link correctly ([9aee101](https://github.com/envia-ep/envia-mcp-server/commit/9aee10107b4708a9b1d7a74da287ef84b302c6e5))

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
