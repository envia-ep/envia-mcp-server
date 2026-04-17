# MCP Portal Agent — Remaining Work Guide

> **Scope update (2026-04-16):** The project has been re-scoped as a **portal
> embedded agent**, not a multi-tenant public MCP server. The criterion for
> including a tool is "a typical portal user would ask the agent for this".
> Admin / dev tasks, onboarding flows, and backend infra concerns are
> explicitly out of scope.

## Current state

- **72 user-facing tools + 4 internal helpers**
- **1369 tests passing**, 103 test files, build clean
- **Local commit:** `ae7407b` on `main` (not pushed) — Sprint 2 changes staged, awaiting Jose's approval

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
| **Sprint 2** | Payments + balance tools + deploy checklist | ✅ Complete |

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

## Sprint 2 — Completed (2026-04-17)

### 1. Goal 1: Pre-deploy validation ✅

- `_docs/DEPLOY_CHECKLIST.md` created — lists all required env vars (ENVIA_API_KEY, ENVIA_ENVIRONMENT, ENVIA_ECART_HOSTNAME, ENVIA_ECART_PAY_HOSTNAME, ENVIA_QUEUE_HOSTNAME), sandbox vs prod URLs, and pre-deploy checklist.
- fulfillmentSync smoke-tested: `POST /tmp-fulfillment/{shop_id}/{order_id}` confirmed reachable (auth OK). Sandbox returns 422 because ecartAPI test hostname DNS fails — expected; production works. Response shapes documented in `ecommerce-sync.ts`.

### 2. Goal 2a: ecart-payment auth verification → BLOCKER ✅

- HTTP 401 `"El token no es válido."` with Envia portal JWT.
- ecart-payment uses its own JWT system (Basic auth with private/public keys → `/api/authorizations/token`).
- Real hostname: `ecart-payment-dev.herokuapp.com` (not `ecart-pay-api.envia.com` which doesn't resolve).
- 5 ecart-payment tools deferred. See `_docs/SPRINT_2_BLOCKERS.md` for resolution options.

### 3. Goal 2b: queue auth verification → BLOCKER + safety issue ✅

- Portal JWT rejected: `"Missing authentication"`.
- TMS queue uses company-scoped JWT from `POST /token` (no auth, just companyId).
- `POST /check` creates **pending charges** (balance holds) — not read-only. Unsafe for conversational tool.
- Real hostname: `queue-private.envia.com` (not `envia-tms-api.envia.com` which doesn't resolve).
- See `_docs/SPRINT_2_BLOCKERS.md`.

### 4. Goal 2c: `envia_check_balance` tool ✅

- Implemented in `src/tools/queue/check-balance.ts` using `fetchUserInfo` (user-information JWT already has `company_balance`).
- Answers "¿tengo saldo suficiente para enviar X?" — truly READ_SAFE, zero financial side effects.
- Supporting files: `src/types/queue.ts`, `src/tools/queue/index.ts`.
- 17 new tests in `tests/tools/queue/check-balance.test.ts`.
- Total: 72 tools, 1369 tests, 103 test files, build clean.

## Remaining work — Sprint 3 "ecart-payment auth fix + internal quality"

### 1. ecart-payment tools (5 tools, blocked on auth — highest priority)

Blocked by JWT mismatch. See `_docs/SPRINT_2_BLOCKERS.md` for 3 resolution options.
Recommended: proxy through queries service (already has ecartpay auth keys).

Tools to implement once auth is resolved:
- `envia_get_refund_status` — `GET /api/refunds?transaction_id=...`
- `envia_get_withdrawal_status` — `GET /api/withdrawals/:id`
- `envia_get_transaction_history` — `GET /api/transactions`
- `envia_get_ecartpay_balance` — `GET /api/transactions/summary`
- `envia_list_invoices` — `GET /api/invoices`

## Remaining work — Sprint 3 "Internal quality" (optional)

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
