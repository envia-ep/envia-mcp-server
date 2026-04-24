# Endpoint Audit Session — Opening Prompt

> **Self-contained prompt for a dedicated audit session.** Executable
> by Opus 4.7 (1M context). No prior session context required beyond
> the repository files referenced below.
>
> **Model:** Opus 4.7 (1M context). Not Sonnet.
> **Expected duration:** 2-3 hours.
> **Output:** 7 markdown files in `_docs/ENDPOINT_AUDIT_2026_04_XX/`.

## Step 0 — Read LESSONS.md before anything else (MANDATORY)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

Every lesson encoded there reflects a prior user correction with a
preventive rule. Read end-to-end. Do not skip. Particular relevance
for this session:

- **L-S1** V1 production is source of truth, not V2 in construction.
- **L-S2** Portal-embedded; criterion is "typical portal user asks
  this in chat". This session does NOT change that scope model —
  it audits inside it.
- **L-S4** When something looks off, verify before defending. Cite
  source file + line for every quantitative claim.
- **L-S6** Don't expose admin/dev tools to the LLM. Classify as ⚫
  ADMIN-ONLY without exception.
- **L-P1** Surface decisions explicitly. This session does not make
  inclusion decisions — it produces the matrix so a subsequent session
  can.
- **L-P4** Resist scope creep; every proposal must pass the portal-user
  test.
- **L-B4** Start from `_meta/` and reference docs if they exist.
- **L-T4** Explore-agent reports must be ground-truth checked.
- **L-G1** Clean tree first.
- **L-G3** Never push to origin without explicit instruction.

## Context

### What the project is

`envia-mcp-server` is a scoped MCP server embedded inside the Envia
portal (v1). Tools replicate the conversational equivalent of portal
UI actions: quote, create label, track, cancel, pickups, tickets,
orders, account info, analytics. It is NOT a multi-tenant public MCP
server.

### Why this session exists

The CEO has expanded the ambition of what the portal agent should
answer — beyond core shipping, toward any topic an authenticated
envia.com customer might ask about. See `_docs/ENDPOINT_AUDIT_BRIEF.md`
section 1 for the exact scope expansion.

**Deployment model has NOT changed.** Still portal-embedded,
authenticated session only. Expanding scope INSIDE that model.

### Current state (pre-audit)

- 72 user-facing tools + 5 internal helpers.
- 1379 tests, build clean, ESLint guard active.
- Last commit: `6af3156` (check with `git log -1 --oneline`).
- Staging deployed (release v9, `https://envia-mcp-server-c0fa1b3dab48.herokuapp.com`).

## Scope — 6 projects to audit

1. **carriers** (`services/carriers/`, PHP/Lumen)
2. **queries** (`services/queries/`, Node/Hapi)
3. **geocodes** (`services/geocodes/`, Node)
4. **ecommerce + eshops + ecartApiOauth** (3 services, group as one audit)
5. **admin-monorepo** (`admon-monorepo/`, no prior analysis)
6. **accounts** (`repos_extra/accounts/`, requires extra sensitivity analysis)

Explicitly OUT: **ecart-payment** (different organizational vertical —
LESSON L-S7, see BRIEF §2.1), envia legacy, envia-php8, fulfillment-api,
fulfillment-warehouse-api, sockets, frontends, AI/MCP repos themselves.
See BRIEF section 2.1 for full reasoning.

## Required reading before dispatching agents (in order)

1. Step 0 — `_docs/LESSONS.md` (already mandatory, done).
2. `_docs/ENDPOINT_AUDIT_BRIEF.md` — full methodology, columns, rubrics,
   seed questions, classification labels. This is the session's
   backbone. Read every word.
3. `_docs/V1_SAFE_TOOL_INVENTORY.md` — tools already exposed + their
   classification. Use when populating the "Already exposed?" column.
4. `_docs/BACKEND_ROUTING_REFERENCE.md` — which tools today hit which
   backend.
5. `_docs/DECISIONS_2026_04_17.md` — A-E context (especially Decision
   A deferring ecart-payment and Decision E scope fence).
6. `_docs/SPRINT_2_BLOCKERS.md` — why ecart-payment has JWT issues.
7. `_docs/COUNTRY_RULES_REFERENCE.md` — what country rules live where
   (relevant for carriers + geocodes audits).
8. `memory/reference_carriers_architecture.md` (Claude Code memory)
9. `memory/reference_queries_architecture.md`
10. `memory/discovery_ecommerce_backend.md`
11. `memory/reference_v1_backend_capabilities.md`

Do NOT skim. The audit quality depends on reusing prior work instead
of re-discovering.

## How to work

### Step 1 — Verify clean tree

```bash
cd ai-agent/envia-mcp-server
git status --short
```

Must be clean. If not, surface to Jose before starting.

### Step 2 — Create the output directory

```bash
mkdir -p _docs/ENDPOINT_AUDIT_2026_04_XX
```

Replace `XX` with the actual day of execution.

### Step 3 — Dispatch 6 Explore subagents in parallel

Send a SINGLE message with 6 `Agent` tool calls (subagent_type:
`Explore`, thoroughness: `very thorough`) — one per project. Each
subagent's prompt must be self-contained and include:

- The project's location and pre-existing doc list (see BRIEF §9.1).
- The 13-column format (see BRIEF §4.2).
- The risk vocabulary (BRIEF §7).
- The classification labels (BRIEF §5).
- The value rubric (BRIEF §6).
- The seed list of user questions (BRIEF §8).
- Instructions to cite source file + line for every quantitative claim.
- Instructions to write directly to
  `_docs/ENDPOINT_AUDIT_2026_04_XX/<project>-audit.md`.
- For `accounts-audit.md`: instruction to fill the Sensitivity
  Analysis section with explicit recommendation.

Running in parallel is important: each agent is isolated and they
don't share context with each other. The brief is the single source
of truth they must all read.

### Step 4 — Wait for all 6 subagents to complete

Each returns a summary pointing at the file written. Spot-check at
least ONE numeric claim per file before synthesis (LESSON L-T4 —
Explore agents occasionally misinterpret code).

If any agent reports a blocker (e.g. "no source found for
admin-monorepo routes"), pause and surface to Jose. Do not guess.

### Step 5 — Synthesize MASTER_SUMMARY.md

Read all 6 audit docs. Produce `MASTER_SUMMARY.md` with the 7 required
sections (BRIEF §10, in order):

1. Executive headline (totals).
2. Top opportunities (30-50 entries, sorted by Value × 1/T-shirt).
3. Overlaps map.
4. Tools to retire / expand.
5. Accounts-specific recommendation.
6. Pending questions for backend team (deduplicated, by team owner).
7. Proposed execution priority (3-5 waves).

The synthesis must be done BY YOU (Opus), not by another subagent —
synthesis requires reading all 6 simultaneously.

### Step 6 — Quality gates before committing

- [ ] 7 files exist in `_docs/ENDPOINT_AUDIT_2026_04_XX/`.
- [ ] Every endpoint row has all 13 columns populated (empty values
      allowed but cell present).
- [ ] Every quantitative claim cites a source file (`ruta/archivo:line`).
- [ ] Accounts-audit.md has a filled Sensitivity Analysis section.
- [ ] MASTER_SUMMARY has all 7 sections with at least one entry each
      where applicable.
- [ ] No new tool registration (verify `git diff src/index.ts` = empty).
- [ ] No code changes (verify `git diff src/` = empty).

### Step 7 — Commit (wait for Jose's approval)

```bash
git add _docs/ENDPOINT_AUDIT_2026_04_XX/
git status --short
```

Propose commit message following LESSONS L-G2 format:

```
docs: endpoint audit across 7 backends — decision matrix for MCP expansion

## Implemented
- _docs/ENDPOINT_AUDIT_2026_04_XX/ — 7 per-project audits + MASTER_SUMMARY.
  Total: <N> endpoints classified across carriers, queries, geocodes,
  ecommerce (+eshops+ecartApiOauth), admin-monorepo, ecart-payment,
  accounts. Each endpoint scored on 13 columns (classification, user
  question, value, risks, PII/financial, sandbox, t-shirt, overlaps).
- MASTER_SUMMARY.md — top opportunities list, overlaps map, retire/expand
  list, accounts sensitivity recommendation, questions for backend team,
  proposed 3-5 waves of execution.

## Method
- Started from _meta/ analyses and reference_*.md memory where available
  (carriers, queries, geocodes, ecommerce). Primary discovery for
  admin-monorepo and ecart-payment.
- Parallel Explore subagents (1 per project) + Opus synthesis.
- Every numeric or structural claim cites source file + line.

## Deferred
- Inclusion decisions — to a dedicated decision session (separate).
- No implementation of new tools.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Wait for Jose's explicit approval before `git commit`.**

### Step 8 — Handoff summary

Give Jose:

- One-paragraph summary of totals by classification.
- Path to MASTER_SUMMARY.md.
- Top 3 surprising findings from the audit (things Jose likely did not
  expect).
- Accounts recommendation headline (include / subset / defer).
- Recommendation for the next session (decision session, Opus, with
  MASTER_SUMMARY as input).
- Note whether LESSONS.md gained new entries.

### Step 9 — Update LESSONS.md if user corrected anything

If during this session Jose corrected any assumption, classification,
or proposal, append the lesson to `_docs/LESSONS.md` following the
existing format (pattern + correction quote + rule + category tag).

If nothing was corrected, note that in the handoff summary.

### Step 10 — Ensure the decision-session prompt references LESSONS.md

Do NOT generate the decision session's prompt in this audit session —
that is the next session's job. Just note in the handoff that the next
prompt must include `Step 0 — Read LESSONS.md`.

## What NOT to do in this session

- **Do NOT write any code.** No `.ts`, no `.js`. Audit produces
  markdown only.
- **Do NOT register new tools.** Tool count stays at 72.
- **Do NOT make inclusion decisions** — the MASTER_SUMMARY proposes
  priorities, it does not decide. The decision is Jose's in a separate
  session.
- **Do NOT skip pre-existing docs.** `_meta/` and `reference_*.md`
  contain hours of prior analysis; starting from scratch wastes time
  and produces lower-quality output (LESSON L-B4).
- **Do NOT infer numeric claims.** Every volumetric factor, cap,
  timeout, or limit must come from a cited source or be flagged as
  "needs clarification from backend team" (LESSON L-S4).
- **Do NOT include ecart-payment.** Organizationally owned by another
  vertical; the MCP does not expose it directly (LESSON L-S7,
  BRIEF §2.1). If any endpoint in the 6 in-scope projects transitively
  calls ecart-payment internally, that's fine and should be captured
  in the "Implementation notes" column — but no ecart-payment audit
  doc and no ecart-payment tool proposals.
- **Do NOT include envia / envia-php8 / fulfillment-api / fulfillment-warehouse-api / sockets / frontends.** Out of scope per BRIEF §2.1.
- **Do NOT push commits to remote.** Local only (LESSON L-G3).
- **Do NOT run `git add -A`.** Stage the audit directory explicitly
  (`git add _docs/ENDPOINT_AUDIT_2026_04_XX/`).

## Conventions

- English for all audit docs (per CLAUDE.md).
- Endpoint rows: Markdown tables, one row per endpoint. Wide tables
  are OK.
- File naming: kebab-case (e.g. `ecart-payment-audit.md`).
- Classifications use the exact emoji + label (🟢 V1-SAFE, etc.) so
  grep / filter works later.
- Risks use only the controlled vocabulary in BRIEF §7.

## Sandbox credentials (for curl verification)

```
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
QUERIES="https://queries-test.envia.com"
CARRIERS="https://api-test.envia.com"
GEOCODES="https://geocodes.envia.com"  # production only — no sandbox
ECART_API_SANDBOX="https://ecart-api-test.ecartapi.com"
# ECART_PAY is OUT of scope — do not verify ecart-payment endpoints.
```

Only do curl verification for high-value candidates (🟢 V1-SAFE +
Alto). Skip admin-only and V2-only.

## Exit criteria

- `_docs/ENDPOINT_AUDIT_2026_04_XX/` exists with 7 files.
- All quality gates in Step 6 satisfied.
- Commit message proposed, awaiting Jose's approval.
- Handoff summary delivered.

If any of these is missing, the session did not succeed. Do not leave
partial work; either finish or surface the specific blocker.

## Out-of-scope reminders for this session

- Sprint 4 planning (auth barrier, observability, portal integration).
- ecart-payment JWT resolution (Decision A deferred this).
- Any code change (strictly docs).
- Tool parity audit (separate side-task).

Good luck. Jose (jose.vidrio@envia.com) is the sole decision-maker for
all inclusion / exclusion / prioritization decisions, but those
decisions happen in a subsequent session. This session's job is to
make those decisions cheap for him by giving him a clean, evidenced
matrix.
