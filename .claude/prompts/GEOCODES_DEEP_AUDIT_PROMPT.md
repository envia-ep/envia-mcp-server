# Geocodes Service — Deep Reference Audit Prompt

> **Self-contained prompt.** Executable by Opus 4.7 (1M context).
> Goal: produce `_docs/GEOCODES_DEEP_REFERENCE.md` at the same depth and
> structure as `_docs/CARRIERS_DEEP_REFERENCE.md` (gold standard).

## Step 0 — Read LESSONS.md (MANDATORY)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

End-to-end. Particularly relevant:
- **L-S5** Reuse existing infrastructure — geocodes IS the place country rules live.
- **L-S4** Verify numeric claims; multi-country rules are full of edge cases.
- **L-B1** Test against real responses; geocodes has NO sandbox so all calls hit prod.
- **L-T4** Cross-check explorer reports.
- **L-G1, L-G3** Clean tree, no push.

## Context — what geocodes is

`services/geocodes` is the **country/coverage/zone authority** of the Envia ecosystem. Smaller in route count than carriers or queries, but **dense in business rules** because it owns:

- Coverage tables per carrier per country.
- Postal code lookups + transformations.
- DANE codes (Colombia city resolution).
- Brazil ICMS interstate tax matrix.
- Tax / items / customs requirements logic (`/location-requirements`).
- Zone classifications (extended zones, ferry zones, India pincodes, Spain peninsular zones, Paquetexpress MX zones, Loggi BR zones, etc.).
- Bridge between carrier-specific zone systems.

Per memory `reference_country_address_rules.md` and the existing `_docs/COUNTRY_RULES_REFERENCE.md`:
- BR postal transforms (`12345678` → `12345-678`).
- AR postal transforms (`C1425` → `1425`).
- US ZIP+4 formatting.
- CO postal = DANE code (resolved via `/locate`).
- ES Canarias special handling.
- IT island detection.

**Critical operational note:** geocodes has NO sandbox environment. All calls hit `https://geocodes.envia.com` (production). This affects how the audit is conducted (no curl verification against test).

Per the carriers controller analysis (already done), geocodes is consumed by:
- `getAddressRequirements` → POST `/location-requirements`
- `resolveDaneCode` → GET `/locate/CO/{state?}/{city}`
- `getBrazilIcms` → GET `/brazil/icms/{origin}/{destination}`
- `envia_validate_address` → GET `/zipcode/{country}/{code}`

Plus likely 5-10 more endpoints not yet documented.

## Mandatory reading order

1. `_docs/LESSONS.md` (Step 0).
2. **`_docs/CARRIERS_DEEP_REFERENCE.md` entirely** — depth bar. Pay attention to §16.2 (Geocodes integration from carriers' perspective), §13 (Extended zones — heavy geocodes data), §10 (insurance regulatory CO/BR — geocodes-driven for some logic).
3. `_docs/COUNTRY_RULES_REFERENCE.md` — the existing distillation of country rules implemented in MCP.
4. `_docs/BACKEND_ROUTING_REFERENCE.md` — current MCP→geocodes integration.
5. **Memory: `reference_country_address_rules.md`** — country rules from a prior session.
6. **Memory: `reference_v1_backend_capabilities.md`** — known capabilities.
7. `services/geocodes/README.md` and `CLAUDE.md` if exist.
8. **Monorepo `_meta/analysis-geocodes.md`** if exists (in monorepo root, not MCP repo).
9. **`_docs/backend-reality-check/geocodes-findings.md`** in monorepo root if exists (Session A findings).
10. The MCP's geocodes consumers: `services/geocodes-helpers.ts` in `ai-agent/envia-mcp-server/src/services/`.
11. The CSV dumps that geocodes-related: `services/carriers/knowledge-base/queries/g*.csv` (g1=information_schema, g2=extended_zones, g3=zone_kinds, g4=sample, g5=ferry_zones, g6=row_counts, g7=delhivery_pincodes, g8=carrier_country_zones, g9=additional_tables, g11-g16=country-specific samples). These are critical: they sample geocodes' production tables.

## Goal

Produce `_docs/GEOCODES_DEEP_REFERENCE.md`. Target: ~92-95% structural coverage. **1,200-1,800 lines** (smaller than carriers/queries because geocodes is more focused). 25-35 sections. Same iteration discipline.

Fully transferable to any future Claude or human session.

## Mandatory sections

### Part 1 — Architecture
1. Architecture overview (Node version, framework, file count).
2. Routes & endpoints (full inventory).
3. Authentication (likely none for most — geocodes is mostly public per the carriers docs).
4. Caching strategy (Redis? in-memory? CDN?).
5. Production-only operation (no sandbox) — implications for testing and deploy.

### Part 2 — Endpoints by domain
6. Postal code lookup (`/zipcode/{country}/{code}`) — request/response, transformations applied.
7. City/locality lookup (`/locate/...`) — DANE resolution flow, multi-country variants.
8. Location requirements (`/location-requirements`) — the tax/items decision engine.
9. Brazil ICMS (`/brazil/icms/{origin}/{destination}`) — interstate tax matrix.
10. Coverage queries — per carrier, per zone type.
11. Distance / transit time queries.
12. Country-specific endpoints (Spain, India, Italy, etc.).
13. Internal admin/maintenance endpoints (likely admin-only, document but don't expose).

### Part 3 — Country rules deep
14. Postal code transformation rules per country (BR, AR, US, CO, ES, etc.).
15. ID document validation rules (CPF, CNPJ, NIT, DNI, NIE, NIF, RFC, CURP).
16. Tax logic (intra-EU, US↔PR, ES→Canarias, FR→Overseas, BR/IN domestic-as-international).
17. Phone normalization (FR especially).
18. Default declared values per country.
19. State / district / colonia handling per country.

### Part 4 — Coverage and zones
20. Extended zone tables — list per carrier (Paquetexpress 144k MX CPs, BRT 2,616 IT, SEUR 12,267 ES, Chronopost 200k+ international, India 6.6M Delhivery pairs, etc.).
21. Ferry zones (BRT IT 109 CPs, Spain islands).
22. Zone classification systems (5-tier España SEUR, India letter codes N1/W2, Loggi BR codes).
23. "NO PERMITIDO" rejection categories (CTT España 735 routes).
24. ODA / OOA semantic equivalents (India).
25. Cross-border tables (15_prod_crossborder_companies cross-reference).

### Part 5 — Database schema
26. Tables (from `g1_information_schema_geocodes.csv`).
27. Coverage table organization (one per carrier or shared with carrier_id key?).
28. Zone-related tables and their row counts (`g6_coverage_tables_row_counts.csv`).
29. Cross-database access (carriers reads geocodes via `DB::connection('geocodes')` — verify the exact mechanism and security implications).

### Part 6 — Inter-service architecture
30. Carriers → geocodes calls (already documented in carriers §16.2 — cross-reference).
31. Queries → geocodes calls (any?).
32. Direct DB connection vs HTTP API split.
33. The MCP's internal helpers consuming geocodes.

### Part 7 — MCP integration
34. Endpoints exposed by geocodes today and consumed by which MCP helpers.
35. Endpoints NOT consumed by MCP (gap analysis — what could be useful?).
36. Recommended new MCP helpers or tools (e.g. carrier-coverage lookup if backend supports it).

### Part 8 — Honesty
37. Open questions for backend team (concrete code/DB queries).
38. Self-assessment.

## Methodology — non-negotiable

### Phase 1: Pre-existing knowledge

1. Read every reference doc in the order above.
2. Build a "known endpoints" snapshot from carriers' §16.2 and the MCP's `geocodes-helpers.ts`.
3. Read all `g*.csv` files in `services/carriers/knowledge-base/queries/` — these contain real DB samples.

### Phase 2: Code map

1. `find services/geocodes -type f -name "*.js" | wc -l`
2. `ls services/geocodes/routes/` (if exists) or look for route definitions in `index.js` / `server.js`.
3. `ls services/geocodes/controllers/` or equivalent.
4. `ls services/geocodes/models/` or DB-related.
5. `ls services/geocodes/util/` or helpers.

### Phase 3: Parallel deep-reads

Dispatch agents (`thoroughness: very thorough`):

| Agent | Domain |
|-------|--------|
| 1 | Endpoints inventory (routes + handlers + auth) |
| 2 | Country rules engine — `/location-requirements` + tax logic + items rules |
| 3 | Coverage tables and zone classifications (cross-reference with `g*.csv`) |
| 4 | Postal codes + DANE + ICMS + state/district per country |
| 5 | DB schema and cross-database access (`g1_information_schema_geocodes.csv` content) |

### Phase 4: First synthesis (iter 1)

Build master doc skeleton from agents' output.

### Phase 5: Cross-check pass (iter 2 — MANDATORY)

Per LESSON L-T4:
- Verify 3 country rules per agent against `_docs/COUNTRY_RULES_REFERENCE.md` AND against carriers code (`country-rules.ts` in MCP `src/services/`).
- Verify 5 zone counts at random against the CSV samples.
- Verify the `services.international` enum interaction with geocodes (already known: 0/1/2/3, used in additional-services controller — does geocodes have similar enums?).

### Phase 6: Iteration 2 expansion

### Phase 7: Iteration 3 finalization

- Cross-check between geocodes' rules and the MCP's `country-rules.ts` (`src/services/country-rules.ts` in `ai-agent/envia-mcp-server/`). Identify duplications or drift.
- MCP gap analysis updated.
- Self-assessment with honest %.

### Phase 8: Commits — 3 incremental.

## Quality gates

- [ ] Every quantitative claim cites file:line OR csv:row.
- [ ] Country rules in carriers' MCP `country-rules.ts` cross-referenced against geocodes' authoritative implementation; document drift if any.
- [ ] No "approximately X" — extract exact values from CSVs.
- [ ] Final length 1,200-1,800 lines.
- [ ] 25-35 sections.
- [ ] Self-assessment closes the doc.

## What NOT to do

- **Do NOT skip the gold standard read.**
- **Do NOT accept first synthesis as final.** Iter 1 always surface.
- **Do NOT replicate country rules in MCP without verifying authority.** LESSON L-C2: graceful degradation > preventive validation. The MCP delegates rules to geocodes for a reason.
- **Do NOT hit production geocodes with destructive curl experiments.** Read-only is acceptable; mutations are not.
- **Do NOT push to remote** (L-G3).

## Specific honesty traps

1. **Tax logic looks simple but is genuinely complex.** Same-country = taxes apply, EXCEPT US↔PR / ES→Canarias / FR→Overseas / intra-EU. Don't simplify; read the controller.
2. **DANE codes vs city names.** CO postal_code field actually holds DANE codes. Frontend / MCP transforms. Verify which side of the boundary geocodes operates on.
3. **Brazil ICMS table size.** Probably state×state = 27×27 = 729 entries plus zero-tax cases. Verify.
4. **Delhivery 6.6M pincode pairs.** That's massive — verify if geocodes really stores all that or if it's per-route-on-demand.
5. **Spain "NO PERMITIDO" 735 routes.** These are *rejections* not *zones* — confirm the response shape.

## Deliverable

`_docs/GEOCODES_DEEP_REFERENCE.md` — 1,200-1,800 lines, 25-35 sections, 3 iterations.

## Handoff at end

1. Final line count and section count.
2. Top 5 surprising findings (geocodes is country-rule-rich; expect surprises).
3. Cross-check corrections summary.
4. Updated ⚪ pending list.
5. Drift report between geocodes' rules and the MCP's `country-rules.ts`.
6. New MCP tool/helper recommendations.
7. Open questions for backend.
8. Recommendation for next session.

## Out of scope for this session

- Carriers (already done).
- Queries (separate prompt).
- Ecommerce / eshops / ecartApiOauth (separate prompt).
- Implementing new MCP helpers.
- Code changes.
- Push to remote.

Good luck. Geocodes is small but dense — depth matters more than breadth.
