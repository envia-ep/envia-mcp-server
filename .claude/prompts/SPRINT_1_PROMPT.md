# Sprint 1 — Close the functional loop

> **Self-contained prompt.** Contains everything needed to execute Sprint 1
> without reading prior sessions. Still, skim the files under "Required
> reading" before starting.

## Context

`envia-mcp-server` is a scoped MCP server embedded inside the Envia portal.
It exposes tools that an AI agent in the portal uses to answer user
questions conversationally — cotizar, crear guía, tracking, cancelar,
recolecciones, tickets, órdenes ecommerce, info de empresa/saldo/salesman,
analytics, etc.

**Scope criterion:** include a tool only if a typical portal user would ask
for it in chat. Admin / dev / onboarding tasks stay out.

**Current state (post Sprint 0, committed locally on `main` as `616cd60`):**
- 71 user-facing tools + 4 internal helpers
- 1318 tests passing, 97 test files, TypeScript build clean
- Working tree clean

## Sprint 1 objectives (in priority order)

### Goal 1 — `fulfillmentSync` helper (HIGHEST PRIORITY)

Problem to fix: when the agent creates a label from an ecommerce order via
`envia_create_label` with an `order_identifier`, the carriers service
creates the label correctly BUT the ecommerce platform (Shopify/WooCommerce/
Tiendanube/etc.) is not notified. Today that sync happens because
`carriers` service makes a direct POST to `ecommerce`. When the MCP is the
caller, the sync is skipped — the order stays "unfulfilled" in Shopify
even though a label exists.

**Fix:** add a silent side-effect after successful `create_label` calls
that include `order_identifier`. Do **not** expose as a separate tool —
users shouldn't have to ask for it manually.

**Endpoint to call:**
```
POST {queriesBase}/order/fulfillment/{shop_id}/{order_identifier}
```

Wait — that's the URL pattern `carriers` uses today. Before implementing,
**verify the exact endpoint and payload shape** by reading:
- `services/ecommerce/processors/fulfill_order.process.js` (lines 69-471)
- `services/carriers/app/ep/actions/Generate.php` (search for
  `order/fulfillment`)
- Run a curl against sandbox with a real order_identifier to confirm

Expected payload fields (to verify):
- `fulfillment.tracking.number` — tracking number from create_label
- `fulfillment.tracking.companyId` — carrier ID or name
- `fulfillment.tracking.url` — tracking URL
- `items` or `fulfillmentOrderId` or `packageIdentifier` (varies per platform)
- `notifyCustomer: true`

Implementation plan:
1. Create `src/services/ecommerce-sync.ts` with:
   - `syncFulfillment(args, client, config): Promise<{ok: boolean; error?: string}>`
   - Pure function — no thrown errors, graceful degradation
   - Full JSDoc explaining the side-effect contract
2. Integrate into `src/tools/create-label.ts`:
   - After a successful label creation, if `args.order_identifier` is truthy,
     call `syncFulfillment`
   - If sync fails, append a warning to the response text
     ("⚠️ Label created but fulfillment sync to <platform> failed: <reason>")
   - NEVER fail the overall tool because of sync — the label is real
3. Tests:
   - Unit tests in `tests/services/ecommerce-sync.test.ts`
     (AAA pattern, factory-based, mock fetch)
   - Integration in `tests/tools/create-label.test.ts`:
     * Sync called when order_identifier present + label created successfully
     * Sync NOT called when order_identifier absent
     * Sync NOT called when label creation fails
     * Warning appended to response text when sync fails

**Exit criteria:** agent-generated labels for ecommerce orders appear as
shipped in the source platform. All new tests green. Existing tests still
green.

### Goal 2 — Backend Reality Check Session B

5 services were not analyzed in Session A. Run parallel `Explore` agents
(≤5 concurrent) and write findings to
`_docs/backend-reality-check/<service>-findings.md`:

1. **tms-admin** (CRITICAL — money flows)
   - Endpoints for balance, charges, refunds, COD processing, chargebacks
   - How the agent could answer "¿cuándo me llega el reembolso?"
   - Any user-facing data worth exposing as tools

2. **ecart-payment** (COD + payment links)
   - COD remittance flows
   - Payment link creation (shareable by WhatsApp)
   - Invoice generation
   - Which endpoints a portal user would call conversationally

3. **sockets** (real-time tracking)
   - WebSocket event shapes
   - If/how MCP should expose a "subscribe to tracking updates" pattern
     (probably defer — WebSocket doesn't fit MCP request/response, but
     document what's possible)

4. **queue** (async jobs)
   - Which Bull queue jobs are user-visible
   - Whether the agent should report queued work status

5. **Secondary carriers** (10 adapters, depth dive)
   - tresGuerras, Almex, FedEx Freight, Sendex, Afimex, AmPm, J&T Express,
     Entrega, 99 Minutos, Fletes Mexico
   - Same template as Session A's `carriers-top5-findings.md`:
     rate/generate/cancel/track/pickup specifics, address constraints,
     service codes, custom keys, known limitations, hidden rules

**Deliverables:**
- 5 findings docs in `_docs/backend-reality-check/`
- Update `_docs/backend-reality-check/MASTER_SUMMARY.md` with the new data
- Propose new tools/helpers using the V1-safe classification from
  `_docs/V1_SAFE_TOOL_INVENTORY.md`

**Do NOT implement new tools yet** — only analyze and propose. Tool
decisions get made after Jose reviews the findings.

### Goal 3 — Fill test gaps for 4 tools (pre-existing debt)

Sprint 0 added `validateAddressForCountry` to these 4 tools that never
had test files:
- `src/tools/addresses/update-address.ts`
- `src/tools/clients/create-client.ts`
- `src/tools/clients/update-client.ts`
- `src/tools/orders/update-order-address.ts`

For each, create a test file following the pattern in
`tests/tools/addresses/create-address.test.ts`. Include at minimum:

1. **Smoke test** — tool is registered, routes to the correct HTTP
   method/URL, sends the expected body shape.
2. **Validation fires** — when `country` is present in the input, the tool
   makes a GET to `/generic-form?country_code=...` before the mutation.
3. **Graceful degradation** — when the form fetch fails, the mutation
   still proceeds (validation returns ok=true on empty form).
4. **Error path** — when the mutation API returns an error, the tool
   returns a mapped error message.

Use the `defaultMockResponse(url)` pattern from `create-address.test.ts`
(routes generic-form lookups to empty data, mutations to the expected
response) to keep tests DAMP.

## Required reading (in this order)

1. `ai-agent/envia-mcp-server/MCP_REMAINING_PHASES_GUIDE.md` — sprint plan
2. `memory/project_mcp_expansion_plan.md` — current project state
3. `ai-agent/envia-mcp-server/CLAUDE.md` — coding conventions
4. `_docs/backend-reality-check/MASTER_SUMMARY.md` — Session A findings
5. `ai-agent/envia-mcp-server/_docs/V1_SAFE_TOOL_INVENTORY.md` — tool
   classification framework
6. `src/services/user-info.ts` and `src/services/geocodes-helpers.ts` —
   reference patterns for new service files (Sprint 0 additions)
7. `src/tools/account/get-company-info.ts` — reference pattern for a tool
   that wraps an internal helper (Sprint 0 addition)

## Conventions (from `ai-agent/envia-mcp-server/CLAUDE.md`)

- Single quotes, 4 spaces, semicolons, 130 width
- kebab-case files, camelCase functions, PascalCase types
- JSDoc on every function and interface
- English in all code, comments, and docs
- Vitest 3.x, AAA pattern, one logical assertion per test
- No control flow in tests (no `if`/`for`/`try`)
- Graceful degradation for backend failures (return empty / ok=false, don't throw)
- SSRF allowlist in `EnviaApiClient` covers all internal hostnames
- `textResponse(...)` from `src/utils/mcp-response.ts` for all tool responses
- `mapCarrierError(code, message)` from `src/utils/error-mapper.ts` for all errors
- `resolveClient(client, args.api_key, config)` to get the per-request client

## Sandbox credentials (for verification curls)

```
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
QUERIES="https://queries-test.envia.com"
CARRIERS="https://api-test.envia.com"
GEOCODES="https://geocodes.envia.com"   # production only — no sandbox
```

## How to work

1. Open the working dir: `cd ai-agent/envia-mcp-server`
2. Run `npm run build` and `npx vitest run` at start to confirm green baseline
3. For each goal:
   a. Verify API contracts with curl before implementing
   b. Follow the existing service → tool → test pattern
   c. Run `npm run build` after each file change
   d. Run affected tests after each change, suite at the end of each goal
4. When all goals complete:
   a. Update `memory/project_mcp_expansion_plan.md` with new state
   b. Update `MCP_REMAINING_PHASES_GUIDE.md`
   c. Stage changes, show `git status --short` to the user, propose a
      commit message, **wait for explicit approval before committing**

## Exit criteria for Sprint 1

- Goal 1: all new fulfillmentSync tests green + create-label tests updated
- Goal 2: 5 findings files in `_docs/backend-reality-check/` + master summary updated
- Goal 3: 4 new test files, ≥3 tests each, all green
- Build clean, full suite green
- No net decrease in user-facing tool count
- Working tree clean, changes staged but NOT committed (user commits)

## Notes from Sprint 0 that matter here

- `ecommerce-sync.ts` will use `config.queriesBase` as the base URL (queries
  service hosts the `/order/fulfillment/...` endpoint, not carriers).
- The `EnviaApiClient.post` method already handles SSRF, retries, timeouts,
  and auth headers — don't duplicate.
- `textResponse` ALWAYS. Never return raw `{ content: [...] }`.
- `mockImplementation((url) => ...)` pattern (not `mockResolvedValue`) is
  preferred when a test has multiple HTTP calls with different expected
  responses, to avoid brittle call-order assumptions.

## What NOT to do in Sprint 1

- Do NOT add HTTP auth layer, Dockerfile, or observability — out of scope
  for portal-embedded agent
- Do NOT re-enable the webhook CRUD or checkout-rule CRUD tools
- Do NOT expose `locate-city` or `create-commercial-invoice` as tools
  again — they are internal helpers
- Do NOT introduce `envia_toggle_whatsapp_cod` — explicitly dropped in
  Sprint 0 after user review
- Do NOT expose new tools from Session B analysis in this sprint — propose
  them, wait for review

Good luck. Jose (jose.vidrio@envia.com) is the decision-maker on scope
questions. When in doubt, ask.
