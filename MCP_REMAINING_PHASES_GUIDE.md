# MCP Portal Agent — Remaining Work Guide

> **Scope update (2026-04-16):** The project has been re-scoped as a **portal
> embedded agent**, not a multi-tenant public MCP server. The criterion for
> including a tool is "a typical portal user would ask the agent for this".
> Admin / dev tasks, onboarding flows, and backend infra concerns are
> explicitly out of scope.

## Current state

- **71 user-facing tools + 4 internal helpers**
- **1352 tests passing**, 102 test files, build clean
- **Local commit:** `616cd60` on `main` (not pushed) — Sprint 1 uncommitted changes staged

## Completed phases

| Phase | Tools | Status |
|-------|-------|--------|
| 0 | 6 validation services | ✅ Complete |
| 0.5 | 12 existing tools reinstrumented | ✅ Complete |
| 1 | Shipments (8) | ✅ Complete |
| 2 | Addresses + Packages + Clients (15) | ✅ Complete |
| 3 | Orders (12) | ✅ Complete |
| 4 | Tickets (7) | ✅ Complete |
| 5 | Branches (3) | ✅ Complete |
| 6 | Config (7 read-only; CRUD removed) | ✅ Complete |
| 7 | Analytics (5) | ✅ Complete |
| 8 | Carriers advanced (6) | ✅ Complete |
| 9 | Notifications (3) | ✅ Complete |
| 10 | Products + Billing + DCe (4) | ✅ Complete |
| **Sprint 0** | Portal-agent consolidation | ✅ Complete |
| **Sprint 1** | Close functional loop | ✅ Complete |

## Sprint 1 — Completed (2026-04-16)

### 1. `fulfillmentSync` helper ✅

Implemented `src/services/ecommerce-sync.ts` + integrated into `src/tools/create-label.ts`.
When a label is created with `order_identifier`, `POST /tmp-fulfillment/{shop_id}/{order_identifier}`
is fired as a silent side-effect to notify the ecommerce platform (Shopify/WooCommerce/etc.).
Graceful degradation: sync failure appends `[warning]` to response but never fails the tool.
Requires `ENVIA_ECART_HOSTNAME` env var. 12 new tests (8 unit + 4 integration).

### 2. Backend Reality Check — Session B ✅

5 findings files written to `_docs/backend-reality-check/`:
- `tms-admin-findings.md` — NOT a backend; it's a React admin SPA
- `ecart-payment-findings.md` — Rich payment API; 5 READ_SAFE tools proposed for Sprint 2
- `sockets-findings.md` — Pure broadcaster; no MCP tools possible
- `queue-findings.md` — `envia_check_balance` proposed immediately; refund queue for Phase 2
- `secondary-carriers-findings.md` — 10 carriers analyzed; generic tools cover 80% of cases

`MASTER_SUMMARY.md` updated with all proposals and V1-safe classifications.

### 3. Test gaps filled for 4 tools ✅

Created test files (5–7 tests each, AAA pattern, all passing):
- `tests/tools/addresses/update-address.test.ts`
- `tests/tools/clients/create-client.test.ts`
- `tests/tools/clients/update-client.test.ts`
- `tests/tools/orders/update-order-address.test.ts`

## Remaining work — Sprint 2 "ecart-payment + internal quality"

### 1. `fulfillmentSync` helper (highest priority)

**Problem:** When the agent generates a label via `envia_create_label` from
an ecommerce order (passing `order_identifier`), the label is created in
carriers service but the ecommerce platform (Shopify/WooCommerce/etc.) is
NOT notified. Today the sync is done by `carriers` service making a direct
POST to ecommerce. When the MCP is the caller, this loop is broken.

**Solution:** After a successful `create_label` call that included an
`order_identifier`, the MCP should fire `POST /order/fulfillment/{shop_id}/{order_identifier}`
in ecommerce service as a side-effect. Do NOT expose this as a separate tool
— it is an automatic side-effect of label creation.

**Where to add:**
- New helper in `src/services/ecommerce-sync.ts` (new file)
- Call the helper from the end of `src/tools/create-label.ts` when
  `args.order_identifier` is truthy AND the label creation succeeded
- Handle errors softly: if fulfillment sync fails, include a warning in the
  `create_label` response text but don't fail the whole tool
- Payload shape and endpoint verified from `services/ecommerce/controllers/*`
  (Sprint 0 discovery)

**Tests:**
- Helper unit tests (fetch mocks, success/failure paths)
- `create-label.test.ts` — verify sync is called when order_identifier present,
  NOT called when absent, warning appears in output when sync fails

### 2. Backend Reality Check — Session B

Five backend services were not analyzed in Session A. Run a parallel agent
sweep with these scopes:

| Service | Why it matters to the portal agent |
|---------|------------------------------------|
| **tms-admin** | Balance/charges/refunds/COD — users ask "when does my refund come?", "what happened to the charge?" |
| **ecart-payment** | COD remittance, EcartPay payment links — relevant for COD flows and "dame el link de pago" requests |
| **sockets** | WebSocket payloads for real-time tracking — may influence how `envia_track_package` surfaces updates |
| **queue** | Bull queue job shapes — relevant if agent should report queued async work |
| **ecartApiOauth** | OAuth for connecting stores — only relevant if connecting a store is a user-facing flow in v1 (probably defer) |
| **Secondary carriers** (10) | tresGuerras, Almex, FedEx Freight, Sendex, Afimex, AmPm, J&T Express, Entrega, 99 Minutos, Fletes Mexico — complete the carrier-specific rules coverage |

Deliverables for Session B:
- One findings file per service in `_docs/backend-reality-check/`
- Updated `MASTER_SUMMARY.md` integrating findings
- Proposed list of new tools/helpers with V1-safety status, using the same
  classification as `V1_SAFE_TOOL_INVENTORY.md`

### 3. Test gaps for 4 tools (pre-existing debt)

Sprint 0 added generic-form validation to tools that had no test files.
The helper itself (`validateAddressForCountry`) is tested in
`tests/tools/addresses/create-address.test.ts`, but the per-tool integration
is not exercised individually:

- `tests/tools/addresses/update-address.test.ts` (missing)
- `tests/tools/clients/create-client.test.ts` (missing)
- `tests/tools/clients/update-client.test.ts` (missing)
- `tests/tools/orders/update-order-address.test.ts` (missing)

Add at minimum:
- 1 smoke test per tool verifying the tool is registered and routes to POST/PUT
- 1 test per tool verifying generic-form validation fires with country input
- 1 test per tool verifying the graceful-degradation path (form fetch fails → mutation proceeds)

## Remaining work — Sprint 2 "Internal quality" (optional)

These came from the structural audit (`_docs/AUDIT_2026_04_16.md`) and are
not user-visible but improve maintainability:

1. Typed payloads — eliminate 111 `Record<string, unknown>` usages in
   mutation bodies. Define per-tool payload interfaces.
2. Tool registry pattern — auto-register tools from each barrel's `index.ts`
   to replace the monolithic `createEnviaServer` body in `src/index.ts`.
3. Address builder refactor — 3 near-identical builders in
   `src/builders/address.ts` can share a single polymorphic function.
4. Migrate ~6 remaining tools that still use raw `{ content: [{ type: 'text', ... }] }`
   response pattern to `textResponse()` helper. Add ESLint rule to prevent
   regression.

## Explicitly deferred / NOT in scope for v1

- **HTTP multi-tenant auth layer** — not needed; agent lives inside the
  portal's authenticated session
- **Shipping Rules editor** — V2 portal feature, UI-intensive, not chat-friendly
- **Buyer Experience editors** (tracking page, email templates) — form-based,
  better in the portal UI
- **Returns Portal** — discovery only, not built
- **Drafts bulk upload** (original Fase 12) — power user feature, Excel-centric
- **Multi-company switching tools** — not needed inside portal session
- **Checkout Rules CRUD** — no UI in v1 or v2
- **Webhook CRUD** — dev/admin task

## Pending from AI shipping mini-batch (Fase 11)

`envia_ai_rate` and `envia_ai_parse_address` — **✅ DONE in Sprint 0.**
Verified the parse-address endpoint was deployed between Apr 13 and Apr 16.

## Key files for next session

Read first (in this order):
1. This file
2. `memory/project_mcp_expansion_plan.md` — current state
3. `_docs/backend-reality-check/MASTER_SUMMARY.md` — all findings
4. `ai-agent/envia-mcp-server/_docs/V1_SAFE_TOOL_INVENTORY.md` — tool classification
5. `ai-agent/envia-mcp-server/CLAUDE.md` — coding conventions
6. Next-session prompt: `.claude/prompts/SPRINT_1_PROMPT.md`

## Sandbox credentials

- Token: `ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3`
- Queries: `https://queries-test.envia.com`
- Carriers: `https://api-test.envia.com`
- Geocodes: `https://geocodes.envia.com` (prod only, no sandbox)
