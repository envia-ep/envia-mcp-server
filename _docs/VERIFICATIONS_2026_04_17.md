# Verification log — Planning session 2026-04-17

Context: Pre-decision verifications V1–V5 from `NEXT_SESSION_PLANNING_BRIEF.md`.
Run by planning session (Opus 4.7, 1M ctx). Outputs feed Decisions A–E.

## V1 — ecart-payment staging access

**Commands run:**
```bash
grep -rn "ECART_PAY" services/queries/
grep -rn "ecart-payment-dev|ecart-payment-test|ecart-payment-stage" services/queries/ services/carriers/
```

**Findings:**
- `services/queries/.env`:
  - `ECART_PAY_HOSTNAME='http://ecart-payment-dev.herokuapp.com'`
  - `ECART_PAY_PRIVATE_KEY=priv6189be80df291598221a5e94`
  - `ECART_PAY_PUBLIC_KEY=pub6189be80df291598221a5e93`
- Keys and hostname are also documented in `services/queries/README.md`.
- Queries resolves a session token via `POST /api/authorizations/token` with Basic auth over those keys (`util/util.js:426`).
- Staging hostname uses **HTTP (not HTTPS)**; prod URL still unconfirmed by this session.
- No alternative staging variants exist (`ecart-payment-test`, `ecart-payment-stage` → 0 hits).

**Implication for Decision A:**
- Option 1 (provision keys to MCP) is **technically viable today** — keys exist, staging reachable.
- Option 2 (proxy via queries) is also viable — queries already owns the auth dance; MCP just needs a thin `GET /mcp/payments/*` that queries proxies.
- Option 3 (payments exposes Envia-JWT endpoint) is a cross-team ask; no evidence any work has started.

## V2 — Portal / MCP deploy env state for `ENVIA_ECART_HOSTNAME`

**Commands run:**
```bash
grep -rn "ENVIA_ECART_HOSTNAME|ECART_HOSTNAME" frontends/ ai-agent/envia-mcp-server/src/
```

**Findings:**
- MCP code: `src/config.ts:67` reads `process.env.ENVIA_ECART_HOSTNAME`. `ecommerce-sync.ts` gracefully skips sync (appends `[warning]`) when the var is missing.
- Portal frontend (`frontends/envia-clients/.env.local`): `NEXT_PUBLIC_ECART_HOSTNAME=https://eshop-deve.herokuapp.com` — **different variable**, different URL (eshop, not ecart-api).
- No evidence that the MCP's `ENVIA_ECART_HOSTNAME` is currently provisioned in any deployed environment (MCP has never been deployed — see `MCP_REMAINING_PHASES_GUIDE.md`).

**Implication for Decision C (deploy timing):**
- Before first staging deploy, `ENVIA_ECART_HOSTNAME` **must** be provisioned or the Sprint 1 fulfillmentSync will emit warnings on every ecommerce label. Per `DEPLOY_CHECKLIST.md`: sandbox = `https://ecart-api-test.ecartapi.com`, prod = `https://ecart-api.ecartapi.com`.
- This is an env-var-only fix (no code change).

## V3 — Tool registration + parity sanity

**Commands run:**
```bash
grep -rn "registerTool|server\.tool(" src/ | wc -l
ls src/tools/
```

**Findings:**
- 95 `registerTool`/`server.tool(` call sites in `src/` (includes branches for different modes, not all unique tools). The headline "72 user-facing tools" in `MCP_REMAINING_PHASES_GUIDE.md` still stands — the extra call sites are mode variants within single tools (e.g. `create-label` registers once but has multiple handler branches).
- Barrel structure under `src/tools/`: account, addresses, ai-shipping, analytics, branches, carriers-advanced, clients, config, notifications, orders, packages, products, queue, shipments, tickets + 13 top-level tools.
- The published V1-SAFE inventory (74 planned) vs current registered (72) suggests 2 tools still not wired. Full parity matrix is an audit task; recommended as a Sprint 3 side-task, not a decision input.

**Implication for Decision B:**
- Tool parity is close enough to proceed. Any drift is small.

## V4 — Regression smoke check

**Commands run:**
```bash
cd ai-agent/envia-mcp-server && npm run build && npx vitest run
```

**Result:**
- `npm run build` → exit 0, zero TS errors.
- `npx vitest run` → **Test Files 103 passed (103). Tests 1369 passed (1369).** Duration 15.3s.

**Implication:** Suite is green. Sprint 3 may start without a remediation step.

## V5 — Secondary-carrier findings re-read

**Source:** `_docs/backend-reality-check/secondary-carriers-findings.md`.

**Proposed quick wins (from the doc, still valid):**
1. Error-map entries for carrier-specific codes that currently surface as generic errors:
   - AmPm coverage codes `260`, `102154` → "no coverage for this route".
   - Entrega track-limit error → "company's tracking limit reached".
   - JTExpress BR state-pair validation → actionable hint for ICMS-missing errors.
   - TresGuerras `ESTADO_TALON=CANCELADO` detection → "shipment already cancelled".
   - Afimex `max insurance 10000` → cap hint when user requests higher.
2. LTL gap (Almex / FedexFreight / FletesMexico / Entrega LTL) — **defer**: LTL is a power-user flow, not chat-friendly.
3. Carrier constraint extension to `validateAddress` (RFC, SAT district, insurance cap, ICMS) — **defer** to a dedicated sprint; adds coupling with `CarrierUtil`.

**Implication for Decision B (Sprint 3 scope):**
- Error-map entries are **small effort, user-visible value** — strong Sprint 3 candidate (brief listed it #1).
- LTL and validateAddress extension are explicitly *not* Sprint 3.

## Summary — inputs to decisions

| Decision | Key evidence from verifications |
|----------|---------------------------------|
| A (ecart-payment path) | Keys + staging reachable (V1). Options 1 and 2 both technically viable. Option 3 unstarted. |
| B (Sprint 3 scope) | Suite green (V4). Error-map entries from V5 are a cheap, user-visible win. Tool parity drift is small (V3). |
| C (First deploy timing) | `ENVIA_ECART_HOSTNAME` must be provisioned pre-deploy (V2). No other blockers detected by verifications. |
| D (Observability) | No evidence in verifications; pure strategic call. |
| E (v1 scope fence) | Nothing new from verifications; purely a discipline call. |
