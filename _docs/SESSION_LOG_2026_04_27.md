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

## Block 5 — Sprint 5 step 2+ (NEXT)

**Plan:**
- Drift fix `EXCEPTIONAL_TERRITORIES` in `src/services/country-rules.ts`
  to match geocodes excStates exactly (remove `FR-MC`, `ES-35`,
  `ES-38`; add `ES-CE`, `ES-ML`).
- Add MX state remap (BN→BC, DF→CDMX, etc. — 11 cases per geocodes
  `Util::setStateCodeMx`).
- Wire generic-form validation into `update-order-address`,
  `create-client`, `update-client` (matches what `create-address` /
  `update-address` already do).
- Tests per country.

**Status:** Decide between continuing in this Opus session OR handoff
to Sonnet via prompt — depends on remaining context budget.

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
