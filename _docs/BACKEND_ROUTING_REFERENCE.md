# Backend Routing Reference — envia-mcp-server

Which backend service each tool talks to, and how environment selection
works. Useful when debugging a failed tool call, provisioning a new
environment, or extending the MCP with a new tool.

Last verified: 2026-04-27 (smoke test against `envia-mcp-stage` PASS 6/6 — see `DEPLOY_LOG_2026_04_27.md`). URLs current as of `b282249` on `mcp-expansion`.

## 1. Environment selection

The MCP talks to **four backend services**. Only one env var switches
sandbox vs production; the others are either hardcoded or take an
explicit URL.

| Env var | Required | Purpose | Default |
|---------|----------|---------|---------|
| `ENVIA_API_KEY` | **Yes** | JWT bearer for every call to Envia APIs | — (server fails to start without it) |
| `ENVIA_ENVIRONMENT` | No | `sandbox` or `production`. Any other value falls back to `sandbox`. | `sandbox` |
| `ENVIA_ECART_HOSTNAME` | No (but required for ecommerce sync) | Base URL for the `eshops` / ecartAPI proxy used by `syncFulfillment`. | `undefined` (sync silently skipped; a `[warning]` is appended to the label response) |
| `ENVIA_GEOCODES_HOSTNAME` | No | Override for the Geocodes base URL. Intended for integration tests. | `https://geocodes.envia.com` (hardcoded, no sandbox exists) |
| `ENVIA_ECART_PAY_HOSTNAME` | No (reserved) | Future use for direct ecart-payment tools. Not consumed today. | — |
| `ENVIA_QUEUE_HOSTNAME` | No (reserved) | Future use for direct TMS queue tools. Not consumed today. | — |

Source of truth: `src/config.ts` + memory `reference_v1_backend_capabilities.md`.

### How `ENVIA_ENVIRONMENT` maps to URLs

Hardcoded in `src/config.ts`:

```ts
sandbox:    { shipping: "https://api-test.envia.com",  queries: "https://queries-test.envia.com" }
production: { shipping: "https://api.envia.com",       queries: "https://queries.envia.com"      }
```

So a single atomic switch keeps shipping + queries consistent. Geocodes
does not change because its backend has no sandbox.

### Carriers service URL aliases (backend-confirmed 2026-04-27)

The carriers service is reachable via two hostnames per environment.
Both resolve to the same backend dyno; the difference is only routing
(direct Heroku vs Cloudflare → Heroku Private Spaces). Pick either —
they are functionally interchangeable.

| Env | Public URL (used by MCP) | Internal URL (also valid) |
|-----|--------------------------|---------------------------|
| sandbox | `https://api-test.envia.com` (Cloudflare → Spaces) | `https://envia-api-dev.herokuapp.com` (Heroku direct) |
| production | `https://api.envia.com` (Cloudflare → Spaces) | `https://api-clients.envia.com` (Cloudflare → same Spaces dyno) |

The MCP uses the public Cloudflare-fronted URLs (`api-test.envia.com` /
`api.envia.com`). The internal URLs are documented because the backend
team sometimes references them in tickets — knowing the alias avoids
confusion ("is this a different server?"). It is NOT a different server.

If a new MCP tool needs to point to a carriers endpoint, keep using
`config.shippingBase`. Do NOT add a separate env var for the internal
URL — that would duplicate config and tempt drift.

## 2. Per-service backend map

### 2.1 Shipping API (carriers service, PHP/Lumen)

Base: `shippingBase` (controlled by `ENVIA_ENVIRONMENT`).

Tools that hit it:

- `envia_quote_shipment` → `POST /ship/rate`
- `envia_create_label` → `POST /ship/generate`
- `envia_track_package` → `POST /ship/generaltrack`
- `envia_cancel_shipment` → `POST /ship/cancel`
- `envia_schedule_pickup` → `POST /ship/pickup`
- `envia_track_pickup` → `POST /ship/pickuptrack`
- `envia_cancel_pickup` → `POST /ship/pickupcancel`
- `envia_validate_address` → `GET /zipcode/{country}/{code}`
- `envia_list_carriers` → `GET /available-carrier`
- `envia_list_additional_services` → `GET /available-service`
- `envia_classify_hscode` → `POST /utils/classify-hscode`
- `envia_create_commercial_invoice` → `POST /ship/commercial-invoice`
- `envia_generate_manifest` → `POST /ship/manifest`
- `envia_generate_bill_of_lading` → `POST /ship/bill-of-lading`
- `envia_submit_nd_report` → `POST /ship/nd-report`
- `envia_generate_complement` → `POST /ship/complement`
- `envia_ai_parse_address` → `POST /ai/shipping/parse-address`
- `envia_ai_rate` → `POST /ai/shipping/rate`
- `envia_get_shipment_history` → `GET /guide/{month}/{year}`

### 2.2 Queries API (queries service, Node/Hapi)

Base: `queriesBase` (controlled by `ENVIA_ENVIRONMENT`).

Tools that hit it (the vast majority — 40+):

- Shipments reads: `envia_list_shipments`, `envia_get_shipment_detail`,
  `envia_get_shipments_status`, `envia_get_shipments_cod`,
  `envia_get_cod_counters`, `envia_get_shipments_surcharges`,
  `envia_get_shipments_ndr`, `envia_get_shipment_invoices`
- Ecommerce orders: `envia_list_orders` (`/v4/orders`),
  `envia_get_orders_count`, `envia_list_shops`, `envia_get_ecommerce_order`,
  `envia_update_order_address`, `envia_update_order_packages`,
  `envia_select_order_service`, `envia_fulfill_order`,
  `envia_get_order_filter_options`, `envia_manage_order_tags`,
  `envia_generate_packing_slip`, `envia_generate_picking_list`,
  `envia_get_orders_analytics`
- Addresses: `envia_list_addresses`, `envia_create_address`,
  `envia_update_address`, `envia_delete_address`,
  `envia_set_default_address`, `envia_get_default_address`
- Packages: `envia_list_packages`, `envia_create_package`,
  `envia_delete_package`
- Clients: `envia_list_clients`, `envia_get_client_detail`,
  `envia_create_client`, `envia_update_client`, `envia_delete_client`,
  `envia_get_clients_summary`
- Tickets: `envia_list_tickets`, `envia_get_ticket_detail`,
  `envia_get_ticket_comments`, `envia_create_ticket`,
  `envia_add_ticket_comment`, `envia_rate_ticket`, `envia_get_ticket_types`
- Settings (read-only): `envia_list_company_users`,
  `envia_list_company_shops`, `envia_get_carrier_config`,
  `envia_get_notification_settings`, `envia_list_api_tokens`,
  `envia_list_webhooks`
- Company / account: `envia_get_company_info`, `envia_get_my_salesman`,
  `envia_get_balance_info`, `envia_check_balance` (all reuse
  `/user-information` from the JWT payload)
- Analytics: `envia_get_monthly_analytics`, `envia_get_carriers_stats`,
  `envia_get_packages_module`, `envia_get_issues_analytics`,
  `envia_get_shipments_by_status`
- Notifications: `envia_get_notification_prices`, `envia_list_notifications`,
  `envia_get_notification_config`
- Products / billing / DCe: `envia_list_products`, `envia_get_billing_info`,
  `envia_check_billing_info`, `envia_get_dce_status`
- Side-effects from other tools: `generic-form` form fetch, `tmp-fulfillment`
  sync call inside `envia_create_label`

### 2.3 Geocodes API (geocodes service)

Base: `geocodesBase` (always `https://geocodes.envia.com` unless overridden via `ENVIA_GEOCODES_HOSTNAME`). No sandbox exists.

- `envia_validate_address` (partial): some lookups use this base.
- Internal helpers (NOT LLM-visible):
  - `getAddressRequirements` → `POST /location-requirements`
  - `resolveDaneCode` → `GET /locate/CO/{state?}/{city}` (Colombia)
  - `getBrazilIcms` → `GET /brazil/icms/{origin}/{destination}`

### 2.4 EcartAPI / eshops proxy

Base: `ecartApiBase` (controlled by `ENVIA_ECART_HOSTNAME`). **This is the only backend NOT reached by any user-facing tool.**

- Internal helper: `syncFulfillment` (invoked as a side-effect of
  `envia_create_label` when `order_identifier` is present).
- Single endpoint: `POST /api/v2/orders/{order_identifier}/fulfillments`
  (via an internal `tmp-fulfillment` route on queries that proxies to it).

If `ENVIA_ECART_HOSTNAME` is not set, the sync is skipped and the label
response includes `[warning] Fulfillment sync skipped — ENVIA_ECART_HOSTNAME not configured.`

## 3. Request path convention (how to tell which backend a tool uses)

Rule of thumb when reading `src/tools/`:

| Tool file location | Usually hits |
|--------------------|--------------|
| `src/tools/*.ts` (root-level — shipping flow) | `shippingBase` |
| `src/tools/shipments/`, `src/tools/orders/`, `src/tools/addresses/`, `src/tools/clients/`, `src/tools/packages/`, `src/tools/tickets/`, `src/tools/config/`, `src/tools/analytics/`, `src/tools/notifications/`, `src/tools/products/`, `src/tools/account/` | `queriesBase` |
| `src/tools/carriers-advanced/` | Mixed: manifest/BOL/nd-report/complement → `shippingBase`; locate-city → `geocodesBase` |
| `src/services/geocodes-helpers.ts` | `geocodesBase` |
| `src/services/ecommerce-sync.ts` | `ecartApiBase` (via queries proxy route) |
| `src/services/user-info.ts` | `queriesBase` (`/user-information`) |

The per-tool URL is always constructed as `${config.X}/path`. Grep
`config.shippingBase|config.queriesBase|config.geocodesBase|config.ecartApiBase`
if in doubt.

## 4. Request flow end-to-end (example)

User says "cotízame un envío de Monterrey a CDMX":

1. Portal backend → `POST /mcp` on the MCP (HTTP mode).
2. MCP dispatches `envia_quote_shipment`.
3. Tool builds a body from the Zod-validated args.
4. Tool calls the shared `EnviaApiClient.post(config.shippingBase + '/ship/rate', body, token)`.
5. Client goes to `api-test.envia.com/ship/rate` (sandbox) with `Authorization: Bearer <ENVIA_API_KEY>`.
6. Backend returns the rate list.
7. Tool formats the result via `textResponse(...)`.
8. MCP sends it back over the SSE stream to the portal.

No external service other than `api-test.envia.com` is touched in this
flow. `queriesBase` and `geocodesBase` are untouched unless the tool
explicitly constructs a URL against them.

## 5. Common misconfigurations to check first

| Symptom | Most likely cause |
|---------|-------------------|
| All tools fail with `401 Unauthorized` | `ENVIA_API_KEY` is missing, expired, or belongs to the wrong environment |
| Shipping tools succeed but orders/shipments tools fail | `ENVIA_ENVIRONMENT` mis-set: token is for prod but URLs point to sandbox (or vice versa) |
| Create-label adds `[warning] Fulfillment sync skipped` | `ENVIA_ECART_HOSTNAME` not set (expected if ecommerce sync is not needed) |
| Geocodes-dependent tools fail (CO DANE, BR ICMS, location-requirements) | Geocodes reachability (shared prod host). Check Datadog; there is no sandbox to fall back to |
| Payment / refund / withdrawal tools do not appear in `tools/list` | Expected — Decision A deferred ecart-payment to v2 |
| `envia_check_balance` returns stale balance | It uses the `company_balance` field in the user-info JWT, which the backend refreshes on token mint. Not live-updated per-request |

## 6. What NOT to add without a decision

LESSON L-S2 + LESSON L-S5: adding a new backend requires a decision log
entry and a new internal helper (not a new tool). The current four
backends cover v1 scope. Adding a fifth (e.g. TMS direct, ecart-payment
direct, accounts direct) is a Sprint-level decision, not an inline
addition.

## 7. Related docs

- `_docs/DEPLOY_CHECKLIST.md` — required env vars before each deploy.
- `_docs/COUNTRY_RULES_REFERENCE.md` — per-country rules applied before
  calling these backends.
- `_docs/DECISIONS_2026_04_17.md` — why ecart-payment and TMS direct
  integrations are deferred.
- `_docs/SPRINT_2_BLOCKERS.md` — the auth mismatch that keeps ecart-payment
  and TMS out of v1.
- Memory `reference_carriers_architecture.md` and
  `reference_queries_architecture.md` — canonical backend architecture docs.

Update this file whenever a new env var is introduced, a new backend is
added, or a tool changes its target base URL.
