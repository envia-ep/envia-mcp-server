# Admin Monorepo — Deep Reference Audit Prompt

> **Self-contained prompt.** Executable by Opus 4.7 (1M context).
> Goal: produce `_docs/ADMIN_MONOREPO_DEEP_REFERENCE.md`. This is
> primary discovery — no prior reference doc exists.

## Step 0 — Read LESSONS.md (MANDATORY)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

End-to-end. Particularly relevant for admin-monorepo:
- **L-S2** Portal-embedded scope criterion — most admin tooling fails this test.
- **L-S6** **Don't expose admin/dev tools to the LLM. Most of admin-monorepo will land here.**
- **L-P1** Surface decisions explicitly — every endpoint discovered is a "include or defer" decision.
- **L-P4** Resist scope creep. Admin endpoints look interesting but rarely qualify.
- **L-B1, L-B4** Verify against real responses; start from `_meta/` if exists.
- **L-T4** Cross-check explorer reports.
- **L-G1, L-G3** Clean tree, no push.

## Context — what admin-monorepo is

`admon-monorepo` is the **operations team's backend** for the Envia ecosystem. It manages:

- Charges, refunds, chargebacks (financial reconciliation).
- KYC / KYB (Know Your Customer / Business — onboarding validation).
- User and company management (creation, suspension, escalation).
- Carrier configuration (adding new carriers, managing private carriers, custom keys provisioning).
- Plan management (pricing tiers, special agreements, overrides).
- Support escalation (tickets, incidents, claims).
- Analytics and reporting for ops team.
- Operations workflows (audit, reconciliation, batch jobs).

**Critical scope assertion:** per memory `project_mcp_expansion_plan.md` and the analysis at planning sessions, **admin-monorepo is largely NOT user-facing**. Most endpoints will be classified ⚫ ADMIN-ONLY per LESSON L-S6.

**The audit's primary value** is:
1. Establishing the boundary: what is admin (out) vs what could be customer-facing (in).
2. Identifying any endpoints that were placed in admin-monorepo but should logically be customer-facing.
3. Documenting the operational workflows for future reference.

## Mandatory reading order

1. `_docs/LESSONS.md` (Step 0).
2. **`_docs/CARRIERS_DEEP_REFERENCE.md` entirely** — depth bar.
3. The monorepo-level `CLAUDE.md` (root of `envia-repos/`) — admin-monorepo is mentioned there.
4. `admon-monorepo/README.md` and `CLAUDE.md` if they exist.
5. **No memory reference exists** for admin-monorepo. Primary discovery from source.
6. `_meta/analysis-admon-monorepo.md` if it exists in monorepo root or sub-paths (likely doesn't, but confirm).
7. `_docs/backend-reality-check/` in monorepo root — Session A may not have covered admon-monorepo, but check.

## Goal

Produce `_docs/ADMIN_MONOREPO_DEEP_REFERENCE.md`. Target: ~92-95% structural coverage. **1,800-2,500 lines** because primary discovery requires more documentation. 30-45 sections.

The doc must give any future session a clear map of: (a) what admin-monorepo does, (b) what's in/out for the customer agent per L-S2, (c) which endpoints are critical to operational workflows.

## Mandatory sections

### Part 1 — Bundle architecture
1. What admin-monorepo is (org-level scope assertion).
2. Tech stack, file count, framework.
3. How it differs from carriers / queries (admin vs operational).
4. Routes & endpoints inventory.
5. Authentication (likely admin-role-gated).

### Part 2 — Domain modules
6. Charges and reconciliation.
7. Refunds (admin-initiated, distinct from `Cancel` flow in carriers).
8. Chargebacks (admin manual vs auto from track flow).
9. KYC / KYB workflows.
10. User / company management.
11. Carrier configuration (add carrier, edit, suspend).
12. Custom keys provisioning (the OPS side of LESSON L-S5).
13. Plan management.
14. Support escalation interface.
15. Analytics for ops.
16. Audit logs / activity trails.

### Part 3 — Operational workflows
17. New customer onboarding flow.
18. Carrier onboarding flow.
19. Custom key provisioning flow.
20. Refund approval flow.
21. KYC approval flow.
22. Account suspension / closure flow (T&C §3.10 from carriers reclamos doc).
23. Incident response procedures.

### Part 4 — Database
24. Tables specific to admin-monorepo.
25. Tables shared with other services (carriers, queries, geocodes — cross-database queries if any).

### Part 5 — Inter-service architecture
26. admon-monorepo → carriers (carrier config writes).
27. admon-monorepo → queries (orders, shipments, tickets).
28. admon-monorepo → ecart-payment (refund instructions — but LESSON L-S7 says ecart-payment is separate vertical; document the boundary).
29. admon-monorepo → accounts (user provisioning).

### Part 6 — Multi-tenancy and authorization
30. Admin role hierarchy.
31. Permission model.
32. Multi-vertical access controls (ops users may have different scopes).

### Part 7 — MCP integration analysis (mostly negative)
33. **Default classification: ⚫ ADMIN-ONLY** for the majority. This section justifies why.
34. Possible exceptions: endpoints that operate on the customer's own account (e.g. "show me my company KYC status") — apply L-S2 strictly.
35. Endpoints the customer agent should NEVER expose (e.g. "create a new admin user", "edit any company's plan").
36. Boundary cases that need product decision.

### Part 8 — Honesty
37. Open questions for backend / ops team.
38. Sensitivity analysis (cross-tenant access risks if any endpoint were exposed wrong).
39. Self-assessment.

## Methodology — non-negotiable

### Phase 1: Pre-existing knowledge

Almost none. Document this as a discovery audit, not a curation audit.

### Phase 2: Code map — primary discovery

Since this is primary discovery, allocate more time:

```bash
cd admon-monorepo
find . -type f -name "*.js" -o -name "*.ts" | wc -l    # file count
ls                                                       # top-level structure
ls services/ 2>/dev/null                                # if monorepo
ls apps/ 2>/dev/null                                    # if monorepo
ls packages/ 2>/dev/null                                # if monorepo
```

This may be a true monorepo with multiple sub-packages. Map it before deep-reads.

### Phase 3: Parallel deep-reads

Dispatch 5-7 Explore agents (`thoroughness: very thorough`):

| Agent | Domain |
|-------|--------|
| 1 | Architecture + monorepo structure + framework |
| 2 | Charges + refunds + chargebacks |
| 3 | KYC + KYB + user/company management |
| 4 | Carrier config + custom keys provisioning + plan management |
| 5 | Inter-service writes (which other DBs admon writes to) |
| 6 | Authentication and admin role model |
| 7 (optional) | UI / frontend integration if admon-monorepo includes one |

Each agent must:
- Cite file:line.
- For each endpoint, propose a classification: ⚫ ADMIN-ONLY (default), 🔵 EXISTS-HIDDEN (admin only but conceptually customer-facing), or 🟢 V1-SAFE (rare exception).
- Identify cross-tenant risks (endpoints that accept any company_id and don't validate authorization).

### Phase 4: First synthesis (iter 1)

### Phase 5: Cross-check pass (iter 2 — MANDATORY)

Per LESSON L-T4 + L-S6:
- Verify any endpoint claimed as "could be customer-facing" — apply L-S2 test rigorously.
- Spot-check 5 random endpoints' authorization to ensure cross-tenant safety.
- Verify financial endpoints (refunds, chargebacks) have admin-role gates.

### Phase 6: Iteration 2 expansion

### Phase 7: Iteration 3 finalization

- Final classification: how many ⚫ vs 🔵 vs 🟢.
- Sensitivity analysis aggregate.
- Self-assessment.

### Phase 8: 3 incremental commits.

## Quality gates

- [ ] Every endpoint has a classification (⚫ / 🔵 / 🟢) with reasoning.
- [ ] Cross-tenant safety verified for at least 10% of endpoints (random sample).
- [ ] Financial endpoints' authorization verified.
- [ ] Honest count of "customer-facing candidate" endpoints (likely 0-5; if more, suspicious — verify).
- [ ] Final length 1,800-2,500 lines.
- [ ] Self-assessment closes.

## What NOT to do

- **Do NOT propose admin endpoints for the agent.** L-S6 is non-negotiable. The default is ⚫.
- **Do NOT confuse "interesting" with "user-facing".** "Generate a refund" is interesting but admin-only.
- **Do NOT skip cross-tenant safety verification.** Admin endpoints are most likely to have authorization holes.
- **Do NOT speculate on workflows.** If you can't trace the flow in code, mark ⚪ and note what's missing.
- **Do NOT push to remote.**

## Specific honesty traps

1. **"This endpoint operates on the user's own data, so it's customer-facing"** — verify. Many "user data" endpoints in admon-monorepo actually allow specifying any user_id, not just self. They're admin endpoints by virtue of authorization, not data scope.
2. **"KYC is customer-facing because users go through it"** — KYC INPUT is customer-facing (UI), but KYC APPROVAL is admin. Distinguish.
3. **"Refunds are user-relevant"** — yes, but the refund TRIGGER is admin (manual approval) or auto (track flow in carriers). admon-monorepo's refund endpoints are likely admin-only.
4. **"Audit logs would be useful for the agent"** — exposing audit logs is itself a security concern (tampering, info leakage). Default ⚫.
5. **"Plan management could let users see their plan"** — yes, but READING plan info is in queries (`get_billing_info`, etc.) or accounts. admon-monorepo's plan endpoints are for ops to MUTATE plans.

## Deliverable

`_docs/ADMIN_MONOREPO_DEEP_REFERENCE.md` — 1,800-2,500 lines, 30-45 sections, 3 iterations.

## Handoff at end

1. Final line count and section count.
2. Total endpoint count.
3. Classification breakdown: # ⚫ / # 🔵 / # 🟢.
4. Cross-tenant safety findings (any endpoints with authorization concerns).
5. Top 5 surprising findings (esp. unexpected customer-facing candidates if any).
6. Operational workflows documented count.
7. Open questions for ops team.
8. Recommendation for next session.

## Out of scope for this session

- Carriers / queries / geocodes / ecommerce / accounts (separate prompts).
- ecart-payment (LESSON L-S7).
- Implementing new MCP tools (L-S6 makes this moot for most of admon).
- Code changes.
- Push to remote.

Good luck. The boundary work matters most here — every "out of scope" decision is itself documentation value.
