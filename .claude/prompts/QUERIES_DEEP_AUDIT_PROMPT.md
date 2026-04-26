# Queries Service — Deep Reference Audit Prompt

> **Self-contained prompt.** Executable by Opus 4.7 (1M context).
> Goal: produce `_docs/QUERIES_DEEP_REFERENCE.md` at the same depth and
> structure as `_docs/CARRIERS_DEEP_REFERENCE.md` (gold standard).

## Step 0 — Read LESSONS.md (MANDATORY, no exceptions)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

End-to-end. Particularly relevant for queries:
- **L-S1, L-S2, L-S4, L-S6, L-S7** scope discipline.
- **L-B1, L-B2, L-B3, L-B4** — verify against real responses, auth gates, source-of-truth docs.
- **L-T4** cross-check explorer reports.
- **L-P1, L-P4** surface decisions, resist scope creep.
- **L-G1, L-G3** clean tree, no push.

## Context — what queries is

`services/queries` is the **Node/Hapi hub** of the Envia ecosystem. It is the second-most-consumed service by the MCP (after carriers) — currently provides ~50 of the 72 user-facing tools.

Per memory `reference_queries_architecture.md` and the broader monorepo `CLAUDE.md`:
- Notifications hub (email, WhatsApp, Slack, sockets) — proxy to several external providers.
- Orders v1-v4 (ecommerce orders normalized).
- Shipments (read-side; carriers owns write/track).
- Tickets (CSAT, support).
- Branches (carrier sucursales).
- Fulfillment sync (`tmp-fulfillment` proxy).
- AI shipping endpoints (parse-address, rate).
- Per-company configs.
- Generic-form (country-specific address rules).
- Additional-services catalog (already deep-analyzed in `_docs/ADDITIONAL_SERVICES_CATALOG_VERIFIED.md`).
- Cross-service auth (it owns ecart-payment proxy keys per LESSON L-S5).

Estimated complexity: **larger** than carriers in route count (65+ public, plus ~40 internal/integration). Smaller in business-rule depth (carriers has 168 carriers × services × insurances × surcharges; queries is more CRUD + integration glue).

## Mandatory reading order

1. `_docs/LESSONS.md` (Step 0).
2. **`_docs/CARRIERS_DEEP_REFERENCE.md` entirely.** This is the depth/structure bar. Note: 40 sections, 2,142 lines, 3 iterations. Future iter sections in §41-51 are out of scope here but their structure should inspire.
3. `services/queries/README.md` and `services/queries/CLAUDE.md` (if exists).
4. **Memory: `reference_queries_architecture.md`** — already curated for this service.
5. **Memory: `reference_v1_backend_capabilities.md`** — inventory of known capabilities.
6. `_meta/analysis-queries-*.md` (in monorepo root `_docs/backend-reality-check/`) if present.
7. `_docs/backend-reality-check/queries-inventory-findings.md` (in MCP repo) — Session A findings.
8. `_docs/ADDITIONAL_SERVICES_CATALOG_VERIFIED.md` — already done; reuse, don't redo.
9. `_docs/BACKEND_ROUTING_REFERENCE.md` — current MCP→backend routing.
10. `_docs/COUNTRY_RULES_REFERENCE.md` — relevant for `/generic-form` and country logic.
11. Memory `reference_*_api.md` files — specific API contract notes (clients, addresses, packages, ndr, ordenes, shipments, tickets, branches, analytics, queries, configuracion).

## Goal

Produce `_docs/QUERIES_DEEP_REFERENCE.md`. Target: ~92-95% structural coverage, **2,000-2,800 lines**, 35-50 sections. Same iteration discipline as carriers (write iter 1, cross-check, iter 2 expansion, iter 3 closure).

Fully transferable to any future Claude or human session.

## Mandatory sections (extend as you discover)

### Part 1 — Architecture
1. Architecture overview (Hapi version, Node version, plugins, file count).
2. Routes & endpoints (full inventory with method + path + auth + handler reference).
3. Authentication & middleware (JWT validation, token types, ecart-payment key handling).
4. Plugins, lifecycle, error handling.

### Part 2 — Domain modules
5. Notifications hub: email, WhatsApp, Slack, web sockets (each as a sub-section).
6. Orders v1-v4 (the 4 versions, their differences, the 11 V4 fields the MCP currently misses per V1_SAFE_TOOL_INVENTORY).
7. Shipments read endpoints (list, detail, status, COD, NDR, surcharges, history).
8. Tickets / CSAT / support (creation, comments, rating, types).
9. Branches.
10. Fulfillment sync (`/tmp-fulfillment/{shop_id}/{order_id}` — the exact endpoint MCP uses).
11. AI shipping endpoints (parse-address, rate).
12. Generic-form (country rules engine — verify §3 of COUNTRY_RULES_REFERENCE).
13. Additional-services catalog (cross-reference with the already-done deep-dive).
14. Per-company configs (config_*, custom_keys).
15. Clients / addresses / packages CRUD.

### Part 3 — Inter-service architecture
16. Ecart-payment proxy (queries owns the keys — already noted in LESSON L-S5).
17. Carriers calls FROM queries (rate, generate, track triggers).
18. Geocodes calls.
19. TMS calls (refunds, COD, balance).
20. Sockets push.
21. Background workers / queues / cron (if any).

### Part 4 — Authentication & multi-tenancy
22. JWT issuance and validation.
23. Token types (1, 2, 7 from carriers' Guard analysis).
24. Multi-company switching.
25. Permissions / roles per endpoint.
26. Rate limiting if any.

### Part 5 — Database
27. DB schema critical observations (table per domain).
28. Models / ORM patterns.
29. Migrations approach.
30. Cross-database queries (queries → carriers DB, queries → geocodes DB).

### Part 6 — Operational
31. Logging / monitoring.
32. Health checks / readiness.
33. Deployment notes (Heroku?).
34. Known performance bottlenecks.

### Part 7 — MCP integration
35. Endpoints exposed by queries today and consumed by which MCP tools.
36. Endpoints exposed by queries NOT consumed by MCP (gap analysis).
37. Endpoints consumed by MCP that have known issues (sandbox bugs, missing fields, etc.).
38. Recommended new MCP tools.

### Part 8 — Honesty
39. Open questions for backend team (concrete BD/code queries).
40. Self-assessment (% structural coverage, ⚪ pending list).

## Methodology — non-negotiable

### Phase 1: Pre-existing knowledge
1. Read all reference docs in the order above. Extract every memory `reference_*_api.md` claim and verify each is still applicable.
2. Build an initial "what we know" snapshot.

### Phase 2: Code map
1. `find services/queries -type f -name "*.js" | wc -l` → file count.
2. `ls services/queries/routes/` → route file inventory.
3. `ls services/queries/controllers/` → controller inventory.
4. `ls services/queries/util/` → util inventory.
5. `ls services/queries/middlewares/` → middleware inventory.
6. `ls services/queries/processors/` → background processors if any.
7. `ls services/queries/schemas/` → Joi/Zod schemas.

### Phase 3: Parallel deep-reads via Explore agents

Dispatch agents (`thoroughness: very thorough`) for these independent domains. Send them as a SINGLE message with multiple Agent calls (parallel):

| Agent | Domain | Input |
|-------|--------|-------|
| 1 | Notifications hub | `routes/notification.routes.js` + handlers + `util/notification*.js` + `util/whatsapp.utils.js` + `util/email*.js` |
| 2 | Orders v1-v4 | `routes/order.routes.js` + `controllers/order.controller.js` + `util/orderUtil.js` |
| 3 | Shipments + Tickets | `routes/shipment.routes.js`, `routes/ticket.routes.js`, controllers + utils |
| 4 | Catalog + Branches + Generic-form | `routes/catalog.routes.js`, `routes/branch.routes.js`, `routes/service.routes.js` |
| 5 | Inter-service (TMS, ecart-pay, sockets, carriers calls FROM queries) | `util/util.js`, `util/event.utils.js`, `util/ecartPay.util.js`, `util/chargebacks.util.js` |
| 6 | Auth + multi-tenancy | `middlewares/auth.middleware.js`, JWT issuance code, token validation |
| 7 | DB schema | `models/`, migrations, cross-database connections |

Each agent must:
- Output a markdown section in the structure of carriers' equivalent.
- Cite file:line for every claim.
- Mark ⚪ items pending if any aspect required code they couldn't fully read.

### Phase 4: First synthesis (iter 1)

Combine the 7 agent outputs into the master doc.

### Phase 5: Cross-check pass (iter 2 — MANDATORY, do NOT skip)

Per LESSON L-T4, the synthesizer must spot-check explorer agent claims:
- Pick 3 quantitative claims per section at random.
- Verify each against source code or DB CSV.
- Document any corrections in iter-2 section of doc.

The carriers doc found 4 new gaps + 5 surcharge leaks during cross-check. Expect similar density here.

### Phase 6: Iteration 2 expansion

Add anything cross-check found.

### Phase 7: Iteration 3 finalization

- DB schema deep cross-check (cross-database queries).
- MCP gap analysis updated.
- Self-assessment with honest %.

### Phase 8: Commit cadence

After phases 4, 6, and 7 — three commits showing iteration evolution. Same pattern as carriers (`v1`, `v2`, `v3`).

## Quality gates

- [ ] Every quantitative claim cites file:line.
- [ ] Every section has explicit ⚪ for pending items.
- [ ] Cross-check pass produced at least 1 correction (if 0, suspicion — verify the cross-check actually happened).
- [ ] Final length 2,000-2,800 lines.
- [ ] 35-50 sections.
- [ ] Self-assessment closes the doc.
- [ ] No code changes; pure docs.

## What NOT to do

- **Do NOT skip the gold standard read.** The carriers doc IS the depth bar.
- **Do NOT accept first synthesis as final.** Iter 1 is reliably surface-level. Iter 2 finds gaps. Iter 3 is the polish.
- **Do NOT redo work that's already in `_docs/ADDITIONAL_SERVICES_CATALOG_VERIFIED.md`.** Cross-reference it.
- **Do NOT include ecart-payment endpoints as new tools** (LESSON L-S7, separate vertical). Document the proxy mechanism, not the endpoints themselves.
- **Do NOT speculate.** "Likely X" without source citation = bad. Cite or mark ⚪.
- **Do NOT push to remote** (L-G3).

## Specific honesty traps to avoid

The carriers iter-1 doc made several mistakes. Inherit those lessons:

1. **`tooltip_amount` was misinterpreted as per-product.** It was per-user (locale-based). For queries: don't infer field semantics without reading the SQL or controller.
2. **`high_value_protection` was flagged as bug.** It was correct (international=2 bidirectional). For queries: when something looks like a bug, verify against business rules first.
3. **services.international was claimed as 3-valued.** It's 4-valued (third-party). For queries: enums and flag fields often have more values than first inspection suggests.

## Deliverable

`_docs/QUERIES_DEEP_REFERENCE.md` — 2,000-2,800 lines, 35-50 sections, 3 iterations evident in commit history. Fully self-contained reference suitable as starting point for any future MCP-related session involving the queries backend.

## Handoff at end

1. Final line count and section count.
2. Top 5 surprising findings.
3. Cross-check corrections summary.
4. Updated ⚪ pending list.
5. New MCP tool recommendations identified.
6. Open questions for the backend team (concrete code/SQL queries — same pattern as carriers' §18).
7. Recommendation for next session.

## Out of scope for this session

- ecart-payment direct integration (LESSON L-S7).
- Carriers backend (already done).
- Geocodes (separate prompt).
- Code changes.
- Pushing to remote.
- Implementing new MCP tools.

Good luck. Hold the bar — "ser los mejores del mundo" requires this doc to be transferable, citation-rich, and honest about gaps.
