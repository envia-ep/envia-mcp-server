# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-04

### Added

- Initial release of `@envia/envia-mcp`
- 10 MCP tools for Envia shipping APIs:
  - `envia_validate_address` — Validate postal codes and city lookup
  - `envia_list_carriers` — List carriers and services by country
  - `envia_get_shipping_rates` — Multi-carrier rate comparison
  - `envia_create_label` — Purchase shipping labels
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

[0.1.0]: https://github.com/envia-ep/envia-mcp-server/releases/tag/v0.1.0
