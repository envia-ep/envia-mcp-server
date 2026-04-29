# Spec — Live-Fixture Testing for MCP Tool Tests

**Version:** v1 — drafted 2026-04-28 by Jose Vidrio (CTO) + Claude Opus 4.7.
**Status:** READY FOR IMPLEMENTATION (Sonnet 4.6 session, expected after Phase 1 of Zod spec lands).
**Estimated effort:** 5–7 hours single Sonnet session.
**Companion spec:** `RUNTIME_ZOD_VALIDATION_SPEC.md` — this spec assumes that work is in production.

---

## Audience

You are an AI engineering session implementing the live-fixture
testing infrastructure for the Envia MCP server. This spec is
self-contained — every file path, schema decision, redaction rule,
and acceptance criterion is documented below. Do not invent paths,
tools, or library APIs not described here.

The spec depends on `RUNTIME_ZOD_VALIDATION_SPEC.md` having shipped
to production (Phase 1 of that work). The Zod schemas produced there
are the validation layer for fixtures captured by this work.

---

## 1. Goal

Replace hand-typed test fixtures with **byte-for-byte captures of
real sandbox responses**, stored in source control as JSON files,
versioned via git history, and used by tests as the canonical
"shape of truth".

In Phase 1 (this spec) we deliver:
- A capture script (`npm run fixtures:capture`) that pulls real
  responses from the sandbox backend and writes them to
  `tests/fixtures/live/`.
- An automated PII-redaction layer that runs before commit so no
  customer data ever lands in source.
- Migration of the test suite for the 10 Phase-1 Zod tools so they
  consume live fixtures instead of inventing data.
- A diff-based drift signal: when re-capturing finds shape changes,
  the PR shows which fields changed.

**Success looks like:** the next time a backend renames a field or
adds a required key, a developer running `npm run fixtures:capture`
sees the diff in their working tree before the change reaches a user.
Tests update mechanically; the developer doesn't have to guess at
the new shape.

**Out of scope:** automated periodic capture (cron / GitHub Actions
nightly); fixtures for tools beyond the 10 from Zod Phase 1; cross-
tenant fixtures (we capture from one company id only).

---

## 2. Background — why this matters now

The 2026-04-27 audit found 5 shape-mismatch bugs that the existing
1581-test suite never caught. Root cause was the same in all 5:
**every test fixture had been hand-typed at the time the tool was
written**, against the assumed shape. Once the backend evolved, the
fixtures stayed frozen — tests passed forever, while the real API
silently drifted.

Zod runtime validation (companion spec) closes the gap **for
production traffic** — drift surfaces as Datadog warnings within
minutes. This spec closes it **for the test suite** — drift surfaces
in the PR diff before code merges.

Together they mean: backend changes either show up in tests (caught
in CI) or in Datadog (caught in production within minutes). Neither
mode goes unobserved.

---

## 3. Design decisions

All decisions below are **finalised**. Implementer should not re-litigate.

### 3.1 Capture is manual, NOT automatic

The capture script runs only when a developer or release engineer
explicitly invokes `npm run fixtures:capture`. We do NOT wire it
into a cron job or nightly GitHub Action.

Rationale: automatic capture creates a noisy commit stream from
sandbox-state changes that are not meaningful (e.g. yesterday's
test shipments now show "Delivered" instead of "Created"). Manual
capture means a human signs off on each fixture refresh — the
commit becomes a deliberate signal.

### 3.2 Storage layout: `tests/fixtures/live/{domain}/{tool}.json`

Each captured fixture is a single JSON file matching the domain
split that already exists for schemas (`shipments`, `tickets`,
`orders`, etc.). Filename = tool-name with `envia_` prefix
stripped (so `envia_get_shipment_detail` → `get-shipment-detail.json`).

```
tests/fixtures/
├── live/
│   ├── shipments/
│   │   ├── get-shipment-detail.json
│   │   ├── list-shipments.json
│   │   ├── get-shipments-status.json
│   │   └── get-shipment-invoices.json
│   ├── tickets/
│   │   └── create-ticket.json
│   ├── carriers/
│   │   └── get-carrier-constraints.json
│   ├── shipping/
│   │   ├── quote-shipment.json
│   │   ├── create-shipment.json
│   │   └── track-package.json
│   ├── orders/
│   │   └── list-orders.json
│   └── _meta/
│       └── capture-log.json
└── (existing test fixtures for tools NOT migrated here stay as they are)
```

`_meta/capture-log.json` records, per fixture: capture timestamp,
endpoint URL, sandbox token fingerprint (first 8 chars only), and
the redaction rules applied. This is the audit trail.

### 3.3 PII-redaction is mandatory and runs before commit

Customer PII NEVER lands in source control. Period.

Two-layer enforcement:

1. **Redaction at capture time:** the script applies a whitelist of
   "always-safe" fields (id, status, currency, etc.) and redacts
   every other string field by default. The implementer reviews each
   field and either marks it explicitly safe in
   `scripts/fixture-redaction-config.ts` or accepts redaction.

2. **Pre-commit validation:** a Vitest test in
   `tests/fixtures/live/_redaction.test.ts` scans every committed
   fixture for known-PII patterns (phone numbers, email regex,
   typical name patterns, JWTs) and fails the build if found.

If a real customer field absolutely must appear unredacted (e.g.
`tracking_number` for the test smoke playbook), that is a deliberate
allowlist entry, never a default.

### 3.4 Tests opt in via filename convention

Tests choose between live and synthetic fixtures via filename:

- `X.live.fixture.ts` — wraps a `tests/fixtures/live/{domain}/{tool}.json`
  via the `loadLiveFixture` helper (§4.2).
- `X.synthetic.fixture.ts` — current hand-typed fixture, kept for
  edge cases that sandbox cannot reproduce (e.g. error responses
  that require triggering specific backend conditions).

A test can use both: live for happy-path, synthetic for error-path.

This split is intentional. We do not delete synthetic fixtures —
some error shapes (5xx, 422 with specific messages) cannot be
captured live without extraordinary effort. The split documents
which is which.

### 3.5 Capture from sandbox, never production

The script targets sandbox URLs (`queries-test.envia.com`,
`api-test.envia.com`) and refuses to run against any URL containing
`envia.com` without `-test`. This is hardcoded — no env var override.

Rationale: capturing from production would mean exfiltrating real
customer data into the repo. Not worth the convenience.

### 3.6 Shape stability vs value stability

Captured fixtures will have stable SHAPE (field names, types,
nullability) but volatile VALUES (timestamps, generated tracking
numbers, status that changes over time).

When tests use a fixture, they assert on SHAPE through the Zod
schema (companion spec) and on VALUES only when the value is
meaningful for the test. Tests that hardcode a specific
`tracking_number` value as an expected output need to be rewritten
to use the value FROM the fixture (e.g.
`expect(text).toContain(fixture.data[0].tracking_number)`).

### 3.7 Version control of fixtures

Each fixture is a normal JSON file. `git diff` shows shape changes
immediately. We do NOT use git-lfs (file sizes will be small,
typically <50 KB) or any external store.

When a re-capture changes a fixture, the diff is reviewed in the PR.
A diff with new keys added is forward-compatible (good signal). A
diff with keys removed or types changed is a breaking backend change
(bad signal — investigate before merging).

### 3.8 Re-capture cadence (operational, not automated)

Recommended cadence:
- **Always before a major MCP deploy** — confirms no silent drift
  since last fixture refresh.
- **When investigating a `schema_validation_failed` Datadog
  alert** — re-capture the affected tool, diff vs old fixture
  reveals the drift.
- **Quarterly review** — a calendar reminder for a sweep of all 10
  fixtures. Catches slow drift that didn't trip alerts.

The spec deliberately does NOT specify a fixed schedule (weekly,
nightly, etc.). The quarterly cadence is a recommendation, not a
hard requirement. Manual capture remains the rule.

### 3.9 No mass migration in this spec

We migrate the 10 tools from Zod Phase 1 only. Tools 11–73 stay on
synthetic fixtures until Phase 2 of the Zod work lands. Resist the
urge to migrate "while we're at it" — the 10 here are the highest-
value targets.

---

## 4. Infrastructure to build

### 4.1 `scripts/capture-fixtures.ts` — the capture script

A standalone Node script (not a tool, not a server) that:

1. Reads `scripts/fixture-targets.ts` which exports an array of
   capture targets (one per tool). Each target specifies:
   - Tool name (matches the tool registered in MCP).
   - HTTP method (GET / POST).
   - URL path (with `{}` placeholders for path params).
   - Path-param values to substitute (a known-good shipment id,
     etc.).
   - Query-param values (if any).
   - Body (for POSTs).
   - Output filename (relative to `tests/fixtures/live/`).
2. For each target, issues the HTTP request to the sandbox backend
   using `process.env.ENVIA_API_KEY` as Bearer auth. Refuses to run
   if URL does not include `-test` (§3.5 enforcement).
3. Applies redaction (§4.3) to the response.
4. Writes the redacted JSON to the target's output filename.
5. Updates `tests/fixtures/live/_meta/capture-log.json` with the
   timestamp, endpoint, and redaction summary.
6. Prints a summary report: "10 fixtures captured, 0 redaction errors,
   3 fields redacted across 4 fixtures".

Invocation:

```bash
ENVIA_API_KEY=... npm run fixtures:capture
# or for a single tool:
ENVIA_API_KEY=... npm run fixtures:capture -- --tool envia_get_shipment_detail
```

If the script is run without `ENVIA_API_KEY`, it prints a clear
error pointing to the sandbox token in the smoke-test playbook.

### 4.2 `tests/helpers/loadLiveFixture.ts` — fixture loader for tests

A small Node helper that tests import:

```typescript
/**
 * Load a captured live fixture by domain + tool name.
 *
 * Returns the parsed JSON. Type is `unknown` — tests should narrow
 * it via the companion Zod schema's `safeParse`.
 *
 * @example
 *   const fixture = loadLiveFixture('shipments', 'get-shipment-detail');
 *   const parsed = ShipmentDetailResponseSchema.safeParse(fixture);
 */
export function loadLiveFixture(domain: string, toolFile: string): unknown;
```

Implementation: synchronous `readFileSync` from
`tests/fixtures/live/{domain}/{toolFile}.json`. Throws a clear error
if the file does not exist (pointing to the capture script).

### 4.3 `scripts/fixture-redaction-config.ts` — redaction policy

Two parts:

**Always-safe fields** (whitelist — stored unredacted):
```typescript
export const SAFE_FIELDS = [
    'id', 'status', 'status_id', 'status_name', 'status_color',
    'created_at', 'updated_at', 'utc_created_at',
    'currency', 'currency_symbol',
    'carrier_id', 'name', 'service', 'service_code',
    'service_id', 'volumetric_factor', 'volumetric_factor_id',
    'box_weight', 'pallet_weight', 'allows_mps',
    'shipment_type', 'shipment_type_id', 'shipment_weight',
    'package_type', 'international',
    'rate_type', 'rate_type_id',
    'capacity', 'distance',
    'total', 'grand_total', 'cost', 'taxes',
    'insurance', 'insurance_cost',
    'cash_on_delivery_amount', 'cash_on_delivery_cost',
    'minimum_amount', 'commission_percentage',
    'enabled', 'active', 'visible', 'private',
    'recordsTotal', 'recordsFiltered', 'total_rows',
    'tracking_delay_minutes', 'track_limit',
    'limit_pallets', 'limit_weight', 'min_weight_kg', 'max_weight_kg',
    'weight_unit',
    'pickup_start', 'pickup_end', 'pickup_span', 'pickup_sameday',
    'invoice_id', 'invoice_url',
    'pattern',
    'event', 'description', 'location',
    'translation_tag', 'tooltip_translation_tag',
];
```

**Always-redact patterns** (denylist — values matched are redacted
even if the field name is not on the safe list):
```typescript
export const REDACT_PATTERNS = [
    /^\+?\d{10,}$/,                      // phone numbers
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,  // emails
    /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/,  // JWT
    /^([A-Z]{4})\d{6}([A-Z\d]{3})$/,    // RFC (Mexican tax ID)
    /^\d{3}-\d{2}-\d{4}$/,              // SSN-like (US tax ID)
];
```

**Default behaviour for everything else:** strings not on the safe
list are replaced with `"<redacted>"`. Numbers and booleans are
kept (they are rarely PII).

The capture script logs which fields were redacted per file. The
implementer reviews the log and either accepts the redaction or
adds the field to `SAFE_FIELDS`.

### 4.4 `tests/fixtures/live/_redaction.test.ts` — pre-commit guardrail

A Vitest test that scans every `.json` file under
`tests/fixtures/live/` and asserts no redaction-pattern values
are present. Fails the build if found.

Implementation: walks the directory, parses each JSON, recursively
walks every string value, applies `REDACT_PATTERNS` from the
config. If any pattern matches, fails with the file path and the
matched string (not the full value, just the type — e.g. "phone-
number-like at fixtures/live/shipments/get-shipment-detail.json:
data[0].sender_phone").

This test is the safety net. The capture script's redaction is the
first line of defence; this test catches anything the script missed.

### 4.5 `scripts/fixture-targets.ts` — capture configuration

The list of 10 tools to capture, with the live values used for path
parameters (taken from the smoke-test playbook):

```typescript
export const FIXTURE_TARGETS: CaptureTarget[] = [
    {
        tool: 'envia_get_shipment_detail',
        method: 'GET',
        url: '/guide/{tracking}',
        params: { tracking: '9824510570' },
        domain: 'shipments',
        outputFile: 'get-shipment-detail.json',
    },
    {
        tool: 'envia_list_shipments',
        method: 'GET',
        url: '/shipments',
        query: { limit: 3, page: 1 },
        domain: 'shipments',
        outputFile: 'list-shipments.json',
    },
    // ... 8 more entries — see §5.1 for the full list
];
```

Each entry's `tracking` / `shipment_id` / etc. references real
sandbox data created during the 2026-04-27 smoke test. If those
values become stale (e.g. tracking number deleted from sandbox
DB), the capture script reports a 404 and the implementer creates
a new sandbox record.

---

## 5. Migration plan (per-tool)

### 5.1 The 10 capture targets

| Tool | Endpoint | Path/query params | Domain |
|---|---|---|---|
| `envia_get_shipment_detail` | `GET /guide/{tracking}` | tracking=9824510570 | shipments |
| `envia_list_shipments` | `GET /shipments?limit=3&page=1` | — | shipments |
| `envia_get_shipments_status` | `GET /shipments/packages-information-by-status?date_from=2026-04-01&date_to=2026-04-30` | — | shipments |
| `envia_get_shipment_invoices` | `GET /shipments/invoices?limit=3&page=1` | — | shipments |
| `envia_create_ticket` | `POST /company/tickets` | type_id=25, shipment_id=170633, comments="fixture capture" | tickets |
| `envia_get_carrier_constraints` | `GET /carrier-constraints/1` | — | carriers |
| `envia_quote_shipment` | `POST /ship/rate` | (full payload from smoke-test §2.1) | shipping |
| `envia_create_shipment` | `POST /ship/generate` | (full payload from smoke-test §2.2) — careful: this charges balance | shipping |
| `envia_track_package` | `POST /ship/generaltrack` | tracking=9824510570 | shipping |
| `envia_list_orders` | `GET /v4/orders?limit=1` | — | orders |

**Important:** the `envia_create_shipment` capture creates a real
sandbox shipment, charging balance. Do not capture this fixture
casually. The fixture may need to be re-captured a few times before
shipping the spec, but each capture costs balance. Document the
tracking_number in `_meta/capture-log.json` so we can cancel later
if needed.

### 5.2 Migration template (per tool)

For each tool:

#### Step 1 — Capture the fixture

```bash
ENVIA_API_KEY=... npm run fixtures:capture -- --tool envia_get_shipment_detail
```

Verify the output file exists at `tests/fixtures/live/shipments/get-shipment-detail.json`
and inspect manually to confirm:
- All expected top-level keys are present.
- PII fields are redacted (sender_name = "<redacted>", etc.).
- The capture log entry has timestamp + endpoint.

#### Step 2 — Update the existing test to consume the live fixture

In the corresponding `tests/tools/{path}/{tool}.test.ts`:

**Before (synthetic fixture):**
```typescript
function makeShipmentDetailRecord(overrides = {}) {
    return {
        id: 170617,
        tracking_number: '9824458744',
        status: 'Created',
        // ...hand-typed fields
        ...overrides,
    };
}
```

**After (live fixture):**
```typescript
import { loadLiveFixture } from '../../helpers/loadLiveFixture.js';

const liveFixture = loadLiveFixture('shipments', 'get-shipment-detail') as {
    data: Array<Record<string, unknown>>;
    total_rows: number;
};

function makeShipmentDetailRecord(overrides = {}) {
    return {
        ...liveFixture.data[0],  // base from real backend
        ...overrides,             // per-test variations
    };
}
```

The factory pattern is preserved — tests can still pass overrides
for edge cases. The base values now come from reality.

#### Step 3 — Run tests

```bash
npx vitest run tests/tools/{path}/{tool}.test.ts
```

If a test fails, that means the test was asserting on a hand-typed
value that is no longer true for the real backend. Update the
assertion to match the live fixture, OR adjust the override to
preserve the test intent. Do NOT modify the live fixture itself.

#### Step 4 — Verify Zod schema still parses

```bash
MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run tests/schemas/{domain}.test.ts
```

The Zod schema (from companion spec) should parse the live fixture
without issues. If it does not, EITHER the schema is wrong OR the
live fixture has an unredacted field whose value broke parsing.
Investigate with the redaction log.

### 5.3 Time budget per tool

- 10–15 min: capture + manual inspection of redaction.
- 15–20 min: migrate the existing test to use live fixture.
- 5 min: verify Zod schema still passes.
- ~40 min per tool × 10 tools = ~6.5 hours.
- Plus infra (script, helper, config, redaction guard test): ~1 hour.

Total: 7.5 hours. Within the 5–7 hour estimate (lower if many tools
have minimal hand-typed data; the original Zod migrations were thin).

---

## 6. Testing strategy

### 6.1 Self-tests for the capture script

`tests/scripts/capture-fixtures.test.ts` (new). 6 tests:
1. Refuses to run against a non-`-test` URL (returns error).
2. Refuses to run without `ENVIA_API_KEY`.
3. Applies redaction correctly (mock response with PII → redacted JSON output).
4. Logs the capture metadata to `_meta/capture-log.json`.
5. Handles HTTP failures gracefully (mock 500 response → reports error,
   does not write a partial file).
6. Single-tool mode (`--tool X`) only captures the requested target.

### 6.2 Self-tests for the redaction config

`tests/scripts/fixture-redaction-config.test.ts` (new). 4 tests:
1. SAFE_FIELDS list includes the obvious safe fields.
2. REDACT_PATTERNS catch known PII (phone, email, RFC, JWT).
3. The redaction function applied to a sample object redacts as
   expected.
4. The redaction function does NOT redact safe-listed fields even
   if their value matches a pattern (e.g. `id: "abc.def.ghi"` is
   not treated as a JWT).

### 6.3 Pre-commit redaction guardrail

`tests/fixtures/live/_redaction.test.ts` (per §4.4). Runs as part of
the regular vitest suite. Fails the build if any committed fixture
contains a value matching `REDACT_PATTERNS`.

### 6.4 Fixture freshness assertion

`tests/fixtures/live/_freshness.test.ts` (new). 1 test that reads
`_meta/capture-log.json` and warns (does NOT fail) if any fixture is
older than 90 days. This is a soft signal, not a hard gate.

### 6.5 Total test delta

- 6 capture-script tests + 4 redaction-config tests + 1 redaction
  guardrail + 1 freshness = **12 new tests**.
- 10 existing test files modified to consume live fixtures.
- Net new: 12. Net modified: 10. No tests deleted.

---

## 7. Operational verification

### 7.1 Run capture against sandbox

```bash
ENVIA_API_KEY=ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3 \
npm run fixtures:capture
```

Expected output (truncated):
```
[capture] envia_get_shipment_detail (GET /guide/9824510570)
   ✓ 200 OK in 421 ms
   ✓ redacted 4 fields (sender_phone, sender_email, consignee_phone, consignee_email)
   ✓ written to tests/fixtures/live/shipments/get-shipment-detail.json (3.2 KB)
... (9 more)
[capture] DONE — 10 fixtures, 0 errors, 38 fields redacted
```

### 7.2 Verify redaction guardrail catches a PII leak

Manually inject a phone-number-like value into one fixture:
```bash
sed -i.bak 's/"<redacted>"/"5512345678"/' tests/fixtures/live/shipments/get-shipment-detail.json
npx vitest run tests/fixtures/live/_redaction.test.ts
# Expect: FAIL with "phone-number-like at fixtures/live/shipments/get-shipment-detail.json"
mv tests/fixtures/live/shipments/get-shipment-detail.json.bak tests/fixtures/live/shipments/get-shipment-detail.json
```

If the redaction guardrail does NOT catch the injected value, the
guardrail itself is broken. Fix it before merging.

### 7.3 Full test run

```bash
npm run build
npx vitest run
MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run
```

All three must pass. If any test fails because a hand-typed expected
value is no longer true in the live fixture, update the assertion to
match the live data, never the fixture.

---

## 8. Acceptance criteria

- [ ] `scripts/capture-fixtures.ts` exists and runs end-to-end.
- [ ] `scripts/fixture-redaction-config.ts` exists with SAFE_FIELDS and
      REDACT_PATTERNS exports.
- [ ] `scripts/fixture-targets.ts` lists all 10 Phase-1 targets.
- [ ] `tests/helpers/loadLiveFixture.ts` exists and is consumed by 10
      test files.
- [ ] `tests/fixtures/live/_redaction.test.ts` passes against committed
      fixtures.
- [ ] `tests/fixtures/live/_freshness.test.ts` exists.
- [ ] 10 fixtures committed under `tests/fixtures/live/{domain}/`.
- [ ] 1 capture-log committed at `tests/fixtures/live/_meta/capture-log.json`.
- [ ] Each captured fixture has been manually inspected — no PII present.
- [ ] `npm run build` exit 0.
- [ ] `npx vitest run` all green.
- [ ] `MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run` all green.
- [ ] `npm run fixtures:capture` registered in `package.json`.
- [ ] No commit on `main`. Branch is `mcp-live-fixtures`.

---

## 9. Anti-patterns to avoid

1. **Do NOT capture from production.** The script enforces this; do
   not bypass with environment variable hacks.
2. **Do NOT commit a fixture with PII.** The redaction guardrail
   catches obvious patterns; visual inspection catches the rest.
3. **Do NOT use git-lfs or external fixture stores.** Plain JSON
   in source control; `git diff` is the diff signal.
4. **Do NOT mass-migrate tools beyond Phase 1.** Phase 2 of Zod
   covers the remaining 63.
5. **Do NOT delete synthetic fixtures.** Some edge cases (specific
   error shapes) cannot be captured live. Keep them.
6. **Do NOT modify a captured fixture by hand.** Re-capture instead.
7. **Do NOT skip the `_redaction.test.ts` guardrail in CI.** It is
   the safety net.
8. **Do NOT commit `_meta/capture-log.json` if it contains the full
   API token.** Only the first 8 chars (a fingerprint).
9. **Do NOT capture `envia_create_shipment` repeatedly.** Each
   capture creates a real sandbox shipment, charging balance.
10. **Do NOT commit fixtures that exceed 100 KB without review.**
    Large fixtures slow tests and dwarf real diffs in PRs.

---

## 10. Open questions and verified assumptions

- **Q: Should we capture per-company-id (multi-tenant)?** A: Phase 1
  uses a single sandbox token. Multi-tenant fixtures are Phase 2 of
  this work, after we have multiple sandbox companies provisioned.
- **Q: What if the backend returns a different shape per locale?**
  A: We capture from MX (the default sandbox locale). If a tool needs
  per-locale fixtures, that's a Phase 2 extension.
- **Q: Should we add a "capture all fixtures" pre-deploy hook?** A:
  Out of scope. Manual capture remains the rule (§3.1 rationale).
- **Verified assumption:** Vitest can read JSON files via `readFileSync`
  in the test runtime. No special config needed.
- **Verified assumption:** `tests/fixtures/` is on the gitignore-
  exempt list (i.e. fixtures are committed). Verify by checking
  `.gitignore`.
- **Verified assumption:** Zod schemas from the companion spec live
  in `src/schemas/{domain}.ts` and parse the live fixtures without
  modification.

---

## 11. Spec metadata

- **Author:** Claude Opus 4.7 (1M context), session 2026-04-28.
- **Reviewer:** Jose Vidrio (CTO).
- **Status:** READY FOR IMPLEMENTATION.
- **Branch target:** `mcp-live-fixtures` (created from `mcp-expansion`
  AFTER Zod Phase 1 lands; the Zod schemas are a hard prerequisite).
- **Estimated effort:** 5–7 hours (single Sonnet 4.6 session).
- **Predecessor specs:** `RUNTIME_ZOD_VALIDATION_SPEC.md` v1.2.

---

## 12. Reporting back

When the session completes, the final response must include:

1. List of files created/modified.
2. Final test count + `npm run build` exit code + strict-mode
   test count.
3. Commit hash + push confirmation.
4. Capture log summary: 10 fixtures captured, total bytes, total
   fields redacted, any captures that failed.
5. Any test that had to be modified beyond mechanical fixture-swap
   (i.e. assertion changes), with rationale.
6. Any field discovered to be PII that is NOT in the existing
   `REDACT_PATTERNS` list — flag for security review.
7. Any judgment call deviating from the spec.

---

## 13. Session bootstrap prompt

```
Implementa el spec en
_docs/specs/LIVE_FIXTURE_TESTING_SPEC.md, rama mcp-live-fixtures
(crear desde mcp-expansion AFTER Zod Phase 1 has landed).

Lee el spec end-to-end ANTES de escribir código.

Secciones que NO son opcionales:
  - §3.3 PII redaction obligatoria + pre-commit guardrail
  - §3.5 Sandbox only — script refuses non-test URLs
  - §3.7 Versioning via git diff
  - §4.3 Redaction config — SAFE_FIELDS + REDACT_PATTERNS
  - §4.4 _redaction.test.ts guardrail — fails build on PII leak
  - §5.1 Lista de los 10 capture targets
  - §5.2 Migration template per tool

Al terminar, reporta según §12.

No captures de producción. No commit con PII. No deletes de fixtures
sintéticos. No mass-migration beyond Phase 1.

Sandbox:
  TOKEN=ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3
  queries=https://queries-test.envia.com
  carriers=https://api-test.envia.com

Bar: production-grade enterprise. PII handling is non-negotiable.
```

---

End of spec.
