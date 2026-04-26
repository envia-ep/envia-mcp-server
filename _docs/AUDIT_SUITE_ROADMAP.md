# Audit Suite Roadmap — Remaining Work

> **Purpose:** Single artifact tracking what remains to bring all 6
> backend services to "best of the world" reference standard. Read
> this at session start to know exactly what to do next; update at
> session end with progress.
>
> **Updated:** 2026-04-26 after the suite-level best-of-world pass
> (carriers cookbook + verification + transversal analysis + brief +
> queries/geocodes scripts).

## Current state of the audit suite

| Project | Deep ref doc | Lines | Cookbook (§53-equivalent) | Verification script | Best-of-world pass |
|---------|--------------|------:|---------------------------|---------------------|---------------------|
| **carriers** | ✅ `_docs/CARRIERS_DEEP_REFERENCE.md` | 4,421 | ✅ §53 (11 scenarios) | ✅ `scripts/verify-carriers-ref.sh` (37 checks) | ✅ done |
| **queries** | ✅ `_docs/QUERIES_DEEP_REFERENCE.md` | 3,863 | ❌ | ✅ `scripts/verify-queries-ref.sh` (25 checks) | ⚠️ partial — needs cookbook + iter trail consolidation |
| **geocodes** | ✅ `_docs/GEOCODES_DEEP_REFERENCE.md` | 3,400 | ❌ | ✅ `scripts/verify-geocodes-ref.sh` (7+8 checks) | ⚠️ partial — needs cookbook + iter trail consolidation |
| **ecommerce + eshops + ecartApiOauth** | ❌ | — | — | — | ❌ — kickoff prompt ready |
| **admin-monorepo** | ❌ | — | — | — | ❌ — kickoff prompt ready |
| **accounts** | ❌ | — | — | — | ❌ — kickoff prompt ready (with sensitivity-special clause) |

## Suite-level deliverables already shipped (2026-04-26)

These cover the audited services horizontally; do not redo:

- ✅ `_docs/TRANSVERSAL_BACKEND_ANALYSIS.md` — top-5 systemic risks, 11 cross-cutting patterns, integration map, schema drift register, 10 ranked recommendations.
- ✅ `_docs/BACKEND_TEAM_BRIEF.md` — 38 open questions consolidated + ranked (7 CRITICAL, 12 HIGH, 14 MEDIUM, 5 LOW), with suggested 5-day plan to close all CRITICAL+HIGH.
- ✅ `_docs/AUDIT_SUITE_ROADMAP.md` — this doc.

## Remaining work — three new deep refs

### 1. ecommerce + eshops + ecartApiOauth (3-service bundle)

**Why bundled:** all three are tightly coupled to the ecommerce
checkout + multi-channel sync flow. Auditing them separately would
fragment the integration narrative.

**Prompt:** `.claude/prompts/ECOMMERCE_DEEP_AUDIT_PROMPT.md`.

**Pre-existing memory:** `discovery_ecommerce_backend.md` in memory
covers endpoints, DB schema, 12 critical answers. Read first.

**Estimated effort:** 3-4 hours of Opus 4.7 (1M).

**Output expected:**
- `_docs/ECOMMERCE_DEEP_REFERENCE.md` (~3,500-4,000 lines target).
- All quantitative claims cite path:line / csv:row.
- Section structure mirrors carriers §1-39 + cookbook §53.
- Scripts: `scripts/verify-ecommerce-ref.sh` (~25 checks).

**Best-of-world pass items already templated** (apply during the
audit, don't defer):
- Cookbook section with 8-10 scenarios specific to ecommerce flows
  (Shopify webhook reconciliation, MercadoLibre order sync, COD
  flow with checkout rules, etc.).
- Verification script in scripts/.
- Cross-references to TRANSVERSAL_BACKEND_ANALYSIS.md §3 patterns
  (auth, cache, third-party integrations).

**Cross-cutting findings to surface during the audit:**
- Webhook signing parity with queries §56 (HMAC-SHA256 hex).
- Country rule branching — does ecommerce have its own copy?
- Cross-DB access — does ecommerce read carriers/queries/geocodes
  schemas directly?
- Auth model — same 3 type_ids as carriers/queries, or different?

### 2. admin-monorepo

**Prompt:** `.claude/prompts/ADMIN_MONOREPO_DEEP_AUDIT_PROMPT.md`.

**Pre-existing memory:** none. Primary discovery work.

**Estimated effort:** 3-4 hours.

**Output expected:**
- `_docs/ADMIN_MONOREPO_DEEP_REFERENCE.md` (~3,000-3,500 lines).
- Cookbook §53.
- `scripts/verify-admin-monorepo-ref.sh`.

**Watch list — known concerns from `_meta/` analyses:**
- CORS permissive (`*`).
- Hardcoded CSRF.
- Score 17/30 in `_meta/STRATEGIC_RECOMMENDATIONS_v3.md`.

These should drive the security section + likely add CRITICAL items
to BACKEND_TEAM_BRIEF.md.

**Cross-cutting findings to look for:**
- Admin uses queries/carriers — what auth pattern?
- Multi-tenant pattern: admin spans companies.
- Audit trail for admin actions — exists?
- Privileged operations exposed via API — match the §6 LESSON L-S6
  rule (no admin tools in MCP).

### 3. accounts

**Prompt:** `.claude/prompts/ACCOUNTS_DEEP_AUDIT_PROMPT.md`.

**Pre-existing memory:** `project_auth_complete.md` in memory has
some context.

**Estimated effort:** 2-3 hours + sensitivity analysis section.

**Sensitivity-special clause** (per AUDIT_PROMPTS_INDEX.md): the
prompt includes a mandatory Sensitivity Analysis section with
recommendation to Jose. Accounts owns auth substrate — any
recommendation has security implications.

**Output expected:**
- `_docs/ACCOUNTS_DEEP_REFERENCE.md` (~2,500-3,000 lines).
- §X Sensitivity Analysis (security threat model).
- Cookbook §53.
- `scripts/verify-accounts-ref.sh`.

**Watch list:**
- 3 token systems documented in `discovery_auth_unified.md`.
- Cookie hardening (httpOnly, secure flags).
- 2FA / MFA status.
- Session management.
- LESSON L-S7: accounts may be in the same vertical or a different
  one — confirm ownership during audit.

**Cross-cutting findings to look for:**
- Token type_id=8 (1,625 sandbox rows; no documented handler — see
  BACKEND_TEAM_BRIEF.md C4). The accounts audit should resolve this.
- access_tokens table is consumed by carriers AND queries — accounts
  is the writer. Audit confirms the contract.

## After the 3 remaining audits land

These are the suite-level moves that need re-running:

1. **Re-validate `_docs/TRANSVERSAL_BACKEND_ANALYSIS.md`** with the
   3 new services included. Likely additions:
   - admin-monorepo CSRF + CORS as a new CRITICAL risk.
   - accounts cookie hardening + token type_id=8 as security
     concerns.
   - ecommerce webhook signing parity check.
2. **Re-validate `_docs/BACKEND_TEAM_BRIEF.md`** — append new open
   questions; re-rank.
3. **Update integration map (§4 of TRANSVERSAL doc)** with new
   edges from admin/accounts/ecommerce.
4. **Add carrier/queries/geocodes to verification script CI.** A
   `scripts/verify-all-refs.sh` wrapper running all per-service
   scripts in sequence with a unified summary.

## Best-of-world pattern checklist (for each future audit)

Apply this during the audit, not after — moves merged inline are
easier to maintain than retrofitted later.

- [ ] §1-N structural sections with verified path:line cites.
- [ ] §X self-assessment with honest coverage estimate.
- [ ] §X+1 cross-check pass (≥3 random claims verified per major
      section).
- [ ] §Y Common Scenarios cookbook (8-12 scenarios, anchored to
      master sections).
- [ ] `scripts/verify-<project>-ref.sh` with 20-40 checks.
- [ ] Doc preamble: "How to read this doc" block.
- [ ] All known errata applied inline (no §52-style errata trail).
- [ ] Backend-team brief items added to BACKEND_TEAM_BRIEF.md.
- [ ] Cross-cutting patterns surfaced for TRANSVERSAL doc.
- [ ] No known errors at commit time.

## Total estimated effort to complete the suite

- ecommerce: 4-5h (audit + best-of-world pass merged)
- admin-monorepo: 4-5h
- accounts: 3-4h
- Suite-level re-validation: 2-3h
- **Grand total: 13-17 hours** of Opus 4.7 (1M) sessions.

## Recommended session order

1. **Next session:** ecommerce — moderate risk, clear scope, lots of
   pre-existing memory to leverage.
2. **Then:** accounts — closes the critical token type_id=8 question
   (BACKEND_TEAM_BRIEF.md C4) and reinforces transversal auth model.
3. **Last:** admin-monorepo — broadest discovery work, expected to
   surface new CRITICAL items.
4. **Final:** suite-level re-validation pass updating TRANSVERSAL
   and BRIEF.

## Unblocking the suite

Some items in BACKEND_TEAM_BRIEF.md unblock the suite:

- **C4 (type_id=8 audit)** is best resolved during the accounts
  audit. Adding "verify type_id=8 consumers" to the prompt for that
  session.
- **C7 (cross-DB access registry)** is partially built into
  TRANSVERSAL_BACKEND_ANALYSIS.md §4. Final form (with all 6
  services) lands after the 3 remaining audits.

## Operating contract

- Each new audit produces 1 doc + 1 script + commits to TRANSVERSAL
  + BRIEF if cross-cutting findings surface.
- Each session starts by reading: LESSONS.md, TRANSVERSAL doc,
  BRIEF, this roadmap.
- Each session ends by updating this roadmap with progress.
- All commits stay local (LESSON L-G3) until Jose says "push".

## Honesty note

The suite at completion (~17h further work) will represent
~6 services × ~3,500 lines = ~21k lines of canonical reference,
plus ~150+ automated structural checks, plus a unified backend
team brief and transversal analysis. This is the "best of the
world" target.

Beyond that, the next quality gate is **runtime intelligence** —
production-data-driven facts (top carriers by volume, error rates
by service, slow-query analysis). That's a different mode (live
DB queries against the .env credentials Jose mentioned) and a
different artifact type (dashboard, not reference). Out of scope
for this roadmap; surface as a separate proposal when ready.
