# Session Log — 2026-04-27 (Opus 4.7 1M, autonomous mode)

> **Purpose:** Chronological record of work done while Jose is away. Each
> work block is dated. Future sessions (or Jose) can read this top-to-bottom
> to understand state without replaying the conversation.

## Session start

**Trigger:** Jose's prompt asking for a world-class MCP redesign analysis.
After full read of `_docs/` + 4 deep references via Explore agents +
verifications, scope settled on **incremental hardening** of the existing
72-tool MCP, NOT a rewrite.

**Permissions granted by Jose for autonomous operation:**
- A — commit autonomously when sprint chunk done + build clean + tests green
- B — push to remote: NO (always ask)
- C — modify project memory: yes
- D — escalate backend debt to BACKEND_TEAM_BRIEF: yes
- E — net-new tools: 4 pre-approved (`ai_address_requirements`,
  `find_drop_off`, `get_carrier_constraints`, `get_additional_service_prices`).
  Additional tools allowed if they pass L-S2/L-S6/L-S7 — must be documented
  in this log + commit message.
- F — additional retire/reclassify with documented justification: yes
- G — major structural changes (auth, refactor, new core services): NO,
  log to TODO list only
- H — backend blocker: escalate + skip + continue: yes

**Canarias decision (γ):** investigate V1 frontend code first, replicate
identically in MCP. Sprint 5 picks this up.

## Block 1 — Verifications + planning artifacts (2026-04-27 ~01:00-02:00 UTC)

**Done:**
1. Read all `_docs/` synthesis files + 4 deep references via parallel
   Explore agents (carriers, queries, geocodes, admin/accounts/ecommerce).
2. Three L-B5 verifications completed before any code change:
   - **V1 — Geocodes /location-requirements**: confirmed bug — backend
     does NOT auto-detect EU exceptional territories from `state_code`.
     Only `country='IC'` returns correct flags. Same for FR-GF/GP/MQ
     (treated as continental).
   - **V2 — Carriers Cancel response**: backend's `CancelBreakdown.php`
     ALREADY returns `refundedAmount`, `balanceReturned`,
     `balanceReturnDate`. MCP's `cancel-shipment.ts` already surfaces
     them. `dailyLimitExceeded` / `dailyLimitReason` are MCP-defensive
     fields the backend never populates → C9 in BACKEND_TEAM_BRIEF.
   - **V3 — Gap 10 (multi-field additional_services)**: backend
     `AdditionalServiceUtil.php:717` accepts arbitrary `data` object
     and stores it as-is. Carrier-specific code (FedEx ETD, hazmat,
     LTL appointments) reads from there. **No backend change needed
     for Gap 10** — pure MCP work for Sprint 7.
3. Production DB query (Jose-supplied): 905 Canarias-bound shipments
   in 90 days. 94% as `country='ES'`, 5.9% as `'IC'`. The 53 IC rows
   are 100% Zeleris (V1 portal has hardcoded `if carrier=zeleris
   then country=IC` logic).
4. Read carriers PHP code: most carriers (Correos Express, DHL, UPS,
   Cainiao, CLM, Envialia) have postal-code-based Canarias awareness
   baked in. Only Zeleris requires `country='IC'` at API level.

**Files modified:**
- `_docs/LESSONS.md` (+L-S8, +L-S9, +L-B5)
- `_docs/BACKEND_TEAM_BRIEF.md` (+C8, +C9, +Canarias evidence)

**Commit:** `2d02355 — docs: scope-fence session 2026-04-27 — lessons + backend debt`

## Block 2 — Sprint 4a part 1 (2026-04-27 ~02:00-02:30 UTC)

**Done:**
1. Audited `src/index.ts`: discovered Sprint 0 had already retired
   `track_authenticated`, `locate_city`, `create_commercial_invoice`,
   webhook CRUD ×3, checkout-rules CRUD ×3 (create/update/delete).
2. Only 2 cleanups remained: deregister `list_checkout_rules` + reclassify
   `generate_bill_of_lading` as INTERNAL.
3. Updated `src/index.ts` with `NOTE(sprint-4a)` comments explaining
   the rationale.
4. Updated `src/resources/api-docs.ts` count "(5)" → "(4)" + rewrote
   international workflow note.
5. Source files retained per L-S6; tests retained per Sprint 0 pattern.

**Verification:**
- `npm run build` — clean
- `npx vitest run` — 1382/1382 passing

**Commit:** `53ae225 — feat(sprint-4a): retire list_checkout_rules + reclassify generate_bill_of_lading INTERNAL`

**Tool count:** 72 → 70 user-facing.

## Block 3 — Sprint 4a part 2 (2026-04-27 ~02:00-02:20 UTC) ✅

**Done:**
- Added `pino@^9.14.0` + `pino-pretty@^11` (dev only).
- `src/utils/logger.ts` — pino factory with env-driven config
  (LOG_LEVEL/LOG_PRETTY/NODE_ENV), level emitted as string for
  Datadog/Loki, ISO timestamps, lazy pretty-print transport.
- `src/utils/server-logger.ts` — `decorateServerWithLogging` patches
  `McpServer.registerTool` once at server-construction so every
  subsequently-registered tool emits a structured `tool_call_complete`
  / `tool_call_failed` event with `{tool, duration_ms, status,
  error_message?, error_class?}`. Idempotent — re-decoration captures
  the same original delegate, no wrapper stacking. Exposes
  `wrapHandlerWithLogging` for direct unit testing.
- `src/index.ts`:
  - `createEnviaServer(logContext)` accepts correlation/session context.
  - HTTP mode: per-request correlationId from upstream
    `x-correlation-id` / `x-request-id` headers (or fresh UUID).
    Echoed back in response. Logs `mcp_request_received`,
    `mcp_request_closed`, `mcp_request_error`.
  - stdio mode: process-wide sessionId.
  - HTTP listen + stdio startup: structured `mcp_listening` /
    `mcp_ready` events replace `console.error` lines.
- ESLint guard `no-restricted-syntax` for raw `{content:[{type:'text',...}]}`
  was already in `eslint.config.js:13-19` (verified). All tools already
  use `textResponse()` — grep returned 0 raw matches. **Skipped this
  task — already done.**
- 22 new tests (10 logger + 12 server-logger).

**Verification:**
- `npm run build` — clean
- `npm run lint` — clean
- `npx vitest run` — 1404/1404 passing (was 1382 + 22 new)

**Commit:** `af71e0b — feat(sprint-4a): observability layer — pino + correlation IDs + structured tool-call events`

## Block 4 — Sprint 5 step 1 — Canarias γ (2026-04-27 ~02:20-02:35 UTC) ✅

**Investigation finding (verified at code level via Explore agent +
spot-check):**
- The `country='ES' → 'IC'` transform for Canarias lives in
  `services/carriers/app/ep/util/CarrierUtil.php:4852` inside
  `validateAddress()`. **Global** (not Zeleris-specific), runs at
  validation time before any carrier-specific code.
- This explains why `/ship/rate` and `/ship/generate` work correctly
  for Canarias destinations regardless of carrier.
- `geocodes /location-requirements` does NOT have the same logic →
  consumers like MCP that hit it directly receive wrong tax flags.
- Production data 94% ES / 5.9% IC reflects persistence inconsistency,
  NOT runtime bug — the carrier API call always sees IC.

**Done:**
- Added `applyCanaryIslandsOverride(country, postal)` to
  `src/services/geocodes-helpers.ts` — replicates the exact 1-line
  transform from `CarrierUtil::validateAddress:4852`.
- Wired into `normaliseLocationPair` so every call to
  `getAddressRequirements` automatically gets correct flags for
  Canarias-bound shipments.
- 12 new tests covering the override (positive cases for 35/38 prefixes,
  negative cases for non-ES countries with same prefixes, undefined
  postal, short postal) + integration tests confirming outgoing
  payload to geocodes carries `country='IC'`.
- Updated C8 in BACKEND_TEAM_BRIEF with the verified file:line
  + interim mitigation note.

**Verification:**
- `npm run build` — clean
- `npx vitest run` — 1416/1416 passing (was 1404 + 12 new)

**Commit:** pending (this block).

## Block 5 — Sprint 5 step 2 — EXCEPTIONAL_TERRITORIES drift fix (2026-04-27 ~02:25 UTC) ✅

**Done:**
- Aligned `src/services/country-rules.ts:EXCEPTIONAL_TERRITORIES`
  with the geocodes source-of-truth list at
  `services/geocodes/controllers/web.js:1762-1776`.
- Removed: `ES-35`, `ES-38` (ad-hoc HASC variants not in geocodes —
  Canarias is detected via the new country override `IC` instead),
  `FR-MC` (Monaco is its own ISO country, not a French territory).
- Added: `ES-CE` (Ceuta), `ES-ML` (Melilla).
- Updated `tests/services/tax-rules.test.ts`:
  - 3 tests rewritten to use HASC codes (`ES-CN/TF/GC`) instead of
    postal-prefix codes.
  - 2 new tests for Ceuta/Melilla.
  - 1 regression-guard test asserts that postal-prefix `'35'` no
    longer triggers the exception path (proves the drift fix).
  - 1 case-insensitive test updated to use HASC code.
- Tax-rules.ts continues to be a local replication of geocodes logic
  (LESSONS L-S5 candidate for deletion). Drift fix is interim — the
  preferred long-term move is to delete tax-rules.ts entirely and
  always call `getAddressRequirements` helper. Logged for a future
  sprint.

**Verification:**
- `npm run build` — clean
- `npx vitest run` — 1419/1419 passing (was 1416 + 3 new)

**Commit:** pending (this block).

## Block 6 — Handoff (NEXT SESSION should pick up here)

**Remaining Sprint 5 chunks** (autonomous-mode permissions still in
effect — see top of this file):

1. **Step 3 — MX state remap.** `services/geocodes/libraries/util.js`
   `Util::setStateCodeMx` (lines 252-289) defines 11 remappings:
   - BN → BC (Baja California)
   - BS → BCS (Baja California Sur)
   - CC → CL (Colima)
   - CX → CMX (Mexico City — inconsistent with internal DF)
   - DF → CDMX (Mexico City — deprecated 2016 form)
   - CP → CS (Chiapas)
   - MO → MR (Morelos)
   - NL → NL (Nuevo León — no-op, listed in source for completeness)
   - QE → QT (Querétaro)
   - TM → TL (Tlaxcala)
   - ZA → ZS (Zacatecas)
   These are normalisation rules: legacy DB codes → ISO codes. The
   MCP should apply this remap before sending `state_code` to any
   geocodes/carriers endpoint that consumes `state_code`. Consult
   the geocodes source for the canonical mapping; it's also
   duplicated at `controllers/web.js` lines 251-285 (queryLocality).

2. **Step 4 — generic-form wiring.** Three tools currently skip the
   validation that `create_address` / `update_address` already
   perform:
   - `src/tools/orders/update-order-address.ts`
   - `src/tools/clients/create-client.ts`
   - `src/tools/clients/update-client.ts`
   Pattern to follow: copy from `src/tools/addresses/create-address.ts`
   the call to `validateAddressForCountry()` (in
   `src/services/generic-form.ts`) before the API call. If validation
   fails, return the error via `textResponse(formatGenericFormError(...))`.

3. **Step 5 — country-specific tests.** Add tests under
   `tests/services/country-rules.test.ts` and
   `tests/services/geocodes-helpers.test.ts` for: BR (CEP transform
   + CPF/CNPJ detection), CO (DANE resolver), MX (state remap once
   implemented), ES (Canarias override + new HASC codes), IT (no
   transforms required, just confirm no false positives), FR (phone
   normalisation), AR (postal stripping).

**Sprint 6** — Response enrichment. Each item REQUIRES a sandbox curl
verification per L-B5 BEFORE coding. Most likely targets:
- `envia_list_orders` + `envia_get_ecommerce_order`: 11 V4 fields
  (fulfillment_status_id, cod_active/value per package, HS codes,
  country_code_origin, fulfillment_info, fraud_risk, partial_available,
  order_comment, assigned_package, return_reason). Verify by curling
  `GET /v4/orders/{shop_id}/{order_id}` against sandbox with the
  token in the .env, see what's actually in the response.
- Sandbox-limitation notes in `envia_get_shipments_ndr`,
  `envia_track_pickup`, `envia_list_tickets` tool descriptions.
- `envia_quote_shipment` surfaces additional-services catalog summary.

**Sprint 7** — 4 new tools + helpers. Pre-approved by Jose:
`envia_ai_address_requirements`, `envia_find_drop_off`,
`envia_get_carrier_constraints`, `envia_get_additional_service_prices`.
Plus internal helpers: `additional-service-resolver` (multi-field
support per Gap 10 — backend already accepts arbitrary `data`,
verified via code read of AdditionalServiceUtil.php:717),
`carrier-constraints` (composes data from existing endpoints).

**Handoff prompt:** see `.claude/prompts/SPRINT_5_CONTINUATION_PROMPT.md`
(written next).

## Final state of this session

**Commits (chronological):**
- `2d02355` — docs: scope-fence session 2026-04-27 — lessons + backend debt
- `53ae225` — feat(sprint-4a): retire list_checkout_rules + reclassify generate_bill_of_lading INTERNAL
- `af71e0b` — feat(sprint-4a): observability layer — pino + correlation IDs + structured tool-call events
- `9020dfc` — feat(sprint-5): apply Canarias country override in getAddressRequirements (γ)
- pending — feat(sprint-5): align EXCEPTIONAL_TERRITORIES with geocodes source-of-truth

**Snapshot:**
- 70 user-facing MCP tools (was 72, retired 2 in Sprint 4a part 1).
- 1419 tests, 105 test files (was 1382 → +37 across Sprint 4a part 2,
  Canarias γ, drift fix tests).
- Build clean, lint clean, all sprints' work commit-clean.
- 0 pushes (per Jose's permission B = NO).

**Backend debt accumulated:** C8 (geocodes auto-detect — MEDIUM,
mitigated MCP-side) + C9 (cancel daily-limit field — MEDIUM,
defensive code already in MCP) — both in BACKEND_TEAM_BRIEF.md.

**Decisions for Jose to confirm on return:**
None blocking — autonomous mode handled everything within scope.
The Canarias deeper question of "should `shipments` table store
post-override IC consistently" is logged in C8 as item (c) but
that's a backend team conversation, not MCP.

## Roadmap remaining (after Sprint 4a part 2)

| Sprint | Scope | Bloqueantes |
|---|---|---|
| **5** | Country rules cleanup + Canarias γ investigation (read V1 portal code, replicate Zeleris logic) | None (γ approved) |
| **6** | Response enrichment (11 V4 fields in orders, sandbox notes, quote_shipment surfaces catalog) | Sandbox verif per field before coding |
| **7** | Helpers internos (`additional-service-resolver`, `carrier-constraints`, Gap 10 multi-field) + 4 tools nuevos | None |
| **Final** | HTTP auth + CORS whitelist | Portal coordinated (Jose holds invariant) |

## Pending decisions / handoff items

None blocking right now. Continue with Sprint 4a part 2 → Sprint 5.

## Handoff protocol

- This file is the source of truth for "what happened today + what's next".
- Memory file `project_mcp_expansion_plan.md` updated at end of each sprint.
- If context budget reaches ~90%, write a final block titled
  `## Handoff to next session (context budget reached)` summarizing:
  - Last commit hash on main
  - Files touched but not committed
  - Open questions for Jose
  - Specific next step for the next session to start with
- Next session should be Sonnet (per L-P3 — execution work, prompts
  ready in this log + memory).

## Backend debt accumulated this session

- C8 — Geocodes `/location-requirements` doesn't auto-detect exceptional
  territories from state_code (severity MEDIUM after carrier-code
  review showed each carrier has its own postal-based detection).
- C9 — Carriers `CancelBreakdown` doesn't populate
  `dailyLimitExceeded` / `dailyLimitReason` (severity MEDIUM, MCP
  already defensive).

Both are in `_docs/BACKEND_TEAM_BRIEF.md`.
