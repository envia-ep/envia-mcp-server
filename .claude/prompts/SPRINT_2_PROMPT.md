# Sprint 2 — Payments & balance READ_SAFE tools

> **Self-contained prompt.** Executable by Sonnet. Covers everything needed
> without prior session context.

## Context

`envia-mcp-server` is a scoped MCP server embedded in the Envia portal. It
exposes tools a portal user asks conversationally: quote, create label,
track, cancel, pickups, tickets, orders, account info, etc.

**Scope criterion:** include a tool only if a typical portal user would
ask for it in chat. Admin/dev tasks stay out.

**State after Sprint 1 (commit `ae7407b` on `main`, local only):**
- 71 user-facing tools + 5 internal helpers
- 1352 tests passing, 102 test files, TypeScript build clean
- Working tree clean

Sprint 1 delivered `fulfillmentSync` (ecommerce loop closing), Session B
backend analysis (5 services), and test gaps filled for 4 previously
untested tools.

## Sprint 2 goals (in priority order)

### Goal 1 — Pre-deploy validation of Sprint 1 (30 min, do first)

Before adding anything new, verify that `fulfillmentSync` works end-to-end.

**Tasks:**

1. Check that `ENVIA_ECART_HOSTNAME` is in the config template and that the
   Heroku/deployment docs mention it. If no such doc exists, create
   `_docs/DEPLOY_CHECKLIST.md` listing required env vars.

2. Run a real smoke test from sandbox:
   ```bash
   TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
   QUERIES="https://queries-test.envia.com"

   # Find an ecommerce order to use as test target
   curl -s "$QUERIES/v4/orders?limit=5&status_payment=paid" \
     -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -80
   ```
   Identify a shop_id + order_identifier from the response, then try a real
   `/tmp-fulfillment` call with a fake tracking number:
   ```bash
   curl -s -X POST "$QUERIES/tmp-fulfillment/{SHOP_ID}/{ORDER_ID}" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://ecart-api-test.ecartapi.com/api/v2/orders/{ORDER_ID}/fulfillments","fulfillment":{"tracking":{"number":"TEST-MCP-001","company":"dhl","url":"https://envia.com/tracking?label=TEST-MCP-001"},"shippingMethod":"","shippingDate":"2026-04-17","items":[]},"type_generate":"mcp_generate"}'
   ```
   Document the actual response shape in a comment at the top of
   `src/services/ecommerce-sync.ts`.

3. If the smoke test reveals issues, fix them before proceeding to Goal 2.

**Exit criteria:** confirmed the sync either works or failure modes are
documented. Deploy checklist in place.

### Goal 2 — Implement 6 READ_SAFE tools (core of Sprint 2)

All 6 tools are GET/read-only, no state change, zero financial risk. They
answer the most common user payment/balance questions.

#### Sub-goal 2a — ecart-payment auth verification (BLOCKER, do first)

ecart-payment has its own JWT issuance that **may or may not** match the
Envia portal JWT. Before implementing any tool, verify with curl:

```bash
# Goal: confirm that the Envia portal JWT is accepted by ecart-payment.
# If not, STOP and defer this sprint's ecart-payment portion —
# requires coordination with the ecart-payment team.
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
ECART_PAY="https://ecart-pay-api.envia.com"   # prod; staging URL TBD

curl -s "$ECART_PAY/api/accounts/me" \
  -H "Authorization: Bearer $TOKEN" \
  -o /tmp/ecartpay-me.json -w "HTTP %{http_code}\n"
cat /tmp/ecartpay-me.json
```

If HTTP 200 with account data → proceed. If 401/403 → defer and document
in a new `_docs/SPRINT_2_BLOCKERS.md`, then skip to Sub-goal 2b (queue).

#### Sub-goal 2b — queue service auth verification

```bash
# Goal: confirm that POST /check accepts the Envia portal JWT.
TOKEN="..."
QUEUE="https://envia-tms-api-test.envia.com"  # verify actual hostname

curl -s -X POST "$QUEUE/check" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":10}' \
  -o /tmp/queue-check.json -w "HTTP %{http_code}\n"
cat /tmp/queue-check.json
```

If the JWT is not accepted, document and defer. Otherwise proceed.

#### Sub-goal 2c — implementation

Assuming auth verification passes, implement the tools using the same
pattern as `src/tools/account/get-balance-info.ts` (reference example).

**ecart-payment tools (5):**

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `envia_get_refund_status` | `GET /api/refunds?transaction_id={id}` | "¿cuándo me llega el reembolso?" |
| `envia_get_withdrawal_status` | `GET /api/withdrawals/{id}` | "¿cuándo llega mi remesa COD?" |
| `envia_get_transaction_history` | `GET /api/transactions?date_from,date_to,status` | "¿qué pasó con ese cobro?" |
| `envia_get_ecartpay_balance` | `GET /api/transactions/summary` | "¿cuál es mi saldo EcartPay?" |
| `envia_list_invoices` | `GET /api/invoices?status?` | "¿tengo facturas pendientes?" |

**queue tool (1):**

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `envia_check_balance` | `POST /check` with `{amount}` | "¿tengo saldo suficiente para enviar?" |

**Architecture:**

- New type files:
  - `src/types/ecart-payment.ts` — interfaces for the 5 ecart-payment responses
  - `src/types/queue.ts` — `BalanceCheckResponse`
- New services:
  - `src/services/ecart-payment.ts` — HTTP calls + formatters
  - `src/services/queue.ts` — HTTP calls + formatters
- New tools:
  - `src/tools/payments/` — folder with 5 tools + `index.ts`
  - `src/tools/queue/` — folder with 1 tool + `index.ts`
- Config additions in `src/config.ts`:
  - `ENVIA_ECART_PAY_HOSTNAME` — default `https://ecart-pay-api.envia.com`
  - `ENVIA_QUEUE_HOSTNAME` — default `https://envia-tms-api.envia.com`
- Allowlist additions in `src/utils/api-client.ts`:
  - `ecart-pay-api.envia.com`, `envia-tms-api.envia.com` (and `-test`)
- Register each tool in `src/index.ts`

**Tests:**

- Service unit tests (HTTP mocks, success/error paths, formatter edge cases)
- Tool handler tests (body builders, happy path, mapped error path, graceful
  degradation where applicable)
- Follow the AAA pattern + one logical assertion per test + no control flow
- Use the `defaultMockResponse(url)` pattern from
  `tests/tools/addresses/create-address.test.ts` when the tool makes
  multiple HTTP calls

**Exit criteria:** 6 tools registered, ~30–50 new tests, build clean,
full suite green, `MASTER_SUMMARY.md` in `_docs/backend-reality-check/`
updated with "IMPLEMENTED" status for these tools.

### Goal 3 — Code quality (optional, only if time remains)

From the structural audit (`_docs/AUDIT_2026_04_16.md`), low-priority but
useful:

1. **Migrate 6 tools with raw response pattern to `textResponse()`**
   Find them with:
   ```bash
   grep -rn "{ content: \[{ type:" src/tools/ --include="*.ts"
   ```
   Each tool: replace with `textResponse(...)`, update tests. Add an
   ESLint `no-restricted-syntax` rule to block the raw pattern in
   `eslint.config.js` (or equivalent).

2. **Tool registry pattern (preparation)** — not required for this sprint,
   but if there's time, sketch an auto-registration helper in
   `src/registry.ts` that each barrel calls. Don't wire it up yet; just
   prove the shape.

## Required reading (do first, in this order)

1. This file.
2. `ai-agent/envia-mcp-server/MCP_REMAINING_PHASES_GUIDE.md` — current plan.
3. `ai-agent/envia-mcp-server/CLAUDE.md` — coding conventions.
4. `ai-agent/envia-mcp-server/_docs/backend-reality-check/ecart-payment-findings.md`
   — endpoint table + auth notes + risk classification.
5. `ai-agent/envia-mcp-server/_docs/backend-reality-check/queue-findings.md`
   — balance check + refund endpoints.
6. `ai-agent/envia-mcp-server/src/services/user-info.ts` — reference pattern
   for a service that shares a client across multiple tools.
7. `ai-agent/envia-mcp-server/src/tools/account/get-balance-info.ts` —
   reference pattern for a balance-related tool.
8. `ai-agent/envia-mcp-server/src/services/ecommerce-sync.ts` — reference
   pattern for graceful-degradation HTTP calls (Sprint 1 delivery).

## Conventions (from `ai-agent/envia-mcp-server/CLAUDE.md`)

- Single quotes, 4 spaces, semicolons, 130 width.
- kebab-case files, camelCase functions, PascalCase types.
- JSDoc on every function and interface.
- English in all code, comments, and docs.
- Vitest 3.x, AAA pattern, one logical assertion per test.
- No control flow in tests (no `if`/`for`/`try`).
- Graceful degradation for backend failures (return `ok: false`, don't throw).
- `textResponse(...)` from `src/utils/mcp-response.ts` for all tool responses.
- `mapCarrierError(code, message)` for all backend errors.
- `resolveClient(client, args.api_key, config)` for per-request auth.
- DO NOT introduce new `any` types. If you need escape-hatch typing, use
  a narrowly-scoped `unknown` with a type guard.

## Sandbox / staging credentials

```
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
QUERIES="https://queries-test.envia.com"
CARRIERS="https://api-test.envia.com"
GEOCODES="https://geocodes.envia.com"          # production only — no sandbox
ECART_PAY_HOSTNAME="TBD — verify with Jose if sandbox exists"
QUEUE_HOSTNAME="TBD — same question"
```

If ecart-payment or queue has no sandbox, curl against production read-only
endpoints ONLY (no mutations, no writes). Document findings; don't guess.

## How to work

1. Open the working dir: `cd ai-agent/envia-mcp-server`
2. Confirm baseline: `npm run build && npx vitest run` — must be green.
3. Goal 1 first. If any blockers surface, stop and surface them.
4. Goal 2a (auth verify) before Goal 2c (implementation). If auth fails,
   defer the affected tool and move on.
5. After each implementation:
   a. Run build after each file touched.
   b. Run affected tests after each file.
   c. Run full suite at the end of each sub-goal.
6. When all goals complete:
   a. Update `memory/project_mcp_expansion_plan.md`.
   b. Update `MCP_REMAINING_PHASES_GUIDE.md` with Sprint 2 status.
   c. Stage changes, show `git status --short`, propose commit message,
      **wait for Jose's explicit approval before committing**.

## Exit criteria for Sprint 2

- Goal 1: smoke test done, deploy checklist documented.
- Goal 2: 6 new tools (or fewer if auth blocked), registered, with tests,
  all green.
- Total tool count: 71 → 77 (or up to 76 if one tool deferred).
- Build clean. Full suite green (target ≥ 1400 tests).
- If auth blocks any tool, clear blocker doc in `_docs/SPRINT_2_BLOCKERS.md`.

## Notes from Sprint 1 that matter here

- `ENVIA_ECART_HOSTNAME` (ecartAPI — order fulfillment) is DIFFERENT from
  `ENVIA_ECART_PAY_HOSTNAME` (ecart-payment — payments/balance). Don't
  confuse them.
- The Sprint 1 Session B findings live in
  `ai-agent/envia-mcp-server/_docs/backend-reality-check/` (MCP repo), NOT
  in the monorepo root `_docs/backend-reality-check/` (which has Session A).
  Both are git-tracked in their respective repos.
- Build tools with `textResponse()` ALWAYS — never raw `{ content: [...] }`.
- `mockImplementation((url) => ...)` pattern (not `mockResolvedValue`) when
  a tool makes multiple HTTP calls with different expected responses.
- `ai-agent/envia-mcp-server/CLAUDE.md` forbids `try/catch` in tests. Use
  `await expect(...).rejects.toThrow(...)` for error-path assertions.

## What NOT to do in Sprint 2

- Do NOT implement Phase-2 mutation tools (`envia_create_payment_link`,
  `envia_request_refund`, `envia_request_withdrawal`) — these need user
  confirmation flows and auth coordination. Keep as notes for Sprint 3.
- Do NOT add tools for chargebacks, disputes, or async fire-and-forget
  operations from the queue service — they have no job-status endpoint
  to confirm completion.
- Do NOT re-enable any tool dropped in Sprint 0 (webhook CRUD, checkout
  rules CRUD, track_authenticated, whatsapp_cod toggle).
- Do NOT push commits to remote. Jose reviews and pushes manually.
- Do NOT skip the auth-verification step. Two endpoints in the scope have
  known auth-scope ambiguity; guessing would waste a full implementation.

## Sprint 3 preview (for context only, do NOT implement)

After Sprint 2, the natural next chunks are:

1. Phase-2 financial mutation tools (with confirmation guardrails).
2. Secondary-carrier warnings in error messages — use the
   `_docs/backend-reality-check/secondary-carriers-findings.md` data to
   expand `src/utils/error-mapper.ts` with J&T, Fletes, 99 Minutos, etc.
3. Typed-payload refactor (kill the ~111 `Record<string, unknown>` usages).
4. Tool registry pattern rollout.

Good luck. Jose (jose.vidrio@envia.com) is the decision-maker on scope,
auth conflicts, and deploy gates. Surface blockers fast.
