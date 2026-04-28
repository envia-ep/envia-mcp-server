# Spec — Tool Consolidation Audit (73 tools → ~40)

**Version:** v1 — drafted 2026-04-28 by Jose Vidrio (CTO) + Claude Opus 4.7.
**Status:** READY FOR IMPLEMENTATION (Sonnet 4.6 session, expected after Datadog dashboard has 30+ days of usage data).
**Estimated effort:** 8–12 hours single Sonnet session (mostly analytical, some refactor).
**Companion specs:** `RUNTIME_ZOD_VALIDATION_SPEC.md`, `DATADOG_OBSERVABILITY_DASHBOARD_SPEC.md` (provides usage data for the audit).

---

## Audience

You are an AI engineering session (Sonnet 4.6) executing the tool
consolidation audit for the Envia MCP server. The work is **mostly
analytical** with a **mechanical refactor phase** at the end. The
analytical part decides what to retire, consolidate, or compose;
the refactor part executes the decisions.

This spec depends on:
- **Datadog dashboard** (companion spec) having ≥30 days of usage
  data so we know which tools are hot, lukewarm, or never called.
  If you reach this spec without that data, STOP and report — the
  decisions need data, not guesses.
- **Zod Phase 1 + 2** ideally complete (so all migrated tools are
  shape-validated before consolidation). If Phase 2 is incomplete,
  proceed but flag tools without schemas as "consolidate after Phase
  2 lands".

---

## 1. Goal

Reduce the MCP tool surface from 73 to ~35–40 by:
1. **Retiring** tools never (or almost never) called.
2. **Consolidating** tools with overlapping function (e.g.
   `envia_search_branches` + `envia_find_drop_off`).
3. **Composing** wizard-style tools that wrap multi-step flows
   (e.g. one `envia_create_international_shipment` that internally
   calls `ai_address_requirements` + `classify_hscode` + `create_shipment`).
4. **Reclassifying** tools to `internal` (helper, not LLM-visible)
   when they exist for backend orchestration but not for end-user
   intent.

**Why this matters:** at 73 LLM-visible tools, the model shows
"tool selection fatigue" — observed during the 2026-04-27 session
where the LLM picked `list_additional_services` instead of
`get_carrier_constraints` for a FedEx-specific question, and
during the international shipment flow where it iterated trial-
and-error instead of using `ai_address_requirements`. Anthropic
guidance puts the comfortable upper bound around 30–50 for
generalist agents; we are well above.

**Success looks like:** a Sonnet/Opus session interacting with the
MCP after consolidation chooses the correct tool on the first try
in ≥95% of cases (measured by re-running the chat agent against a
test corpus of 50 representative user prompts). Today, anecdotally,
the rate is closer to 70–75%.

**Out of scope:** rewriting tool descriptions for clarity (that's
ongoing work, not a consolidation effort); changing tool input
schemas beyond what's required for consolidation; adding new tools
not justified by the audit.

---

## 2. Background — observed problems

The 2026-04-27 audit + 2026-04-28 chat-agent observations surfaced
three concrete failures attributable to tool surface area:

**Observation A — Wrong tool chosen for a carrier question.**

User asked "qué servicios adicionales tiene fedex?". The LLM
called `envia_list_additional_services` (returns global catalog by
country) instead of `envia_get_carrier_constraints` (returns the
carrier's add-on list). Both tools exist; both have plausible
descriptions. The LLM picked the simpler one.

**Mitigation already in place:** description hardening (commit
`f7d809f`). But this would not have been needed if the two tools
did not overlap.

**Observation B — International shipment flow degenerated.**

User asked to create a MX→US shipment. The LLM iterated through 6
turns asking for fields (some already in the original message)
without ever calling `envia_ai_address_requirements`. The wizard
exists; the LLM didn't find it.

**Mitigation:** would benefit from a `envia_create_international_shipment`
composed tool that orchestrates the multi-step flow internally.

**Observation C — Duplicate calls during rename transition.**

Debug log showed the LLM calling `list_additional_services` (old
name) and `envia_list_additional_services` (new name) in sequence
for the same intent. Suggests the LLM's tool selection is partially
guess-and-retry — symptomatic of high tool surface area.

These observations confirm the consolidation case. The spec below
operationalises it.

---

## 3. Design decisions

### 3.1 Data-driven decisions

Every retire / consolidate / compose decision is justified by data
from the Datadog dashboard (companion spec):

- **Usage volume** (calls per day): the strongest signal. Tools <1
  call/day on average over 30 days are retire candidates.
- **Failure rate**: high-failure tools may need fixing OR may be
  symptoms of LLM confusion (it's calling the wrong tool because
  the right one is not obvious).
- **Co-occurrence**: tools always called in the same conversation
  (e.g. `quote_shipment` + `create_shipment`) are candidates for
  composition.
- **Description similarity** (NLP, soft signal): tools with semantic
  overlap in their description are consolidation candidates.

The Sonnet session does NOT make decisions on intuition. Each
decision in the audit output cites the data point that motivated it.

### 3.2 Three retirement modes

When a tool is selected for retirement, we choose one of three
paths:

**Mode A — Hard retirement** (tool ceases to exist):
- The tool is unregistered from the MCP server.
- The source file is kept (per L-S6 lesson) with a deprecation
  comment.
- Downstream agentic-ai code is updated to remove references.
- **Used when:** tool has zero usage AND no logical successor.

**Mode B — Reclassification to internal** (still in code, not
LLM-visible):
- `server.registerTool()` call removed; function exported as a
  helper instead.
- Other tools may import and use the helper internally.
- **Used when:** the tool is useful for orchestration but
  exposing it to the LLM creates noise.

**Mode C — Consolidation into another tool** (function preserved,
exposure reduced):
- Tool's parameters become an optional argument or sub-mode of
  another tool.
- Original tool removed; description of merged tool extended.
- **Used when:** two tools serve overlapping intents and one is a
  natural superset.

### 3.3 Composed tools (the new arrivals)

Some retirements are paired with NEW composed tools that wrap the
multi-step flows the LLM struggles to orchestrate:

- `envia_create_international_shipment` — wraps
  `envia_ai_address_requirements` + `classify_hscode` + Zod-validated
  `create_shipment` into one call. Replaces the 6-turn wizard the LLM
  fails at today.
- (Possibly others — the audit identifies them.)

These composed tools are NOT additions to the surface area — they
replace the 3-4 underlying tools they wrap, which become internal
helpers (Mode B reclassification).

### 3.4 Backwards compatibility for retirements

When a tool is retired, the MCP server's response to a call to that
tool name returns a clear redirect message:

```
Tool 'envia_X' was retired in MCP v1.2 (2026-MM-DD). For the same
function, use 'envia_Y' instead. See _docs/CHANGELOG.md for migration
notes.
```

This is more informative than a generic "tool not found" and helps
agentic-ai (or any other consumer) self-correct during the migration
window.

The redirect mechanism is implemented as a stub registered with the
old name that returns the redirect message. Stubs are kept for one
release cycle (~30 days), then removed.

### 3.5 Migration coordination with agentic-ai

The agentic-ai team needs to know:
- Which tools are retired (so they remove references from prompts).
- Which tools are renamed/consolidated (so they use the new name).
- Which tools are composed (so they call the wizard, not the
  individual steps).

This spec produces a `_docs/CONSOLIDATION_MIGRATION.md` file with the
exact mapping. Sonnet hands this to Jose; Jose coordinates with the
agentic-ai owner team.

### 3.6 No new tools without justification

The audit may identify gaps where a new tool would help. Each
proposed new tool must justify itself with:
- An observed user prompt that no current tool handles well.
- Why a new tool is the right fix vs. extending an existing one.
- The expected usage volume.

Without all three, the new tool is rejected. Phase 1 of this audit
adds AT MOST 2 new composed tools.

### 3.7 Out-of-bounds: 5 tools we never retire

Five tools are explicitly off-limits regardless of usage. They are
core flows whose absence would be a regression in capability:

| Tool | Why off-limits |
|---|---|
| `envia_quote_shipment` | Core revenue path |
| `envia_create_shipment` | Core revenue path |
| `envia_track_package` | Most-called read |
| `envia_cancel_shipment` | Critical undo |
| `envia_get_balance_info` | Required for any pre-flight check |

Even with low usage, these are the spine of the MCP. The audit
does NOT consider them.

---

## 4. The audit framework (analytical phase)

### 4.1 Inputs

The Sonnet session needs:
1. **Usage data export** from Datadog: per-tool call count over
   the last 30 days. Format: CSV with columns `tool, calls_total,
   calls_per_day_avg, distinct_companies`.
2. **Failure data export**: per-tool failure count + error_class
   distribution.
3. **Co-occurrence data**: which tools appear together in the same
   correlation_id (i.e. same chat turn).
4. **Current MCP source**: `src/tools/**` for descriptions and
   handler signatures.
5. **agentic-ai prompt source**: which tools the LLM is explicitly
   instructed to use, and in which contexts.

If any of these inputs is missing, the audit cannot proceed. Stop
and request from Jose / ops.

### 4.2 Methodology — the audit matrix

For each of the 73 tools (excluding the 5 off-limits in §3.7),
produce a row in the audit matrix:

| Tool | Calls/day | Failure rate | Co-occurs with | Description overlap | Decision | Mode | Justification |
|---|---|---|---|---|---|---|---|

Decision options:
- **KEEP** — high enough usage, no overlap, stays as-is.
- **RETIRE** — Mode A (hard), Mode B (internal), or Mode C (consolidate into X).
- **COMPOSE** — bundle into a new wizard tool with named partners.
- **DEFER** — insufficient data, revisit after another 30 days.

The matrix is the deliverable of the analytical phase. It lives at
`_docs/CONSOLIDATION_AUDIT_MATRIX.md` and is reviewed before any
code change happens.

### 4.3 Decision thresholds

The matrix uses these objective thresholds where possible:

| Metric | Threshold | Action |
|---|---|---|
| Calls/day < 0.1 over 30 days | always | Retire Mode A or B |
| Calls/day < 1.0 AND failure rate > 50% | always | Retire Mode A (broken + unused) |
| Description similarity > 80% with another tool | always | Mark consolidation candidate |
| Co-occurs > 90% with another tool | always | Mark composition candidate |
| Calls/day > 10 | always | KEEP unless severe overlap |

Where thresholds collide, prefer KEEP over retirement — the cost of
retiring a useful tool is higher than keeping a marginal one.

### 4.4 Description similarity computation

For each pair of tools, compute description-level similarity:
1. Take the `description` string passed to `server.registerTool()`.
2. Tokenise (lowercase, remove stopwords, stem).
3. Compute Jaccard similarity over token sets.
4. If similarity > 0.6, surface the pair for human review.

Sonnet does NOT need to integrate a real NLP library for this — a
simple JS implementation against a small stopword list suffices for
73 tools × 73 = ~5000 pairs.

### 4.5 Anticipated decisions (Sonnet should expect these but
        verify against data)

Based on the 2026-04-27 audit, these are the most likely outcomes
(but Sonnet must verify each with data):

**Likely retirements (Mode A — hard):**
- `envia_list_api_tokens` (admin, near-zero usage by chat agent)
- `envia_list_webhooks` (same)
- `envia_get_dce_status` (Brazil-specific, niche)
- `envia_check_billing_info` (has alternative `get_billing_info`)
- `envia_get_clients_summary` (overlap with `list_clients`)

**Likely consolidations (Mode C):**
- `envia_search_branches` + `envia_find_drop_off` → keep
  `envia_find_drop_off`, retire `envia_search_branches`
- `envia_validate_address` + `envia_ai_address_requirements` → keep
  `envia_ai_address_requirements`, retire `envia_validate_address`
- `envia_quote_shipment` + `envia_ai_rate` → keep `envia_quote_shipment`,
  retire `envia_ai_rate` (or vice-versa, depending on data)

**Likely compositions (NEW tools):**
- `envia_create_international_shipment` — wraps the 3-tool wizard
  the LLM fails at.
- (One or two more identified by the audit.)

**Likely reclassifications (Mode B):**
- `envia_get_my_salesman` (rarely user-asked, but useful internal context)
- `envia_classify_hscode` (almost always called via
  `envia_create_shipment` for international)

If Sonnet's data-driven analysis disagrees with any of the above,
the data wins. The spec author's anticipations are NOT prescriptions.

---

## 5. Refactor plan (mechanical phase)

After the audit matrix is reviewed and approved by Jose, the
mechanical phase executes the decisions.

### 5.1 Order of operations

1. **Compose first.** New composed tools (e.g.
   `envia_create_international_shipment`) are added — but NOT yet
   exposed publicly. They are registered, but the descriptions
   include "INTERNAL — pending consolidation review".
2. **Reclassify (Mode B) next.** Internal helpers stop being LLM-
   visible.
3. **Consolidate (Mode C) third.** Where two tools merge, the
   surviving tool's description and parameters expand to subsume
   the retired one.
4. **Hard-retire (Mode A) last.** Stubs registered with redirect
   messages (per §3.4).
5. **Promote composed tools.** Once #1-#4 stabilise, the "INTERNAL"
   suffix is removed from the new wizard tools and they become
   public.

This order is deliberate. Reversing it risks an interim state where
agentic-ai has no path forward (e.g. the legacy tool is gone but the
new composed tool isn't yet usable).

### 5.2 Per-decision template

For each retirement / consolidation / composition:

#### Step 1 — Update `src/index.ts`

Add or remove the `server.registerTool()` call. For Mode A
retirements, replace with a redirect stub.

#### Step 2 — Update the source file

For Mode A: add deprecation comment at top of file, keep the
exported function (other code may use it internally). For Mode B:
remove the `server.registerTool()` call but keep the exported
function. For Mode C: extend the surviving tool's description and
input schema.

#### Step 3 — Update test files

Tests for retired tools become tests for the redirect stub (Mode
A), or are deleted (Mode A hard-removal where stub is also gone),
or are migrated to the surviving tool (Mode C).

#### Step 4 — Update `src/resources/api-docs.ts`

The internal tool catalogue. Reflect the new state.

#### Step 5 — Update agentic-ai migration doc

Add an entry to `_docs/CONSOLIDATION_MIGRATION.md`:
```
### envia_X
- Decision: RETIRED (Mode A)
- Replaced by: envia_Y (use this for the same function)
- Migration window: 30 days
- agentic-ai update needed in: src/channels/portal/skills/X.ts
```

### 5.3 Test budget

Tests are removed when their tool is retired. Tests are added when
new composed tools land. Net delta is expected to be modest (~-30
to +30 tests). Acceptance criterion is "build green, no regressions
in the 5 off-limits tools' tests".

### 5.4 Time budget for the refactor

Per decision: ~30–45 min (touching 3-5 files, running tests).
For ~25–30 decisions (the expected size of the consolidation), that
is ~12-22 hours of refactor work alone. Plus the 4-6 hours of
analytical phase before. Total **16-28 hours** — far above the
session-level 8-12 hour budget.

**Therefore: the spec splits into two sessions.**

- **Session A (this spec):** analytical phase only — produce the
  audit matrix, get it reviewed, decide.
- **Session B (follow-up spec):** refactor execution per the
  approved matrix.

Sonnet executing this spec produces the matrix in §4.2 and the
migration doc draft in §5.2 step 5, but does NOT execute any
retire/consolidate/compose. That waits for Jose's review.

This split is CRITICAL. Do not attempt the full refactor in one
session.

---

## 6. Operational verification

### 6.1 Analytical phase

When the matrix is produced:

- [ ] Every one of 73 tools (minus 5 off-limits) has a row.
- [ ] Every row has a decision (KEEP / RETIRE / COMPOSE / DEFER).
- [ ] Every retirement / consolidation / composition cites at
      least one data point (usage, failure, co-occurrence, or
      description similarity).
- [ ] No decision relies solely on intuition.
- [ ] The matrix is committed at `_docs/CONSOLIDATION_AUDIT_MATRIX.md`.
- [ ] Total proposed retirements + reclassifications + compositions
      brings the public surface to 35–45 tools (target 35-40, ±5
      tolerance).
- [ ] No tool from §3.7 (off-limits) is touched.

### 6.2 Pre-refactor signoff (next session, not this one)

Before Session B (refactor) starts, Jose reviews the matrix and
either approves, modifies, or rejects each decision. Disagreements
are documented in the matrix as "REVIEWER OVERRIDE: kept tool X
because Y" so the audit trail is complete.

The signed-off matrix becomes the executable plan for Session B.

---

## 7. Acceptance criteria (this spec — analytical phase)

- [ ] `_docs/CONSOLIDATION_AUDIT_MATRIX.md` exists and meets §6.1.
- [ ] `_docs/CONSOLIDATION_MIGRATION.md` exists with draft entries
      for every proposed retirement / consolidation.
- [ ] No code in `src/` was modified.
- [ ] No tools from §3.7 off-limits list were analysed (just listed
      as "OFF-LIMITS — see §3.7").
- [ ] No test changes.
- [ ] The matrix's "decision" column has zero blank rows.
- [ ] Every decision cites at least one data point.
- [ ] Branch is `mcp-tool-audit` (created from `mcp-expansion`); commits
      contain only the two new docs.
- [ ] Proposed final tool count: between 35 and 45 (target 35-40).

---

## 8. Anti-patterns to avoid

1. **Do NOT retire any tool from §3.7 (off-limits).** Even if data
   suggests it, those are the spine of the MCP.
2. **Do NOT execute the refactor in this session.** This spec is
   analytical only. Refactor is Session B.
3. **Do NOT make decisions on intuition.** Every decision cites data.
4. **Do NOT add tools beyond the 2-new-composed-tools cap (§3.6).**
5. **Do NOT assume the 2026-04-27 anticipations (§4.5) are correct.**
   They are guesses. The data may surprise you.
6. **Do NOT skip the agentic-ai migration doc draft (§5.2 Step 5).**
   The agentic-ai owner team needs that to plan their work.
7. **Do NOT consolidate two tools without confirming the surviving
   tool can express both intents.** A consolidation that loses
   capability is a regression.
8. **Do NOT propose retiring a tool that is referenced in the
   agentic-ai source code without flagging it.** Coordination cost
   is high; better to scope cautiously.
9. **Do NOT include user PII in the matrix or migration doc.** Data
   exports are aggregate; pre-redact if any raw payload sneaks in.
10. **Do NOT exceed the 8–12 hour budget on the analytical phase.**
    If approaching the cap, freeze the matrix as-is, mark unfinished
    rows DEFER, and report.

---

## 9. Open questions and verified assumptions

- **Q: How many days of Datadog data is enough?** A: ≥30 days for
  stable averages. The session refuses to start with <14 days.
- **Q: Should the analysis include tools-zero-calls-but-recently-shipped?**
  A: Yes — but mark them DEFER (insufficient data) and revisit after
  30 days post-ship.
- **Q: Can a tool be "composed into" another tool that doesn't
  exist yet?** A: Yes — that's a new composed tool (§3.3). Justify
  per §3.6.
- **Q: What if the data shows agentic-ai NEVER calls a particular
  tool?** A: Strong retirement signal. But verify the tool isn't
  used by other consumers (none should exist, but check).
- **Verified assumption:** Datadog log data is queryable in CSV or
  JSON export form. If only raw logs are available, allocate extra
  time for parsing.
- **Verified assumption:** The `correlation_id` field on
  `tool_call_complete` events lets us cluster co-occurring calls.
  Verified by Sprint-4a observability work.

---

## 10. Spec metadata

- **Author:** Claude Opus 4.7 (1M context), session 2026-04-28.
- **Reviewer:** Jose Vidrio (CTO).
- **Status:** READY FOR IMPLEMENTATION (after ≥30 days of Datadog
  dashboard data is available).
- **Estimated effort (this session, analytical only):** 8–12 hours.
- **Follow-up effort (Session B, mechanical refactor):** 12-22 hours,
  separate spec.
- **Branch target:** `mcp-tool-audit` (created from `mcp-expansion`).
- **Predecessor specs:** `RUNTIME_ZOD_VALIDATION_SPEC.md` v1.2,
  `LIVE_FIXTURE_TESTING_SPEC.md`, `DATADOG_OBSERVABILITY_DASHBOARD_SPEC.md`.

---

## 11. Reporting back

When the session completes, the final response must include:

1. Path to the matrix (`_docs/CONSOLIDATION_AUDIT_MATRIX.md`).
2. Path to the migration doc draft
   (`_docs/CONSOLIDATION_MIGRATION.md`).
3. Summary numbers: how many tools KEEP, RETIRE Mode A, RETIRE Mode
   B, CONSOLIDATE Mode C, COMPOSE, DEFER. Verify the
   sum = 73 (off-limits 5 already accounted for separately).
4. Final proposed public surface count (target 35-40).
5. List of 5 most-impactful single decisions (top retirements by
   likely confusion-reduction).
6. List of any data inputs that were missing or insufficient (e.g.
   "co-occurrence data was unavailable for the analytical period —
   used proxy of session-id grouping instead").
7. Any judgment call deviating from the spec.
8. Estimated effort for Session B (mechanical refactor) given the
   matrix's complexity.

---

## 12. Session bootstrap prompt

```
Implementa el spec en
_docs/specs/TOOL_CONSOLIDATION_AUDIT_SPEC.md, rama mcp-tool-audit
(crear desde mcp-expansion).

Esta sesión es ANALÍTICA, NO de refactor. Produces dos documentos:
  - _docs/CONSOLIDATION_AUDIT_MATRIX.md (la matriz completa)
  - _docs/CONSOLIDATION_MIGRATION.md (mapping para agentic-ai)

NO TOQUES src/. NO TOQUES tests/. Todo cambio de código es Session B.

Lee el spec end-to-end ANTES de empezar.

Pre-requisitos verificables ANTES de empezar:
  - ≥30 días de datos en el Datadog dashboard del MCP. Si no, STOP.
  - Acceso al export CSV/JSON de los logs de Datadog.
  - Las 5 tools off-limits §3.7 NO se tocan.

Secciones que NO son opcionales:
  - §3.1 Decisiones data-driven, jamás intuición
  - §3.2 Tres modos de retirement (A/B/C)
  - §3.7 Tools off-limits (5 que NUNCA se tocan)
  - §4.2 Audit matrix — formato exacto, una row por tool
  - §4.3 Decision thresholds objetivos
  - §5.4 SPLIT EN DOS SESIONES — solo analytical aquí

Al terminar, reporta según §11.

Bar: production-grade enterprise. Cada decisión tiene data point.
Ningun "creo que" — solo "los datos muestran X".
```

---

End of spec.
