# Planning Session — envia-mcp-server portal agent v1

> **This session is for strategic decisions, not code execution.**
>
> Model: Opus 4.7 (1M context) recommended.
>
> Goal: make four pending decisions, run lightweight verifications, and
> produce execution prompts for the next wave of work.

## Your role this session

You are a planning partner for Jose (CTO Envia). You are NOT a code
executor. Your job is to:

1. **Validate** the current state of the project against reality (git,
   tests, deployed config).
2. **Force decisions** that have been accumulating: surface the tradeoffs
   clearly and ask Jose to choose.
3. **Generate** clean execution prompts for the next Sonnet sessions.
4. **Resist scope creep** — every new proposal gets measured against
   "would a typical portal user ask for this?"

You should write very little code this session. Most output is markdown
documents + clarifying questions + a final prompt.

## What to do first (in this exact order)

### Step 0 — Read LESSONS.md (MANDATORY, ALWAYS, NO EXCEPTIONS)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

This file encodes every user correction from prior sessions, with
patterns and rules to prevent repeating mistakes. You MUST read it
end-to-end before doing anything else. If you skip this, you will
almost certainly repeat a mistake Jose has already paid for.

Pay special attention to the **Strategic / scope decisions** category —
the 4 decisions you'll be forcing in Step 4 have directly relevant
lessons (L-S1, L-S2, L-S3, L-S4).

### Step 1 — Read the brief

Read every word of this file — it is the single source of context:

```
ai-agent/envia-mcp-server/_docs/NEXT_SESSION_PLANNING_BRIEF.md
```

That document:
- Summarizes the project state (72 tools, 1369 tests, 3 sprints done).
- Lists 4 decisions pending (A–E).
- Lists 5 validations to run.
- Defines what this session must deliver.

Do not start any other reading until you have read this fully.

### Step 2 — Commit planning handoff docs (clean tree first)

Sprint 2 is already committed (`ed4cf6c`). The only pending items are the
2 planning artefacts from the handoff session:

```bash
cd ai-agent/envia-mcp-server
git status --short    # should show exactly 2 untracked files:
                      #   .claude/prompts/PLANNING_SESSION_PROMPT.md
                      #   _docs/NEXT_SESSION_PLANNING_BRIEF.md

git add -A
git commit -m "docs: planning session brief + opening prompt for next session"
git log -1 --stat | head -10
```

Then proceed with verifications + decisions below. The tree must be
clean before you start generating Sprint 3 artefacts.

### Step 3 — Run verifications V1–V5 from the brief

See the brief's "Validations needed" section. Each is 5–15 minutes of
curl / grep / reading. Do all five; their outputs inform the decisions.

Document each verification outcome in a short log:
```
## Verification log (2026-04-17)

### V1 — ecart-payment staging access
Command: <what you ran>
Result: <what you got>
Implication: <how this changes Decision A>

### V2 — ...
```

Save to `_docs/VERIFICATIONS_2026_04_17.md`.

### Step 4 — Bring the 4 decisions to Jose explicitly

One at a time. For each decision:

1. State the options with current evidence.
2. Give your recommendation with reasoning.
3. Wait for Jose's answer before moving to the next.

Capture each answer in `_docs/DECISIONS_2026_04_17.md` with:
- Date
- Decision letter (A, B, C, D, E)
- Options considered
- Chosen path + reasoning
- Follow-up actions

Do NOT move to Step 5 until all four decisions are captured in the doc.

### Step 5 — Generate Sprint 3 prompt

Based on the decisions, produce
`ai-agent/envia-mcp-server/.claude/prompts/SPRINT_3_PROMPT.md` using
`SPRINT_1_PROMPT.md` and `SPRINT_2_PROMPT.md` as templates.

Required elements of the prompt:
- Context (what the project is, in 2 paragraphs).
- Current state metrics (tools, tests, last commit).
- Scoped goals (≤3 items; cite the decisions they come from).
- Auth-verification gates where relevant (if any tool depends on an
  external service — follow the pattern from Sprint 2 Sub-goal 2a).
- Exact file paths to create/modify.
- Exit criteria quantified (tool count delta, test count delta).
- "What NOT to do" section — carry over Sprint 0/1/2 exclusions +
  anything new from this session's decisions.

### Step 6 — Update state docs

Before closing the session:

1. Update `memory/project_mcp_expansion_plan.md` with Sprint 2 complete
   and Sprint 3 queued.
2. Update `ai-agent/envia-mcp-server/MCP_REMAINING_PHASES_GUIDE.md`
   with the new plan.
3. Update the "Last commit" / "Current state" fields to reflect the
   Sprint 2 commit you made in Step 2.

### Step 7 — Update LESSONS.md (if Jose corrected anything)

If during this session Jose corrected an assumption, a proposal, or a
scope decision, add the lesson to
`ai-agent/envia-mcp-server/_docs/LESSONS.md` following the format
already in place (pattern + correction quote + rule + category tag).

If nothing was corrected, skim the file briefly and decide whether any
existing lesson should be strengthened based on your session's
experience.

### Step 8 — Ensure SPRINT_3_PROMPT.md references LESSONS.md

The generated Sprint 3 prompt MUST include, as its Step 0:

```
Step 0 — Read LESSONS.md before anything else.
```

Every prompt generated from now on must start this way. Non-negotiable.

### Step 9 — Hand off summary

Give Jose:
- One-paragraph summary of decisions made.
- Link to `SPRINT_3_PROMPT.md`.
- Recommended opening message for the next execution session.
- Model recommendation for the next session.
- Note whether LESSONS.md gained new entries this session.

## Non-negotiables

- **No implementation code this session.** If you catch yourself writing
  `.ts` files that aren't docs or prompts, stop and ask.
- **No decisions made unilaterally.** Each of A, B, C, D, E requires
  Jose's explicit answer.
- **No scope additions without evidence.** "It might be useful" isn't
  enough. Tie every proposal to a specific user question from the portal
  UX or a specific finding from the reality-check docs.
- **Clean tree discipline.** Sprint 2 must be committed before this
  session generates new files.

## Model guidance

You (this session): **Opus 4.7 (1M context)** — strategic decisions +
synthesis of many docs.

The next execution session: **Sonnet 4.6** — good for scoped code work
against a detailed prompt.

When in doubt about who should do what: Opus for "what and why", Sonnet
for "how". That rule has held across all sessions so far.

## Minimum required reading before decisions

In this order:
1. ⭐ `_docs/LESSONS.md` (MANDATORY FIRST — see Step 0)
2. `_docs/NEXT_SESSION_PLANNING_BRIEF.md` (this session's backbone)
3. `_docs/V1_SAFE_TOOL_INVENTORY.md`
4. `_docs/SPRINT_2_BLOCKERS.md`
5. `_docs/backend-reality-check/MASTER_SUMMARY.md` (in the MCP repo)
6. `MCP_REMAINING_PHASES_GUIDE.md`
7. `_docs/DEPLOY_CHECKLIST.md`

Optional but valuable:
- `_docs/AUDIT_2026_04_16.md`
- `_docs/PLAN_VS_IMPL_GAP_REPORT_2026_04_16.md`
- Session B findings: `ecart-payment-findings.md`, `queue-findings.md`,
  `secondary-carriers-findings.md`, `sockets-findings.md`,
  `tms-admin-findings.md`.

## Success criterion for this session

When the session closes:
- Sprint 2 is committed.
- Four decisions (A–D) are captured in a decisions log with reasoning.
- `SPRINT_3_PROMPT.md` exists and is self-contained.
- Memory + guides are updated.
- Jose has a one-paragraph summary and a clear next step.

If any of those is missing, the session did not succeed. Don't let
conversation drift toward implementation; hold the line.

Good luck. Jose (jose.vidrio@envia.com) is the only decision-maker.
Your job is to make decisions cheap for him by surfacing evidence and
tradeoffs clearly.
