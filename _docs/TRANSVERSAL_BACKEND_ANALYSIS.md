# Transversal Backend Analysis

> **Purpose:** Surface the patterns, risks, and shared technical
> debt that cut across the Envia backend services covered by deep
> reference documentation. The per-service docs are silos — this doc
> connects them.
>
> **Scope at audit time (2026-04-26):** carriers, queries, geocodes.
> ecommerce + admin-monorepo + accounts will be added when their
> reference docs land (see roadmap in §7 of this doc).
>
> **Reading guide:**
> - §1 Service comparison at a glance.
> - §2 Top-5 systemic risks ranked by severity (start here for action).
> - §3 The 11 cross-cutting patterns with cross-references to each
>   service's reference.
> - §4 The integration map — who calls whom, with auth + failure modes.
> - §5 Schema drift register.
> - §6 Recommendations to the backend team, ranked.
> - §7 Roadmap for the remaining 3 reference docs.
>
> **Verification:** every cross-reference cites the section anchor in
> the underlying reference doc (`carriers §X.Y` = §X.Y of
> `_docs/CARRIERS_DEEP_REFERENCE.md`; same for queries / geocodes).

## 1. Three services at a glance

| Dimension | carriers | queries | geocodes |
|-----------|----------|---------|----------|
| **Stack** | Lumen 8.x / PHP 8.3 | Hapi 21.3 / Node 18 | Hapi 21.3 / Node 18 |
| **DB driver** | Eloquent ORM | mysql2 raw SQL | mysql2 raw SQL |
| **Code size** | ~830 PHP files; 7,734-line `CarrierUtil` god class (carriers §47) | 694 method definitions across 65 route files; 60 controllers (queries §1.2) | 10 files; 2,349-line `controllers/web.js` god file; 723-line `routes/web.js` (geocodes §1) |
| **Endpoint count** | ~30 routes (`routes/web.php`, carriers §2) | 286 paths / 694 raw method declarations (queries §1.2) | 48 routes (geocodes §15.1) |
| **Auth model** | JWT via `Guard.php` + DB token fallback; 3 type_ids (1, 2, 7) (carriers §3) | 8 strategies; same 3 type_ids; constant-time comparison for cron/stp (queries §3) | **All 48 routes `auth: false`** — relies on network isolation + unanchored Heroku host filter (geocodes §15.1) |
| **Test coverage** | `tests/Unit/` + `tests/System/{Rate,Generate,Track,Cancel,Pickup}/` (carriers `CLAUDE.md`) | Some unit tests, broad coverage uneven (queries §1.2) | **`package.json` test script: `echo "Error: no test specified"` — ZERO tests** (geocodes §16.6) |
| **Observability** | Sentry + New Relic + Datadog APM (carriers §4.3, §16.7) | dd-trace 5.86 (Datadog auto-instrumentation) (queries §4.1) | New Relic 12.15.0, conditional non-prod only (geocodes §1) |
| **Models / ORM** | 126 Eloquent models (carriers §49) | No ORM; raw SQL throughout | No ORM; raw SQL throughout |
| **Reference doc state** | best-of-world (4,421 lines, cookbook §53, verification script, 0 known errors) | 3,863 lines, ~95-97% coverage, iter-7 with strong DB ground-truth | 3,400 lines, ~80% coverage |
| **Doc cookbook** | ✅ §53 (11 scenarios) | ❌ | ❌ |
| **Verification script** | ✅ `scripts/verify-carriers-ref.sh` (37 checks) | ❌ | ❌ |

## 2. Top-5 systemic risks (ranked)

These are the issues most worth resolving — high impact, multi-service
blast radius, observable today.

### 2.1 SQL injection in `geocodes` — 2 confirmed sites (CRITICAL)

Source: geocodes §16.1.

- `queryExtendendZoneCarrierValidator` (geocodes `controllers/web.js:2085, 2098-2100`):
  3 string interpolations into raw SQL.
- `queryRedserviCoverage` (`controllers/web.js:2123-2124`): 6
  interpolations inside `IF/LENGTH/SUBSTR` expressions.

**Why it's CRITICAL across services:**

`config/database.js:20` of geocodes sets `multipleStatements: true`.
Combined with the interpolated parameters, an attacker can chain
arbitrary SQL after the legitimate SELECT. **And carriers PHP reaches
into the geocodes DB via `DB::connection('geocodes')` (carriers §16.2)**
— a successful injection could be used to corrupt rows that carriers
will then trust, propagating poisoned data into the rate/generate
flow.

**Compounding factors:**

- Geocodes routes are public (no auth, geocodes §2). Any internet-
  reachable IP can hit the endpoint.
- Heroku host filter `/herokuapp/` is unanchored — `X-herokuapp.com`
  passes (geocodes §16.4).
- Public `POST /flush` endpoint can also wipe the cache pre/post
  injection to cover tracks (geocodes §16.2).

**Fix urgency:** highest in the analysis. Estimated 1-2 hours to
parameterize both sites + remove `multipleStatements: true` (no
documented use case for stacked queries in the codebase).

### 2.2 Country-rule branching duplicated across 4+ codebases

Source: geocodes §7.2 + queries §10 + carriers (per-controller) +
MCP local replication.

**The pattern:** each service implements its own copy of country-
specific business rules:

| Where | What | Source |
|-------|------|--------|
| **geocodes** | Hardcoded postal-code transformations (6 countries in `postcode-with-dash.json`, 6+ in `fixZipcode` switch); EU exceptional territories (FR-GF/GP/MQ/YT/RE, PT-20/30, ES-CN/TF/GC, NL-SX, ES-CE/ML); MX 11-case state-code remap (BN→BC, DF→CX, …) | geocodes §7.2, §24, §25 |
| **queries** | `generic_forms` table with per-country address/billing field schemas + regex patterns | queries §10 |
| **carriers** | Per-carrier controller country branching (FedEx country list, UPS country list, country-specific volumetric factors per service); regulatory `insurance` enforcement for BR/CO domestic (carriers §10.3 D5) | per controller |
| **MCP** | Local replication of postal-code transformation, EU exceptional territories list (`COUNTRY_RULES_REFERENCE.md`) | memory `reference_country_address_rules.md` |

**Drift confirmed:**

- ES-CE / ES-ML (Ceuta/Melilla) appear in geocodes' `excStates` but
  the MCP's `EXCEPTIONAL_TERRITORIES` list differs (geocodes §18 Q#3).
- Postal-code transformation rules in MCP duplicate geocodes logic;
  any geocodes update silently leaves MCP stale.
- Argentina case in `fixZipcode` falls through to SE/GR/TW logic
  without a `break` (geocodes §25.2) — likely a bug, not a pattern,
  but illustrates the fragility.

**Why it's CRITICAL:** every new country expansion requires touching
4+ codebases. Current state guarantees drift. The "right" answer is a
single country-rules service or a shared library — but doing the
consolidation requires a strategic decision.

**Quick mitigation while waiting on consolidation:** the MCP should
delegate to geocodes for postal-code normalization rather than
replicate. This is documented in carriers §53.7 cookbook.

### 2.3 Cross-service DB access (cross-schema queries from carriers + queries → geocodes)

Source: carriers §16.2 + queries §32.

**The pattern:** services don't communicate only through HTTP. They
also cross schema boundaries via shared MySQL pool:

| Service | DB connection | Tables read |
|---------|---------------|-------------|
| **carriers** | `DB::connection('geocodes')` | `postal_codes`, `coverage`, `carrier_extended_zone`, ~18 carrier-coverage tables (`amazon_coverage`, `paquetexpress_coverage`, `jtexpress_coverage`, etc.) |
| **queries** | Cross-database SQL via schema prefix | `geocodes.paquetexpress_postal_code_distances`, `geocodes.paquetexpress_coverage`, `geocodes.list_localities` (queries §32) |

**Why it's a systemic issue:**

- **Hidden coupling:** the geocodes deep-reference doc lists 8+ orphan
  tables (geocodes §18 Q#8) — tables with no HTTP route, only consumed
  via direct DB. Without cross-project doc, the geocodes team could
  drop a table that breaks carriers in production.
- **Schema changes blast radius unclear:** add/drop a column in
  geocodes' `paquetexpress_coverage` and you may break carriers'
  rate flow without warning. Code review on geocodes won't catch it.
- **No mutual TLS, just MySQL credentials:** auth is at the DB
  level, not the service level. Compromise of a DB user = compromise
  across services.

**Fix urgency:** medium-high. Should be a deliberate decision: either
(a) keep cross-DB access but document it formally so geocodes team
sees consumers before changing schema, or (b) wrap each cross-DB
table in an HTTP endpoint and migrate consumers. (a) is faster,
maintains current performance.

### 2.4 Schema documentation drift (`db-schema.mdc` is misleading)

Source: queries §71.

queries' iter-7 audit found:

- 30+ NEW columns in `companies` table not in `db-schema.mdc` (fiscal
  identity, credit terms, operational tracking, localization, physical
  address, social media, rep FKs).
- `users.image_profile` and `users.image_background` have **default
  values that look swapped** — possibly a copy-paste error not yet
  fixed in production (queries §71.2, Q#42).
- `shops.checkout` is `double NOT NULL` in live DB, but documented as
  `int` in `db-schema.mdc` (queries §71.5, Q#43).
- `user_companies.invitation_status` enum has **5 states** in
  production (sent, accepted, rejected, revoked, expired) but only
  `accepted` is documented in `auth.middleware.js` (queries §71.7,
  Q#45).

**Why it's a systemic issue:**

- `db-schema.mdc` is loaded into Cursor IDE's code-completion
  context. Stale docs ⇒ developers write code against the wrong
  schema ⇒ bugs at runtime.
- 4 of those columns are FKs (kam, salesman, ecartpay_rep, …) that
  the service likely needs to JOIN on — silent stale code paths.

**Fix urgency:** medium. Process question more than code question.
Either (a) regenerate `db-schema.mdc` automatically from `INFORMATION_SCHEMA`
periodically, or (b) drop it as a source of truth.

### 2.5 Webhook delivery security pattern uneven across services

Source: queries §56, §61 + carriers §16.1 (webhook test endpoint).

**State of the art (queries):** verified during iter-5:

- HMAC-SHA256 hex via `util/crypto.utils.js:43-46` ✅
- 8-second timeout + 8 retries + exponential backoff per
  `config/webhooks.js`
- Bird-stalling pattern: open after 20 failures, silence 60s
- Headers: 5 envia-specific signing headers (queries §61)

**State elsewhere:**

- **carriers** has `/ship/webhooktest` endpoint (carriers §2.1) but
  the production webhook flow is via queries (carriers calls queries
  for notifications). Carriers itself doesn't sign outbound
  webhooks — but it DOES validate inbound webhooks from carrier APIs
  (token-based). Pattern not yet audited cross-service.
- **geocodes** doesn't have webhooks (it's a callee, not a caller).
- **MCP** doesn't sign or verify webhooks.

**Why it matters:** queries' webhook is the customer-facing webhook
(shipment status updates, COD payment events). Customers verify the
signature. carriers' inbound webhook validation (carrier APIs sending
tracking updates) is a different story but also security-relevant.

**Fix urgency:** medium. The queries-side is solid; the cross-service
audit hasn't surfaced gaps but the question "is every cross-service
webhook signed?" needs an explicit answer.

## 3. Cross-cutting patterns (11 themes)

### 3.1 Auth model heterogeneity

Three services, three patterns:

| Service | Inbound auth | Pattern source |
|---------|--------------|----------------|
| carriers | JWT or DB token (3 type_ids) | carriers §3.1-3.4 |
| queries | 8 strategies; same 3 type_ids; constant-time comparison for cron/stp tokens (queries §3.4) | queries §3 |
| geocodes | All 48 endpoints `auth: false` (geocodes §15.1) | network isolation |

**Cross-service signal:** queries explicitly notes that "carriers'
`Guard.php` accepts the same three values (carriers §3.3) — confirms
cross-service token compatibility" (queries §3.2). So 2 of 3 services
share the auth substrate; geocodes is the outlier.

**Recommendation:** geocodes should adopt at minimum a shared-secret
header (e.g., `X-Internal-Secret`) so internal callers are
distinguished from world traffic. Cost: ~2 hours for geocodes + ~1
hour to update each consumer (carriers, queries, MCP).

### 3.2 Cache-aside with TTL=0 + public `/flush`

Source: geocodes §5.2, §16.2 + queries Redlock pattern at §5.1.

geocodes uses TTL=0 (persistent) for list-style endpoints (states,
localities). Only `POST /flush` (unauthenticated, geocodes §16.2)
clears the cache. Implications:

- Adding a new state/city in production requires either dyno restart
  or a manual `/flush` call.
- The `/flush` endpoint is public — anyone can cause a cross-service
  cache stampede (carriers + queries + MCP all hit cold cache
  simultaneously).

queries by contrast uses Redlock with explicit TTLs (e.g., 120s for
shipment notifications, queries §5.1) — different problem space, but
shows the team knows how to use Redis correctly.

**Recommendation:** auth-protect `/flush`, replace TTL=0 with
time-based TTLs (e.g., 24h for list catalogs that change rarely).

### 3.3 Test coverage gradient

| Service | Tests |
|---------|-------|
| carriers | `tests/Unit/` + 5 system test directories | per `CLAUDE.md` |
| queries | Coverage uneven; some processors tested, many gaps | per audit |
| geocodes | **0 tests** (`echo "Error: no test specified"` in `package.json`) | geocodes §16.6 |

**Implication:** geocodes is the lowest-tested service AND the
service with confirmed SQL injection sites. Refactoring (e.g.,
parameterizing the 2 SQL sites) without a test suite is high-risk.

**Recommendation:** before fixing the SQL injection sites in
geocodes, add a minimal Vitest suite (~2-4 hours) covering the
specific endpoints being modified. Without this, the fix risks
regressing CTT/Redservi coverage.

### 3.4 Observability stack heterogeneity

| Service | Stack |
|---------|-------|
| carriers | Sentry + New Relic + Datadog APM (carriers §4.3, §16.7) |
| queries | Datadog dd-trace 5.86 auto-instrumentation (queries §4.1) |
| geocodes | New Relic 12.15.0, conditional non-prod only (geocodes §1) |

**Cross-service implication:**

- An incident touching all three services (e.g., a slow MySQL query
  cascading from geocodes to carriers to queries) requires correlating
  traces across 3 different vendors.
- queries → carriers calls (queries §23) carry no shared trace ID.

**Recommendation:** standardize on Datadog (queries already there,
carriers already partial) and adopt a single trace propagation
header. Migrating geocodes from New Relic-conditional to dd-trace
is ~4-6 hours.

### 3.5 External API integration patterns vary

queries integrates with the most third parties:

| Provider | What for | Auth | Failure handling |
|----------|----------|------|------------------|
| Mailgun | Email | API key | (queries §5.1) |
| Infobip | SMS | Basic auth (`INFOBIP_AUTH` base64) | (queries §5.1) |
| Facebook WhatsApp | WhatsApp native | Bearer token | (queries §5.1) |
| RespondIO | WhatsApp BSP | Bearer | (queries §5.1) |
| OpenAI | Chat / Whisper / Assistants | API key + hardcoded org/project | 15s timeout (queries §15) |
| VIACEP (geocodes) | BR postal fallback | Public, unauth | Fire-and-forget INSERT, no validation (geocodes §14.1) |

**Cross-cutting issues:**

- No unified retry/timeout policy. queries uses axios-retry 3× @
  1500ms for ecart-payment (queries §25.1); 8-retries exponential
  backoff for webhook delivery (queries §5.6); no documented policy
  for OpenAI.
- No circuit breaker on any third-party call (carriers §16.6 hints
  at the same gap).
- VIACEP responses are inserted into `geocode_info` **without
  validation or source flagging** (geocodes §23) — poisoned rows
  affect all downstream consumers (carriers, queries, MCP).

**Recommendation:** introduce a shared `httpClient` library with
default timeouts, retry policy, and circuit breaker. ~1 day of work,
consolidates ~10 ad-hoc integrations.

### 3.6 Failure handling gaps (timeouts, retries, circuit breakers)

Documented per service:

- carriers §16.6 explicitly states "Currently: NO circuit breaker
  exists. This is documented technical debt."
- queries has retry on specific paths (webhooks, ecart-payment) but
  no breaker.
- geocodes has no retry policy; failed VIACEP calls are silently
  swallowed.

**Cross-service signal:** the recommended timeouts in carriers §16.6
(carrier API rate 10-15s, generate 30s, track 15s, TMS 5s, geocodes
5s, Redis 1s) are not enforced via a shared library — each service
may use different defaults.

**Recommendation:** adopt a shared HTTP client with the carriers
§16.6 timeout matrix as default, plus a circuit-breaker library
(e.g., opossum for Node, a simple counter-based one for PHP).

### 3.7 Code-injected business rules (silent surcharges)

Source: carriers §22.

Carriers code injects services that don't appear in the catalog
endpoint:

- Delhivery: 6 services (`owner_risk`, `green_tax`, `oda`,
  `state_charge`, `extended_zone`, `reverse_pickup`)
- BlueDart: 4 services (`owner_risk`, `reverse_pickup`,
  `state_charge`, `green_tax`)
- Most MX carriers: `cross_border` (when origin ≠ destination
  country)

**Cross-cutting implication for queries:** when queries surfaces a
shipment's expected charges (e.g., in the dashboard or notification),
it shouldn't trust ONLY the catalog endpoint — code-injected
services would be missing. queries §15 (AI shipping module) likely
needs awareness of this.

**Cross-cutting implication for MCP:** answering "what charges will
I see?" requires knowing the carrier-route combination triggers code
injection. The carriers cookbook §53.8 covers this; MCP system prompt
should encode the rule.

### 3.8 Schema drift register (see §5)

See §5 below for the full register. Three confirmed drifts:

1. `companies` table — 30+ new columns not in `db-schema.mdc`
   (queries §71.1).
2. `users` table — image_profile / image_background defaults swapped
   (queries §71.2).
3. `shops.checkout` — type drifted from int to double (queries
   §71.5).

### 3.9 Multi-version API endpoints (legacy + current)

queries has V1-V4 orders APIs running in parallel (queries §6). carriers
has V1-V2-V3 ship endpoints (carriers §2.2). Each version has its
own auth model and response shape.

**Cross-cutting implication:** the MCP must pick the right version per
tool. queries §6 documents that V4 is canonical for orders. carriers
§2.2 says V1 returns raw responses, V2/V3 normalize.

**Recommendation:** for each multi-version endpoint, document which
version is canonical going forward and which are deprecated. Bake
the answer into the MCP routing reference (`BACKEND_ROUTING_REFERENCE.md`).

### 3.10 Deprecated dependencies

geocodes flagged (geocodes §16.6):

- Axios 0.23.0 (current 1.7+, known vulnerabilities)
- Heroku stack `heroku-18` (EOL)

Other services not directly audited for deprecation in the
references — should be done.

**Recommendation:** add a quarterly dependency audit to the audit
suite. Could be a verification-script-style check
(`scripts/verify-dependencies.sh`).

### 3.11 Deployment platform single point of failure

All services are on Heroku (per envia-repos `CLAUDE.md` system
overview). Implications:

- Heroku platform incident = all services down.
- Heroku-18 stack EOL forces migration coordinated across all
  services.
- Heroku private spaces are the security perimeter (geocodes relies
  on this completely, §15.1).

**Recommendation:** containerize critical services (start with
geocodes since it's smallest) so platform migration is at least
optional. Long-term, multi-region resilience.

## 4. Integration map (who calls whom)

This is the canonical inter-service graph as of 2026-04-26, derived
from carriers §16, queries §23-§32, geocodes §2.

```
                ┌─────────────────────────────────────┐
                │   MCP (envia-mcp-server, portal)    │
                │  72 tools across 4 backends         │
                └──────┬──────────┬──────────┬────────┘
                       │          │          │
                       ▼          ▼          ▼
       ┌──────────────────┐ ┌─────────┐ ┌──────────┐
       │     carriers     │ │ queries │ │ geocodes │
       │  (Lumen / PHP)   │ │  (Hapi) │ │  (Hapi)  │
       └────┬─────────┬───┘ └────┬────┘ └────┬─────┘
            │         │          │           │
            │ HTTP    │ DB::     │ HTTP       │
            ▼         │ connect  ▼            │
       ┌────────┐     │     ┌────────┐        │
       │  TMS   │     ▼     │  TMS   │        │
       └────────┘  ┌──────┐ └────────┘        │
                   │geocod│                    │
                   │  DB  │ ◄──────────────────┘
                   └──────┘    (geocodes is
                                its own service +
                                its own DB schema
                                accessed by both
                                carriers and queries)
```

**Auth + failure-handling per edge:**

| From | To | Mechanism | Auth | Timeout | Retry | Failure mode |
|------|-----|-----------|------|---------|-------|--------------|
| MCP | carriers | HTTP `POST /ship/*` | JWT | 10-30s per action (carriers §16) | None | Tool returns error |
| MCP | queries | HTTP routes | bearer | varies | None | Tool returns error |
| MCP | geocodes | HTTP `POST /location-requirements`, `GET /locate/*`, `GET /brazil/icms/*` | none (public) | varies | None | Tool returns error |
| carriers | TMS | HTTP `/apply, /rollback, /payment-cod, /chargeback-cod, /cancellation, /return-to-origin, /pickup-cancellation, /token, /check` (carriers §16.1) | TMS-specific JWT, 30s exp | 5s | None documented | Generate fails before charge if `/check` fails |
| carriers | geocodes (HTTP) | `/postal-code/{country}/{code}` | none | 5s | None | Coverage validation skipped, warning logged |
| carriers | geocodes (DB) | `DB::connection('geocodes')` direct SQL | MySQL creds | DB-level | None | Throws if connection fails |
| carriers | queries | HTTP `/notification` (notification endpoint) | internal API key | 5s | None | Notification not sent |
| carriers | sockets | HTTP `/emit` | internal API key | 5s | None | Real-time UI stale |
| carriers | S3 | PUT/GET (label storage) | AWS keys | varies | None | Label can't be retrieved |
| queries | carriers | HTTP `/ship/rate, /ship/generate` (queries §23) | bearer user JWT | None | None | Draft action fails |
| queries | carriers (MCP client) | `services/carriers-mcp-client.js` (queries §23.2) | (configured) | 30s | None | Tool fails |
| queries | TMS | `/token, /apply` (queries §24) | bearer custom TMS token | None | None | Charge skipped |
| queries | ecart-payment | `/api/tokens, /api/orders, /api/customers, /api/chargebacks` (queries §25) | bearer cached in Redis | varies | 3× @ 1500ms | Order/payment unprocessed |
| queries | ecart-API | `/api/v2/store, /api/v2/services/carriers` (queries §26) | bearer shop API key | None | None | Shop config out of sync |
| queries | sockets | Bull queue `notifications` (queries §27) | Redis-backed | n/a | n/a | Real-time UI stale |
| queries | OpenAI | Chat/Whisper/Assistants Beta (queries §15.7) | API key | 15s | None | AI tool fails |
| queries | Mailgun | Email API (queries §5.1) | API key | varies | varies | Email not sent |
| queries | Infobip | `/sms/2/text/advanced` (queries §5.1) | Basic auth base64 | varies | varies | SMS not sent |
| queries | Facebook WhatsApp | `/{phone}/messages` (queries §5.1) | Bearer | varies | varies | WhatsApp not sent |
| queries | RespondIO | `/contact/create_or_update/email:{email}` (queries §5.1) | Bearer | varies | varies | WhatsApp BSP not sent |
| queries | Accounts | `POST {ACCOUNTS_HOSTNAME}/api/notifications` (queries §5.1) | Bearer, refresh on 401 | varies | varies | Push notification not sent |
| geocodes | queries | `GET /state/{cc}/{state_code}` (geocodes §15) | none | varies | None | State resolution fails |
| geocodes | VIACEP | `GET /ws/{cep}/json` (geocodes §14.1) | none (public, free) | None documented | None | Silent fallback to NULL fields, may insert bad data |

**Observations:**

1. **TMS is reached by both carriers and queries** with different auth
   tokens — confirms the "TMS owns money flow" architecture (carriers
   §16.1).
2. **No service has a circuit breaker** (carriers §16.6).
3. **geocodes is the only HTTP-public service** in the suite (no auth
   on inbound) — security risk amplified by inbound SQL injection
   (§2.1).
4. **VIACEP fallback is fire-and-forget** with no validation (§3.5).
   Trust boundary not enforced.

## 5. Schema drift register

Confirmed at audit time. Each entry is a place where production DB
state diverges from documentation or expected state.

| # | Where | Drift | Reference | Severity |
|--:|-------|-------|-----------|----------|
| 1 | `companies` table | 30+ new columns (fiscal_name, accounts_id, industry, company_type, credit_line_days_front, credit_days, credit_created_at, inhouse_ltl, pod_id, legacy_tracking_page, language, timezone, date_format, 6 address columns, 4 social media, 6 rep FKs) NOT in `db-schema.mdc` | queries §71.1 | High |
| 2 | `users` table | `image_profile` and `image_background` defaults appear SWAPPED (probable copy-paste error in production) | queries §71.2, Q#42 | Low (cosmetic but real) |
| 3 | `shops.checkout` | type is `double NOT NULL` in live DB; documented as `int` | queries §71.5, Q#43 | Medium (downstream casts may misbehave) |
| 4 | `user_companies.invitation_status` enum | 5 production states (sent, accepted, rejected, revoked, expired); only `accepted` documented in `auth.middleware.js` | queries §71.7, Q#45 | Medium |
| 5 | `access_tokens.type_id=8` | 1,625 rows in sandbox; no documented auth handler | queries Q#41 | Medium-high (security) |
| 6 | `1_prod_carriers.csv` Estafeta row | `allows_mps=0` in DB; `Estafeta.php:39` overrides to 1 at runtime (technical debt — DB row should be updated) | carriers §52.5 S1 | Low |
| 7 | `geocode_info` BR rows | VIACEP-imported rows have hardcoded `timezone='America/Sao_Paulo'` (wrong for 5 states); `iso2='BR-<full state name>'` instead of `BR-SP` | geocodes §23 | Medium (downstream queries miss rows) |
| 8 | `db-schema.mdc` | Stale reference loaded into Cursor IDE — actively misleading developers writing new code | queries §76.2 | High (process issue) |
| 9 | `additional_service_prices.mandatory=1` | Zero rows for addon_id=14 (insurance LTL) or 52 (regulatory parcel insurance). Regulatory enforcement for BR/CO domestic must therefore live in carrier code or geocodes — NOT in DB flag | carriers §10.3 D5 | Documentation drift (claim vs reality) |

## 6. Recommendations to the backend team (ranked by ROI)

Each recommendation: action, why, effort, blast radius.

### 6.1 Parameterize the 2 SQL injection sites in geocodes (CRITICAL)

- **Action:** convert `${var}` interpolations to `?` placeholders;
  remove `multipleStatements: true` flag from `config/database.js`
  unless a real use case exists.
- **Why:** confirmed RCE-via-SQL surface. Geocodes is publicly
  reachable. Carriers reads from the same DB.
- **Effort:** 1-2 hours (code) + 4 hours (test scaffold, since
  geocodes has zero tests).
- **Blast radius:** geocodes only. No downstream changes.

### 6.2 Add a shared internal-secret header to geocodes

- **Action:** require `X-Internal-Secret: <env-stored>` header on all
  routes. Update carriers, queries, MCP to send it.
- **Why:** geocodes routes are auth-less; rely on Heroku private
  space. A misconfigured space exposes everything. Defense in depth.
- **Effort:** 2 hours geocodes + 1 hour each consumer = ~5 hours total.
- **Blast radius:** all 4 services need a coordinated deploy.

### 6.3 Auth-protect `/flush` endpoint in geocodes

- **Action:** behind `X-Internal-Secret` (per 6.2) or remove entirely
  if redis cache TTL is converted to time-based.
- **Why:** anyone can wipe geocodes cache → cross-service stampede.
- **Effort:** 30 min (code) + decision on TTL strategy.
- **Blast radius:** geocodes only.

### 6.4 Regenerate or retire `db-schema.mdc`

- **Action:** automate generation from `INFORMATION_SCHEMA` (e.g.,
  weekly cron writing to a `_meta/db-schema-current.md` artifact),
  OR mark `db-schema.mdc` as deprecated and remove from Cursor IDE
  context.
- **Why:** stale doc loaded into every developer's IDE actively
  misleads new code.
- **Effort:** 2-4 hours for the cron-regenerator.
- **Blast radius:** developer workflow only; no runtime impact.

### 6.5 Consolidate country rules into a single source

- **Action:** decision-gate item. Two paths:
  - (a) MCP delegates 100% to geocodes for postal-code normalization
    + EU exceptional territories. Remove local replication. (~4
    hours)
  - (b) Build a shared country-rules library (Node + PHP packages)
    and update all 4 codebases to consume it. (~3 weeks)
- **Why:** drift between geocodes / queries `generic_forms` / carriers
  per-controller / MCP local copy is guaranteed to keep happening.
- **Recommendation:** start with (a). Defer (b) until a real cross-
  service country expansion is on the roadmap.

### 6.6 Document cross-DB access (carriers ↔ geocodes)

- **Action:** add a `_meta/CROSS_DB_ACCESS_REGISTRY.md` listing every
  table accessed via `DB::connection('geocodes')` (carriers) and
  every `geocodes.X` cross-schema query (queries).
- **Why:** hidden coupling. geocodes team needs to see consumers
  before changing schema.
- **Effort:** 2-3 hours by the audit team (already partially done in
  geocodes §2 + queries §32).
- **Blast radius:** documentation only.

### 6.7 Adopt a shared HTTP client with circuit breaker

- **Action:** standardize on a shared `httpClient` per language
  (Node + PHP) with default timeouts (per carriers §16.6), retry
  policy, circuit breaker.
- **Why:** failure handling is currently inconsistent across services
  and across third-party integrations.
- **Effort:** ~1 week for the library + ~3 days per consumer to
  migrate.
- **Blast radius:** large. Phased rollout recommended (queries first
  — most third-party touchpoints).

### 6.8 Add minimum test coverage to geocodes (Vitest)

- **Action:** before ANY refactor in geocodes, add a Vitest suite
  covering the 5 critical endpoints (postal lookup, locate,
  brazil/icms, paquetexpress coverage, redservi coverage).
- **Why:** zero tests + confirmed bugs (CTT silent column-alias
  failure, `/locality` cache-key bug) = high regression risk on any
  fix.
- **Effort:** 4-8 hours initial + ongoing maintenance.
- **Blast radius:** geocodes only; paves the way for safe SQL-injection
  fix.

### 6.9 Verify type_id=8 access tokens

- **Action:** SQL query backend can run:
  ```sql
  SELECT user_id, company_id, valid_until, access_ecommerce, COUNT(*)
  FROM access_tokens
  WHERE type_id = 8
  GROUP BY user_id, company_id, valid_until, access_ecommerce
  LIMIT 50;
  ```
  Plus: search code for `type_id = 8` to find any consumer.
- **Why:** 1,625 rows exist in sandbox; no documented auth handler.
  Either a security gap or undocumented feature flag.
- **Effort:** 30 min query + 1 hour code search.
- **Blast radius:** investigation only.

### 6.10 Investigate `Util.searchCep` VIACEP iso2 format

- **Action:** decide whether VIACEP-imported BR rows should be flagged
  with a `source='viacep'` column (or migrated to authoritative
  `iso2='BR-SP'` format).
- **Why:** queries assuming `iso2='BR-SP'` will miss VIACEP rows;
  silent inconsistency.
- **Effort:** 1 hour decision + 2-4 hours code change + migration.
- **Blast radius:** geocodes + carriers.

## 7. Roadmap — remaining 3 reference docs

These need deep references to complete the audit suite. Estimated
effort per `AUDIT_PROMPTS_INDEX.md`:

| # | Project | Estimated effort | Blockers |
|---|---------|-----------------|----------|
| 4 | ecommerce + eshops + ecartApiOauth | 3-4 hours | None — prompt ready |
| 5 | admin-monorepo | 3-4 hours | None — prompt ready |
| 6 | accounts | 2-3 hours + sensitivity analysis section | Sensitivity-special; mandatory recommendation to Jose per prompt |

**Total remaining effort:** ~10-12 hours of Opus 4.7 (1M) sessions,
distributed.

After all 6 docs land, this transversal analysis should be
re-validated and extended:

- Add ecommerce / admin / accounts columns to §1.
- Re-rank §2 risks (may add e.g., admin CSRF or accounts cookie
  hardening as new risk).
- Extend §4 integration map with admin + accounts.
- Add new schema drifts to §5 if discovered.
- Update §6 recommendations.

## 8. Honest assessment

- **What this doc surfaces well:** the systemic patterns (auth
  heterogeneity, cross-DB access, schema drift, country rule
  duplication) that no single service doc could surface. Direct value
  to backend team for prioritization.
- **What this doc cannot do:** decide product priorities. The
  recommendations are ranked by engineering ROI; product/business
  context (which expansion is next, which incidents are top of mind)
  may reorder them.
- **Coverage on the 3 audited services:** good. Carriers + queries +
  geocodes have enough depth that cross-cutting patterns are
  empirically grounded, not speculation.
- **Coverage gaps from un-audited services:** ecommerce, admin,
  accounts. There may be systemic patterns we don't see yet (e.g.,
  admin CSRF, accounts cookie hardening). The roadmap §7 closes this.

Next session that picks this up should: (a) read this doc, (b)
prioritize 6.1-6.4 (the security + correctness fixes), (c) draft
backend team brief for the 33+ open questions consolidated from all
3 service docs.
