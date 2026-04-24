# Decisions log — Planning session 2026-04-17

Session type: Planning (Opus 4.7, 1M ctx). No code written.
Decision-maker: Jose Vidrio (jose.vidrio@envia.com).
Brief: `_docs/NEXT_SESSION_PLANNING_BRIEF.md`.
Verifications: `_docs/VERIFICATIONS_2026_04_17.md`.

## Decision A — ecart-payment integration path

**Options considered**
1. Provision ecart-payment keys to MCP env.
2. Proxy via queries service (new `/mcp/payments/*` endpoints in queries).
3. Request ecart-payment team to expose endpoints accepting Envia portal JWT.
4. Defer indefinitely.

**Chosen:** Option 4 — **defer and document**.

**Reasoning (Jose):** Not worth pulling cross-team work or widening blast radius right now. Users can still check payment state in the portal UI; the conversational gap is tolerable in v1.

**Reinforced (2026-04-XX, audit scoping session):** Beyond the technical blocker, ecart-payment is owned by a different organizational vertical at Envia. The MCP must not wrap other-vertical endpoints directly; transitive reach via Envia-owned endpoints (carriers/queries) is the allowed path. This upgrades the defer from "nice-to-have-eventually" to a stronger boundary. Captured as LESSON L-S7. Revisiting requires either (a) ecart-payment transfers ownership or (b) an explicit cross-org agreement — not a solo technical decision.

**Follow-up actions**
- `SPRINT_2_BLOCKERS.md` already documents the blocker and the 3 resolution paths; keep as-is (no edits needed).
- 5 ecart-payment tools stay out of the registered-tool list.
- Revisit in v2 of the agent (post-launch) with real user demand data.

## Decision B — Sprint 3 scope

**Chosen:** 3 items, no user-facing new tools.

1. **Secondary-carrier error-map entries** (small / user-visible).
   - Add AmPm (codes 260, 102154), Entrega (track-limit), JTExpress (BR ICMS-missing hint), TresGuerras (`ESTADO_TALON=CANCELADO`), Afimex (insurance cap 10,000) patterns to `src/utils/error-mapper.ts`.
2. **Smoke-test playbook + first deploy to staging** (small / internal).
   - Write `_docs/SMOKE_TEST_PLAYBOOK.md`.
   - Provision `ENVIA_ECART_HOSTNAME` on the staging MCP environment (sandbox URL per `DEPLOY_CHECKLIST.md`: `https://ecart-api-test.ecartapi.com`).
   - Execute first staging deploy (Heroku or equivalent) and run the playbook end-to-end.
3. **`textResponse()` migration + ESLint guard** (small / internal).
   - Migrate the ~6 remaining tools to `textResponse()`.
   - Add `eslint.config.js` `no-restricted-syntax` rule blocking raw `{ content: [{ type: 'text', ... }] }`.

**Out of Sprint 3 (explicitly deferred):**
- ecart-payment tools (Decision A = defer).
- Typed-payloads refactor (L: no user-visible impact, no evidence of bug; LESSONS L-C2).
- Tool registry pattern (does not block deploy).
- Observability layer (Decision D).
- LTL tools + validateAddress carrier-constraints extension (power-user, not chat-friendly per V5).
- Any Shipping Rules / Buyer Experience / Returns / Drafts work (deferred v1).

**Reasoning:** With the suite green (V4: 1369/1369) the bottleneck is *real-world validation*, not more tools. Shipping over polishing. LESSONS L-B1 / L-B2 (verify against reality before assuming), L-P4 (resist scope creep).

## Decision C — First deploy timing & go/no-go

**Chosen:** First deploy happens **inside Sprint 3**, to **staging only**.

**Go criteria (all MUST hold):**
- `npm run build` → exit 0.
- `npx vitest run` → all green (target ≥ 1369).
- `_docs/SMOKE_TEST_PLAYBOOK.md` executed against staging and passes (quote → create label (sandbox) → track → cancel → check balance happy path; plus 1 error path via mapped carrier error).
- Required env vars provisioned (see `DEPLOY_CHECKLIST.md`): `ENVIA_API_KEY`, `ENVIA_ENVIRONMENT=sandbox`, `ENVIA_ECART_HOSTNAME`.

**Regression detection v1:** manual smoke re-run + native Heroku logs. No custom observability layer yet (Decision D).

**Post-deploy monitor:** Jose (first 48h). Surface anomalies by pasting log excerpts into a follow-up session.

**No-go fallback:** any failure in the above → roll back; do NOT promote to prod; open an issue doc before retry.

**Production deploy:** not in Sprint 3. Revisit after ≥ 1 week of staging stability + Sprint 3 retro.

## Decision D — Observability gap

**Chosen:** **Defer to Sprint 4** (post-staging-deploy).

**Reasoning:**
- v1 MCP is portal-embedded and inherits the portal's auth/logs infrastructure. Custom observability before first deploy is speculative work.
- Native Heroku logs + Sentry already available at the platform level are sufficient to triage "the agent said X" in v1.
- Post first real-world sessions we'll know what we actually need to instrument (which tool calls fail, which hot paths are slow) — design against evidence, not hypotheticals.

**Accepted v1 debug mode:** "tell me exactly what you typed" + retrieve Heroku logs by timestamp.

**Sprint 4 candidate scope (not binding):** pino + correlation IDs threaded through tool handlers; structured log emitter per tool call; basic metrics (call count / error count per tool).

## Decision E — v1 scope fence

**Chosen:** **Lock v1 at the current 72 registered tools.**

**Rules:**
- Sprint 3 adds **zero new user-facing tools** (only error-map / deploy / textResponse cleanup).
- Any new tool proposal must pass the "typical portal user would ask for this in chat" test (LESSONS L-S2) AND have real user demand signal (not a hypothetical).
- v2 of the agent (post-v1 launch) is the bucket for: ecart-payment tools, Shipping Rules conversational edits, Buyer Experience edits, Returns Portal integration, LTL, validateAddress carrier-constraints extension, anything else surfaced by v1 usage.

**Reasoning:** LESSON L-P4 (resist scope creep). We've accumulated 72 tools with 0 real usage; the next signal worth acting on is usage data, not more discovery.

---

## Summary

| Decision | Outcome |
|----------|---------|
| A | Defer ecart-payment integration |
| B | Sprint 3 = error-map + staging deploy + textResponse migration (3 items, 0 new tools) |
| C | Staging deploy inside Sprint 3; go criteria defined; prod deferred ≥ 1 week post-staging |
| D | Observability deferred to Sprint 4 |
| E | v1 scope fence locked at 72 tools |

All decisions captured ahead of `SPRINT_3_PROMPT.md` generation per planning-session protocol.
