# LESSONS.md — envia-mcp-server Self-Improvement Log

> **🚨 IMPERATIVE: Read this file at the START of every session.**
>
> **Every session prompt must begin with:**
> `Read ai-agent/envia-mcp-server/_docs/LESSONS.md before anything else.`
>
> **This file encodes every user correction.** Each lesson has a pattern
> (what went wrong), the correction (user's exact words when possible),
> and the rule (how to prevent the mistake). Ignoring these lessons
> repeats mistakes you have already paid for.

## Maintenance protocol

1. **At session start:** read all lessons, re-focus on rules for your
   scope (strategic / execution / testing / etc).
2. **After ANY user correction, surface the pattern:**
   - Add a new lesson with: pattern + correction quote + rule.
   - Tag with category and date.
   - Remove or merge duplicates if the same mistake appears under two
     different lessons.
3. **Ruthlessly iterate:** if a mistake recurs, the rule is too soft or
   too hidden. Rewrite it. Escalate it. Move it to the top of the file.
4. **At session end:** skim additions. If you found no new lessons the
   rules are working; if you found many, flag it to the user.

## Organisation

Lessons grouped by category. Within each, ordered by how often the
mistake has recurred (most frequent first).

---

## 🎯 Strategic / scope decisions

### L-S1. V1 production is the source of truth — not V2 in construction

**Pattern.** Proposed tools/flows assuming V2 portal features imply
backend availability. Several V2 UIs use mock data or backend that is
partial.

**User correction (2026-04-16):**
> "V2 es una versión que está en construcción, mi único miedo es que en
> V2 se estén considerando flujos que al día de hoy no existan en V1 y
> que incluso en V2 pudieran no funcionar correctamente."

**Rule.**
- Before proposing any tool, verify the flow exists and works in **V1
  production** (shipping.envia.com / ship-test.envia.com).
- Discoveries of V2 features → classify as `V2-ONLY-BACKEND-REAL` or
  `V2-ONLY-MOCK` (see `_docs/V1_SAFE_TOOL_INVENTORY.md`). Do NOT treat
  as ready-to-expose.
- If a flow only works in V2 and backend is mock → defer until backend
  is real, no exceptions.

---

### L-S2. The MCP is portal-embedded, not a multi-tenant public server

**Pattern.** Initial audit proposed HTTP auth layer, Dockerfile,
observability for multi-tenant, CORS whitelist, rate-limiting per key.
All irrelevant because the MCP lives inside the portal's authenticated
session.

**User correction (2026-04-16):**
> "El propósito de este MCP Server es exponer herramientas para el
> agente que vive en nuestro portal, en esta etapa inicial, las
> herramientas deben acotarse solo a las que realmente pudieran hacer
> sentido para nuestro usuario solicitar al agente."

**Rule.**
- Scope criterion (single test): **"Would a typical portal user ask for
  this in chat?"** If not → not in v1.
- Admin/dev tasks, onboarding flows, infrastructure concerns are OUT.
- HTTP multi-tenant auth is NOT in scope for v1. Observability is
  a Decision-gate item, not automatic.
- Tool responses must match what the portal UI would show — no more,
  no less.

---

### L-S3. Lean list responses, full detail responses, internal helpers for the rest

**Pattern.** Proposed surfacing 11 V4 fields on every order in
`list_orders`. Would bloat chat output.

**User correction (2026-04-16):**
> "la interacción con el usuario es en una ventana de chat, si son
> demasiados campos, se puede complicar mucho la presentación de la
> información."

**Rule.**
- List tools → summary + short flags (💳 COD, ⚠️ fraud, 🔀 partial,
  status). ≤ 8 fields per item.
- Detail tools (`get_X_detail`, `get_ecommerce_order`) → full context.
- Internal helpers → fields the agent uses when composing requests but
  never shows to the user (HS codes, country_of_origin, fulfillment_info).
- Never dump raw JSON to the user.

---

### L-S4. User questions often reveal agent errors — verify before defending

**Pattern.** Reported Paquetexpress volumetric factor = 1,000,000
(Sprint 0 backend audit). User pushed back: "eso es demasiado, según
recuerdo en la tabla services el factor más común es 5000".

**User correction (2026-04-16):**
> "de donde obtuviste que Paquetexpress 1000000? eso es demasiado según
> recuerdo en muchos de los lugares y de acuerdo a la tabla services en
> BD el factor volumétrico más común es 5000 creo que no veo ningún que
> llegue ni a 7000"

**Root cause.** Explorer subagent misinterpreted
`(L × W × H) / 1000000` in PHP code — that's cm³→m³ unit conversion
used by Paquetexpress LTL pricing, NOT the volumetric factor. The real
factor lives in DB table `catalog_volumetrict_factor`.

**Rule.**
- When a user questions a number or claim, **verify immediately** with
  code/DB/curl, don't defend.
- Critical numeric values (caps, factors, limits, timeouts) must come
  from BD tables, API responses, or verified env vars. NEVER from code
  inference alone.
- When an Explore subagent reports a specific number, spot-check it.
  Explorer agents can and do misinterpret complex code paths.

---

### L-S5. Reuse existing infrastructure — don't parallel-build

**Pattern.** Sprint 2 proposed calling TMS `/check` endpoint for
balance. Would require separate JWT auth gymnastics.

**Better path (taken in Sprint 2):** `envia_check_balance` pivoted to
reuse `fetchUserInfo` from Sprint 0 (JWT already has
`company_balance`). Same functionality, zero new auth complexity,
zero new endpoints.

**Rule.**
- Before proposing a new HTTP call, check if existing helpers already
  expose the data (often via shared JWTs or already-fetched payloads).
- Backend calculations stay on the backend. Don't re-implement business
  rules client-side (tax logic, volumetric weight, pricing).
- If the portal works by consuming `GET /user-information`, the MCP
  probably should too.

---

### L-S6. Don't expose admin/dev tools to the LLM

**Pattern.** Early plans registered webhook CRUD, checkout-rule CRUD,
API token creation, and similar admin ops as LLM-visible tools.

**User correction (2026-04-16, during Sprint 0 design):**
> Confirmed that webhook CRUD and checkout rules are dev/admin tasks
> (1-time setup, no UI in v1 or v2).

**Rule.**
- Tools registered with `server.registerTool()` are what the LLM sees.
  If a task is not a conversational user action, do NOT register it.
- Keep the file for potential internal reuse — just don't wire it to
  the LLM.
- Criteria for LLM-visible: user would say "hazlo por mí". If they'd
  say "voy a configurarlo yo", it's portal UI territory.

---

### L-S7. Organizational ownership boundaries limit what the MCP exposes

**Pattern.** Sprint 2 proposed 5 tools wrapping ecart-payment endpoints
(refunds, withdrawals, transactions, ecartpay balance, invoices).
Decision A deferred them for a technical reason (JWT auth blocker).
During audit scoping (2026-04-XX) Jose added a stronger organizational
reason: ecart-payment is owned by a separate vertical at Envia, not
by the team that owns this MCP.

**User correction (2026-04-XX, during audit scoping):**
> "el proyecto ecart-payment no está bajo mi gestión es otra vertical
> de la empresa, considero que nuestro MCP no debería exponer tools de
> forma directa, si nuestros endpoints utilizan los servicios de
> ecartpay, entonces sigamos por ese camino, pero no considero buena
> idea nosotros exponerlos directamente"

**Rule.**
- Before proposing a tool that wraps a backend endpoint, confirm the
  backend is owned by the same organization/vertical as the MCP.
- If a backend is owned by another vertical, the MCP may still reach
  it **transitively** via an endpoint owned by this org (e.g. carriers
  calls ecart-payment internally). That is acceptable.
- Direct wrapping of another vertical's endpoints is NOT acceptable:
  different release cadence, different SLA, different incident
  response path, different compliance obligations, different data
  ownership.
- When listing backends in scope, explicitly label each with its
  owning team/vertical. If ambiguous, ask before audit/expose.
- This rule sits alongside L-S2 (portal-user test) and L-S6 (no admin
  tools) as a third filter for tool inclusion.

**How to apply:**
- Audit scoping sessions: exclude other-vertical backends from the
  project list up front.
- Tool proposal sessions: if a backend's ownership is unclear, the
  default is EXCLUDE until confirmed.
- Decision sessions: if a backend later becomes "co-owned" or gets
  transferred, reopen the decision explicitly rather than silently
  including it.

---

### L-S8. MCP-only modifications — never touch other repos

**Pattern.** Easy to "fix" something cross-cutting (drift between
MCP and geocodes, missing field in a queries response, broken
schema) by patching both the MCP and the upstream backend in the
same session. That conflates ownership and ships work the
backend team didn't review.

**User correction (2026-04-27, scope-fence session):**
> "Todo lo que se modificaría es en el proyecto de MCP server
> actual, correcto? Como regla, NO debemos modificar ningún
> proyecto adicional, todo nuestro trabajo será en el proyecto
> de MCP."

**Rule.**
- The only repo this MCP is allowed to write to is
  `ai-agent/envia-mcp-server/`. Reading other repos for
  verification is fine; writing is not.
- If a tool would require a backend change to function
  correctly (new endpoint, new response field, new accepted
  payload), DO NOT implement a half version. Surface the gap
  to Jose AND log it as backend debt in
  `_docs/BACKEND_TEAM_BRIEF.md` under the appropriate severity.
- Verifications that confirm backend already supports what we
  need before coding (sandbox curl, code reading) are mandatory
  before starting any sprint that depends on backend behavior
  not previously verified (see L-B5).
- Drift between MCP and a backend (e.g. exceptional-territories
  list mismatch) is resolved by changing the MCP side to match
  the backend, never the other way around.

---

### L-S9. CEO directive overrides "real user demand signal" gate

**Pattern.** Decision E (2026-04-17) locked v1 scope at 72 tools
"until we have real usage data". On 2026-04-27 the CEO directive
re-opened scope expansion regardless of usage data, with the
filter being "tools that make sense for an authenticated portal
user".

**User correction (2026-04-27):**
> "Esto es algo que no quiero se convierta en un blocker… la
> solicitud del CEO es clara, quiere que se incorporen todos los
> tools posibles que hagan sentido, no importa si al día de hoy
> los usuario los han requerido o no."

**Rule.**
- The "real user demand signal" prerequisite from Decision E is
  **suspended**. Do not gate inclusion on usage data.
- L-S2 (portal-user test) and L-S6 (no admin/dev tools) still
  apply unchanged — those are correctness filters, not demand
  filters.
- L-S7 (no other-vertical wrapping) still applies unchanged.
- L-P4 (resist scope creep) is reframed: the CEO directive IS
  the demand signal; resist scope ONLY when a proposal fails
  L-S2 / L-S6 / L-S7, not because "no one asked yet".
- When proposing tools, justify against the L-S2/L-S6/L-S7
  filters explicitly. "User demand signal" is no longer a
  required justification.

---

## 🔍 Backend verification

### L-B1. Test real API responses before implementing — never trust backend code alone

**Pattern.** Fase 3 (Orders) initial plan was based on reading controllers.
Real responses had 8+ differences from assumptions (field names, shapes,
nullability). This is also documented in `feedback_api_discovery.md`.

**Rule.**
- Every new tool starts with a curl against sandbox with a real token.
  Document the response shape AS A COMMENT in the tool or types file.
- When the backend has multiple auth strategies (JWT vs hex token vs
  basic), verify which one is accepted.
- If sandbox is unavailable, note this explicitly in the code and
  surface it as a deployment gate.

---

### L-B2. Auth-verification gates must run before code

**Pattern.** Sprint 2 originally planned 5 ecart-payment tools.
Auth-verification gate (`curl /api/accounts/me` with Envia JWT) returned
401 immediately. Without the gate, 4+ hours of implementation would
have shipped tools that give 401 in runtime.

**Sprint 2 outcome.** Gate worked: tools deferred, blocker documented
in `SPRINT_2_BLOCKERS.md`.

**Rule.**
- When a new tool depends on a service with unknown auth compatibility,
  add an explicit "Sub-goal Xa — auth verification" BEFORE implementation
  sub-goal.
- If auth fails, defer and document. Do NOT guess / fall back to
  implementing with speculative auth.
- Follow the pattern from `SPRINT_2_PROMPT.md` Sub-goal 2a.

---

### L-B3. Read the router and the handler, not just one

**Pattern.** Endpoint paths sometimes look like typos (e.g.
`/tmp-fulfillment` with literal `tmp-` prefix). First instinct: this is
a mistake. Verification: grep the backend router — the path is real and
production-active.

**Rule.**
- Suspicious-looking endpoint names → grep the full path in the backend
  repo (`grep -rn "'/path-name'" services/{queries,ecommerce,...}/routes/`).
- Cross-reference: if two services use the same endpoint, the name is
  canonical (even if ugly).
- Read the Joi schema / validator next to the route definition — that
  reveals the accepted payload shape authoritatively.

---

### L-B4. Source-of-truth docs exist in `_meta/` — read before analysing

**Pattern.** Initial backend audits skipped services that already had
analyses in `_meta/` (geocodes, accounts, ecommerce, eshops, sockets).
Repeating the analysis from scratch would have missed context and
wasted hours.

**User correction (2026-04-16):**
> "ayer dentro del análisis no se incluyó el proyecto geocodes (no se
> si sea necesario o no) , al final todos los endpoints, rutas,
> servicios, lógica, etc que se tiene como base se encuentran en esos
> repos."

**Rule.**
- Before running a Reality Check on a backend service, read its existing
  `_meta/analysis-{service}.md` if one exists.
- Also check `reference_*_api.md` in memory for verified API contracts.
- The `reference_v1_backend_capabilities.md` memory file is an
  inventory of known backend capabilities — consult before assuming
  something "doesn't exist".

---

## 💻 Code execution

### L-C1. Never introduce new `any` types — narrow `unknown` with guards

**Rule.**
- TypeScript strict is enforced. `any` is forbidden.
- If an API response has loose typing, use `unknown` + a type guard, or
  a narrowly-scoped discriminated union.
- Double casts (`as unknown as X`) are a code smell — if you find one,
  write the type guard instead.

---

### L-C2. Graceful degradation over preventive validation

**Pattern.** Earlier proposals duplicated backend business rules in the
MCP (tax-rules replication, volumetric factor hardcoding) to "prevent
errors early". Most ended up wrong or out-of-date.

**Rule.**
- If the backend rejects bad input, map the error clearly
  (`mapCarrierError` + suggestions). Don't pre-validate business logic.
- If a backend call fails (timeout, 5xx, transient), degrade gracefully:
  return `{ ok: false, error: '...' }` and let the caller surface a
  warning — don't throw.
- Only validate client-side what the backend literally cannot see
  (e.g. input shape before sending, or country-specific formats like
  CPF that need checksum).

---

### L-C3. `textResponse()` always — no raw `{ content: [...] }`

**Rule.**
- All tool handlers return via `textResponse(...)` from
  `src/utils/mcp-response.ts`.
- The raw `{ content: [{ type: 'text', text: ... }] }` shape is legacy
  from 6 unmigrated tools. Do not add more. Migrate when you touch them.
- Future: ESLint rule `no-restricted-syntax` should block the raw pattern.

---

### L-C4. Side-effects, not separate tools, for cross-service sync

**Pattern.** Proposed `envia_sync_fulfillment` as a separate tool. User
would never ask for it directly.

**Resolution (Sprint 1):** `syncFulfillment` became an internal helper
fired automatically from `create_label` when `order_identifier` is
present. Silent side-effect, warning appended if sync fails, tool never
fails because of sync.

**Rule.**
- If an operation is an automatic consequence of another (sync,
  fulfillment, analytics event), implement as a side-effect of the
  primary tool — not as its own LLM-visible tool.
- Side-effect failures append warnings; never break the primary
  operation.

---

### L-C5. Reuse tool templates — don't invent patterns

**Rule.**
- Before creating a new tool, find a similar existing tool and copy its
  shape. Examples:
  - Simple read tool: `src/tools/products/check-billing-info.ts`
  - Tool that wraps a shared helper: `src/tools/account/get-balance-info.ts`
  - Tool with side-effect: `src/tools/create-label.ts` + `ecommerce-sync.ts`
  - Tool with carrier POST body: `src/tools/carriers-advanced/generate-bill-of-lading.ts`
- Consistency > cleverness. Don't create a new pattern unless the
  reference ones genuinely fail.

---

## 🧪 Testing

### L-T1. Tests for new behaviour, not just "pass the suite"

**Pattern.** Sprint 0 enriched `cancel-shipment` with refund amount,
daily-limit, COD chargeback. Suite passed — but no test covered the
new fields. Self-review caught it; 3 tests added pre-commit.

**Rule.**
- For every new code path, feature flag, or response field: write at
  least one test that explicitly asserts it.
- A green suite is necessary, not sufficient. Ask: "what test would
  fail if I broke this new behaviour?"
- Test file gaps for tools you're modifying = write them before moving on.

---

### L-T2. No control flow in tests (CLAUDE.md)

**Rule.**
- Tests must NOT contain `if`, `for`, `while`, `try/catch`. Use factories,
  parametric tests, or separate `it()` blocks.
- If an error-path test requires `try/catch`, use
  `await expect(...).rejects.toThrow(...)` instead.

---

### L-T3. `mockImplementation((url) => ...)` over `mockResolvedValue` for multi-call tools

**Pattern.** Adding generic-form validation to `create-address` broke
tests because the tool now makes 2 HTTP calls. Original
`mockResolvedValueOnce` on the mutation response got consumed by the
generic-form GET instead.

**Rule.**
- When a tool makes multiple HTTP calls with different expected
  responses, use `mockFetch.mockImplementation((url) => ...)` routing
  by URL.
- `defaultMockResponse(url)` helper pattern in
  `tests/tools/addresses/create-address.test.ts` is the template.

---

### L-T4. Explore-agent reports must be ground-truth checked

**Pattern.** Explore subagents wrote findings docs with specific
numeric claims (volumetric factor 1,000,000). Accepted uncritically,
then user corrected.

**Empirical error rate (admon-monorepo audit, 2026-04-26):** 5
corrections out of 16 random-sampled claims = **~31% error rate** when
explorer-agent claims are not directly source-verified. Top error mode:
agents over-count endpoints by ~2× when grep-counting handler
invocations or other patterns instead of route-object definitions
(e.g., Agent 2 reported 94 endpoints in `finances.routes.js` where
the true count is 49). Other modes: structure misinterpretation (Agent
3 reported a 26-element flat array of permission IDs that is actually
a 25-tuple `[perm_id, ticket_type_id]` mapping), and conflating
distinct code paths (claiming "constant-time comparison" for a token
strategy when only ONE of two cron auth paths actually uses it).

**Rule.**
- When an Explore agent returns numeric facts, carrier-specific rules,
  or business logic claims — spot-check at least one before using in a
  decision or shipping.
- For endpoint counts specifically, verify via:
  `grep -c -E "method:\s*'(GET|POST|PUT|PATCH|DELETE)'" <route-file>`.
  Don't accept agent-reported totals.
- For arrays/structures claimed as "flat list of N items" — open the
  source file, don't trust the description.
- Explore agents are great at scope and structure, weaker at
  interpreting dense PHP/Node semantics. Trust with verification.
- Plan for ~30% spot-check rate on critical numeric claims; budget
  the cross-check time into the audit, don't treat it as optional.

---

### L-B5. Verify backend support before any sprint that depends on it

**Pattern.** Sprint plans assume the backend already returns the
field, accepts the payload shape, or routes the request as the
MCP wants. When that turns out to be false mid-sprint, you have
shipped half a feature, can't merge cleanly, and have created
backend debt without escalating it.

**User correction (2026-04-27, scope-fence session):**
> "Si hay algo que requiera respuesta backend que hoy no exista,
> debes comentármelo y también documentarlo como deuda técnica.
> Primero verifica y coméntamelo."

**Rule.**
- Before starting any sprint whose items depend on backend
  fields/payloads/routing not previously verified in V1
  production, run an explicit verification step (curl against
  sandbox or read of the authoritative backend code path).
- Verification results go into the next planning conversation
  with Jose BEFORE coding starts.
- If verification shows backend doesn't support what the sprint
  needs:
  - Drop the affected item from the sprint.
  - File the gap in `_docs/BACKEND_TEAM_BRIEF.md` under
    appropriate severity, with sandbox repro if applicable.
  - Surface to Jose, do NOT proceed with a partial
    implementation that would only work after backend lands its
    own change.
- Reading backend code (PHP/Node) for verification is allowed
  and authoritative; per L-S8, writing to those repos is not.

---

## 📦 Commits / Git

### L-G1. Clean tree discipline before any session kicks off

**Pattern.** Entering sessions with dozens of pending files from prior
sessions creates ambiguity about what's new.

**Rule.**
- First command of every session: `git status --short` + `git log -1`.
- If there are pending changes, commit them (with explicit user
  approval) BEFORE generating new artifacts.
- Never mix "planning session" changes with "execution session" changes
  in the same commit.

---

### L-G2. Commit messages tell the sprint story, not just the diff

**Rule.**
- Every sprint commit message has:
  - **Summary line:** `feat: Sprint N — one-sentence outcome`
  - **Body sections:** `## Implemented`, `## Deferred`, `## Quality`
  - **Co-authored trailer:** `Co-Authored-By: Claude <model> <noreply@anthropic.com>`
- See commit `ed4cf6c` (Sprint 2) as the current template.

---

### L-G3. Never push without explicit instruction

**Rule.**
- All commits stay local by default.
- Push only when user says "push" or similar explicit instruction.
- Branch management (feature branches vs main) is the user's call, not
  the agent's.

---

## 🗣️ Process / communication

### L-P1. Surface decisions explicitly — don't make them silently

**Rule.**
- When multiple paths exist (architecture, scope, priority), list the
  options with tradeoffs and ASK the user to choose.
- Capture the chosen option in a decisions log
  (`_docs/DECISIONS_*.md`) with reasoning.
- Unilateral decisions by the agent = planning debt for future sessions.

---

### L-P2. Handoff between sessions needs a brief + a prompt

**Pattern.** Without a brief, the next session spends 30+ minutes
rediscovering context. With a brief, arbitrary model jumps straight to
work.

**Rule.**
- Every long-running project needs:
  - `project_X_plan.md` in memory — evergreen project state.
  - `_docs/NEXT_SESSION_*_BRIEF.md` — one-shot brief for the next
    specific session.
  - `.claude/prompts/X_PROMPT.md` — self-contained opening prompt.
- After finishing a session, regenerate the brief + prompt for the
  next one.

---

### L-P3. Opus for "what and why", Sonnet for "how"

**Rule.**
- Strategic sessions (decisions, synthesis across docs, reality checks,
  scope fences): **Opus 4.7 (1M context)**.
- Execution sessions (implement a detailed prompt, run tests, produce
  code per spec): **Sonnet 4.6**.
- This rule has held across all MCP sessions so far — do not deviate
  without a specific reason.

---

### L-P4. Resist scope creep with the "typical user" test

**Pattern.** Every new discovery reveals "this would be useful too".
Most are not v1.

**Rule.**
- Apply the test from L-S2 to every proposal: "Would a typical portal
  user ask for this?"
- If the answer is "a power user", "an admin", or "maybe later" →
  defer, log in a deferred-list, move on.
- v1 is frozen scope. New scope requires an explicit user decision.

---

### L-P5. Document blockers, don't guess around them

**Pattern.** Sprint 2 ecart-payment auth failed. Option A was "guess
the correct auth and try variations". Chose instead to document root
cause in `SPRINT_2_BLOCKERS.md` with 4 resolution paths and defer.

**Rule.**
- When a blocker appears, the session produces:
  - Root cause (what exactly fails and why)
  - Resolution options (ranked by complexity/risk)
  - Which are in scope for this sprint vs future
- Never implement against an unresolved blocker. Never silently skip
  the issue.

---

## How to add a new lesson

When the user corrects you, immediately:

1. Stop your current train of thought.
2. Re-read the correction carefully — what EXACTLY did they say?
3. Identify the pattern: what did you do that triggered the correction?
4. Write the lesson here under the most appropriate category.
5. Derive a rule that prevents the same mistake. Rule must be testable
   ("is this a list tool with >8 fields?") not vague ("be careful").
6. If the same lesson already exists, strengthen the rule instead of
   adding a duplicate.
7. If the correction reveals a process failure (not a technical one),
   put it under "Process / communication".
8. At the end of the session, verify the lesson is in place.

## Self-check at session end

Before closing any session:

- [ ] Did the user correct me today? If yes, is each correction
      reflected here as a lesson?
- [ ] Did I apply lessons from previous sessions? If I hit a mistake
      that was already documented, why? Strengthen the rule.
- [ ] Is the file bloating with duplicates? Consolidate.
- [ ] Is any lesson obsolete (project changed)? Strike it with a
      dated `~~L-X~~ (obsolete 2026-XX-XX, reason)` line.
