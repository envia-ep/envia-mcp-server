# Backend Team Brief — Open Questions Consolidated

> **Audience:** Envia backend team (carriers, queries, geocodes
> ownership leads).
>
> **Purpose:** Single artifact with every open question that
> surfaced during the deep-reference audits. Ranked by impact +
> blast radius. Each item has: why it matters, the verifiable answer
> path (SQL / code grep / decision), and effort to resolve.
>
> **State at audit time (2026-04-26):**
> - 3 of 6 backend services have deep references (carriers, queries,
>   geocodes).
> - 38 distinct open questions across the 3 docs (after dedupe).
> - 7 are CRITICAL (security or MCP-blocking).
> - 12 are HIGH (correctness / drift).
> - 14 are MEDIUM (technical debt).
> - 5 are LOW (clean up).
>
> **How to use this brief:**
> - Pick from the CRITICAL section first — those are blockers.
> - Each item has a "suggested answer path" — paste the SQL or
>   command into the relevant terminal and the question resolves.
> - Update this doc as questions get answered (mark with date +
>   answer summary).

## CRITICAL (7 — blocks security or MCP work)

### C1. Parameterize 2 SQL injection sites in geocodes

**Why it matters:** confirmed RCE-via-SQL surface on a publicly-
reachable endpoint. carriers reads the same DB. Cache flush is
also public, making forensics harder.

**Source:** geocodes §16.1.

**Sites:**

- `controllers/web.js:2085, 2098-2100` (`queryExtendendZoneCarrierValidator`):
  3 string interpolations into raw SQL.
- `controllers/web.js:2123-2124` (`queryRedserviCoverage`): 6
  interpolations inside `IF/LENGTH/SUBSTR` expressions.

**Action:**

1. Replace `${var}` with `?` placeholders + parameter array.
2. Remove `multipleStatements: true` from `config/database.js:20`
   unless an explicit use case is documented.
3. Before merging, add Vitest coverage for both endpoints (geocodes
   has zero tests today — see C2).

**Effort:** 1-2h code + 4h tests. Owner: geocodes team.

### C2. Add minimum test coverage to geocodes (Vitest)

**Why it matters:** zero tests + confirmed bugs (CTT silent column-
alias failure at `controllers/web.js:2003`, locality cache-key bug)
= high regression risk on any fix. Blocks safe SQL injection
remediation (C1).

**Source:** geocodes §16.6.

**Action:**

1. Set up Vitest with config + first run target.
2. Add tests for the 5 most critical endpoints:
   - `GET /zipcode/{country}/{code}`
   - `GET /locate/{country}/{state?}/{city}`
   - `GET /brazil/icms/{origin}/{destination}`
   - `POST /location-requirements`
   - `GET` paquetexpress + redservi coverage (the 2 with SQL injection sites)
3. Mock MySQL + Redis. Cover happy path + 2 edge cases per endpoint.

**Effort:** 4-8h. Owner: geocodes team.

### C3. Fix MCP `validateAddressForCountry` silent no-op

**Why it matters:** code uses `form=address_form` which doesn't
exist in the `generic_forms` table. Actual form names are
`address_info`, `billing_form`, `billing_info`, `branch_info`,
`legal_info_moral`, `legal_info_physical`. Feature has been
**silently broken since deployment** — graceful degradation returns
`[]` required fields, so validation always passes, but no country-
specific rules actually run.

**Source:** queries §72.3, §76.2 point 4.

**Action:**

```typescript
// ai-agent/envia-mcp-server/src/services/generic-form.ts:168
// CHANGE: form='address_form'  →  form='address_info'
```

Verify: query `generic_forms` table for available `name` values
across all countries.

**Effort:** 1-line code change + verification (~30 min). Owner: MCP
team.

### C4. Verify `access_tokens.type_id=8` semantics

**Why it matters:** 1,625 production tokens with `type_id=8` exist
in the `access_tokens` table. NO documented auth handler in
`auth.middleware.js` accepts this type. Either:
- Active feature flag not yet documented (low risk, doc gap).
- Stale/orphan tokens (low-medium, cleanup).
- Active auth path not surfaced in audit (HIGH security risk —
  unmapped auth surface).

**Source:** queries §71.6, Q#41.

**Suggested answer path:**

```sql
-- 1) Distribution check
SELECT type_id, COUNT(*), MIN(valid_until), MAX(valid_until)
FROM access_tokens
GROUP BY type_id
ORDER BY type_id;

-- 2) Sample for context
SELECT user_id, company_id, valid_until, access_ecommerce, created_at
FROM access_tokens
WHERE type_id = 8
ORDER BY created_at DESC
LIMIT 50;

-- 3) Code search for handler
grep -rn "type_id.*=.*8\|type_id IN.*8\|typeId.*8" services/queries/
grep -rn "type_id.*=.*8\|type_id IN.*8\|typeId.*8" services/carriers/
```

**Effort:** 1h investigation. Owner: queries team (auth ownership).

### C5. Verify regulatory `insurance` enforcement for BR/CO domestic

**Why it matters:** carriers §10.3 D5 hypothesizes that addons
`id=14` (insurance LTL) and `id=52` (regulatory parcel insurance)
are mandatory in BR/CO domestic by regulation. Verified at audit
time: zero rows in `additional_service_prices` have `mandatory=1`
for these IDs. Real enforcement therefore lives in:

- carrier controller code (Correios.php, Coordinadora carriers/);
- geocodes `/location-requirements` response;
- queries action constructor logic.

The MCP currently cannot detect "this addon will be added
automatically" via the catalog endpoint.

**Source:** carriers §10.3 D5.

**Suggested answer path:**

```bash
# Search carrier code for the insurance addon names
grep -rn "'insurance'\|\"insurance\"" services/carriers/app/ep/carriers/Correios.php
grep -rn "'insurance'\|\"insurance\"" services/carriers/app/ep/carriers/coordinadora/

# Check geocodes /location-requirements response shape
curl -X POST $ENVIA_GEOCODES_HOSTNAME/location-requirements \
  -H 'Content-Type: application/json' \
  -d '{"origin":"BR","destination":"BR"}'
```

**Effort:** 1-2h. Owner: carriers team for code + geocodes team for
endpoint inspection.

### C6. Resolve `db-schema.mdc` staleness

**Why it matters:** `services/queries/db-schema.mdc` is loaded into
Cursor IDE's code-completion context. Audit found:

- 30+ NEW columns in `companies` table not in the doc.
- `users.image_profile` and `users.image_background` defaults appear
  swapped in production (likely bug not yet fixed).
- `shops.checkout` is `double NOT NULL` in live; documented as
  `int`.
- `user_companies.invitation_status` enum has 5 states in production;
  only `accepted` documented.

Stale doc ⇒ developers write code against the wrong schema ⇒ bugs
that test suites won't catch (since tests share the assumptions).

**Source:** queries §71, §76.2.

**Action options:**

(a) **Automate regeneration:** weekly cron writing
   `_meta/db-schema-current.md` from `INFORMATION_SCHEMA`. Mark
   `db-schema.mdc` as deprecated, point Cursor IDE at the
   regenerated artifact.
(b) **Manual refresh:** queries team updates the doc to match
   current production schema.

**Recommendation:** (a). Cron prevents recurrence.

**Effort:** 2-4h for cron + retire `db-schema.mdc`. Owner: queries
team.

### C7. Document or close cross-service DB access

**Why it matters:** carriers PHP uses `DB::connection('geocodes')`
to read 18+ tables directly. queries uses `geocodes.X` cross-schema
queries. Geocodes team has 8+ orphan tables (no HTTP route, only
consumed via direct DB) — they could drop one without warning,
breaking carriers in production.

**Source:** carriers §16.2, queries §32, geocodes §18 Q#8.

**Action options:**

(a) **Document the contract:** create
   `_meta/CROSS_DB_ACCESS_REGISTRY.md` listing every table accessed
   via `DB::connection('geocodes')` (carriers) and every `geocodes.X`
   cross-schema query (queries). Add a "before changing schema, see
   this list" callout in geocodes' contributor guide.
(b) **Refactor to HTTP:** wrap each cross-DB table in a geocodes
   HTTP endpoint and migrate consumers.

**Recommendation:** (a) now (~3h documentation), (b) when carriers
refactors are scheduled. (a) is sufficient if the audit team owns
the registry.

**Effort:** (a) 3h. (b) ~1 week per consumer. Owner: cross-team —
ownership question itself needs an answer.

## HIGH (12 — correctness / drift)

### H1. `users.image_profile` and `image_background` defaults swapped

**Why:** values look like a copy-paste error. queries §71.2.

**SQL:**
```sql
SELECT
  COLUMN_NAME, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME='users'
  AND COLUMN_NAME IN ('image_profile','image_background');
```

If swapped, decide: (a) fix the defaults via migration; (b) keep as
bug-compat. Effort: 30 min decision + 1h migration.

### H2. `shops.checkout` type drift (int → double NOT NULL)

**Why:** downstream casts may misbehave; documented as int. queries
§71.5.

**SQL:**
```sql
SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME='shops' AND COLUMN_NAME='checkout';

-- Are all existing values integer-valued?
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE checkout = FLOOR(checkout)) AS integer_valued
FROM shops;
```

Effort: 30 min investigation. queries team owns.

### H3. `user_companies.invitation_status` 5-state enum transitions

**Why:** 5 states (sent, accepted, rejected, revoked, expired); only
`accepted` documented in `auth.middleware.js`. Where are the other
4 transitions enforced?

**Source:** queries §71.7, Q#45.

**Code search:**
```bash
grep -rn "invitation_status\|invitationStatus" services/queries/
grep -rn "invitation_status\|invitationStatus" services/carriers/
grep -rn "invitation_status\|invitationStatus" repos_extra/accounts/
```

Effort: 1h. queries / accounts team.

### H4. Estafeta `allows_mps` runtime override

**Why:** `1_prod_carriers.csv` shows `allows_mps=0` but
`Estafeta.php:39` overrides to 1 at start of every `rate()`. DB row
should match runtime — minor technical debt.

**Source:** carriers §52.5 S1.

**Action:** UPDATE `carriers` table to set `allows_mps=1` for
Estafeta row (carrier_id=2). Remove the override line in code.

**Effort:** 15 min migration + 5 min code change. Owner: carriers
team.

### H5. Estafeta LTL max weight discrepancy resolved (1100 not 1200)

**Why:** the deep-dive doc claims 1,200 kg max; code at
`Estafeta.php:129` enforces 1,100 kg. Doc was wrong; code is canonical.

**Source:** carriers §52.5 S2.

**Action:** update `knowledge-base/carrier-services/carriers-v2/estafeta.md`
to state 1,100 kg. Effort: 5 min. Owner: carriers team.

### H6. CTT España `/seur/identify` endpoint silent column-alias bug

**Why:** missing comma at `controllers/web.js:2003` causes
`origin_country_code AS origin_province` — query returns wrong
column mappings. How long has CTT coverage data been corrupted?

**Source:** geocodes §15.2, §16.1, Q#5.

**Action:** Fix the missing comma. Run regression check on CTT
coverage data integrity.

**Effort:** 5 min code + 1h data audit. Owner: geocodes team.

### H7. Locality cache-key bug

**Why:** `GET /locality/{cc}/{locality}` uses cache key
`zipcode.{cc}.undefined` (should be `locality.{cc}.{locality}`).
First locality query cached; all subsequent queries for that country
hit the same key.

**Source:** geocodes §21.1.

**Action:** Fix the key template. Add TTL (currently 0 = persistent).

**Effort:** 30 min. Owner: geocodes team.

### H8. NDR alias-in-HAVING MySQL 8 incompat (`type` param BROKEN)

**Why:** `/get-shipments-ndr?type=...` returns 422 due to alias-in-
HAVING pattern that broke after MySQL 5.7→8 upgrade
(ONLY_FULL_GROUP_BY mode). Backend `type` param BROKEN; UI does
client-side filtering as a workaround.

**Source:** queries §72.1, §76.2.

**Action:** rewrite the HAVING clause to reference the underlying
column expression, not the alias.

**Effort:** 1-2h. Owner: queries team.

### H9. `/shipments/config-columns` wrong handler

**Why:** routes/shipment.routes.js:472-481 wires the wrong
controller method. HIGH severity, 5-10 LOC fix.

**Source:** queries §72 (bug discovery).

**Action:** wire the correct handler. Effort: 30 min. queries team.

### H10. `/company/tickets` JSON.parse(undefined) bug

**Why:** controllers/company.controller.js:1261-1262 throws
JSON.parse(undefined) when ticket JSON column is null. HIGH
severity, 2 LOC fix.

**Source:** queries §72.

**Action:** add null guard. Effort: 15 min. queries team.

### H11. Coordinadora COD overrides — 55/16 (verified)

**Why:** previously a soft claim; now verified via
`6_prod_additional_service_custom_prices_summary.csv`:
- Ground COD: 55 companies with override (avg 2.46%).
- Ecommerce COD: 16 companies with override.

The carriers reference §43.4 already reflects this correctly.
**No backend action needed** — closes prior open question. Listed
here for reconciliation.

**Source:** carriers §52.5 S3.

### H12. VIACEP-inserted BR rows have wrong iso2 format

**Why:** rows inserted via VIACEP fallback have
`iso2='BR-<full state name>'` (e.g., `BR-São Paulo`) instead of
authoritative `iso2='BR-SP'`. Queries assuming `BR-SP` miss VIACEP
rows. Silent inconsistency.

**Source:** geocodes §23.4.

**Action options:**

(a) Migrate VIACEP rows to authoritative format:
   ```sql
   UPDATE geocode_info
   SET iso2 = CASE
     WHEN iso2='BR-São Paulo' THEN 'BR-SP'
     WHEN iso2='BR-Rio de Janeiro' THEN 'BR-RJ'
     -- ...all 27 states
   END
   WHERE iso='BR' AND iso2 LIKE 'BR-%' AND LENGTH(iso2) > 5;
   ```

(b) Add a `source` column to `geocode_info` (`source ENUM('envia','viacep')`)
   for traceability + don't migrate.

**Recommendation:** (a) immediately + (b) prospectively.

**Effort:** (a) 1h (audit + migration). (b) 30 min (column add) + ongoing.
Owner: geocodes team.

## MEDIUM (14 — technical debt)

### M1. Public `POST /flush` endpoint in geocodes

Auth-protect or remove. Risk: cross-service cache stampede.

Source: geocodes §16.2. Effort: 30 min. Owner: geocodes.

### M2. `multipleStatements: true` flag in geocodes config

Remove unless explicit use case documented (none found in audit).
Reduces SQL injection blast radius.

Source: geocodes §16.3. Effort: 5 min + grep audit. Owner: geocodes.

### M3. Permissive CORS + unanchored Heroku host filter in geocodes

CORS `origin: ['*']`; Heroku-host check uses `/herokuapp/`
substring (allows `X-herokuapp.com` false positives).

Action: replace with `origin: ['<known-domains>']` + anchored regex
`^[^.]+\.herokuapp\.com$`.

Source: geocodes §16.4, §16.5. Effort: 30 min. Owner: geocodes.

### M4. `validateHash` not timing-safe in queries

Uses string `===` instead of `crypto.timingSafeEqual`. Low security
risk but easy fix.

Source: queries §56.1, Q#35. Effort: 5 LOC. Owner: queries.

### M5. `automatic_insurance` flag semantics

Column confirmed in DB; auto-add at quote time?

Source: queries Q#24. Effort: 30 min code search + decision. Owner:
queries.

### M6. WooCommerce strategy missing in fulfillment

queries lists 15 ecommerce platforms but `woocommerce.strategy.js`
doesn't exist. Is WooCommerce handled via a different path?

Source: queries Q#37. Effort: 30 min. Owner: queries / fulfillment.

### M7. DCe Paraná state-specific scope

queries' DCe (Documento de Conhecimento eletrônico) implementation is
Paraná-specific. How are shipments through SP, RJ, MG handled?
Separate fiscal doc service, or unified solution planned?

Source: queries Q#38. Effort: 1h product/architecture decision. Owner:
queries / Brazil ops.

### M8. `dce_config WHERE id=1` single-row table

Why a single-row config table instead of env vars or a typed
service? Architecture nit.

Source: queries Q#39. Effort: 30 min decision + (optional) migration.
Owner: queries.

### M9. EU exceptional territories — ES-CE/ML, FR-MC drift

geocodes' `excStates` has ES-CE, ES-ML; MCP's
`EXCEPTIONAL_TERRITORIES` differs. Is this intentional or drift?

Source: geocodes §18 Q#3. Effort: 30 min reconciliation. Owner:
geocodes + MCP teams jointly.

### M10. GB/EN/SC/WL/NI codes in geocodes — design intent

ISO has only `GB`. Geocodes carries `EN`, `SC`, `WL`, `NI` in
arrays. Are these ever sent by callers? If yes, document; if no,
remove.

Source: geocodes §18 Q#4. Effort: 1h grep across consumers. Owner:
geocodes.

### M11. `usage_counter` semantics in `list_localities`

Used for sorting in `/locate`. The `/usage-counter` endpoint is a
no-op (geocodes `controllers/web.js:1384-1386`). Was it ever wired
and disabled? Cron? Manual?

Source: geocodes §18 Q#2. Effort: 1h investigation. Owner: geocodes.

### M12. Orphan coverage tables — HTTP-hidden carriers consumers

`amazon_coverage` (162k rows), `jtexpress_coverage` (96k),
`paquetexpress_coverage` (95k), + 8 others have no HTTP route.
Carriers PHP reads via `DB::connection('geocodes')`. List the
consumers.

Source: geocodes §18 Q#8. Closes when §C7 documents the registry.
Effort: included in C7. Owner: cross-team.

### M13. `carrier_extended_zone.destination_zipcode` only?

Does origin side exist elsewhere
(e.g., `paquetexpress_postal_code_distances`)?

Source: geocodes §18 Q#9. Effort: 30 min DB schema check. Owner:
geocodes.

### M14. File cache expiration in geocodes

`resources/zipcodes/` ephemeral file cache grows unbounded on long-
lived dynos. No expiration strategy.

Source: geocodes §20.1. Effort: 30 min decision (TTL-by-mtime cleanup
job vs Redis-only cache). Owner: geocodes.

## LOW (5 — clean up)

### L1. `postcode-with-dash.json` vs `fixZipcode` switch — two sources of truth

geocodes §18 Q#10. Effort: 1h consolidation. Owner: geocodes.

### L2. `store.middleware.js` and `webhook.middleware.js` — unused?

Confirm and remove if dead code.

Source: geocodes §18 Q#11. Effort: 30 min. Owner: geocodes.

### L3. AR fall-through in `fixZipcode` — add explicit `break`

`case 'AR':` strips non-digits, NO `break` → falls through to SE/GR/TW
case. Mostly harmless but fragile.

Source: geocodes §25.2. Effort: 5 LOC. Owner: geocodes.

### L4. Deprecated dependencies in geocodes (Axios 0.23, Heroku-18)

Axios 0.23.0 has known vulnerabilities; Heroku-18 stack is EOL.

Source: geocodes §16.6. Effort: 2-4h upgrade + test. Owner: geocodes.

### L5. Update `knowledge-base/carrier-services/carriers-v2/estafeta.md` LTL max

Per H5 — doc wrong, code right.

Source: carriers §52.5 S2. Effort: 5 min. Owner: carriers.

### C8. Geocodes `/location-requirements` does not auto-detect EU exceptional territories from `state_code`

**Why it matters:** Verified 2026-04-27 against
`https://geocodes.envia.com/location-requirements`. When the consumer
sends `{country_code: 'ES', state_code: 'ES-CN', postal_code: '35001'}`
(Canarias) the response is `{applyTaxes: true, includeBOL: false,
isInternalEU: true}` — i.e. the route is treated as domestic-EU
intra-Spain. Same with `state_code: 'ES-CE'` (Ceuta) and
`state_code: 'FR-GF'` (French Guiana from FR origin).

The CORRECT behaviour (`{applyTaxes: false, includeBOL: true,
isInternalEU: false}`) is only returned when `country_code: 'IC'` is
sent explicitly. Confirmed via test:
```
curl -X POST https://geocodes.envia.com/location-requirements \
  -d '{"origin":{"country_code":"ES","state_code":"ES-MD","postal_code":"28001"},
       "destination":{"country_code":"IC","state_code":"ES-CN","postal_code":"35001"}}'
→ {"applyTaxes":false,"includeBOL":true,"isInternalEU":false,...}
```

**Impact:** any consumer (MCP, V1 portal, carriers PHP) that sends
state-style codes for exceptional territories receives incorrect tax
guidance. Shipments to Canarias / Ceuta / Melilla / French ultramar /
Azores / Madeira may be created without the items[] array or BOL the
carrier will require, leading to silent rate underestimation or
generate-time rejections at customs.

**Action options:**

(a) **Geocodes-side fix:** in `controllers/web.js` (location-requirements
   handler), detect state_code prefix → if matches an entry in `excStates`
   (`ES-CN/TF/GC/CE/ML`, `FR-GF/GP/MQ/YT/RE`, `PT-20/30`, `NL-SX`), treat
   as exceptional regardless of `country_code`. ~15 LOC.

(b) **MCP-side workaround:** transform state→country before calling
   geocodes. Risky because not every backend route accepts non-ISO
   country codes (e.g. carriers `/ship/rate` may reject `country='GF'`
   even if it accepts `'IC'`). Requires per-territory testing.

**Recommendation:** (a). Single fix benefits all consumers.

**Production-data evidence (PROD DB, queried by Jose 2026-04-27):**
- Last ~90 days, destinations stored with country='ES' having CP
  35xxx (Las Palmas) or 38xxx (Tenerife) or state in {GC, TF, LP}:
  **852 shipments**.
- Same window, country='IC': **53 shipments** (37 TF, 16 GC).
- **5.9% of Canarias-destined shipments are correctly stored as IC;
  94.1% are stored as ES.**

**Source breakdown of the 53 IC shipments:**
| Source | Carrier | Service | Shipments |
|--------|---------|---------|-----------|
| client_platform | zeleris | next_day | 43 |
| app | zeleris | next_day | 6 |
| client_platform | zeleris | maritimo | 3 |
| app | zeleris | maritimo | 1 |
- **100% are Zeleris.** No other carrier in the ecosystem uses
  country='IC'. The portal V1 has hardcoded conditional logic:
  `if carrier == zeleris && destination is Canarias → country = IC`.

**Carriers backend Canarias awareness (verified in code 2026-04-27):**
- **`CarrierUtil::validateAddress` at `app/ep/util/CarrierUtil.php:4845-4868`
  applies the global override for ALL carriers** —
  `$address->country = $address->country == 'ES' && in_array(substr($address->postalCode, 0, 2), ["35","38"]) ? "IC" : $address->country;`
  (line 4852). This runs at validation time, before any carrier-specific
  code sees the address. So every shipment passing through `/ship/rate`
  / `/ship/generate` with ES + CP 35xxx/38xxx automatically becomes IC
  before the carrier API call. `country='IC'` is a first-class code per
  `CountryTimezoneUtil.php:26` (`'IC' => 'Atlantic/Canary'`).
- `Zeleris` — REQUIRES country='IC'. `ZelerisUtil.php:174` throws
  `InvalidValueException(1125)` if intl shipments are requested from
  Canarias. Zeleris is the Spain↔Canarias specialist carrier. Receives
  IC because validateAddress already converted before its code runs.
- `Correos Express` (`CorreosExpressUtil.php:664-691`),
  `DHL` (`DhlRestV3Util.php:497`),
  `UPS` (`UpsUtil.php:845`),
  `Cainiao` (`CainiaoUtil.php:140`),
  `CLM` (`ClmUtil.php:107-144` — `getCanariasZone(postalCode)`,
  classification 2=Canarias, 5=Baleares),
  `Envialia` (`EnvialiaUtil.php:199-248`)
  — all detect Canarias internally via `postal_code` ranges /
  classification table. They are robust to either country code (ES or
  IC) because they consult postal_code first.

**Why production data still shows 94% as country='ES':**
The `shipments` table persists the address BEFORE `validateAddress`
runs (or via a different path). The override is "on the way to the
carrier", not stored back to the database. Customer-visible behaviour
is correct because the carrier API call always sees IC.

**Revised severity assessment:**

The 94% ES-stored Canarias shipments are NOT necessarily mishandled
end-to-end — the carriers themselves classify by postal_code and
apply correct routing/rating. The customs implication may also be
absorbed by the carriers (each handles BOL generation per its own
rules).

The customer-visible bug surfaces when:
1. A consumer (MCP, V1 portal, integration) sends a Canarias
   shipment to **Zeleris** with country='ES' → Zeleris API throws
   1125 → shipment fails. Today the V1 portal compensates;
   the MCP does NOT.
2. A new carrier is integrated that requires country='IC' and the
   portal's hardcoded conditional list isn't updated.
3. The location-requirements endpoint returns the wrong tax flags
   (`applyTaxes:true, includeBOL:false`) for any consumer that
   chooses to act on them.

**Adjacent finding (data quality, not blocking C8):** state values
are stored inconsistently for ES Canarias — `GC`, `cn` (lowercase),
`TF`, `LP`. Worth a normalisation sweep when geocodes lands C8.

**Recommendation revised:**

(a) Geocodes-side fix in `/location-requirements` to apply the same
    1-line transform that lives in `CarrierUtil::validateAddress`
    (`app/ep/util/CarrierUtil.php:4852`). Single source of truth →
    every consumer of `/location-requirements` (MCP, V1 portal,
    integrations, future tools) receives correct flags without
    needing to replicate the rule. **MEDIUM severity** — bug exists
    and matters for any consumer trusting the location-requirements
    flags but does NOT break the rate/generate path because that
    runs through validateAddress.

(b) **Interim MCP-side mitigation (LANDED 2026-04-27):** the MCP
    `getAddressRequirements` helper now applies the same exact
    transform from `CarrierUtil::validateAddress:4852` before
    calling geocodes. See
    `ai-agent/envia-mcp-server/src/services/geocodes-helpers.ts`
    `applyCanaryIslandsOverride()`. The transform is verbatim — when
    geocodes lands C8, the MCP can keep the override in place
    (idempotent — geocodes returning the same flags either way) or
    remove it as cleanup; both are safe.

(c) **Separate proposal: surface the persistence inconsistency.**
    Decide whether `shipments` table should store the post-override
    country code (consistent with carrier API view) or pre-override
    (consistent with user-input view). Today it's the latter for
    most paths but Zeleris-via-V1 (53 of 905 in 90 days) persists
    the post-override IC. Inconsistent persistence makes analytics
    harder. Not part of C8.

**Effort:** C8 still 1-2 h code + tests in geocodes.
**Severity:** **MEDIUM** (revised from HIGH after carrier-code
verification) — bug exists and matters for any consumer trusting
the location-requirements flags, but does not break the majority
of Canarias shipments end-to-end.

---

### C9. Carriers `CancelBreakdown` does not surface daily-refund-limit refusals

**Why it matters:** Verified 2026-04-27 against
`services/carriers/app/ep/responses/CancelBreakdown.php` (lines 14, 26,
27, 34) and `app/ep/util/CarrierUtil.php` (lines 947–960).

`CancelBreakdown` returns:
- `refundedAmount` (rounded, 2 decimals) ✅
- `balanceReturned` ✅
- `balanceReturnDate` ✅

`CarrierUtil::checkRefundLimit` enforces a daily cap per shipment_type
(parcel: 5, pallet: 2, FTL: 5) with whitelist for company IDs
`[70279, 456605, 75110, 649207]`. When the cap is exceeded, the TMS
refund call is silently skipped — the cancel succeeds but no refund is
issued. The user gets `balanceReturned: false, refundedAmount: 0` and
NO indication that the daily limit was the cause.

**Impact:** users see "shipment cancelled" with `Refund: Pending` and
have no way to know they hit the limit. Result: support ticket
escalations ("¿por qué no me regresan el dinero?") that could be
self-served if the cancel response surfaced `dailyLimitExceeded: true,
dailyLimitReason: 'Limit of 5 parcel cancellations/day reached for
your company'`.

The MCP's `cancel-shipment.ts` already declares
`dailyLimitExceeded: boolean, dailyLimitReason: string` in its `CancelData`
interface and renders a warning if either is set. The fields are simply
never populated by the backend — the MCP is defensive but the user
never sees the warning.

**Action:** in `CancelBreakdown.php`, populate two new fields when
`CarrierUtil::checkRefundLimit` returns false:
- `dailyLimitExceeded: bool`
- `dailyLimitReason: string` (e.g. `"Daily refund limit of N
  cancellations/day reached for shipment type {type}"`)

**Effort:** ~30 min code + 1 unit test. **Severity:** **MEDIUM** —
not a correctness bug but a UX gap that drives support load. Already
plumbed in MCP, will light up automatically once backend ships.

---

### C10. V4 orders response missing per-package COD fields

**Why it matters:** The MCP types for `V4Package` (and the original
ecommerce-order service) referenced `cod_active` and `cod_value`
per-package fields that do NOT appear in the real `GET /v4/orders`
response (verified 2026-04-27 via sandbox curl).

Only `order.order.cod` (an integer — 0=no COD, >0=COD amount) is
present at the order level. The per-package COD breakdown is
unavailable through the orders API.

**Impact:** The MCP `hasCod` flag was silently incorrect —
`pkg.cod_active === 1` always evaluated to `false`, even for COD
orders. Fixed client-side (MCP commit 2026-04-27) by reading
`order.order.cod > 0` instead.

**Action (optional):** If per-package COD breakdown is needed
(useful for multi-location orders where only some packages are COD),
expose `cod_active` and `cod_value` at the package level in the
`/v4/orders` response, or provide a separate
`GET /v4/orders/{id}/packages-cod` endpoint.

**Effort:** Minor — adding fields to V4 response serializer.
**Severity:** LOW for correctness (MCP compensates); MEDIUM for
feature completeness (multi-package COD breakdown).

---

### C11. New endpoint required: `GET /carrier-constraints/{carrier_id}` (carriers)

**Why it matters:** The MCP server (envia-mcp-server, AI agent embedded
in the portal) needs to answer questions like *"Does FedEx Express
support COD in Mexico?"* / *"What's the max weight for DHL international?"*
/ *"Which additional services can I add to UPS Ground?"* without forcing
the user to attempt a quote and parse the error.

**Source:** L-B5 backend verification executed 2026-04-27 confirmed:

- The data exists across `carriers`, `services`,
  `company_service_restrictions`, and `catalog_additional_services` +
  `additional_service_prices` tables. Plus scattered hardcoded constants
  in `app/ep/carriers/utils/{Carrier}Util.php` classes (Phase 2).
- **NO endpoint currently exposes any of it.** Closest existing routes
  (`GET /carrier/{id}` and `GET /get-service/{carrier_id}` in queries)
  return metadata only — no weight, dimension, COD, or additional-service
  catalog data.
- Therefore the MCP cannot ship its 4th pre-approved Sprint 7 tool
  (`envia_get_carrier_constraints`) until this endpoint exists.

**Action:** Build `GET /carrier-constraints/{carrier_id}` in the
**carriers** service per the detailed implementation spec at
`ai-agent/envia-mcp-server/_docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md`.
That document is fully self-contained for an implementer:
- Verbatim API contract (success + 5 error responses).
- Per-field source mapping to existing DB columns.
- File-by-file implementation plan (route, controller, service, tests).
- 11 unit + 7 feature test cases, named to follow existing carriers conventions.
- Caching strategy (CacheUtil::remember, TTL 3600s, per-company keying).
- Acceptance-criteria checklist (15 items).
- Anti-patterns to avoid (cross-tenant probing, god-class imports,
  weight-unit drift, premature hardcoded-constant extraction).

**Phasing:** Phase 1 (this ticket) ships the DB-driven catalog. Phase 2
(separate, deferred) extracts hardcoded carrier-class constants into
`config/carrier_constraints.php`. Phase 1 is independently shippable
and unblocks the MCP tool — Phase 2 enriches the response.

**Effort:** **2–3 days** for Phase 1, fully tested. Phase 2 estimated
5–7 days when scheduled (per-carrier audit is the long pole).

**Severity:** **MEDIUM** — does not block existing functionality, but
blocks the MCP's 4th pre-approved tool and any future agentic /
self-service capability discovery work.

**Owner:** carriers team. Spec was authored to minimise back-and-forth
— the implementer should be able to read, code, test, and ship without
follow-up clarification, modulo the 4 open questions enumerated in
spec §12.

**[2026-04-27 UPDATE — Spec v2 published. Backend team can proceed with implementation.]**
A backend code review session on 2026-04-27 produced 13 decisions that
have been incorporated into spec v2. All open questions from v1 §12 have
been resolved or have documented fallback rules. The spec is now authoritative
and self-contained. MCP code (`src/types/carrier-constraints.ts`,
`src/services/carrier-constraints.ts`, `src/tools/get-carrier-constraints.ts`)
has been aligned to the v2 contract in the same commit. Summary of the 13
closed decisions:
  1–3.  Company JWT filters four tables (private carriers, private services,
        disabled carriers, disabled services) — backend-side, no MCP changes.
  4.    `international` is now a triple field (bool + int code + string scope).
  5.    `volumetric_factor_id` added as optional FK alongside the actual divisor.
  6.    Tracking split into `envia_track_url_template` + `carrier_track_url_template`.
  7.    `additional_service_prices.active = 1` enforced in query — backend-side.
  8.    Coverage summary SQL corrected to use `carriers.locale_id → locales.country_code`.
  9.    Coverage summary returns Phase 1 placeholder, never fails the request.
  10.   `carrier.endpoint` omitted from response (internal URL security).
  11.   "Carrier not active" 404 removed; empty services returns 200 + `meta._note`.
  12.   Strict 400 (malformed input) vs 422 (business mismatch) distinction.
  13.   `meta.cached` removed; cache observability via Datadog APM span attributes.

**[2026-04-27 UPDATE — Spec v3 published (FINAL CONTRACT). 10 round-2 decisions closed.]**
A second backend review session on 2026-04-27 produced 10 additional
refinements that have been incorporated into spec v3. The most consequential
is #1 — it resolves a contradiction in v2 between §2.3 (200 with empty
services) and §3.7+§6 (404 for private/disabled). v3 is the final contract;
implementers can read it end-to-end with no further verification. MCP code
aligned to v3 in the same commit. Summary of the 10 closed decisions:
  1.   CRITICAL — strict 404/200/422 hierarchy: private/disabled → 404 (no leak);
       empty services → 200 + `meta._note`; `service_id` mismatch → 422;
       `service_id` filtered for company → 200 + specific `meta._note`.
  2.   `coverage_summary` opt-in (only when `?include=coverage_summary`) — sparse fieldset.
  3.   Additional services SQL filtered against company-visible service IDs (closes leak).
  4.   `service_id` filtered for company → 200 empty (consistent with #1).
  5.   `volumetric_factor_id` shape stable: always present, `null` when unset.
  6.   `carrier.active` removed (redundant — any carrier in 200 is active by contract).
  7.   `company_service_restrictions` PK metadata corrected: composite (company_id, service_id).
  8.   Cache wraps `data` only; `meta` (esp. `generated_at`, `_note`) built per-request.
       `CacheUtil` is unmodified.
  9.   Controller validates ints with `FILTER_VALIDATE_INT` — defends against `"abc"`/`"123abc"`.
  10.  §12 reframed as "Verified assumptions" — `catalog_shipment_types`, `catalog_rate_types`,
       `carriers.track_url_site`, `company_private_carriers` all confirmed by backend.

The spec now has zero open questions. Backend team can proceed end-to-end.

---

## Closed since this brief was drafted (resolution log)

This section will accumulate as items are resolved. Format:

> **[YYYY-MM-DD] [item-id]** — Brief resolution note. Verifier
> name/identifier. Link to commit/PR/SQL trace.

(none yet — populate as items close.)

## Suggested order of operations

A backend-team week-of-work plan, optimized by impact-per-hour:

**Day 1 (security):** C1 (parameterize SQL injection) + C2 (Vitest
scaffold to enable safe refactor) + M1 (auth-protect /flush) + M2
(remove multipleStatements). Total ~10h. Closes the geocodes
security surface.

**Day 2 (correctness):** H6 (CTT alias bug) + H7 (locality cache
key) + H8 (NDR alias-in-HAVING) + H9 (config-columns wrong handler)
+ H10 (JSON.parse undefined). Total ~6h. Customer-impacting bugs.

**Day 3 (drift):** C6 (db-schema.mdc regen cron) + C7 (cross-DB
registry) + H1 (image defaults) + H2 (shops.checkout type) + H4
(Estafeta allows_mps DB row) + H5 (Estafeta LTL doc fix) + H12
(VIACEP iso2 migration). Total ~10h. Documentation + schema
consistency.

**Day 4 (security investigation):** C4 (type_id=8 audit) + M4
(timing-safe hash) + M3 (CORS / Heroku regex). Total ~4h. Closes
unmapped auth surface concerns.

**Day 5 (architecture decisions):** C5 (regulatory insurance
enforcement) + M9 (exceptional territories drift) + M10 (GB/EN/SC
codes) + M7 (DCe state coverage) + L4 (geocodes deps + Heroku
migration plan). Total ~6h, includes some product/strategy meetings.

**Total backend team effort to close all CRITICAL + HIGH:** ~30
hours. Closes the highest-impact items in 1 sprint.

## Reading the briefing

Each question is grouped by severity, so you can:

1. Skim CRITICAL — these block users or expose security.
2. Cherry-pick HIGH — these are isolated bugs / drifts with known
   fixes.
3. Schedule MEDIUM into normal cleanup time.
4. Defer LOW until friction-free time.

When closing an item, append to "Closed since this brief was drafted"
with date + commit/PR + verifier. This keeps the brief accurate over
time.
