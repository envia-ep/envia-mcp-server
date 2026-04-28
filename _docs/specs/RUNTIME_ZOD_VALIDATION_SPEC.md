# Spec — Runtime Zod Validation in the Response Layer (Phase 1)

**Version:** v1.2 — drafted 2026-04-28 by Jose Vidrio (CTO) + Claude Opus 4.7.
Iteration 2 added §1.5, §6.4, expanded §3, §4.1, §5.6, §7, §10, §11.
Iteration 3 added §3.10 (security), §5.7 (commit hygiene), §6.6 (completeness self-check), §7.4 (performance budget), §14 (code-review + rollback), §15 (observability), expanded §4.1, §10, §11.
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

## 1.5 Schema evolution — when and how to update a schema later

This is operational guidance for after Phase 1 is in production. The
implementer should familiarise themselves with it because it shapes
some of the design decisions in §3.

**When the backend ADDS a field** (forward-compatible):
- The passthrough behaviour (§3.2) accepts the new field silently.
- No schema update is required for tools that do not consume the new
  field.
- When a future tool wants to consume the field, the schema gets
  extended with `.optional()` for the new field. No breaking change.

**When the backend RENAMES a field** (breaking):
- A `schema_validation_failed` warning fires in Datadog within seconds
  of the first request.
- The fix is: update the schema to the new field name, update the
  formatter to read the new name, ship a coordinated MCP release.
- This is exactly the workflow that the 5 audit bugs would have
  followed if Phase 1 had been in place at the time.

**When the backend changes a TYPE** (e.g. number → string):
- Same as rename: warning fires, schema gets updated, fix ships.
- Use `z.union([z.string(), z.number()])` if the backend is in the
  middle of a migration and both shapes are valid temporarily.

**Never weaken a schema to silence warnings.** If a `schema_validation_failed`
warning is firing in production, that is signal — do not turn it off
with `.optional()` on every field. Investigate the root cause.

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

### 3.7 Nullability conventions in schemas

Pick the right Zod modifier for each field based on what the backend
ACTUALLY returns in the live capture (not what the existing TS type says):

| Backend behaviour in live capture | Zod modifier | Example |
|---|---|---|
| Field always present, value `null` allowed | `.nullable()` | `folio: z.string().nullable()` |
| Field sometimes absent (key missing), never `null` | `.optional()` | `coverage_summary: CoverageSummarySchema.optional()` |
| Field sometimes absent AND sometimes `null` | `.nullable().optional()` | `delivered_at: z.string().nullable().optional()` |
| Field always present, value never `null` | (no modifier) | `tracking_number: z.string()` |

**Rule of thumb:** if the curl in §5.2 ever shows the field as `null`,
use `.nullable()`. If the curl ever omits the key entirely, use
`.optional()`. Both can apply.

### 3.8 Tests in strict mode — the contract

Strict mode (`MCP_SCHEMA_VALIDATION_MODE=strict`) is the diagnostic
that tells us whether our test fixtures match reality. It is the most
valuable single check in this spec.

When strict mode reveals a failing test that previously passed:
- **Default conclusion:** the test fixture is wrong (was hand-typed
  during the audit era; the backend evolved). Update the fixture to
  the live shape.
- **Less common:** the schema is wrong (you misread the curl output).
  Re-capture and verify.
- **NEVER weaken the schema** (`.optional()` everywhere, `.passthrough`
  abuse) just to make a test pass. That defeats the purpose.

If a test cannot reasonably be made to match a real backend shape
(e.g. the backend will never return that error structure), it is the
test that needs to be removed, not the schema.

### 3.9 Date-time, currency, and string-vs-number conventions

The Envia backend has known idiosyncrasies for some types:

- **Timestamps:** always strings of the form `"2026-04-27 13:27:18"`
  (no timezone). Use `z.string()` — do NOT use `z.string().datetime()`
  (that requires ISO 8601 with timezone, which the backend does not
  produce).
- **Currency amounts:** usually `number` (e.g. `14.28`) but for some
  COD endpoints they come as strings. Use `z.union([z.number(),
  z.string()])` for any amount field that you observe as either type
  in the live capture. Only one type → use that one.
- **Percentages from `/shipments/packages-information-by-status`:**
  pre-formatted strings with `%` baked in (e.g. `"100.00%"`). Use
  `z.string()`. This was the bug in commit `1af57ad`.
- **Boolean-like integers:** the backend uses `0`/`1` for many flags
  (`active`, `is_default`, `is_favorite`, `private`). Schema should
  use `z.number()` even when the formatter coerces to boolean.

### 3.10 Security guardrails

This is non-negotiable. Schema validation runs in the request path
and surfaces information about response payloads to logs and
(potentially) error responses. Every guardrail below is a hard
constraint, not a recommendation.

**S1 — Never log raw response data on validation failure.**

The default Zod `safeParse` error includes `received` values for each
failed field. Those values may be PII (customer names, emails, phone
numbers, tracking numbers, addresses, COD amounts) or carrier API
secrets. The helper in §4.1 emits ONLY `path`, `code`, and `message`
— it does NOT include `received`. Verify your implementation matches
this. If you find yourself calling `JSON.stringify(data)` anywhere in
the helper, stop.

**S2 — Truncate issue lists.**

A pathological backend response could produce thousands of issues
(e.g. an array of 10,000 records, all malformed). The helper truncates
to the first 5 issues in the log. Do not raise this number.

**S3 — Never include the full payload in a thrown error.**

`SchemaValidationError` carries `tool` and `issues` (already
sanitized). It does NOT carry the raw response. If the strict-mode
error reaches an HTTP error handler that serialises it to JSON, only
the sanitized fields surface.

**S4 — Schemas must not be sourced from the request.**

Schemas are imported at module load. Never accept "schema as parameter"
from a runtime input — that opens a deserialization-of-trust attack
surface. If a tool needs different schemas for different cases, declare
each one statically and select between them with a switch.

**S5 — Token redaction in any payload echo.**

If for any reason you need to log a snippet of the raw response
(allowed only in local dev for debugging, never in committed code),
the snippet must redact:
  - `Authorization` header values
  - Any field named `api_key`, `apiKey`, `token`, `access_token`,
    `secret`, `password`, `auth_token`, `webhook_token`
  - Any value that matches the JWT pattern `^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$`

Phase 1's `parseToolResponse` does not echo any response payload —
this rule exists pre-emptively for any extension.

**S6 — Strict mode is a development tool, not a production toggle.**

Setting `MCP_SCHEMA_VALIDATION_MODE=strict` in production would cause
backend forward-compatible additions to take down user requests.
Never enable strict mode on the production Heroku app. The CI guard
in §6.3 is the only place strict mode runs in any pipeline.

**S7 — Log volume bounds.**

A persistent backend mismatch could fire `schema_validation_failed`
on every single request to a popular tool. Sustained high-cardinality
logging is a self-DoS. Document a Datadog alert (§15) that catches
"sustained schema_validation_failed > N/min" and pages someone before
the log volume causes problems.

**S8 — Schemas live in source control.**

Never load schemas from a remote URL, S3, or any runtime store. Phase
1 schemas are committed code, reviewed in PRs, deployed atomically
with the binary. This rules out a class of attacks where an attacker
modifies a remote schema to bypass validation.

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
    //
    // SECURITY (§3.10 S1, S2): we emit ONLY path / code / message.
    // Zod's default error formatting can include `received` values
    // — those are PII risk (customer names, phones, addresses,
    // tracking numbers, COD amounts). NEVER add `received` here.
    // NEVER stringify `data` here. NEVER raise the slice(0, 5) cap.
    logger.warn(
        {
            event: 'schema_validation_failed',
            tool: toolName,
            issue_count: result.error.issues.length,
            issues: result.error.issues.slice(0, 5).map((i) => ({
                path: i.path.join('.'),
                code: i.code,
                message: i.message,
                // DO NOT add `received: i` or anything that surfaces
                // the actual value at the failed path.
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

**Edge cases the helper must handle correctly:**

| Input `data` | Expected behaviour |
|---|---|
| `null` | `safeParse` fails → log warning → return `null` (warn) or throw (strict). Tools must check for `null` explicitly before accessing properties; this was already true pre-validation. |
| `undefined` | Same as `null`. Some endpoints return 204 No Content; the fetch wrapper surfaces this as `undefined`. |
| `{}` (empty object) | If schema requires fields, `safeParse` fails. Behaviour as above. |
| `[]` (empty array) | If schema is `z.array(X)`, parses successfully. If schema is `z.object({...})`, parses fail. |
| Backend returns a string error like `"Internal Server Error"` instead of JSON | The fetch wrapper should already mark `res.ok = false` so the tool returns BEFORE calling `parseToolResponse`. If somehow this slips through, the helper returns the string cast as `z.infer<S>`, and the formatter will fail accessing properties. The log will fire. This is acceptable — it is a backend bug being surfaced. |

**Correlation ID:** the existing pino logger picks up `correlation_id`
from the active context (Sprint 4a, `decorateServerWithLogging` in
`src/utils/server-logger.ts`). The `parseToolResponse` helper does not
need to manually pass it — pino does that automatically when called
from within a tool handler that was registered through the decorated
server. Verify this assumption by checking that the existing
`tool_call_complete` events carry `correlation_id`; if they do, the
new `schema_validation_failed` events will too.

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
3. Add a short README at `src/schemas/README.md`. Required content:

   ```markdown
   # Zod schemas (response validation)

   Schemas in this directory mirror the `src/types/` split (one file per
   domain: `shipments.ts`, `tickets.ts`, `orders.ts`, etc.).

   ## Conventions

   - Schema name = TypeScript type name + `Schema` suffix.
     Example: `ShipmentDetailResponseSchema` parses into the same
     shape as `ShipmentDetailResponse` from `src/types/`.
   - Field-level rules in spec §3.7 (nullability) and §3.9 (types).
   - Every schema gets a JSDoc citing "Verified live YYYY-MM-DD against
     {endpoint}".
   - Every schema is consumed via `parseToolResponse(schema, data,
     toolName)` from `src/utils/response-validator.ts`. Do not call
     `.parse()` or `.safeParse()` directly from tool code.

   ## Adding a new schema

   See `_docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md` §5.4 for the
   migration template.
   ```

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

**Schema reuse for shared sub-shapes (DRY principle):**

Several response shapes in the Envia backend share sub-objects:

| Sub-shape | Used in | Suggested name |
|---|---|---|
| Sender / consignee address (flat fields) | `/guide/{tracking}`, `/shipments`, `/get-shipments-ndr` | `FlatAddressSchema` |
| Address (nested object) | `/all-addresses`, some legacy `/shipments` results | `NestedAddressSchema` |
| Money amount (number-or-string) | `total`, `grand_total`, `cash_on_delivery_amount` | `MoneyAmountSchema` |
| ISO datetime string (no TZ) | every `created_at`, `updated_at`, `shipped_at` | `EnviaDateTimeSchema = z.string()` |
| Carrier reference (id + slug + display) | every list endpoint that surfaces carriers | `CarrierRefSchema` |

When two of the 10 Phase 1 tools share a sub-shape, define it ONCE
at the top of the relevant `src/schemas/{domain}.ts` file and import
or compose it in the consumers. Concretely:

```typescript
// src/schemas/shipments.ts
const FlatSenderSchema = z.object({
    sender_name: z.string().optional(),
    sender_email: z.string().optional(),
    sender_phone: z.string().optional(),
    // ...
});

const FlatConsigneeSchema = z.object({
    consignee_name: z.string().optional(),
    // ...
});

const ShipmentDetailRecordSchema = FlatSenderSchema
    .merge(FlatConsigneeSchema)
    .merge(z.object({
        id: z.number(),
        tracking_number: z.string(),
        // ...
    }));
```

DO NOT extract sub-schemas across domain files (e.g. don't put
`FlatAddressSchema` in `src/schemas/_shared.ts` and import it from
`shipments.ts`, `tickets.ts`, etc.). Cross-file sharing is a Phase 2
optimisation. In Phase 1, a small amount of duplication across
domain files is preferable to creating a coupling that makes Phase 2
schemas harder to evolve independently.

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

**Import path depth (do not get this wrong — TypeScript will catch it
but it's annoying):**

| Tool location depth | Import path to helper | Import path to schema |
|---|---|---|
| `src/tools/X.ts` (root tools) | `'../utils/response-validator.js'` | `'../schemas/{domain}.js'` |
| `src/tools/{subdir}/X.ts` (e.g. `shipments/`, `orders/`) | `'../../utils/response-validator.js'` | `'../../schemas/{domain}.js'` |
| `src/tools/{subdir}/{subsubdir}/X.ts` (none in Phase 1) | `'../../../utils/...'` | `'../../../schemas/...'` |

Verify with `npm run build` after each tool migration — a wrong path
will fail compilation immediately.

**Type vs schema-inferred type — when to use which:**

The existing `src/types/` files declare TypeScript types. The schemas
in `src/schemas/` produce runtime-validated types. **Where they
diverge (which they will, after live-shape capture), the schema is the
source of truth.**

- Old code: `import type { ShipmentDetailResponse } from '../types/shipments.js';`
- New code: `import { ShipmentDetailResponseSchema } from '../schemas/shipments.js';`
  → use `z.infer<typeof ShipmentDetailResponseSchema>` if you need the
  type explicitly. In most cases the implicit return type from
  `parseToolResponse` is enough.

The TS type in `src/types/` may stay (other code depends on it) but
should NOT be the basis for the schema. Use the live curl.

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

| # | Tool name | File | Backend endpoint | Schema file → name | Why on Phase 1 |
|---|---|---|---|---|---|
| 1 | `envia_get_shipment_detail` | `src/tools/shipments/get-shipment-detail.ts` | `GET /guide/{tracking}` (queries) | `src/schemas/shipments.ts` → `ShipmentDetailResponseSchema` | Severe bug confirmed in commit `a99736a` |
| 2 | `envia_list_shipments` | `src/tools/shipments/list-shipments.ts` | `GET /shipments` (queries) | `src/schemas/shipments.ts` → `ShipmentListResponseSchema` | Medium bug in `a99736a` |
| 3 | `envia_get_shipments_status` | `src/tools/shipments/get-shipments-status.ts` | `GET /shipments/packages-information-by-status` (queries) | `src/schemas/shipments.ts` → `ShipmentStatusStatsSchema` | HIGH bug in `9007a5d` (flat-shape) + cosmetic in `1af57ad` (% strings). Two regressions in 24h — schema is highest-value here. |
| 4 | `envia_get_shipment_invoices` | `src/tools/shipments/get-shipment-invoices.ts` | `GET /shipments/invoices` (queries) | `src/schemas/shipments.ts` → `InvoiceListResponseSchema` | Medium bug in `9007a5d` (DataTables wrapper, total_shipments) |
| 5 | `envia_create_ticket` | `src/tools/tickets/create-ticket.ts` | `GET /guide/{tracking}` (lookup) + `POST /company/tickets` (queries) | `src/schemas/tickets.ts` → `CreateTicketResponseSchema` (POST), reuse `ShipmentDetailResponseSchema` (GET) | Linkage gap fixed in `9aee101`. Two endpoints touched per call — schema covers both. |
| 6 | `envia_get_carrier_constraints` | `src/tools/get-carrier-constraints.ts` | `GET /carrier-constraints/{id}` (carriers/shipping) | `src/schemas/carrier-constraints.ts` → `CarrierConstraintsResponseSchema` | C11 spec v3 — backend just shipped (verified live). Schema codifies the v3 contract end-to-end. |
| 7 | `envia_quote_shipment` | `src/tools/get-shipping-rates.ts` | `POST /ship/rate` (carriers/shipping) | `src/schemas/shipping.ts` → `QuoteShipmentResponseSchema` | Most-called tool. No prior shape bugs — sensitive surface, validate first. |
| 8 | `envia_create_shipment` | `src/tools/create-label.ts` | `POST /ship/generate` (carriers/shipping) | `src/schemas/shipping.ts` → `CreateShipmentResponseSchema` | Highest revenue-per-call. Backend errors are mission-critical — schema MUST cover error path too. |
| 9 | `envia_track_package` | `src/tools/track-package.ts` | `POST /ship/generaltrack` (carriers/shipping) | `src/schemas/shipping.ts` → `TrackPackageResponseSchema` | Most-called read. Per-event nested shape — extra care on event array. |
| 10 | `envia_list_orders` | `src/tools/orders/list-orders.ts` | `GET /v4/orders` (queries) | `src/schemas/orders.ts` → `OrderListResponseSchema` | Heavily used by chat agent. Complex nested order/customer/shipment data — biggest schema in Phase 1. |

**Migration dependencies** (do these in order, do not parallelise):
- Tool #1 (`envia_get_shipment_detail`) writes `ShipmentDetailResponseSchema`
  in `src/schemas/shipments.ts`. Tool #5 (`envia_create_ticket`) **re-imports
  that exact schema** for its tracking-number lookup. Migrating #5 before
  #1 means the agent has to write the same schema twice or guess. **Do
  #1 first.**
- Tool #2 and #4 share `src/schemas/shipments.ts` with #1, #3. Append to
  the same file — do not create duplicates.
- Tools #6–9 each get their own file (`carrier-constraints.ts`,
  `shipping.ts`). #7, #8, #9 share `shipping.ts`.

**Tool #8 (`envia_create_shipment`) needs special care:** it can return
either a success shape with tracking + label URL, or an error shape
with carrier-mapped errors. The schema should be a `z.union` or
`z.discriminatedUnion` over both shapes. Capture both via curl (one
successful create, one with deliberately bad input).

**Time budget:**
- Tools 1–5 (already have working types): ~30 min each = 2.5h
- Tools 6, 9, 10 (medium complexity): ~45 min each = 2.25h
- Tools 7, 8 (high complexity, multi-shape): ~60 min each = 2h
- Plus infra (§4): ~1h, helper tests (§6.2): ~30min, verification (§7): ~30min

Total ≈ 8h. Within the 6–9h envelope.

### 5.7 Commit hygiene during the migration

Atomic commits are the difference between "we can revert tool #4 if
something explodes" and "we can't revert anything without losing the
other 9 migrations". Do this:

**One commit for infrastructure** (must come first):
- `src/utils/response-validator.ts`
- `src/utils/server-logger.ts` (JSDoc update)
- `src/schemas/_index.ts`, `src/schemas/README.md`
- `tests/utils/response-validator.test.ts`
- `package.json` `test:strict` script
- Commit message: `feat(schemas): add runtime validation infrastructure (Phase 1 of 2)`

**One commit per tool migration** (in the order from §5.6):
- The schema file (or schema additions if the file already exists from
  a previous tool migration)
- The tool file
- The test file (or additions to an existing test file)
- Existing tool tests if their fixtures had to be updated to live shape
- Commit message: `feat(schemas): migrate envia_get_shipment_detail to runtime validation (1/10)`
- The `(N/10)` suffix lets reviewers track progress at a glance.

**Rationale:** if tool #6 reveals a problem with the helper that
requires changes to `parseToolResponse`, you go back, edit
`response-validator.ts`, and the change is in the FIRST commit (infra)
— which means tools #1–5 effectively pick up the fix without their
commits being touched. Compare to a single mega-commit where any
infra change requires re-opening every tool diff.

**Push after each commit.** `git push origin mcp-zod-validation`. The
worst case is power loss / accidental rebase — local commits not
pushed are lost work.

**Build + tests must be green at every commit.** If a tool migration
causes a temporary failure, fix it before committing. Never `--force`,
never `--no-verify`. If tests fail in a way that requires updating a
fixture for a tool NOT yet migrated, that means you accidentally
touched something out of scope — back out, re-scope, retry.

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

If the script name `test:strict` already exists, append a suffix
(`test:strict:phase1`) — do not overwrite.

### 6.4 Edge-case tests beyond the 3-test minimum (recommended for the
        more complex schemas)

For tools #3 (status), #6 (carrier-constraints), #8 (create-shipment),
#9 (track-package), and #10 (list-orders), add these additional tests
where they apply to the shape:

- **Empty list:** schema for a list endpoint must accept `{ data: [] }`.
- **Single-element list:** sanity test, smaller than full live capture.
- **Optional sub-object absent:** e.g. `coverage_summary` absent in
  carrier-constraints v3. Verify schema does not require it.
- **Optional sub-object present:** e.g. `coverage_summary` present and
  has `_unavailable` placeholder.
- **Nullable field returns `null`:** e.g. `delivered_at: null`.
- **Nullable field returns string:** e.g. `delivered_at: "2026-04-27 13:27:18"`.
- **Discriminated union (#8 only):** one test for success shape, one
  for error shape. Both should parse against the union.

Total additional test count: ~20 across the 5 complex tools (4 each,
roughly). Counted into the ~36 net new test target.

### 6.5 Fixture sourcing

For each schema test, the "live shape" fixture comes from §5.2
(real curl output). The fixture lives **inline in the test file**, not
in a separate JSON. Reasons:
- Keeps test self-contained and reviewable in a single file.
- Type narrowing works: TypeScript catches typos in the fixture.
- No `fs.readFileSync` overhead at test start.

If a fixture is large (>200 lines) consider extracting to a `tests/
fixtures/{domain}/{tool}.fixture.ts` exporting a single const. Phase 1
does not require this — it's a Phase 2 optimisation if the test files
become unwieldy.

### 6.6 Migration completeness self-check

A mechanical guard against "I forgot to wire one of the 10 tools".
Add this test file:

`tests/utils/migration-completeness.test.ts`:

```typescript
/**
 * Phase 1 completeness guard.
 *
 * Verifies that every tool listed as "Phase 1" in
 * _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.6 imports the
 * parseToolResponse helper. If a tool is on the Phase 1 list but the
 * source file does not import the helper, the migration was forgotten.
 *
 * This test is intentionally simple: a grep for the import statement.
 * It does NOT verify the helper is invoked correctly — that is the
 * responsibility of the per-tool tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PHASE_1_TOOLS = [
    'src/tools/shipments/get-shipment-detail.ts',
    'src/tools/shipments/list-shipments.ts',
    'src/tools/shipments/get-shipments-status.ts',
    'src/tools/shipments/get-shipment-invoices.ts',
    'src/tools/tickets/create-ticket.ts',
    'src/tools/get-carrier-constraints.ts',
    'src/tools/get-shipping-rates.ts',
    'src/tools/create-label.ts',
    'src/tools/track-package.ts',
    'src/tools/orders/list-orders.ts',
] as const;

describe('Phase 1 migration completeness', () => {
    for (const path of PHASE_1_TOOLS) {
        it(`${path} imports parseToolResponse`, () => {
            const source = readFileSync(resolve(process.cwd(), path), 'utf8');
            expect(source).toMatch(/parseToolResponse/);
            expect(source).toMatch(/from ['"](?:\.\.\/)+utils\/response-validator\.js['"]/);
        });
    }
});
```

This test alone does NOT prove correctness — a tool could `import` the
helper but never call it. The per-tool tests catch that. But this test
catches the "I migrated 9 out of 10 and forgot the 10th" mistake,
which is the highest-likelihood human error in a 10-step mechanical
migration.

---

## 7. Operational verification (do not skip)

After build + tests pass, the implementer must run these three checks:

### 7.1 Schema-vs-live verification (offline, does NOT need a running MCP)

The most important verification step. Does NOT require deploying anything.

For each of the 10 migrated tools, the agent issues a curl directly to
the backend (bypassing the MCP) and confirms the response parses
against the new schema:

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"

# Example for tool #1 (get_shipment_detail):
curl -s -m 15 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" \
  "https://queries-test.envia.com/guide/9824510570" \
  > /tmp/live-shipment-detail.json

# Then locally, verify the schema parses it:
cat > /tmp/verify.mjs << 'EOF'
import { ShipmentDetailResponseSchema } from './dist/schemas/shipments.js';
import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/tmp/live-shipment-detail.json', 'utf8'));
const result = ShipmentDetailResponseSchema.safeParse(data);
if (!result.success) {
    console.error('Schema parse FAILED');
    console.error(JSON.stringify(result.error.issues.slice(0, 10), null, 2));
    process.exit(1);
}
console.log('PASS');
EOF
node /tmp/verify.mjs
```

The exact endpoint to hit per tool is in §5.6's `Backend endpoint`
column. If the endpoint requires a path param (tracking number,
shipment id, etc.), use the live values from the most recent smoke
test in `_docs/DEPLOY_LOG_2026_04_27.md`:
- Tracking number: `9824510570` or `9824458744`
- Shipment id: `170617` or `170633`
- Carrier id: `1` (FedEx)
- Service id: `7` (DHL Express)
- Ticket id: `3186` or `3177`

For endpoints that need a generated input (quote, create), use the same
payload as the smoke test playbook.

### 7.2 Strict-mode local run (most important regression check)

```bash
MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run
```

All ~1617 tests must pass (1581 baseline + ~36 new — exact count
expected to land between 1610 and 1625; any delta outside that band
must be explained in the final report). If any test fails in strict
mode that passed in warn mode, the test fixture is the source of
truth that needs adjustment per §3.8.

### 7.3 Stage-deploy verification (skip if branch not deployed)

This step is **optional during the implementation session** — the
spec does not require Sonnet to deploy `mcp-zod-validation` to Heroku
stage (that is Jose's call, similar to the previous mcp-expansion
deploy decision).

If the branch IS deployed to stage during the session:
- Trigger one tool call per Phase 1 tool through the chat agent or
  via direct MCP call.
- Check Datadog or Heroku logs for `schema_validation_failed` events.
- Zero events expected for Phase 1 tools (their schemas should match
  live).
- Up to many events expected for non-Phase-1 tools (their helpers
  were not wired — these warnings should NOT exist; if they appear
  it means the helper leaked into a non-target tool by accident).

If the branch is NOT deployed:
- §7.1 (offline schema-vs-live) is sufficient verification for this
  session.
- Note in the final report that stage verification is pending.

### 7.4 Performance budget — verify Zod overhead is sub-millisecond

Zod parsing overhead has been measured at well under 1 ms for typical
MCP response sizes (50–500 keys, no deep nesting). This step verifies
the migration did not introduce a pathological case (e.g. an array
of 10,000 items, or a regex-heavy schema).

For each migrated tool, run a micro-benchmark in the test suite:

```typescript
// In one of the schema test files (e.g. tests/schemas/shipments.test.ts)
it('parses a representative payload in under 5ms (p95 ceiling)', () => {
    const fixture = /* the live shape from §5.2 */;
    const ITERATIONS = 1000;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        ShipmentDetailResponseSchema.safeParse(fixture);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / ITERATIONS;
    expect(avgMs).toBeLessThan(5); // generous; typical is <0.5ms
});
```

Add ONE such micro-benchmark per `tests/schemas/{domain}.test.ts`
file (so 4–5 total in Phase 1, not per tool). The 5 ms ceiling is
deliberately generous — actual numbers should be 0.05–0.5 ms. A
failure of this bound indicates a regex-heavy or recursive schema
that needs simplification before shipping.

Performance ceiling rationale: the MCP request path is dominated by
HTTP latency to the backend (50–500 ms). A schema parse adding 1 ms
is invisible. A schema parse adding 50 ms (10% overhead) is a bug.
The 5 ms test boundary catches the "10% overhead" case loudly.

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
- [ ] `npx vitest run` passes 100% — final count between **1610 and 1625**
      (1581 baseline + 30–45 new). Any delta outside this band must be
      explained in the final report (§13).
- [ ] `MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run` passes 100%
      with the same test count as above.
- [ ] `package.json` has the new `test:strict` script.
- [ ] §7.1 schema-vs-live verification passes for all 10 tools (each
      tool's live curl response parses against its new schema with
      zero issues).
- [ ] No commit on `main`. Branch is `mcp-zod-validation` throughout
      (created from `mcp-expansion`).

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
11. **Do NOT use `z.any()` to silence a parse failure.** That defeats
    every point of this spec. If a field's shape is genuinely unknown,
    use `z.unknown()` and document why.
12. **Do NOT add validation to error responses without thinking.**
    Backend errors (4xx/5xx) come back via the existing `mapCarrierError`
    path before `parseToolResponse` is invoked. If a tool needs to
    validate the *body* of an error response, do it explicitly with a
    separate schema, not the success schema. Tool #8 (`envia_create_shipment`)
    is the one place this matters in Phase 1.
13. **Do NOT mass-update existing test fixtures during this migration.**
    Some old fixtures will fail in strict mode because they are
    fixture-vs-reality drift (the bug pattern this spec exists to
    prevent). Update each fixture **as you migrate the corresponding
    tool**, not in a separate sweep. The link between the migration
    commit and the fixture fix is what makes the diff reviewable.
14. **Do NOT couple two phases of work in a single commit.** This
    session lands Phase 1. Phase 2 is a separate session with a
    separate spec. If you finish Phase 1 with time to spare, stop
    and report — do not start Phase 2 freelance.
15. **Do NOT include `received` values in Zod issue logs.** Zod's
    default `format()` and the raw `issues[i]` object include a
    `received` field that contains the value at the failed path —
    that value is PII risk (customer names, addresses, tracking
    numbers, COD amounts) or secrets. The helper in §4.1 explicitly
    omits this. Verify your implementation does the same.
16. **Do NOT log raw response data anywhere in the helper.** No
    `JSON.stringify(data)`. No `console.log(data)`. No `logger.debug(data)`.
    The `path / code / message` triple from Zod issues is the only
    information that should reach observability.
17. **Do NOT enable strict mode on the production Heroku app.** The
    `MCP_SCHEMA_VALIDATION_MODE=strict` env var is for CI and local
    dev only. Setting it in production turns every backend forward-
    compatible addition into a customer outage.
18. **Do NOT `--force` push or `--no-verify` commit.** If the build
    or tests fail, fix them. Force-pushing rewrites history that
    other reviewers may have already pulled.
19. **Do NOT skip the migration completeness self-check (§6.6).** It
    is a 30-line file that prevents the highest-likelihood human
    error in a 10-step mechanical migration: forgetting to wire one
    of the tools.

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
- **Verified assumption:** Vitest is the canonical test runner
  (`package.json` declares `vitest@3.x`). No new test framework.
- **Verified assumption:** The 10 Phase 1 tools all use either
  `queryShipmentsApi` (queries-base) or a direct HTTP call via
  `EnviaApiClient.get/post` (carriers-base). Both return objects of
  shape `{ ok: boolean, status: number, data: T, error?: string }` —
  the helper takes `data` from that wrapper, never the wrapper itself.
- **Verified assumption:** `process.env` is read synchronously at
  module load in Node — no `await` required for the `MODE` constant.
- **Verified assumption:** the existing 4 tools renamed in commit
  `83f6b78` (e.g. `envia_quote_shipment`) use the post-rename names
  in the registered tool name. The schema's `toolName` argument must
  match the post-rename name, never the historical `quote_shipment`.
- **Q: What if the existing test for a tool already mocks the response
  via `vi.mock` of `queryShipmentsApi`?** A: The mock returns whatever
  fixture the test gives it; `parseToolResponse` runs on that fixture.
  If the fixture is wrong, the test will fail in strict mode — and that
  is correct behaviour (the test was lying). Update the fixture per §3.8.
- **Q: Does the helper need to be exported from a barrel file?** A: No.
  Each tool imports it directly from `'../utils/response-validator.js'`
  (or `'../../utils/...'` per §5.4). Barrel files add bundling overhead
  and obscure import paths.
- **Q: What happens if Zod throws an unexpected runtime error inside
  `safeParse`?** A: This is exceedingly rare (would indicate a broken
  schema definition or memory corruption). The helper does not catch
  it — let it propagate. The MCP server will return a 500 to the
  caller. The fix is a code review of the offending schema, not a
  try/catch in the helper.
- **Verified assumption (security):** the existing pino logger does
  NOT log `Authorization` headers, `api_key` arguments, or other
  secrets by default. Validate this by grepping `src/utils/logger.ts`
  and `src/utils/server-logger.ts` for any `Authorization` or
  `api_key` reference; if any exist, raise it as a separate finding
  (out of scope for this spec — but it's the kind of thing this spec
  exists to surface).
- **Verified assumption (security):** `tool_call_complete` events
  emitted by `decorateServerWithLogging` (Sprint 4a) do NOT include
  the raw response body. Verify by reading the implementation. If
  raw response bodies are being logged, fix that as a separate PR
  before this Phase 1 ships.
- **Verified assumption (resilience):** `safeParse` is synchronous
  and pure — same input always produces the same output. No global
  mutation, no I/O. This is what allows §7.4's micro-benchmarks to
  be deterministic.
- **Verified assumption (deps):** Zod's API for `safeParse` is stable
  across `zod@^3.x`. The `result.error.issues` shape with `path`,
  `code`, `message` is documented and stable. No breaking change
  expected within Phase 1's lifetime.
- **Q: Should the helper sanitize `path`s in the log?** A: Path
  arrays from Zod consist of field names and array indices — never
  user-supplied data. Safe to log verbatim. The reason for caution
  is documented (§3.10 S1) but `path` itself is not the risk.
- **Q: What if a tool produces a 200 response with an HTML error
  page (e.g. Cloudflare interstitial during incident)?** A: Zod
  parse will fail (HTML is not the expected JSON shape). In warn
  mode the formatter receives the HTML string as `data`, accesses
  property `data?.[0]` and gets `undefined` — the user sees an
  unhelpful but not catastrophic output, and a Datadog log fires.
  This is acceptable behaviour for an edge case during an
  upstream incident.

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

1. **Files created/modified** with line counts. Group by infra
   (helper, schemas dir, server-logger), schemas (1 line per schema
   file), tools (1 line per migration), tests (1 line per test file).
2. **Final test count** and `npm run build` exit code.
3. **Strict-mode test count** (with `MCP_SCHEMA_VALIDATION_MODE=strict`).
   If different from #2, explain why.
4. **Commit hash** and confirmation `git push origin mcp-zod-validation`
   succeeded.
5. **§7.1 schema-vs-live results** — one line per tool: `tool_name:
   PASS` or `tool_name: FAIL — {issue summary}`. Zero failures
   expected; any failure is a blocker.
6. **Schema-vs-prior-type divergences** — for each migrated tool, was
   the new schema identical to the existing TypeScript type in
   `src/types/`, or did the live capture reveal differences? List
   every difference (missing field, extra field, wrong type, wrong
   nullability). This list is the most valuable artifact for Phase 2
   planning.
7. **Existing test fixtures updated** — for each tool, did any
   `tests/tools/{tool}.test.ts` fixture need updating to match the
   new schema in strict mode? If yes, list them and why.
8. **Judgment calls** deviating from this spec, with rationale.
9. **Open items for Phase 2** — any tool that revealed a schema
   surprise during Phase 1 worth flagging (e.g. a sub-shape used
   across many tools that deserves a shared schema), or any
   anti-pattern detected in non-Phase-1 tools.

If any acceptance criterion in §8 cannot be met, **stop immediately and
report**. Do not paper over a failing check. Specifically:

- If `npm run build` fails, fix the build or stop and report. Do not
  ship code that does not compile.
- If strict-mode test fails, treat it as the most important signal in
  this entire session — do not bypass it.
- If §7.1 reveals a schema-vs-live mismatch, that is the spec working
  as intended. Fix the schema, re-run, re-commit.
- If you have less than 1 hour left and have not completed all 10 tool
  migrations, stop and commit what you have with the unfinished tools
  clearly listed. A partial Phase 1 is still valuable; a rushed Phase
  1 with wrong schemas is worse than no Phase 1.

---

## 14. Code review checklist + rollback plan

### 14.1 Pre-merge checklist for the human reviewer

When the PR for this Phase 1 work lands, the reviewer (Jose, or
another engineer) should run through this list. Anything unchecked
is a blocking comment.

**Code:**
- [ ] `parseToolResponse` reads `MCP_SCHEMA_VALIDATION_MODE` exactly
      once at module load (not per-call).
- [ ] `parseToolResponse` does NOT log `received` values, raw `data`,
      or any other field beyond `path / code / message`.
- [ ] `SchemaValidationError` does not carry the raw `data` in its
      payload.
- [ ] Each schema file has a JSDoc citing "Verified live YYYY-MM-DD
      against {endpoint}".
- [ ] No schema uses `.strict()`. No schema uses `z.coerce.*`. No
      schema uses `z.any()` to silence a parse failure.
- [ ] No tool from the 63 not on Phase 1 was modified.
- [ ] `package.json` has `test:strict` script.
- [ ] No `--force` push or `--no-verify` commit in the branch
      history.

**Tests:**
- [ ] Each Phase 1 tool has a corresponding `tests/schemas/{domain}.test.ts`
      block with at least 3 tests (live shape passes,
      missing-field rejection, passthrough acceptance).
- [ ] `tests/utils/response-validator.test.ts` has 6 tests covering
      success, warn-mode failure, log emit, strict-mode throw, error
      tool-name, issue truncation.
- [ ] `tests/utils/migration-completeness.test.ts` exists and asserts
      all 10 Phase 1 tools import the helper.
- [ ] At least 4 `tests/schemas/{domain}.test.ts` files include a
      performance micro-benchmark per §7.4.

**Verification:**
- [ ] `npm run build` exit 0.
- [ ] `npx vitest run` all green.
- [ ] `MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run` all green.
- [ ] §7.1 schema-vs-live verification PASS for all 10 tools.
- [ ] Final report (per §13) attached to the PR description.

**Atomic commits:**
- [ ] One infra commit, ten tool commits, in the order from §5.6.
      No mega-commit. No `(N/10)` suffix missing.
- [ ] Every commit individually builds and tests green.

### 14.2 Rollback plan

If the Phase 1 deploy causes any user-facing issue in stage or
production:

**Symptom: chat agent starts behaving strangely on a specific tool.**
1. First check Datadog for `schema_validation_failed` events on that
   tool. If many: the schema is wrong (live shape diverged from what
   we captured). Action: write a hotfix that updates the schema, ship
   it. The MCP keeps working (warn mode) while the fix is in flight.
2. If no `schema_validation_failed` events: the issue is likely
   unrelated to schema validation. Investigate elsewhere.

**Symptom: a tool returns blank or partial data.**
1. The tool was likely returning stale or incorrect data BEFORE the
   migration too — now strict validation reveals it. Compare the
   pre-Phase-1 output (from `_docs/DEPLOY_LOG_*` examples) to current.
2. If the Phase 1 migration introduced a regression, revert just
   that tool's commit (one of the 10) — the atomic-commit structure
   in §5.7 makes this trivial.

**Symptom: catastrophic — the MCP server is throwing 500s on every
request to a Phase 1 tool.**
1. The most likely cause is a syntax error in a schema file that
   slipped past the build (extremely unlikely after `tsc` clean run,
   but possible if production has different Node version).
2. Immediate action: revert the entire branch on stage or production
   (the previous deploy worked, and the dependency on Phase 1 is
   isolated to the 10 tools — reverting brings back warn-vs-no-
   validation, which is a known-working state).
3. After revert, investigate offline.

**Symptom: log volume from `schema_validation_failed` is excessive.**
1. The §15 Datadog alert fires.
2. Identify which tool / schema is mismatched.
3. Patch the schema (forward fix) within hours.
4. The log spike is the spec working as intended — backend drift was
   caught immediately. Don't disable validation; fix the schema.

**Never the right rollback:** turning off schema validation entirely
(by adding a "disabled" mode), reverting only the helper but leaving
schemas in place, or merging a "make every field optional" hotfix
that defeats the validation. If any of those tempts you, escalate
to Jose first.

### 14.3 Versioning guidance

This Phase 1 work warrants a `package.json` version bump from
`1.0.1` to `1.1.0` (semver minor — additive feature, backwards-
compatible API for tool consumers). The bump goes in the infra
commit (the first one), not as a separate commit.

---

## 15. Observability — recommended Datadog dashboard

These are recommendations for Jose / the operations team to set up
AFTER Phase 1 lands. Sonnet does NOT need to create the Datadog
dashboard — that is operational work outside the source code.
Documenting here so the recommendation lives with the spec.

### 15.1 Recommended panels

**Panel 1 — `schema_validation_failed` event rate by tool (line graph)**

Datadog query:
```
sum:logs{event:schema_validation_failed} by {tool}.as_rate()
```

Expected baseline: zero. Any non-zero value is an alert.

**Panel 2 — Top 10 tools with most validation failures (bar chart, last 24h)**

Datadog query:
```
top(sum:logs{event:schema_validation_failed} by {tool}, 10, 'sum', 'desc')
```

Useful when shape drift is multi-tool (e.g. a backend deploy that
renamed a shared field).

**Panel 3 — Validation-failure issue paths heatmap (last 24h)**

Aggregates the `issues.path` field. Useful for diagnosing "is this
one field that drifted, or many?".

**Panel 4 — Tool call success rate before/after (already exists from Sprint 4a)**

This is the Sprint 4a `tool_call_complete` panel, augmented with
overlay of Phase 1 deploy time. Helps see whether validation overhead
is impacting overall success rate (it should not).

### 15.2 Recommended alerts

**Alert 1 — Burst:**
- Trigger when any single tool emits more than **20 `schema_validation_failed`
  events per minute** for **3 consecutive minutes**.
- Severity: P2 (page during business hours).
- Action: investigate which schema mismatched, write hotfix.

**Alert 2 — Sustained:**
- Trigger when total `schema_validation_failed` rate is **>0** for
  **30 consecutive minutes**.
- Severity: P3 (Slack notification).
- Action: lower-urgency review of which tool needs a schema update.

**Alert 3 — Diversity:**
- Trigger when more than **5 distinct tools** are firing
  `schema_validation_failed` simultaneously.
- Severity: P1 (this means a backend-wide change happened — page
  immediately).

### 15.3 What this data buys us

Before Phase 1: we discovered shape drift WEEKS after it shipped, by
user reports. Time-to-detect was bounded by user observation.

After Phase 1: every drift surfaces in Datadog seconds after the
first request. Time-to-detect is bounded by alerting cadence
(minutes, not weeks).

The dashboard pays for itself the first time a backend ships a
breaking change without coordinating — which historically has
happened multiple times per quarter.

---

End of spec.
