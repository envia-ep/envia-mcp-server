# Spec — Runtime Zod Validation in the Response Layer (Phase 1)

**Version:** v1 — drafted 2026-04-28 by Jose Vidrio (CTO) + Claude Opus 4.7.
**Status:** READY FOR IMPLEMENTATION (Sonnet 4.6 session).
**Estimated effort:** 6–9 hours single Sonnet session.
**Phase:** 1 of 2. Phase 2 (rollout to the remaining 63 tools) is a follow-up spec.

---

## Audience and how to read this document

You are an AI engineering session (Sonnet 4.6 or equivalent) implementing the
runtime-validation infrastructure for the Envia MCP server. This document is
self-contained — every file path, function signature, design decision, and
test pattern is enumerated here. **Do not invent paths, helpers, or library
APIs that are not described below.** When in doubt, prefer the conservative
choice and surface it in the final report.

You will:
1. Read the prerequisites section once.
2. Implement the infrastructure (§4) — one new helper, one new schemas
   directory, one new logger event.
3. Migrate exactly 10 tools listed in §5.6, in the order specified, using
   the template in §5.4.
4. Add the test coverage described in §6.
5. Run build + full test suite + the targeted live-fixture verification
   (§7) and stop only when all three pass.
6. Commit per the L-G2 template in §9 and push to `mcp-expansion`. Do not
   touch `main`.

You are NOT in scope for the remaining 63 tools — they belong to the Phase 2
spec. If you encounter a tool not on the Phase 1 list (§5.6), do not modify
it. Verify, do not assume.

---

## 1. Goal

Add runtime validation of every backend response that flows through the
Envia MCP server, using Zod schemas mirrored against live sandbox fixtures.
When the backend returns a shape that diverges from the schema, the MCP
emits a structured warning to the observability layer (pino → Datadog) but
**still returns the data to the caller**, so users do not experience
breakage from non-breaking backend additions.

In Phase 1 this scope covers:
- A reusable helper (`parseToolResponse`) that any tool can wrap a fetch
  result with.
- A `src/schemas/` directory containing Zod schemas keyed by domain.
- The 10 highest-impact tools migrated to use the helper, with
  fixture-backed tests asserting the schemas match live sandbox shapes.
- Operational toggles (`MCP_SCHEMA_VALIDATION_MODE` env var) so the same
  binary can run permissive in production and strict in CI.

**Success looks like:** future backend shape changes surface as a single
Datadog log line within minutes (instead of being discovered by users
weeks later, as happened five times in the 2026-04-27 audit). New tools
can adopt the pattern in 15 minutes per tool.

**Out of scope (Phase 2):** rollout to the remaining 63 tools, schema
generation tooling (`npm run schemas:capture`), schema versioning across
deployed releases.

---

## 2. Background — why this matters now

Between 2026-04-27 and 2026-04-28, five separate response-shape bugs were
discovered live in the sandbox MCP, all undetected by the existing test
suite (1581 tests at the time):

| Bug | Tool | Mismatch | Severity |
|---|---|---|---|
| 1 | `envia_get_shipment_detail` | Backend returns `data: [array]` with flat sender_/consignee_ fields; tool expected `data: object` with nested origin/destination | SEVERE — every field rendered as `undefined` |
| 2 | `envia_list_shipments` | Backend returns `name` / `service_description`; tool read `carrier_name` / `service_name` | MEDIUM — every row showed `?  /  ?` |
| 3 | `envia_get_shipments_status` | Backend returns flat object at top level; tool expected `{ data: ... }` wrapper | HIGH — tool always returned "no statistics" |
| 4 | `envia_get_shipment_invoices` | Backend uses `total_shipments` and DataTables-style `recordsTotal`; tool read `shipments_amount` and `total` | MEDIUM — count and shipments rendered as `—` |
| 5 | `envia_get_shipments_status` (cosmetic) | Backend returns percentages as strings `"100.00%"`; tool typed them as `number` and appended `%` | LOW but visible |

The unifying root cause is: **TypeScript types are compile-time promises
that the runtime never verifies.** The unit tests pass because their
fixtures were hand-typed to match the assumed shape, not captured from the
live API. By the time a user reports the bug, days or weeks of incorrect
output have already shipped.

Zod runtime parsing closes this gap.

---

## 3. Design decisions

Every decision below is **finalised** unless explicitly tagged "open".
Sonnet should not re-litigate them — implement as written.

### 3.1 Soft-warn by default, strict on demand

When a backend response fails Zod validation, the helper:
- **Default behaviour:** logs a structured warning to pino (which feeds
  Datadog), then **returns the data anyway** (using Zod's `safeParse`
  result regardless of success). This guarantees no production user is
  ever broken by a non-breaking backend addition.
- **Strict mode:** when `MCP_SCHEMA_VALIDATION_MODE=strict`, throws a
  `SchemaValidationError` instead of returning. Used in CI and local
  development to surface drift loudly.
- The mode is read once at module-load time (not per-call) so the
  performance overhead is one comparison per response.

Rationale: production blast radius is asymmetric. A backend that
silently adds an optional field shouldn't take down the chat agent.
A backend that renames a field should surface in test runs immediately.

### 3.2 Passthrough (do NOT use `.strict()`)

All Zod object schemas use the default passthrough behaviour. **Never
call `.strict()` on schemas.** Reason: the backend frequently returns
extra fields (the carrier-constraints audit showed `/carrier-company/config`
returns 24 fields the MCP doesn't use). Strict mode would fail
validation on every additional field — an own-goal.

If a tool genuinely needs to detect new fields, it can call `.strict()`
locally on its own copy. This is rare and should be a deliberate decision.

### 3.3 New `src/schemas/` directory

Zod schemas live in `src/schemas/{domain}.ts`, mirroring the existing
`src/types/{domain}.ts` split. Each schema file exports:
1. The schema itself: `export const ShipmentDetailResponseSchema = z.object({...});`
2. The inferred type: `export type ShipmentDetailResponseT = z.infer<typeof ShipmentDetailResponseSchema>;`
   (use the `T` suffix only when the type would otherwise collide with an
   existing name in `src/types/`. Otherwise re-export under the same name.)

Rationale: Zod schemas are executable code with runtime cost.
TypeScript types are declarative compile-time annotations. Mixing them in
the same file conflates two concepts. The MCP is a TypeScript codebase;
keep the type system tidy.

### 3.4 Phased rollout

Phase 1 (this spec): 10 tools listed in §5.6 — chosen for either having
been the source of a confirmed bug (5 of them) or being among the
most-called tools (the other 5). Total LOC: ~1,500 across 10 schemas, 10
tool-edit diffs, 1 helper, 1 logger event, ~30 new tests.

Phase 2 (separate spec, future session): rollout to the remaining 63
tools using the same template. Estimated 4–6 hours per session, 4
sessions total. **Out of scope for Sonnet today.**

### 3.5 Synchronous parsing, no async

`parseToolResponse` runs `safeParse` synchronously on the in-memory
response object. No async I/O. This keeps the call-site signature trivial
(no extra `await`) and avoids a measurable latency penalty.

### 3.6 No cross-cutting refactors

This spec adds infrastructure and migrates 10 tools. It does NOT:
- Change the existing `EnviaApiClient` HTTP layer.
- Modify response handling for tools not on the Phase 1 list.
- Adjust pino logger configuration beyond adding one new event class.
- Touch any business logic in formatters.

Resist the temptation to "fix one more thing while we're in here." Each
out-of-scope change extends review burden and risk.

---

## 4. Infrastructure to build (3 deliverables)

### 4.1 `src/utils/response-validator.ts` — the canonical helper

Create this file. Contents:

```typescript
/**
 * Runtime response validation for MCP tools.
 *
 * Wraps a backend response in a Zod parse step. When validation fails,
 * the helper either returns the data anyway (default, "warn" mode) or
 * throws (when MCP_SCHEMA_VALIDATION_MODE=strict).
 *
 * Mode is read once at module load. Tools call `parseToolResponse(schema,
 * data, toolName)` and forget about the rest.
 *
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md for design rationale.
 */

import type { ZodTypeAny, z } from 'zod';
import { logger } from './logger.js';

type ValidationMode = 'warn' | 'strict';

/**
 * Module-level configuration. Read once at first import.
 *
 * - 'warn'   (default): log + return data anyway.
 * - 'strict': throw SchemaValidationError on mismatch.
 */
const MODE: ValidationMode =
    process.env.MCP_SCHEMA_VALIDATION_MODE === 'strict' ? 'strict' : 'warn';

/**
 * Thrown only when MODE === 'strict'. The chat agent / portal sees this as
 * a 500-class error from the MCP. Production should never run in strict
 * mode; this is meant for CI and local dev.
 */
export class SchemaValidationError extends Error {
    public readonly tool: string;
    public readonly issues: z.ZodIssue[];

    constructor(tool: string, issues: z.ZodIssue[]) {
        super(`Response validation failed for tool "${tool}": ${issues.length} issue(s)`);
        this.name = 'SchemaValidationError';
        this.tool = tool;
        this.issues = issues;
    }
}

/**
 * Parse a backend response against a Zod schema.
 *
 * @param schema   - Zod schema describing the expected shape.
 * @param data     - Raw response data (typically `res.data` from an
 *                   EnviaApiClient call).
 * @param toolName - Name of the tool calling this helper, used as the
 *                   `tool` field in the warning log.
 * @returns        - The parsed data on success. On failure in 'warn' mode,
 *                   returns the original `data` cast to the inferred type
 *                   (since downstream code expects that shape). On failure
 *                   in 'strict' mode, throws SchemaValidationError.
 *
 * NOTE: 'warn' mode returns the ORIGINAL `data`, not Zod's coerced result.
 * This is deliberate — if the schema is wrong, we want the formatter to
 * see what the backend actually sent, not a half-coerced version.
 */
export function parseToolResponse<S extends ZodTypeAny>(
    schema: S,
    data: unknown,
    toolName: string,
): z.infer<S> {
    const result = schema.safeParse(data);

    if (result.success) {
        return result.data;
    }

    // Validation failed. Log structured event regardless of mode so
    // Datadog always captures the drift signal.
    logger.warn(
        {
            event: 'schema_validation_failed',
            tool: toolName,
            issue_count: result.error.issues.length,
            // Take only the first 5 issues to bound log size; full list is
            // recoverable from local repro if needed.
            issues: result.error.issues.slice(0, 5).map((i) => ({
                path: i.path.join('.'),
                code: i.code,
                message: i.message,
            })),
        },
        `[schema] Response shape mismatch for ${toolName}`,
    );

    if (MODE === 'strict') {
        throw new SchemaValidationError(toolName, result.error.issues);
    }

    // 'warn' mode: return raw data so the formatter sees backend reality,
    // not a half-coerced Zod object.
    return data as z.infer<S>;
}
```

**Notes for the implementer:**
- `logger` is the existing pino instance at `src/utils/logger.ts`. Do
  not create a new one.
- The cast `data as z.infer<S>` is intentional. TypeScript treats a
  failed parse as "unknown" but the formatter is already written
  against the expected type. The runtime warning is the safety net.
- Read `process.env.MCP_SCHEMA_VALIDATION_MODE` exactly once via the
  module-level `MODE` constant. **Never** read it inside the function.

### 4.2 `src/utils/server-logger.ts` — extend the event taxonomy

The existing `decorateServerWithLogging` (Sprint 4a, commit `af71e0b`)
emits `tool_call_complete` and `tool_call_failed` events. **Add**:

- `schema_validation_failed` is the warning event emitted by
  `parseToolResponse` (already wired via `logger.warn` in §4.1; no code
  change needed in `server-logger.ts`).
- Update the JSDoc at the top of `server-logger.ts` to mention this new
  event class so future readers see the full taxonomy in one place. **No
  behavioural change.**

### 4.3 `src/schemas/` — new directory + base file

1. Create directory `src/schemas/`.
2. Create `src/schemas/_index.ts` (the leading underscore avoids barrel-
   collision with the future `index.ts` if added). This file re-exports
   nothing today — it's a marker for the directory and a place for
   per-domain re-exports as Phase 2 schemas land.
3. Add a short README at `src/schemas/README.md` explaining the
   convention, copy-paste from §5.4 below.

---

## 5. Migration plan (per-tool template)

### 5.1 The migration is mechanical

Each of the 10 tools follows the exact same recipe. **Do not improvise.**
Every deviation from the template needs to be flagged in the final
report.

### 5.2 Capture the live shape first

Before writing any schema, the implementer **must** capture the live
sandbox response and inspect it. This non-negotiable step is what
prevents the same fixture-vs-reality bugs that motivated this work.

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"

# Example: shipment detail
curl -s -m 15 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  "https://queries-test.envia.com/guide/9824510570" \
  | jq . > /tmp/shape-shipment-detail.json

# Inspect every key. Note nullable fields, array vs object, type drift.
cat /tmp/shape-shipment-detail.json | python3 -c '
import json, sys
d = json.load(sys.stdin)
def walk(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            walk(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(obj, list) and obj:
        walk(obj[0], f"{prefix}[]")
    else:
        print(f"{prefix}: {type(obj).__name__} = {repr(obj)[:60]}")
walk(d)
' | head -50
```

The schema must match this output, **not the existing TypeScript type**.
If they disagree, the type is wrong (probably documented during the
2026-04-27 audit; verify against `src/types/`).

### 5.3 Mock-friendly fixtures

When sandbox returns empty data (e.g., `/clients` was 404 in the audit,
or `/shipments/surcharges` returned `[]`), the implementer must:
1. Note this in the migration report.
2. Build the schema from the existing TypeScript type **as a fallback**.
3. Mark the test fixture as "synthetic — verify against production
   when possible" in a code comment.

### 5.4 Per-tool migration template

For each tool on the Phase 1 list:

#### Step 1 — Create the schema

File: `src/schemas/{domain}.ts` (e.g. `src/schemas/shipments.ts`).

```typescript
import { z } from 'zod';

/**
 * Verified live 2026-04-27 against {endpoint}.
 * Captured shape: see live curl in
 * _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.2.
 */
export const ShipmentDetailRecordSchema = z.object({
    id: z.number(),
    tracking_number: z.string(),
    folio: z.string().nullable().optional(),
    status_id: z.number(),
    status: z.string().optional(),
    name: z.string().optional(),                  // carrier slug
    service: z.string().optional(),
    sender_name: z.string().optional(),
    sender_postalcode: z.string().optional(),     // NOTE: no underscore
    // ...remaining fields per src/types/shipments.ts ShipmentDetailRecord
});

export const ShipmentDetailResponseSchema = z.object({
    data: z.array(ShipmentDetailRecordSchema),
    total_rows: z.number().optional(),
});

export type ShipmentDetailResponseT = z.infer<typeof ShipmentDetailResponseSchema>;
```

**Schema authoring rules:**
- Every field that the backend returns goes in the schema, even if the
  formatter does not read it. Reason: future formatter additions can
  rely on the schema.
- Nullable fields: `.nullable()`. Optional (might be absent): `.optional()`.
  Both: `.nullable().optional()`. Use `.optional()` for any field that
  was absent in the captured curl, even if the type marks it required.
- Use `z.number()` not `z.coerce.number()` — coerce silently accepts
  string `"42"` as `42`, hiding type drift bugs.
- For union types where the backend can return string or number, use
  `z.union([z.string(), z.number()])` — this is what shipment_invoices
  needed for `total` (sometimes float, sometimes string).
- For the `_note` and `_unavailable` fields in `meta` and `coverage_summary`:
  `z.string().optional()`.
- Re-use shared sub-schemas (e.g. `AddressSchema`) when the same shape
  appears in multiple records.

#### Step 2 — Wire the helper into the tool

File: `src/tools/{path}/{tool}.ts`.

Find the existing pattern:

```typescript
const res = await queryShipmentsApi<ShipmentDetailResponse>(
    activeClient, config, `/guide/${tracking}`, {},
);

if (!res.ok) { /* ... */ }

const s = res.data?.data?.[0];
```

Replace with:

```typescript
import { parseToolResponse } from '../../utils/response-validator.js';
import { ShipmentDetailResponseSchema } from '../../schemas/shipments.js';

// ...inside the handler:

const res = await queryShipmentsApi<unknown>(
    activeClient, config, `/guide/${tracking}`, {},
);

if (!res.ok) { /* ... */ }

const validated = parseToolResponse(
    ShipmentDetailResponseSchema,
    res.data,
    'envia_get_shipment_detail',
);

const s = validated.data?.[0];
```

**Wiring rules:**
- The `queryShipmentsApi` (or whichever fetch helper the tool uses)
  generic argument becomes `<unknown>` — the Zod schema is now the
  source of truth for the response type.
- The tool name string passed to `parseToolResponse` must match exactly
  the tool name registered with `server.registerTool()`. Use the post-
  rename names (e.g. `envia_quote_shipment`, not `quote_shipment`).
- Do not re-import the original TypeScript type unless the formatter
  needs it for documentation purposes. The schema's inferred type
  flows through `validated`.

#### Step 3 — Add the validation test

File: `tests/schemas/{domain}.test.ts` (new directory `tests/schemas/`).

```typescript
import { describe, it, expect } from 'vitest';
import { ShipmentDetailResponseSchema } from '../../src/schemas/shipments.js';

describe('ShipmentDetailResponseSchema', () => {
    it('parses the live 2026-04-27 sandbox shape', () => {
        const liveFixture = {
            data: [
                {
                    id: 170617,
                    tracking_number: '9824458744',
                    folio: null,
                    status_id: 4,
                    status: 'Canceled',
                    name: 'dhl',
                    service: 'express',
                    sender_name: 'Almacen Test',
                    sender_postalcode: '03940',
                    // ...all fields present in the live capture
                },
            ],
            total_rows: 1,
        };

        const result = ShipmentDetailResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects responses missing tracking_number', () => {
        const broken = { data: [{ id: 1, status_id: 1 }], total_rows: 1 };
        const result = ShipmentDetailResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = {
            data: [
                {
                    id: 1,
                    tracking_number: 'X',
                    status_id: 1,
                    new_backend_field_added_next_quarter: 'hello',
                },
            ],
            total_rows: 1,
        };
        const result = ShipmentDetailResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });
});
```

**Test authoring rules:**
- Every schema gets at least these three tests: live shape passes,
  required-field-missing fails, passthrough accepts extras.
- The "live shape" fixture in the test must be **byte-for-byte from the
  curl capture** in §5.2 (with sensitive values redacted if needed).
  This is the single most important test — it is the regression guard
  against fixture/reality drift.
- Do not abbreviate the live fixture. If the backend returns 50 fields,
  the test fixture has 50 fields.

#### Step 4 — Verify no regression in the existing tool tests

After the wiring change, the existing tests in `tests/tools/{path}/{tool}.test.ts`
should still pass without modification. If they do not:
1. Check whether the existing test fixture matches the live shape. If
   not, the test fixture is wrong (from the audit era) and **the test
   fixture must be updated**, not the tool code.
2. The schema may have a typo. Compare against the curl capture.
3. Do NOT loosen the schema to make a test pass — the fixture is what's
   wrong.

### 5.5 Logger event sample

After a successful migration, exercise the strict-mode path locally:

```bash
MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run tests/tools/.../{tool}.test.ts
```

If the existing test fixtures are correct, this should still pass. If
strict mode reveals a fixture mismatch, fix the fixture (it's wrong) or
the schema (if you misread the live capture). **Do not relax the schema.**

### 5.6 Phase 1 tool list (the 10 to migrate, in this order)

The order is deliberate: each tool in the list either has a confirmed
shape bug already documented (1–5) or is among the highest-call-volume
tools (6–10). Migrating in this order maximises Datadog signal early.

| # | Tool | File | Domain | Why on Phase 1 |
|---|---|---|---|---|
| 1 | `envia_get_shipment_detail` | `src/tools/shipments/get-shipment-detail.ts` | shipments | Severe bug confirmed 2026-04-27 |
| 2 | `envia_list_shipments` | `src/tools/shipments/list-shipments.ts` | shipments | Medium bug confirmed |
| 3 | `envia_get_shipments_status` | `src/tools/shipments/get-shipments-status.ts` | shipments | High bug confirmed |
| 4 | `envia_get_shipment_invoices` | `src/tools/shipments/get-shipment-invoices.ts` | shipments | Medium bug confirmed |
| 5 | `envia_create_ticket` | `src/tools/tickets/create-ticket.ts` | tickets | Linkage gap fixed; schema codifies the new shape |
| 6 | `envia_get_carrier_constraints` | `src/tools/get-carrier-constraints.ts` | carriers | High-value new tool, no prior schema |
| 7 | `envia_quote_shipment` | `src/tools/get-shipping-rates.ts` | shipping | Most-called tool by volume |
| 8 | `envia_create_shipment` | `src/tools/create-label.ts` | shipping | Highest revenue impact per call |
| 9 | `envia_track_package` | `src/tools/track-package.ts` | shipping | Most-called read |
| 10 | `envia_list_orders` | `src/tools/orders/list-orders.ts` | orders | High-volume, complex shape |

**Tools 1–5** already have working types and tests; the migration is
straightforward (capture live shape → write schema → wire helper → add
schema test). Estimated 30 min each.

**Tools 6–10** may not have prior schemas matching live shape. Spend
extra time on §5.2 (live capture) for these. Estimated 45 min each.

Total estimated: ~6.5 hours. Buffer included in the 6–9 hour overall
estimate.

---

## 6. Testing strategy

### 6.1 What gets added

For each of the 10 tools:
- One new schema test file at `tests/schemas/{domain}.test.ts` (or appended
  if multiple tools share a domain). 3 minimum tests per schema (live shape,
  missing-field rejection, passthrough acceptance).

For the helper:
- `tests/utils/response-validator.test.ts` — 6 tests:
  1. Returns parsed data on success.
  2. Returns raw data on failure in 'warn' mode (default).
  3. Logs `schema_validation_failed` event on failure.
  4. Throws `SchemaValidationError` in 'strict' mode.
  5. Includes the tool name in the error.
  6. Truncates issues to 5 in the log.

### 6.2 Total test delta

- 10 schemas × 3 tests = 30 schema tests
- 6 helper tests
- **Net new: 36 tests.** Existing 1581 tests must continue to pass
  unmodified.

### 6.3 Strict-mode CI guard

Add to `package.json` scripts:

```json
"test:strict": "MCP_SCHEMA_VALIDATION_MODE=strict vitest run"
```

This script runs the full test suite with strict mode on. It is what CI
will eventually call (out of scope for Phase 1) but landing it in
`package.json` now means devs can use it locally to surface drift early.

---

## 7. Operational verification (do not skip)

After build + tests pass, the implementer must run these three checks:

### 7.1 Live sandbox smoke (the 10 migrated tools, hitting real backend)

```bash
# From the MCP server directory:
npm run build
node dist/index.js &  # local stdio MCP server
# Use the staging Heroku app instead if local stdio is awkward:
export MCP_URL="https://envia-mcp-stage-8942f8239481.herokuapp.com"
export TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
```

For each of the 10 migrated tools, issue one real call (the same calls
already documented in `_docs/SMOKE_TEST_PLAYBOOK.md`) and verify:
- The tool returns a successful, non-empty response.
- No `schema_validation_failed` warnings appear in the logs.
- The output to the LLM is unchanged from the pre-migration version
  (compare against `_docs/DEPLOY_LOG_2026_04_27.md` reference outputs).

If any tool emits `schema_validation_failed`, that is the schema being
wrong (or the captured fixture being wrong). Fix the schema, not the
production data. Do not move on.

### 7.2 Strict-mode local run

```bash
MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run
```

All 1581 + 36 tests must still pass. If any test fails in strict mode
that passed in warn mode, the test fixture is the source of truth that
needs adjustment.

### 7.3 Datadog warning sanity-check

After deploying to stage with the new build, manually trigger one tool
call against a known-mismatched endpoint (none of the 10 migrated tools
should mismatch — try `envia_get_shipments_surcharges` which is NOT on
Phase 1 and was untouched, so the helper is not even invoked). Confirm
no spurious `schema_validation_failed` logs appear in Datadog.

If a spurious log appears for a tool NOT on the Phase 1 list, that
indicates the helper was wired into a non-Phase-1 tool by accident.
Revert that change.

---

## 8. Acceptance criteria (executable checklist)

Mark each `[ ]` → `[x]`. Do not commit until all are checked.

- [ ] `src/utils/response-validator.ts` exists, exports `parseToolResponse`
      and `SchemaValidationError`, reads `MCP_SCHEMA_VALIDATION_MODE` once
      at module load.
- [ ] `src/schemas/` directory exists with `_index.ts` and `README.md`.
- [ ] Each of the 10 Phase 1 tools imports and uses `parseToolResponse`.
- [ ] Each schema has a JSDoc comment citing "Verified live YYYY-MM-DD against {endpoint}".
- [ ] No tool from the 63 not on Phase 1 was modified.
- [ ] `tests/schemas/` directory exists with at least one test file per
      migrated domain.
- [ ] `tests/utils/response-validator.test.ts` has 6 tests, all passing.
- [ ] `npm run build` exits 0.
- [ ] `npx vitest run` passes 100% (target: 1617 tests = 1581 + 36).
- [ ] `MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run` passes 100%.
- [ ] `package.json` has the new `test:strict` script.
- [ ] Live sandbox smoke (§7.1) for the 10 migrated tools yields zero
      `schema_validation_failed` warnings.
- [ ] No commit on `main`. Branch is `mcp-expansion` throughout.

---

## 9. Commit and push

Commit per the L-G2 template:

```
feat(schemas): runtime Zod validation in response layer (Phase 1, 10 tools)

[Body. Suggested 30–50 lines summarising what was added. Keep the
"Phase 1 of 2" framing prominent so future readers know rollout to the
remaining 63 tools is still pending.]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Then `git push origin mcp-expansion`. Do NOT push to `main`.

---

## 10. Anti-patterns to avoid

1. **Do NOT use `.strict()` on schemas.** The backend frequently returns
   extra fields; strict mode produces false alarms.
2. **Do NOT use `z.coerce.number()` or `.transform()`.** Coercion hides
   drift bugs. We want to detect when backend changes string ↔ number.
3. **Do NOT add validation to tools outside the Phase 1 list.** Phase 2
   has its own spec; do not pre-empt it.
4. **Do NOT modify the existing `EnviaApiClient` HTTP layer.** Validation
   is a wrap, not a refactor.
5. **Do NOT throw in 'warn' mode.** The default is silent + log.
6. **Do NOT read `process.env.MCP_SCHEMA_VALIDATION_MODE` per-call.** Read
   once at module load.
7. **Do NOT rebuild fixtures by inventing field values.** Capture from the
   live API per §5.2.
8. **Do NOT delete or modify any of the 1581 existing tests.** Add to,
   don't replace.
9. **Do NOT add console.log statements.** All observability flows through
   pino.
10. **Do NOT skip the strict-mode test run** (§7.2). It is the single
    most important verification step in this entire spec.

---

## 11. Open questions and verified assumptions

These were considered during spec authoring and are documented here so
the implementer does not re-litigate them:

- **Q: Should we also validate request payloads (`api_key`, args) at
  runtime?** A: No — the MCP SDK already validates Zod input schemas
  per-tool. This spec only covers responses.
- **Q: Should we cache validation results?** A: No — `safeParse` on a
  parsed JSON object is sub-millisecond. Caching adds complexity for no
  measurable gain.
- **Q: Should the helper expose the parse result type (success/failure)
  to the caller?** A: No — encapsulation of warn-vs-strict behaviour is
  the whole point. If a tool needs to react differently on parse
  failure, that is a future extension.
- **Q: What about endpoints currently returning 404 in sandbox (clients
  family)?** A: Those tools are NOT on Phase 1. They will be addressed
  in Phase 2 once sandbox is fixed or production validation is feasible.
- **Q: What about endpoints currently returning empty arrays in sandbox
  (surcharges)?** A: Those tools are NOT on Phase 1. The schema for
  Phase 2 may need to be derived from production data.
- **Verified assumption:** Zod is already a dependency
  (`@modelcontextprotocol/sdk` requires it). No new dependency added.
- **Verified assumption:** pino is the canonical logger
  (`src/utils/logger.ts`). No new logger added.
- **Verified assumption:** TypeScript strict mode is on
  (`tsconfig.json`). The cast `data as z.infer<S>` requires it.

---

## 12. Spec metadata

- **Author:** Claude Opus 4.7 (1M context), session 2026-04-28.
- **Reviewer:** Jose Vidrio (CTO).
- **Status:** READY FOR IMPLEMENTATION (Phase 1).
- **Phase 2 owner:** TBD (separate spec, separate session).
- **Branch target:** `mcp-expansion`.
- **Estimated effort:** 6–9 hours (single Sonnet 4.6 session).
- **Acceptance:** §8 checklist must be 100% green before commit.
- **Predecessor specs:** `_docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md`
  (same authoring style, same level of detail).

---

## 13. Reporting back

When the session completes, the final response must include:

1. List of all files created/modified, with line counts.
2. Final test count and `npm run build` exit code.
3. Strict-mode test count.
4. Commit hash and confirmation push succeeded.
5. The §7.1 smoke test results (one line per tool: PASS / FAIL with
   error if any).
6. Any judgment calls deviating from this spec, with rationale.
7. List of open items for Phase 2 (any tool that revealed a schema
   surprise during Phase 1 worth flagging).

If any acceptance criterion in §8 cannot be met, **stop immediately and
report**. Do not paper over a failing check.

---

End of spec.
