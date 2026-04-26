# Carriers Deep Reference — Continuation Prompt

> **Self-contained prompt.** Executable by Opus 4.7 (1M context).
> Continues `_docs/CARRIERS_DEEP_REFERENCE.md` from v3 (commit `042f91b`,
> ~92-95% coverage) to ~98-100%.

## Step 0 — Read LESSONS.md (MANDATORY, no exceptions)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

Read end-to-end. Particularly relevant for this session:
- **L-S1** V1 production source of truth.
- **L-S4** Verify numeric claims; explorer agents misinterpret dense PHP.
- **L-S6** Don't expose admin/dev tools to the LLM.
- **L-T4** Cross-check explorer reports.
- **L-G1** Clean tree first.
- **L-G3** Never push without explicit instruction.
- **L-P4** Resist scope creep.

## Context

`_docs/CARRIERS_DEEP_REFERENCE.md` covers the carriers service at ~92-95% structural completeness across 40 sections / 2,142 lines. Three iterations were committed (`3123146`, `41422a3`, `042f91b`). The remaining ~5-8% is enumerated explicitly in §40 of that doc and is the scope of this session.

This is **not** a redo. This is **completion**. The existing doc structure stays; new content extends it.

## Mandatory reading order

1. **`_docs/LESSONS.md`** — Step 0.
2. **`_docs/CARRIERS_DEEP_REFERENCE.md`** entirely. Pay attention to §30 (iter-2 self-assessment) and §40 (iter-3 final self-assessment with explicit ⚪ pending list).
3. **`services/carriers/CLAUDE.md`** — repo conventions.
4. **`services/carriers/knowledge-base/carrier-services/MASTER-REFERENCE.md`** — carriers team's curated overview.
5. **`services/carriers/knowledge-base/carrier-services/INDEX.md`** — full carrier index by country.
6. **`services/carriers/ai-specs/specs/backend-standards.mdc`** — architecture standards (already cited in the existing doc but reread for refresh).
7. **`services/carriers/ai-specs/specs/carrier-integration.mdc`** — new carrier integration guide.

## Scope — what this session must complete

### Block A: Six secondary-carrier deep-dives (priority order)

For each carrier below, read the corresponding `services/carriers/knowledge-base/carrier-services/carriers-v2/<carrier>.md` and integrate findings into a NEW section of the master doc. Use the same depth and structure as the FedEx/UPS/DHL coverage in §36-38.

| # | Carrier | File | Why this carrier matters |
|---|---------|------|--------------------------|
| 1 | **Paquetexpress** (MX) | `paquetexpress.md` | ~144,000 extended-zone CPs (largest in MX), unique 15-package same-day pickup. |
| 2 | **Estafeta** (MX) | `estafeta.md` | OXXO branch convenios; Ground ≤5kg overweight exemption. |
| 3 | **Coordinadora** (CO) | `coordinadora.md` | COD enabled for Ground + Ecommerce; primary CO carrier. |
| 4 | **Correios** (BR) | `correios.md` | Government carrier; only carrier with custom `rateOverWeight` recalculation logic. |
| 5 | **Delhivery** (IN) | `delhivery.md` | Auto-injects multiple charges (`owner_risk`, `green_tax`, `oda`, `state_charge`, `extended_zone`, `reverse_pickup`) — not in DB. |
| 6 | **BlueDart** (IN) | `bluedart.md` | Auto-injects similar set; has zone_type semantic (ROI / Metro / NE-J&K). |

For each, add a section §41-46 with:
- 1.1 Identity (countries, services count, MPS support, peso máximo, pickup windows).
- 1.2 Services per country (full enumeration).
- 1.3 Insurance specifics (interaction with Envia Seguro / regulatory `insurance` for CO/BR).
- 1.4 COD specifics if applicable.
- 1.5 Extended zone specifics (mechanism + numeric counts).
- 1.6 Operational charges (each with formula, threshold, country).
- 1.7 Volumetric factor (verified; CarrierUtil cross-reference).
- 1.8 Code-injected services list (for Delhivery/BlueDart specifically).
- 1.9 Hard limits.
- 1.10 Distinctive characteristics (the "what's unique here" line).

### Block B: CarrierUtil.php god class — section method

Source: `services/carriers/app/ep/util/CarrierUtil.php` (7,734 lines).

Approach: do NOT read line-by-line. Use grep to extract:

```bash
cd services/carriers
grep -n "^    public static function\|^    private static function\|^    public function\|^    protected static function" app/ep/util/CarrierUtil.php
```

This gives the full method roster with line numbers. Then categorize methods by responsibility (auth resolution, address validation, coverage, weight/volume, shipment persistence, status updates, custom keys, charge/refund, error handling, etc.).

Add as §47 "CarrierUtil method inventory" with:
- A table of all methods grouped by responsibility area.
- For top-15 most-called methods (use grep across `app/` to count callers), add a 1-paragraph summary.
- Identify methods that are likely safe to refactor vs methods that have many callers (refactoring risk).
- Note any duplicated logic (e.g. v1 vs v2 patterns).

### Block C: AbstractCarrier parent class

Source: `services/carriers/app/ep/carriers/AbstractCarrier.php`.

Read fully (likely <500 lines). Add as §48 "AbstractCarrier parent" with:
- Default method implementations.
- Abstract methods every carrier must implement.
- Properties exposed to subclasses.
- Patterns enforced.

### Block D: Eloquent Models inventory (128+)

Source: `services/carriers/app/Models/`.

Strategy:
```bash
ls services/carriers/app/Models/ > /tmp/models.txt
```

For each model, do NOT read fully. Instead:
```bash
grep -l "table = " services/carriers/app/Models/*.php  # finds explicit table name
grep -h "protected \$fillable" services/carriers/app/Models/<Model>.php  # to identify columns
```

Build §49 "Models inventory" with:
- Total count.
- Categorized list (Shipment-related, Carrier config, User-related, Tracking, Pricing, Address, etc.).
- Top-30 most-used models (cross-reference against carrier files via grep).
- Ones flagged as deprecated or rarely used.

### Block E: JSON schemas

Source: `services/carriers/app/ep/schemas/`.

```bash
ls services/carriers/app/ep/schemas/
```

For each `.v1.schema` file, extract the input contract. Add as §50 "Action input schemas":
- Table: action → schema file → required fields → optional fields → validation patterns.
- Examples: `rate.v1.schema`, `generate.v1.schema`, `cancel.v1.schema`, `pickup.v1.schema`, `track.v1.schema`, `branches.v1.schema`, `manifest.v1.schema`, `billoflading.v1.schema`, `ndreport.v1.schema`, `generate.ltl.v1.schema`, `generate.ftl.v1.schema`, etc.
- This is essential for the MCP because every tool's input must match these schemas.

### Block F: CSV detailed analysis (DB ground truth)

Source: `services/carriers/knowledge-base/queries/*.csv`.

Already inventoried in §15.4. Now go deeper. For each high-value CSV, read 50-100 sample rows + describe what's there:

| CSV | Rows to extract | Why |
|-----|----------------|-----|
| `1_prod_carriers.csv` (168 rows) | All — small enough | Carrier inventory with pickup/track configs |
| `2_prod_services.csv` (473 rows) | All international=2 + all international=3 | Validate bidirectional + third-party scopes |
| `3_prod_additional_service_prices.csv` | All `mandatory=TRUE` rows | Identifies regulatory mandatory services |
| `7_prod_catalog_additional_services.csv` | Full | Master catalog reference |
| `8_prod_catalog_price_operations.csv` | Full | Documents the 12 operation types beyond what's already in §20 |
| `12_prod_locales.csv` | All entries with `locale_operation` flag | Identifies operational vs blocked locales |
| `14_prod_catalog_volumetrict_factor.csv` | Full | Definitive volumetric factor by carrier (closes ambiguity in §23.2) |
| `9_prod_carrier_surcharge_codes.csv` | Full | WS surcharge → addon mapping (referenced in §22 code-injected) |

Add as §51 "DB ground truth — verified sample contents" with the actual values.

## Methodology — exact steps

### Phase 1: Setup (10 min)
1. Read Step 0 (LESSONS.md).
2. Read CARRIERS_DEEP_REFERENCE.md fully.
3. `git status` clean check.
4. Confirm baseline: `cat _docs/CARRIERS_DEEP_REFERENCE.md | wc -l` should be ~2142.

### Phase 2: Parallel reads (60 min)
- Dispatch 6 Explore subagents (`thoroughness: very thorough`), one per Block A carrier. Each agent receives:
  - The carrier's deep-dive doc path.
  - Output template matching §36-38 structure.
  - Instruction to extract all unique business rules and not paraphrase from the doc.
- While they run: you (Opus) personally execute Blocks B (CarrierUtil grep), C (AbstractCarrier read), D (Models grep), E (Schemas).
- Block F (CSVs): dispatch 1 more Explore agent dedicated to extracting verified samples.

### Phase 3: Synthesis (40 min)
- Integrate Block A outputs into §41-46 of the master doc.
- Write §47-50 from your own deep-reads.
- Integrate Block F into §51.
- Update the §40 self-assessment to reflect new coverage (~98-100%).

### Phase 4: Cross-check pass (20 min)
- Pick 3-5 quantitative claims at random from each new section. Verify against source.
- Cross-check claim "Delhivery auto-injects 6 services" by reading `services/carriers/app/ep/carriers/Delhivery.php` and `DelhiveryUtil.php` directly. Confirm or adjust the list.
- Cross-check 8 random catalog rows from CSVs against the rules section to detect contradictions.

### Phase 5: Final self-assessment (10 min)
- Update §40 to reflect what's now covered.
- Move ⚪ items that were covered to the "covered" list.
- Add any new ⚪ items discovered during deep-reads (likely 2-3).
- Honest closing: "this doc is now ~98-100%, suitable as canonical reference."

### Phase 6: Commit (per phase, not at end)

Incremental commits:
- After Phase 2: commit Block A subagent results as v4-checkpoint-A.
- After Phase 3: commit Blocks B-F as v4-checkpoint-B.
- After Phase 5: final commit v4 with self-assessment update.

Use commit messages following LESSON L-G2: summary + ## Implemented + ## Quality + ## Coverage delta.

## Quality gates — non-negotiable

- [ ] Every quantitative claim cites file:line OR csv:row OR knowledge-base path.
- [ ] No "approximately X" or "around Y" — read the source and be specific.
- [ ] Cross-check pass found at least 3 claims to verify; document the verification in a brief note.
- [ ] §40 self-assessment updated honestly.
- [ ] Final doc length ~2,500-3,200 lines.
- [ ] No code changes.
- [ ] Build/tests not affected (this is docs-only).

## What NOT to do

- **Do NOT redo §1-39.** They're committed and stable.
- **Do NOT replace the iter-3 self-assessment** — extend it. Future readers see iter 1, 2, 3 evolution.
- **Do NOT push to remote** (L-G3).
- **Do NOT introduce code changes.** Pure docs.
- **Do NOT skip cross-check pass** even if sections look complete (L-T4).
- **Do NOT speculate** on CarrierUtil method semantics. Read the code or cite the call site.

## Deliverable

`_docs/CARRIERS_DEEP_REFERENCE.md` extended from 2,142 lines to ~2,800-3,200 lines. Sections §41-51 added. §40 self-assessment updated. 3+ commits showing the work.

## Handoff at end (closing report)

Give Jose:
1. Final line count and section count.
2. Top 5 surprising findings during deep-reads (esp. CarrierUtil and CSV verification).
3. Any inconsistencies discovered between knowledge-base docs and source code.
4. Updated ⚪ list (post iter-4).
5. Final coverage estimate (target ~98-100%, honest if lower).
6. Recommendation for follow-up sessions.

## Out of scope for this session

- ecart-payment integration (deferred, LESSON L-S7 — different vertical).
- New MCP tools.
- Sprint 4 work.
- Code changes of any kind.
- Pushing to remote.

Good luck. Jose (jose.vidrio@envia.com) is the sole decision-maker for any decision points encountered. When in doubt, surface and ask before deciding unilaterally (LESSON L-P1).
