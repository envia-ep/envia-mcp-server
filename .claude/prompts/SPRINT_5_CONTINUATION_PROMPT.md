# Sprint 5 Continuation Prompt — envia-mcp-server

> **For:** Sonnet 4.6 execution session.
> **Predecessor:** Opus 4.7 (1M) session 2026-04-27. State at handoff:
> - 5 commits landed (last: `b4818d4`).
> - 70 user-facing tools, 1419 tests, build/lint clean.
> - Autonomous-owner mode active (Jose's permissions A, C, D, E, F, H).
> - Forbidden: B (push) and G (major structural changes).

## Mandatory first reads (in order)

1. `_docs/LESSONS.md` — every user correction. Pay special attention to
   L-S8 (MCP-only modifications), L-S9 (CEO directive replaces demand
   gate), L-B5 (verify backend before sprint), L-S6 (no admin tools),
   L-S2 (portal-user test).
2. `_docs/SESSION_LOG_2026_04_27.md` — what the predecessor did, what's
   pending, autonomous-mode permissions verbatim.
3. `_docs/BACKEND_TEAM_BRIEF.md` — backend debt items C8 + C9 included.
4. `memory/project_mcp_expansion_plan.md` — project state.

Skip if you've already loaded them. Do not re-investigate items
flagged as already-done in SESSION_LOG.

## Your job

Execute Sprint 5 step 3 → step 5, then Sprint 6, then Sprint 7. Each
step has a verify-before-code gate per L-B5. If a verification reveals
the backend doesn't support a planned change, escalate to
BACKEND_TEAM_BRIEF.md and skip the affected item — never ship a
partial implementation that depends on backend work that hasn't
landed.

## Detailed runbook

### Sprint 5 step 3 — MX state remap

**Goal:** Apply the same 11 normalisations from
`services/geocodes/libraries/util.js:Util::setStateCodeMx` (lines
252-289) before any MCP call sends `state_code` to geocodes/carriers.

**Verification before coding:**
1. Read the geocodes source for the canonical mapping.
2. Confirm the mapping is duplicated identically at
   `services/geocodes/controllers/web.js` lines 251-285. If they
   differ, use whichever the live `/locate` endpoint actually returns
   (curl-test if unsure).

**Implementation:**
1. Add `setMxStateCode(stateCode)` to `src/services/country-rules.ts`
   alongside the existing transforms. Pure function, returns the
   normalised code.
2. Wire into `normaliseLocationPair` in
   `src/services/geocodes-helpers.ts` so any MX state passes through
   the remap before being sent.
3. Tests: one per remap (11) plus negatives (e.g., `JAL` stays `JAL`).
4. Update `tests/services/country-rules.test.ts`.

**Effort:** ~1-2h.

### Sprint 5 step 4 — generic-form wiring on 3 tools

**Goal:** `update-order-address`, `create-client`, `update-client`
currently skip the country-specific address validation that
`create_address` / `update_address` already do. This lets users save
invalid addresses that fail later at rate/generate.

**Verification before coding:**
1. Read `src/tools/addresses/create-address.ts` to see the existing
   pattern (calls `validateAddressForCountry` from
   `src/services/generic-form.ts`, returns formatted error if invalid).
2. Read each of the 3 target tools to understand their current shape
   and where to insert the validation call.

**Implementation:**
1. For each target tool, before the API call:
   - Resolve the country code (from input or from the existing record).
   - Call `validateAddressForCountry(client, country, addressFields)`.
   - If the result is `{ ok: false }`, return
     `textResponse(formatGenericFormError(...))`.
2. Update each tool's existing test file to cover the new validation
   path with at least 2 tests: one happy path (validation passes,
   API call proceeds), one rejection (validation fails, API not
   called).

**Effort:** ~2-3h. The pattern is well-established; copy from
create-address.

### Sprint 5 step 5 — country-specific test coverage

**Goal:** Strengthen coverage so future drift is caught fast.

Add focused tests in:
- `tests/services/country-rules.test.ts`: BR (CEP transform with and
  without dash; CPF/CNPJ detection), CO (no MCP transform — verify
  delegation to resolver), MX (state remap once step 3 lands), AR
  (postal stripping), FR (phone normalisation including +33 idempotent
  case), IT (no transforms — sanity), ES (Canarias HASC + Ceuta/Melilla
  + numeric postal-prefix NOT in EXCEPTIONAL_TERRITORIES).
- `tests/services/geocodes-helpers.test.ts`: combine origin/destination
  cases to make sure `applyCanaryIslandsOverride` handles asymmetric
  routes (mainland → Canarias and reverse).

**Effort:** ~1-2h.

### Sprint 6 — Response enrichment

**REQUIRES per-item L-B5 verification.** Do NOT code without
confirming the backend already returns the field.

Verifications to perform first (use the sandbox token from
`services/queries/.env` — DB_URI for read-only DB queries; HTTP token
in test files for sandbox API). The DB connection works:
- Host: `enviadevelopment.cg8mmltfzroe.us-east-1.rds.amazonaws.com`
- DB: `enviadev`
- User: from `services/queries/.env` `DB_URI`
- Per L-S8 read-only queries only — never write.

For each missing V4 field on `envia_list_orders` /
`envia_get_ecommerce_order`, curl
`GET https://queries-test.envia.com/v4/orders/{shop_id}/{order_id}`
with a Bearer token and inspect the JSON. If the field is in the
response → MCP just needs to surface it. If absent → escalate to
BACKEND_TEAM_BRIEF.md as new item, skip that field.

The 11 candidate fields:
fulfillment_status_id, cod_active, cod_value (per package),
harmonized_system_code, country_code_origin, fulfillment_info,
fraud_risk, partial_available, order_comment, assigned_package,
return_reason.

Other items in Sprint 6 (no backend dependency, just description
updates):
- `envia_get_shipments_ndr`, `envia_track_pickup`, `envia_list_tickets`:
  add sandbox-limitation notes to tool descriptions.
- `envia_quote_shipment`: extend response to include a 1-line summary
  of the additional-services catalog applicable to the route.

**Effort:** ~3-5h depending on how many fields the backend supports.

### Sprint 7 — Net-new tools + helpers

**Pre-approved by Jose:**
1. `envia_ai_address_requirements` — wraps queries
   `GET /ai/shipping/address-requirements/{country}` (verify endpoint
   shape via curl).
2. `envia_find_drop_off` — wraps carriers `POST /ship/branches`.
3. `envia_get_carrier_constraints` — composes from existing endpoints
   (no new backend call). Surfaces COD max, insurance caps, dimension
   caps, weight caps per carrier so the agent can pre-validate.
4. `envia_get_additional_service_prices` — wraps queries
   `GET /additional-services/prices/{service_id}` (verify endpoint
   shape via curl; controller is at
   `services/queries/controllers/company.controller.js:2173-2212`).

Plus internal helpers (NOT LLM-visible):
- `additional-service-resolver` — given (country, intl, shipment_type,
  user intent), picks the right insurance variant, validates COD
  availability, etc.
- `carrier-constraints` — fetches and caches carrier limits.
- Multi-field support per Gap 10 — extend `buildAdditionalServices` to
  accept arbitrary `data` payload (backend already accepts per
  AdditionalServiceUtil.php:717 verified 2026-04-27). Extends
  `create_label` and `quote_shipment` schemas to let agent pass
  ETD/hazmat/LTL appointment fields.

If during implementation you spot another tool that genuinely passes
L-S2/L-S6/L-S7 and isn't on this list, you have permission E to
include it — just document the addition in SESSION_LOG and the commit
message.

**Effort:** ~6-10h for the bundle. Stage by sub-cluster (helpers
first, then tools).

## Operating rules (reminder)

- **Commit autonomously** when sprint chunk done + build clean +
  tests green. Use L-G2 commit message format. Co-author trailer:
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (or
  whichever model executes).
- **Never push** — Jose handles when he returns.
- **Never modify other repos.** Read for verification, write only to
  `ai-agent/envia-mcp-server/`.
- **Backend gaps go to BACKEND_TEAM_BRIEF.md** + skip the affected
  item. Don't ship partial implementations.
- **Append to SESSION_LOG_2026_04_27.md** Block 7+ as you progress.
- **Update memory** (`project_mcp_expansion_plan.md`) at end of each
  sprint.
- **If context gets tight** (~90% budget): write a final SESSION_LOG
  block titled "Handoff — context budget reached" with last commit
  hash, files staged but uncommitted, open questions, specific next
  step. Then stop.

## Constants you'll need

- Sandbox HTTP token (already in test fixtures and env): use the same
  token the existing tests use; don't introduce a new one.
- Sandbox DB credentials: `services/queries/.env` `DB_URI` (already
  read-only-tested in this session).
- Production DB: NOT accessible to the MCP project. Jose runs
  production queries himself if needed (Sprint 5 step 1 used this
  pattern — production-data evidence supplied by Jose, MCP code only).

## Scope fence

Anything NOT in Sprints 5-7 above stays out unless Jose adds it
explicitly. The LESSONS file is the constitution; this prompt is the
sprint plan.

Good luck.
