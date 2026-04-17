# Planning Session Brief — envia-mcp-server portal agent

> **Purpose:** Consolidated context for a dedicated planning/validation
> session. The next session is NOT for execution; it is for strategic
> decisions, verifications against reality, and generation of the next
> round of execution prompts.
>
> **Recommended model:** Opus 4.7 (1M context). Strategic judgment, not
> code execution.

## The project in one paragraph

`envia-mcp-server` is an MCP server embedded inside the Envia portal. It
exposes conversational tools for the AI agent that lives in the portal —
quote, create label, track, cancel, pickups, tickets, orders, account
info, analytics. Scope criterion: "everything a portal user could ask in
chat, with responses matching the portal UI". Admin/dev/onboarding tasks
are explicitly excluded. Not a multi-tenant public MCP server.

## Current state (2026-04-17)

### Quantitative

| Metric | Value |
|--------|-------|
| User-facing tools registered with LLM | **72** |
| Internal helpers (not LLM-visible) | 5 |
| Tests passing | **1369** / 1369 |
| Test files | 103 |
| Source files | 167 |
| Source LOC | ~19,500 |
| TypeScript build | ✅ clean |

### Git state

| Item | Detail |
|------|--------|
| Branch | `main` (local only, not pushed) |
| Last commit | `ed4cf6c — feat: Sprint 2 — envia_check_balance + deploy checklist + auth blockers documented` |
| Pending to commit | 2 planning docs created in the handoff session (this brief + the planning prompt). Commit them as the planning session's first action. |

### Sprints completed

| Sprint | Outcome | Commit |
|--------|---------|--------|
| 0 | Cleanup + 5 new V1-safe tools + 3 internal helpers + generic-form integration + error map expansion | `616cd60` |
| 1 | fulfillmentSync side-effect in create_label + Session B analysis (5 services) + test gaps filled for 4 tools | `ae7407b` |
| 2 | `envia_check_balance` (pivoted to reuse user-info) + deploy checklist + Sprint 2 blockers doc + smoke-test response shapes docs | **uncommitted** |

## Pending to commit (only 2 docs from the handoff session)

```
?? .claude/prompts/PLANNING_SESSION_PROMPT.md
?? _docs/NEXT_SESSION_PLANNING_BRIEF.md      (this file)
```

These are planning artefacts only. The planning session should commit
them early (before generating Sprint 3 artefacts) to keep a clean tree.
Suggested commit message:

```
docs: planning session brief + opening prompt for next session
```

All Sprint 0/1/2 code is already in `main` locally.

## Key documents to consult

Hand the planning session this list — it should read at least the ones
marked with ⭐ before making decisions.

### 🚨 READ FIRST (mandatory for every session)
- ⭐⭐⭐ `ai-agent/envia-mcp-server/_docs/LESSONS.md` — every user
  correction ever, with patterns and rules. Do NOT skip.

### State & strategy
- ⭐ `ai-agent/envia-mcp-server/_docs/V1_SAFE_TOOL_INVENTORY.md` — master
  classification framework (V1-SAFE / V1-PARTIAL / V2-ONLY / ADMIN-ONLY
  / INTERNAL-HELPER). Source of truth for "what belongs in the agent v1".
- ⭐ `ai-agent/envia-mcp-server/_docs/SPRINT_2_BLOCKERS.md` — ecart-payment
  JWT auth incompatibility, with root cause and proposed resolutions.
- ⭐ `ai-agent/envia-mcp-server/MCP_REMAINING_PHASES_GUIDE.md` — current
  plan + sprints done + remaining work.
- `ai-agent/envia-mcp-server/_docs/AUDIT_2026_04_16.md` — structural
  audit (partially addressed). P1+P2 items still open.
- `ai-agent/envia-mcp-server/_docs/PLAN_VS_IMPL_GAP_REPORT_2026_04_16.md`
  — gap report that triggered Sprint 0.

### Reality check findings
Location split intentional:
- **Monorepo root** (`envia-repos/_docs/backend-reality-check/`):
  Session A findings — geocodes, accounts, ecommerce-eshops,
  carriers-top5, queries-inventory, MASTER_SUMMARY.
- **MCP repo** (`ai-agent/envia-mcp-server/_docs/backend-reality-check/`):
  Session B findings — ecart-payment, queue, sockets, secondary-carriers,
  tms-admin, MASTER_SUMMARY.

### Deploy & ops
- ⭐ `ai-agent/envia-mcp-server/_docs/DEPLOY_CHECKLIST.md` — env vars
  required, deploy gates, post-deploy verification steps.

### Session prompts already written
- `ai-agent/envia-mcp-server/.claude/prompts/SPRINT_1_PROMPT.md` (done)
- `ai-agent/envia-mcp-server/.claude/prompts/SPRINT_2_PROMPT.md` (done,
  but Sprint 2 deferred ecart-payment)

## Decisions pending (the planning session must answer these)

### Decision A — ecart-payment integration path

**Context:** Sprint 2 blocked 5 tools (refund status, withdrawal status,
transaction history, ecartpay balance, invoices) because ecart-payment
has its own JWT issuance via `ECART_PAY_PAYMENTS_PRIVATE_KEY` +
`ECART_PAY_COLLECT_PRIVATE_KEY` env vars not available to the MCP.

**Options:**
1. **Provision keys to MCP** — give the MCP the same env vars the queries
   service uses. Security implication: widens the blast radius of an MCP
   compromise. Easiest to implement.
2. **Proxy via queries service** — queries already has the keys; add a
   new endpoint like `GET /proxy/ecart-payment/{resource}` that relays
   authenticated calls. Cleanest from a security standpoint; requires
   backend team work.
3. **Payments-team endpoint accepting Envia JWT** — request ecart-payment
   to expose specific read-only endpoints that validate the standard
   Envia portal JWT. Most idiomatic; slowest (cross-team coordination).
4. **Defer indefinitely** — the 5 tools are "nice to have"; v1 ships
   without them. The user can always read this info in the portal UI.

**Question for the planning session:** Which path? And what's the ETA?

### Decision B — Sprint 3 scope

**Candidates, ordered by impact/effort ratio:**

| # | Item | Effort | User-visible? | Depends on |
|---|------|--------|---------------|------------|
| 1 | Secondary-carrier error-map entries (J&T, Fletes, 99 Minutos, etc. — from findings) | Small | Yes (better error messages) | — |
| 2 | Resolve Decision A and implement ecart-payment tools | Medium | Yes (5 new tools) | Decision A path |
| 3 | Smoke test playbook + first deploy to staging | Small | No (internal) | Deploy access |
| 4 | Typed payloads refactor (kill ~111 `Record<string, unknown>`) | Large | No (internal quality) | — |
| 5 | Tool registry pattern (auto-register from barrels) | Medium | No (internal quality) | — |
| 6 | Migrate 6 tools with raw response to `textResponse()` + ESLint rule | Small | No (internal quality) | — |
| 7 | Observability layer (pino logger + request correlation IDs) | Medium | No (debuggability) | Deploy path |

**Question for the planning session:** What's in Sprint 3? Keep it ≤3
items to stay focused.

### Decision C — First deploy timing

**Context:** The MCP has never been deployed. All 72 tools have unit +
integration tests, but no end-to-end real-user validation. Decisions
needed:

1. When does staging deploy happen? Who executes it?
2. What's the go/no-go criteria for v1 launch (list of MUST-WORK tools)?
3. How is regression detected after deploy? (manual smoke test vs
   automated vs both)
4. Who monitors `type_generate: 'mcp_generate'` logs after the first
   ecommerce label is generated?

### Decision D — Observability gap

**Context:** The original audit flagged "zero observability" as a P0
issue. Sprint 0 deferred it because the MCP was going to live inside the
portal (shared auth). However, production still needs:

- Correlation IDs to trace a user's conversation across tool calls.
- Structured logs for debugging when a user reports "the agent said X".
- Metrics for tool usage (which tools are called most, which fail).

**Question:** Does observability go into Sprint 3, or is deferred (and
we accept "tell me exactly what you typed" as the debug mode for v1)?

### Decision E — Scope fence for v1 launch

**Context:** There's pressure to expand scope with each discovery. The
planning session should either:

a. Lock scope at current 72 tools for v1, defer everything else to v2.
b. Define a small, specific set to add before v1 (e.g. "the 5 Decision-A
   tools and nothing else").
c. Pick an explicit v1 launch date and reverse-engineer scope from it.

## Validations needed (can start BEFORE decisions)

The planning session can kick off these lightweight validations to
inform the decisions:

### V1 — ecart-payment staging access

Confirm: is there a staging hostname for ecart-payment, what's its URL,
and is there a staging version of the keys the queries service uses? If
yes, Decision A option 1 becomes viable without risk.

```bash
# From queries service staging env
grep "ECART_PAY" services/queries/.env.example 2>/dev/null
grep -r "ecart-payment-dev\|ecart-payment-test\|ecart-payment-stage" \
  services/queries/ | head -5
```

### V2 — Portal deploy environment state

Confirm: is the `ENVIA_ECART_HOSTNAME` env var already configured in
the portal's staging/production environment? If not, the Sprint 1
fulfillmentSync will emit warnings indefinitely.

### V3 — Tool parity with portal

Audit: do the 72 MCP tools map cleanly to what the portal UI exposes?
Produce a matrix: Portal Section → Expected User Question → MCP Tool →
Coverage Status. Identify any gap or duplicate.

### V4 — Regression smoke check

Before Sprint 3 starts, run a full suite against sandbox:
```bash
cd ai-agent/envia-mcp-server
npm run build && npx vitest run
```
Must be 1369/1369. Any failure = investigate first.

### V5 — Secondary-carrier findings re-read

Re-read `_docs/backend-reality-check/secondary-carriers-findings.md`.
It proposes specific error-map entries. Decision: do those entries
become part of Sprint 3 Item #1?

## Deliverables expected from the planning session

When the planning session closes, it must have produced:

1. ⭐ **`SPRINT_3_PROMPT.md`** — self-contained execution prompt for the
   next Sonnet session, scoped to the decisions made here.
2. ⭐ **Decisions log** — `_docs/DECISIONS_2026_04_17.md` with the four
   decisions (A-D) explicitly answered and signed by Jose.
3. **Updated memory:** `memory/project_mcp_expansion_plan.md` with the
   new sprint in the roadmap.
4. **Updated `MCP_REMAINING_PHASES_GUIDE.md`** reflecting Sprint 3
   scope + anything deferred to Sprint 4+.
5. **Commit of all Sprint 2 pending changes** (11 files listed above),
   BEFORE generating new artifacts. Clean tree discipline.

## Model-selection guidance

| Work | Model | Why |
|------|-------|-----|
| This planning session | **Opus 4.7 (1M context)** | Strategic decisions, synthesis of 5+ docs, tradeoff analysis |
| Sprint 3 execution session | **Sonnet 4.6** | Scoped execution against a good prompt |
| Future validation sessions | **Opus** | Anytime strategy > ejecución |

## Red flags the planning session should watch for

- **Scope creep** — every new doc reveals more "nice to have". The session
  must defend the v1 scope fence (Decision E).
- **Over-engineering without evidence** — typed payloads is a big refactor
  with no user-visible impact. Only do it if something broke because of
  the missing types.
- **Verification theatre** — don't generate a prompt that mandates curl
  checks without a clear "if fail, then X" plan. Blockers must have
  predefined fallbacks.
- **Cross-repo sprawl** — findings live in 2 `_docs/backend-reality-check/`
  directories (monorepo root + MCP repo). Decide whether to consolidate
  or accept the split.
