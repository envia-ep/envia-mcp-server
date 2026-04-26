# Geocodes Service — Deep Reference

> **Purpose:** Single transferable knowledge document about the
> `services/geocodes` Node.js / Hapi backend. Built for any future
> session (Claude or human) that needs to operate, integrate, or
> extend this service without re-discovering its architecture and
> business rules.
>
> **Source of truth:**
> - `services/geocodes/` repo (commit head as of 2026-04-26)
> - `services/carriers/knowledge-base/queries/g*.csv` — DB schema and
>   row-count snapshots from production geocodes (canonical reference;
>   geocodes itself does not ship per-table docs).
> - `_meta/analysis-geocodes.md` — prior audit (referenced for line
>   drift cross-checks).
> - `_docs/backend-reality-check/geocodes-findings.md` — Session A
>   reality-check (referenced for prior MCP-gap analysis).
> - `_docs/COUNTRY_RULES_REFERENCE.md` — MCP's local replication of
>   country rules (cross-referenced in §17 drift report).
>
> **Verification policy:** every quantitative claim cites
> `path:line` or `csv:row N`. When inferring, this doc says
> "inferred" explicitly. Drift between prior docs and current source
> is called out (see §15 cross-check pass).
>
> **Iteration:** v1 of this doc. Sections marked 🟡 are partial; ⚪
> are still pending material that must be added in future iterations.

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Routes & endpoints](#2-routes--endpoints)
3. [Authentication & middleware](#3-authentication--middleware)
4. [Database connection pool](#4-database-connection-pool)
5. [Redis cache layer](#5-redis-cache-layer)
6. [`/zipcode` — postal-code lookup (canonical)](#6-zipcode--postal-code-lookup)
7. [`/location-requirements` — tax/BOL decision engine](#7-location-requirements--taxbol-decision-engine)
8. [Locality / locate / suburb hierarchy](#8-locality--locate--suburb-hierarchy)
9. [DANE Colombia flow](#9-dane-colombia-flow)
10. [Brazil ICMS endpoint](#10-brazil-icms-endpoint)
11. [Coordinates & distance endpoints](#11-coordinates--distance)
12. [Coverage tables (per carrier, per country)](#12-coverage-tables)
13. [Extended zones (master table)](#13-extended-zones-master-table)
14. [External integrations (VIACEP, queries, ecart-api)](#14-external-integrations)
15. [Cross-check pass — drift from prior docs](#15-cross-check-pass)
16. [Security findings](#16-security-findings)
17. [MCP coverage gap analysis](#17-mcp-coverage-gap-analysis)
18. [Open questions for backend team](#18-open-questions)
19. [References](#19-references)

---

## 1. Architecture overview

### 1.1 Stack

- **Runtime:** Node.js 18.x.x, npm 10.x.x. Confirmed in `services/geocodes/package.json` `engines`.
- **Framework:** `@hapi/hapi` `^21.3.2` (`package.json`).
- **Auth plugin:** `hapi-auth-bearer-token` `^8.0.0` — strategy is registered as `token_user` and set as default (`server.js:38-40`), but **every route overrides with `auth: false`**. The strategy is effectively unused; see §3.
- **Cache plugin:** `hapi-redis2` `^3.0.1` decorating the request with `request.redis.client` (`server.js:44-49`).
- **Database driver:** `mysql2` `^3.14.3`, raw SQL via `Db.query` / `Db.execute` (no ORM).
- **Validation:** `joi` `^17.13.3` extended with `@hapi/joi-date`. All routes Joi-validate params/payload/query.
- **HTTP client:** `axios` `^0.23.0` (outdated; current is 1.7+).
- **Logging:** `laabr` `^6.1.3` (Pino-based). Pino enabled only when `NODE_ENV === 'development'` (`server.js:55`).
- **APM:** New Relic `^12.15.0`. Loaded conditionally — only when `NODE_ENV` is NOT in `['development','localhost']` (`server.js:5-7`).
- **Distance helper:** `haversine-distance` `^1.2.3` (consumed by `getDistanceOriginDestination`, see §11).
- **External fallback:** `axios.get(${VIACEP_API_HOSTNAME}/ws/{cep}/json)` — Brazil postal code fallback (see §14.1).

### 1.2 File inventory (verified)

```
services/geocodes/
├── server.js                          (90 lines)
├── package.json
├── Procfile
├── app.json
├── newrelic.js
├── eslint.config.mjs
├── sonar-project.properties
├── authorization/
│   └── strategies.js                  (1458 bytes, ~43 lines)
├── config/
│   └── database.js                    (631 bytes, 23 lines)
├── controllers/
│   ├── files.js                       (25 lines)
│   └── web.js                         (2,349 lines — the god file)
├── libraries/
│   ├── counterUtil.js                 (147 lines)
│   ├── postcode-with-dash.json        (config: 6 countries)
│   ├── redisUtil.js                   (69 lines)
│   └── util.js                        (291 lines — VIACEP integration)
├── middlewares/
│   ├── store.middleware.js            (52 lines — appears unused)
│   ├── web.middleware.js              (135 lines — fixZipcode/cleanLocateQuery/getState)
│   └── webhook.middleware.js          (23 lines — appears unused)
├── resources/
│   └── zipcodes/                      (empty — file cache directory, .gitkeep only)
└── routes/
    └── web.js                         (723 lines — 48 routes)
```

**Total:** 13 `.js` files, 3,091 lines of JS code (counted via `wc -l`).

### 1.3 Request flow (canonical)

```
HTTP Request
  → server.ext('onPreHandler') → blocks *.herokuapp.com hosts in production (server.js:67-72)
  → Joi validation per route (params/payload/query)
  → Pre-handler middlewares (where applicable):
      · fixZipcode (web.middleware.js:53-89)
      · cleanLocateQuery (web.middleware.js:91-117)
      · getState (web.middleware.js:10-51) — calls ENVIA_QUERIES_HOSTNAME
  → Controller method (controllers/web.js)
      · Optional Redis lookup via RedisUtil.remember
      · Optional VIACEP fallback (Brazil postal codes only)
      · MySQL query via Db.query / Db.execute
  → Response (JSON body or Boom.badData)
```

`server.js` is 90 lines. `routes/web.js` is auto-loaded via `glob.sync('./routes/*.js')` at startup (`server.js:61-66`).

### 1.4 Critical operational note — production-only

**Geocodes has NO sandbox environment.** All callers (carriers PHP backend, the MCP, queries) hit the production host `https://geocodes.envia.com` regardless of their own environment. Documented in MCP `_docs/BACKEND_ROUTING_REFERENCE.md` line 113.

Implications:
- Curl-based verification against test is impossible.
- Any DB mutation (e.g., `/zipcode/BR/...` triggering VIACEP fallback that INSERTs into `geocode_info`) hits live data.
- Cache invalidation via `POST /flush` (see §16.2) affects every consumer simultaneously.

## 2. Routes & endpoints

### 2.1 Inventory

`routes/web.js` declares **48 routes** (verified via `grep -c "method: '" services/geocodes/routes/web.js` → 48; equivalent path-count → 48). Every route has `auth: false`. **Drift note:** prior `_docs/backend-reality-check/geocodes-findings.md` claimed 52 routes; actual count is 48. The "extra 4" likely came from miscounting routes that share a handler chain (`/seur/identify/...` has a single registration).

Grouped by domain:

#### 2.1.1 Postal / locality lookup (9 routes)

| Method | Path | Handler | Pre-handlers |
|--------|------|---------|--------------|
| GET | `/zipcode/{country_code}/{zip_code}` | `queryZipCode` | `fixZipcode` |
| GET | `/locality/{country_code}/{locality}` | `queryLocality` | — |
| GET | `/locate/{country_code}/{locate}` | `queryLocate` | `cleanLocateQuery` |
| GET | `/locate/{country_code}/{state_code}/{locate}` | `queryLocateV2` | `cleanLocateQuery`, `getState` |
| GET | `/list/states/{country_code}` | `queryStates` | — |
| GET | `/list/localities/{country_code}/{state_code}` | `queryLocalities` | — |
| GET | `/list/suburbs/{country_code}/{state}/{locality}` | `querySubUrbs` | — |
| GET | `/list/levels/{country_code}/{level}` | `queryLevels` | — |
| GET | `/list/zipcode/{country_code}` | `queryListZipCodeByCountryCode` | — |

#### 2.1.2 Coverage — India (8 routes)

| Method | Path | Handler | Backing table |
|--------|------|---------|---------------|
| GET | `/ecomexpress/pincode/{pincode}` | `queryPinCodeEcom` | (ecomexpress pincode table) |
| GET | `/delhivery/{origin}/{destination}` | `queryPinCodeDelhivery` | `pincodes_delhivery_coverage` |
| GET | `/delhivery/zone/{origin}/{destination}` | `queryZoneDelhivery` | `zones_india_b2b`, `pincodes_delhivery` |
| GET | `/delhivery/info/{zipcode}` | `queryPincodeDataDelhivery` | `pincodes_delhivery` |
| GET | `/xpressbees/pincode/{pincode}` | `queryPinCodeXpressBees` | `xpressbees_coverage` (3,407 rows; g6:row 18) |
| GET | `/bluedart/pincode/{pincode}` | `queryPinCodeBluedart` | `bluedart_coverage` (12,558 rows; g6:row 3) |
| GET | `/ekart/pincode/{pincode}` | `queryPincodeEkart` | (ekart pincode table) |
| GET | `/dtdc/pincode/{pincode}/{product_code}` | `queryPinCodeDtdc` | (dtdc pincode table) |
| GET | `/gati/pincode/{pincode}` | `queryPinCodeGati` | (gati pincode table) |

#### 2.1.3 Coverage — LATAM (12 routes)

| Method | Path | Handler | Country |
|--------|------|---------|---------|
| GET | `/transaher/{origin}/{destination}` | `queryTransaherZone` | CO |
| GET | `/deprisa/{service_code}/{origin_dane_code}/{destination_dane_code}` | `queryDeprisaCoverage` | CO |
| GET | `/deprisa/centers/{origin_dane_code}` | `queryDeprisaCenters` | CO |
| GET | `/deprisa/address/{dane_code}/{direction}` | `queryDeprisaAddressInfo` | CO |
| GET | `/deprisa/coverage/{dane_code}` | `queryDeprisaCoverageV2` | CO |
| GET | `/redservice_coverage/{origin_dane_code}/{destination_dane_code}` | `queryRedserviCoverage` | CO ⚠️ SQL inj |
| GET | `/andreani/{origin_zipcode}/{destination_zipcode}` | `queryAndreaniCoverage` | AR |
| GET | `/correo-argentino/sameday/{origin}/{destination}` | `queryCorreoArgSameday` | AR |
| GET | `/buslog/{state_code_2digits}/{postal_code}` | `queryBuslogCoverageService` | BR |
| GET | `/buslog/{postal_code}` | `queryBuslogCoverage` | BR |
| GET | `/loggi/{postal_code}/{state}/{type}/{serviceId}` | `queryLoggiCoverage` | BR (`loggi_coverage` 31,391 rows; g6:row 10) |
| GET | `/shippify/{postal_code}/{state}` | `queryShippifyCoverage` | BR |
| GET | `/forza/header-code/{state}/{city}` | `queryForzaLocalities` | BR |
| GET | `/ivoy/{origin}/{destination}` | `queryIvoyCoverage` | MX |
| POST | `/fazt/coverage` | `queryFaztCoverage` | CL |

#### 2.1.4 Coverage — Europe (5 routes)

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/dhl/es/{postal_code}` | `queryPostalCodeDhlES` | ES; returns is_aduanable, is_aereo, zona |
| GET | `/correos/es/{postal_code}` | `queryPostalCodeCorreosES` | ES; backed by `postalcode_correos_es_coverage` (14,746 rows; g6:row 13) |
| GET | `/cex/{origin_province_code}/{destination_province_code}` | `queryCEXPeninsularPlus` | ES (`cex_peninsular_plus_coverage` 430 rows; g6:row 5) |
| GET | `/seur/identify/{country_code}/{zip_code}` | (chain: `queryZipCode` → `querySeurIdentifyInfo`) | ES |
| GET | `/seur/{origin_identify}/{destination_identify}` | `querySeurZone` | ES |
| GET | `/cttExpress/{origin_country_code}/{origin_iso_state}/{destination_country_code}/{destination_iso_state}` | `queryCttCoverage` | ES/PT 🔴 column-aliasing bug at line 2003 |

#### 2.1.5 Meta / catalog (5 routes)

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| POST | `/location-requirements` | `addressRequirements` | Tax / BOL / EU / GB / UK decision engine. **No DB call.** See §7. |
| GET | `/continent-country/{country_code}` | `queryContinentCountry` | Continent code lookup (DB table `continent_country`) |
| POST | `/additional_charges` | `queryAdditionalCharges` | Carrier surcharges by zipcode/state/city (table `catalog_carrier_charge_rules`) |
| GET | `/extended_zone/{carrier_name}/{country_code}/{zipcode}` | `queryExtendendZoneCarrierValidator` | Master extended-zone validator. 🔴 SQL inj. See §13, §16. |
| GET | `/coordinates/{country_code}` | `getCoordinates` | Lat/lon by postal/state+locality. Dynamic WHERE (parameterized values). |
| GET | `/distance/{country_code}/{origin_zip_code}/{destination_zip_code}` | `getDistanceOriginDestination` | Haversine distance. |
| GET | `/brazil/icms/{origin}/{destination}` | `queryBrazilIcms` | ICMS interstate tax % for Brazil. See §10. |

#### 2.1.6 Admin / utility (2 routes)

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| POST | `/flush` | `flushRedis` | 🔴 Public, no auth. `RedisUtil.flush(client)` calls `client.flushdb()`. See §16.2. |
| POST | `/usage-counter` | `usageCounter` | 🟡 No-op stub. Returns `true` unconditionally (line 1384-1386). Endpoint accepts a 4-field payload but does nothing with it. |

### 2.2 Public vs authenticated

**All 48 routes are public.** The default Hapi auth strategy `token_user` (registered at `server.js:39-40`) is overridden by `auth: false` on every route. This is documented behavior — geocodes is treated as an internal service trusted at the network level (Heroku private space, plus the `onPreHandler` heroku-host blocker at `server.js:67-72`).

## 3. Authentication & middleware

### 3.1 The `token_user` strategy (registered, but unused for routing)

**File:** `services/geocodes/authorization/strategies.js` (43 lines).

`token_user()` returns a Hapi bearer-token strategy that, on every request, runs:

```sql
SELECT
    u.id AS user_id,
    c.id AS company_id,
    u.status AS user_status,
    c.status AS company_status,
    u.role_id AS user_role,
    at.type_id AS token_type,
    at.valid_until AS token_valid_until
FROM access_tokens AS at
JOIN users AS u ON at.user_id = u.id
JOIN companies AS c ON u.company_id = c.id
WHERE at.type_id BETWEEN 1 AND 2 AND at.token = ? AND u.status = 1;
```

Type 1 tokens have a `valid_until` check; type 2 tokens are permanent. On success the strategy decorates the request with `auth.credentials`. On failure → `Boom.unauthorized('User token is invalid.')`.

Since every route has `auth: false`, this strategy never runs in production. Removing it would simplify the bootstrap; leaving it lets future routes opt in.

### 3.2 `fixZipcode` middleware

**File:** `services/geocodes/middlewares/web.middleware.js:53-89`.

Pre-handler for `GET /zipcode/{country_code}/{zip_code}` (only). Runs `validateDash` first (postcode-with-dash.json countries: BR, JP, PT, PL, AI, KY — see §6.3 for the full transform table) and then country-specific transformations. Returns the cleaned zipcode in `request.pre.zipcode`.

### 3.3 `cleanLocateQuery` middleware

**File:** `services/geocodes/middlewares/web.middleware.js:91-117`.

Pre-handler for the two `/locate/...` routes. Trims and lowercases the locate string; for some countries (BR, JP, PT) inserts dashes if numeric input lacks them. Special case: replaces `"CIUDAD DE GUATEMALA"` with `"Guatemala"` (line 93-96) to canonicalize an ambiguous Spanish form.

### 3.4 `getState` middleware

**File:** `services/geocodes/middlewares/web.middleware.js:10-51`.

Pre-handler for `/locate/{country_code}/{state_code}/{locate}`. Resolves a state code (e.g., `MX-DF`) to a richer object via two paths:

1. **Redis cache lookup** with key `state.{country_code}.{state_code}` — TTL `0` (persistent).
2. **Cache miss → HTTP call** to `${ENVIA_QUERIES_HOSTNAME}/state/{country_code}/{state_code}` (line 24). Response is consumed for `code_3_digits` and `code_2_digits`, and the result is stored in Redis with `TTL=0` (no expiration).

Returned object shape (line 28-44, inferred):

```js
{ iso3, iso2, code3, code2 }
```

**Risk:** if queries is unreachable AND there is no Redis hit, this middleware throws `Boom.badData()` (line 46) and the route fails. There is no in-process fallback. See §14.2.

### 3.5 `store.middleware.js` and `webhook.middleware.js` — appear unused

`store.middleware.js` (52 lines) defines `getStore`/`getStoreAdmin` and `webhook.middleware.js` (23 lines) defines `getWebhooksAdmin` calling `${ECART_API_HOSTNAME}/api/v2/webhooks`. Neither is referenced as a `pre` handler in `routes/web.js`. They are dead code (likely copied from another service). Documented for inventory completeness, NOT exposed.

## 4. Database connection pool

**File:** `services/geocodes/config/database.js:1-23`.

```js
let connectionString = process.env.DB_URI;          // mysql://user:pass@host/db
connectionString = connectionString.substring(8);   // strip "mysql://"
let [userAndPassw, hostAndDbw] = connectionString.split('@');
let [user, password] = userAndPassw.split(':');
let [host, database] = hostAndDbw.split('/');

const pool = mysql.createPool({
    connectionLimit: process.env.DB_POOL_SIZE,
    host, user, password, database,
    timezone: process.env.TZ,
    dateStrings: ['DATE', 'DATETIME', 'TIMESTAMP'],
    multipleStatements: true,    // 🔴 line 20 — see §16
});
```

Notable:
- `dateStrings` returns date columns as strings (line 19), not `Date` objects.
- **`multipleStatements: true` (line 20)** — amplifies the impact of any SQL injection (see §16.1). The current SQL injection sites (§16.1) write only `SELECT` statements, but the flag means an attacker who finds an injection point can chain `; INSERT ...; DELETE ...; --`.
- `connectionLimit` comes from `DB_POOL_SIZE` env var with no default (likely 10 if unset, mysql2 default).
- Connection-string parsing is fragile: `connectionString.substring(8)` assumes the prefix `mysql://` (8 chars). A different prefix (e.g., `mysql+ssl://`) would corrupt the parse silently.

**Cross-database access:** the carriers PHP backend has a separate `DB::connection('geocodes')` pool that points at the same MySQL instance. Same DB, different pool. This means:
- Schema migrations on geocodes DB affect carriers immediately.
- Queries from carriers (e.g., `paquetexpress_coverage` joins) bypass geocodes' HTTP layer entirely. No HTTP rate limit, no Redis cache benefit.
- **No mutual TLS or service auth between processes** beyond MySQL credentials.

## 5. Redis cache layer

### 5.1 `RedisUtil` API

**File:** `services/geocodes/libraries/redisUtil.js:1-69`.

Methods exposed (verified by reading the file):

| Method | Behavior |
|--------|----------|
| `remember(client, key, ttl, query, params, callback, method)` | Cache-aside: GET key → if miss, run SQL via `Db.query`/`Db.execute` (per `method`), apply `callback(result)`, SET with TTL (or `PERSIST` if `ttl===0`), return |
| `get(client, key)` | Raw GET, returns parsed JSON |
| `set(client, key, data, ttl)` | SET; if `ttl===0` calls `PERSIST` (no expiration), else `EXPIRE` |
| `delete(client, key)` | DEL |
| `flush(client)` | `client.flushdb()` — wipes the entire current Redis DB |

### 5.2 TTL conventions in handlers

| Endpoint | Key pattern | TTL (seconds) | Notes |
|----------|-------------|---------------|-------|
| `/zipcode/{cc}/{zip}` | (varies; see file cache in §6) | — | File cache primary; Redis seen but TTL not consistent ⚪ |
| `/locate/{cc}/{locate}` | `locate.{cc}.{locate}` | `LOCATE_EXPIRATION` env var or 21600 (6h) | |
| `/list/states/{cc}` | `states.{cc}` | 0 (persistent) | |
| State resolver (`getState`) | `state.{cc}.{state_code}` | 0 (persistent) | |
| `/list/zipcode/{cc}` | `list.all.zipcode.{cc}` | 0 (persistent) | |
| `/locate/{cc}/{state}/{locate}` | (call to RedisUtil.remember with TTL=0) | 0 | |
| `getCoordinates`, `getDistance` | inferred Redis | ⚪ (not yet read) | |

**Pattern observation:** most list/state endpoints set TTL=0, meaning the data persists in Redis until `POST /flush` is called or the key is explicitly deleted. There is no scheduled cache refresh.

### 5.3 The `/flush` route — public Redis wipe

**Routes:** `routes/web.js:134-140`.
**Handler:** `controllers/web.js:1013-1016`:

```js
flushRedis(request) {
    RedisUtil.flush(request.redis.client);
    return true;
}
```

`RedisUtil.flush` calls `client.flushdb()`. **Auth: false.** Anyone reachable to the geocodes hostname can wipe all cached state. Cross-service impact: every consumer (carriers PHP, MCP via `getAddressRequirements`/`resolveDaneCode`/`getBrazilIcms`, queries) experiences cache-stampede latency until keys are repopulated. See §16.2 for full risk analysis.

## 6. `/zipcode` — postal-code lookup

The most-consumed endpoint. Resolves a postal code to a geocoded record (latitude, longitude, country, region1-4, locality, suburb, timezone, etc.).

### 6.1 Query path (verified, controllers/web.js:18-156)

1. **`fixZipcode` middleware** runs first (web.middleware.js:53-89) — applies country-specific normalization (see §6.3).
2. **File cache check** (`controllers/files.js`) — looks for `resources/zipcodes/{country_code}-{zip_code}.json`. If present, returns it.
3. **Redis cache check** via `RedisUtil.remember` ⚪ — not fully traced in iter 1.
4. **DB query** (joined SELECT):
   ```sql
   SELECT * FROM geocode_info gi
   LEFT JOIN list_states ls ON gi.region1 = ls.name
   WHERE gi.postcode = ? AND gi.iso = ?
   ```
5. **Brazil-specific VIACEP fallback** (web.js:64-65, 71-74) — if BR and no row found, OR if BR and row found but `street IS NULL`, calls `Util.searchCep(...)` which queries the public VIACEP API and INSERTs the result into `geocode_info`. See §14.1.
6. **File cache write** — successful results are persisted to `resources/zipcodes/...` for next time. (The `resources/zipcodes/` directory in Git contains only `.gitkeep`; the actual cache is built up at runtime in the dyno's ephemeral filesystem.)

### 6.2 Response shape

The DB returns columns from `geocode_info` (postcode, iso, country, region1-4, locality, suburb, lat, lng, iso2, hasc, stat, timezone, utc, level, type) joined with `list_states` (iso_code, country_code, hasc, name, code_2digits, code_3digits). The handler returns the joined row directly. **No documented response schema** — consumers infer from sample responses.

### 6.3 Postal-code transformation rules (`fixZipcode` + `postcode-with-dash.json`)

`postcode-with-dash.json` is the config-driven part. It declares dash-insertion positions:

```json
{
    "BR": 5,   // 12345678 → 12345-678
    "JP": 3,   // 1234567 → 123-4567
    "PT": 4,   // 12345678 → 1234-567 (?) — verify position semantics ⚪
    "PL": 2,   // 12345 → 12-345
    "AI": 2,   // (Anguilla)
    "KY": 3    // (Cayman Islands)
}
```

**Drift caveat:** `validateDash`'s exact semantics for `position` (insert AFTER index N? insert AT index N?) and the AR exception (where `fixZipcode` strips non-digits but AR is not in the JSON) are documented inconsistently across code and config. The countries handled in `fixZipcode`'s body (CA, AR, SE, GR, TW, NL — ⚪ verify each via direct read in iter 2) are NOT reflected in the JSON, creating two sources of truth.

The `cleanLocateQuery` middleware (web.middleware.js:91-117) applies its own normalization for the locate path, including the `"CIUDAD DE GUATEMALA"` → `"Guatemala"` substitution.

## 7. `/location-requirements` — tax/BOL decision engine

**The single most-consumed business endpoint.** Used by carriers/MCP to decide whether `items[]` is required and whether a commercial invoice / BOL must be generated.

### 7.1 Request and response

**Route:** `POST /location-requirements` (routes/web.js:466-485). Schema:

```js
payload: {
    origin:      { country_code: required, postal_code: optional, state_code: required },
    destination: { country_code: required, postal_code: optional, state_code: required }
}
```

**Note:** `postal_code` is in the schema but `addressRequirements` does NOT use it (verified controllers/web.js:1722-1817). Only `country_code` and `state_code` matter for the decision.

Response (controllers/web.js:1802-1814):

```js
{
    applyTaxes: boolean,           // canonical tax-applicability flag
    includeBOL: !applyTaxes,       // commercial invoice / BOL required?
    isInternalEU: boolean,         // both endpoints in EU-27
    isInternalGB: boolean,         // both in [GB, EN, SC, WL]
    isInternalUK: boolean          // both in [GB, EN, SC, WL, NI]
}
```

### 7.2 The hardcoded country lists (verbatim)

Lines 1729-1776:

```js
const greatBritain = ["GB", "EN", "SC", "WL"];                     // line 1729
const unitedKingdom = ["GB", "EN", "SC", "WL", "NI"];              // line 1730
const usPr = ["US", "PR"];                                          // line 1731
const countriesInEU = [                                             // lines 1732-1760
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR",
    "HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK",
    "SI","ES","SE",
];                                                                  // 27 entries
const excStates = [                                                 // lines 1762-1776
    "FR-GF","FR-GP","FR-MQ","FR-YT","FR-RE",
    "PT-20","PT-30",
    "ES-CN","ES-TF","ES-GC","NL-SX","ES-CE","ES-ML",
];                                                                  // 13 entries
```

**Cross-check verified.** EU list = exactly 27 entries (matches official EU-27). `excStates` = 13 entries.

### 7.3 Decision flow (verified, lines 1778-1800)

```
shouldApplyTaxes = true   (initialize)
if (origin_cc !== destination_cc)              shouldApplyTaxes = false   // line 1780
if (usPr.includes(o) && usPr.includes(d))      shouldApplyTaxes = true    // line 1784  [override: US↔PR is domestic]
if (EU.includes(o) && EU.includes(d))          shouldApplyTaxes = true    // line 1788  [override: intra-EU is domestic]
if (oState !== dState && excStates.has(oState OR dState))
                                                shouldApplyTaxes = false   // line 1795  [exceptional territory]
return { applyTaxes, includeBOL: !applyTaxes, isInternalEU, isInternalGB, isInternalUK }
```

The four rules apply IN ORDER without `else`, so the LAST matching condition wins. Concrete truth-table examples:

| Origin | Destination | applyTaxes | includeBOL | isInternalEU | Notes |
|--------|-------------|-----------:|-----------:|--------------|-------|
| MX | MX | true | false | false | same-country domestic |
| US | PR | true | false | false | US↔PR override (rule 2) |
| ES (state CE peninsular) | ES (state CN Canarias) | false | true | false | exceptional state (rule 4) |
| FR (mainland) | FR-GF (Guiana) | false | true | false | exceptional state |
| DE | FR | true | false | true | intra-EU override (rule 3) |
| DE | UK (`GB`) | false | true | false | non-EU different country |

### 7.4 The GB/EN/SC/WL/NI design issue

`greatBritain` and `unitedKingdom` use codes that are **not valid ISO 3166-1 alpha-2**. ISO 3166-1 issues only `GB` for the United Kingdom of Great Britain and Northern Ireland; `EN` (England), `SC` (Scotland), `WL` (Wales), and `NI` (Northern Ireland) are not country codes at the alpha-2 level.

For `isInternalGB` / `isInternalUK` to ever return `true` with values other than both being `GB`, callers must be sending non-standard country codes. There is no documentation in the geocodes repo explaining the convention. ⚪ Confirm via consumer code (probably the carriers PHP backend) whether `EN`/`SC`/`WL`/`NI` are ever passed; if not, these arrays could be reduced to just `[GB]` without loss.

### 7.5 The MCP doesn't call this endpoint directly today

Per `_docs/COUNTRY_RULES_REFERENCE.md` §2.1, `getAddressRequirements` exists in `src/services/geocodes-helpers.ts` and POSTs to `/location-requirements`. It IS internal-only — no LLM-visible tool wraps it. It is consumed by `quote_shipment` and `create_label` to decide whether `items[]` is required.

The MCP also has its own static replication of EU and exceptional-territories sets in `src/services/country-rules.ts` (see §15.3 drift report). **Drift is real:** the MCP's `EXCEPTIONAL_TERRITORIES` includes `ES-35`, `ES-38`, and `FR-MC` which geocodes does NOT have in `excStates`. See §15.3 for the full drift table.

## 8. Locality / locate / suburb hierarchy

### 8.1 Tables (inferred from queries)

| Table | Purpose | Key columns | Row count |
|-------|---------|-------------|-----------|
| `geocode_info` | Authoritative postal/coord/region records | `iso`, `postcode`, `region1-4`, `locality`, `suburb`, `lat`, `lng`, `iso2`, `hasc`, `stat`, `timezone`, `utc`, `level`, `type` | ⚪ not in g6 (massive global table) |
| `list_states` | State catalog per country | `iso_code`, `country_code`, `hasc`, `name`, `code_2digits`, `code_3digits` | ⚪ not in g6 |
| `list_localities` | City catalog per state | `country_code`, `state_code`, `name`, `usage_counter` | ⚪ |
| `list_suburbs` | Neighborhood catalog | `country_code`, `state_code`, `locality`, `name` | ⚪ |

### 8.2 Handlers

- `queryStates(country_code)` (controllers/web.js:821-876) — `SELECT * FROM list_states WHERE country_code = ?`. Cached as `states.{cc}` TTL=0.
- `queryLocalities(country_code, state_code)` (878-916) — joins `list_localities` × `list_states`.
- `querySubUrbs(country_code, state, locality)` (1316-1352) — `list_suburbs` lookup.
- `queryLocate(country_code, locate)` (311-588 — large handler) — fuzzy locality search; LIKE on `region2`; sort by `usage_counter`. Falls back to `region3` if no result.
- `queryLocateV2(country_code, state_code, locate)` (590-819) — same with state filter (uses `getState` middleware to resolve state code first).

### 8.3 `usage_counter` — sorting heuristic

`list_localities` carries a `usage_counter` column used to ORDER results in fuzzy queries — more-queried localities surface first. The endpoint `POST /usage-counter` was presumably designed to increment this counter, but the handler is a no-op (line 1384-1386: `return true;`). So `usage_counter` is a static column populated by some other process (manual? cron?). ⚪ Confirm with backend team.

## 9. DANE Colombia flow

Colombia uses **DANE codes** (Departamento Administrativo Nacional de Estadística) — 5-8 digit numeric municipality identifiers — instead of postal codes. The Envia ecosystem stores DANE codes in the `postcode` column of `geocode_info` (when `iso='CO'`), and various Colombia-only carrier endpoints (Deprisa, RedServi) require DANE input directly.

### 9.1 Resolver flow (city → DANE)

The consumer (frontend / MCP / carriers PHP) calls `GET /locate/CO/{state?}/{city}`, which dispatches to `queryLocate` or `queryLocateV2`. The handler returns rows from `geocode_info` filtered by city/state, including the `postcode` field which is the DANE code.

The MCP wraps this as `resolveDaneCode(client, cityOrCode, stateHint?)` in `src/services/geocodes-helpers.ts`. If the input already matches `^\d{5,8}$`, returns verbatim; otherwise calls the locate endpoint and returns the first match's `zip` field. (See `_docs/COUNTRY_RULES_REFERENCE.md` §2.2.)

### 9.2 DANE-consuming endpoints in geocodes itself

- `/deprisa/{service}/{origin_dane}/{dest_dane}` — Deprisa coverage by DANE pair.
- `/deprisa/centers/{origin_dane}` — pickup centers by DANE.
- `/deprisa/address/{dane}/{direction}` — address lookups.
- `/deprisa/coverage/{dane}` — V2 endpoint.
- `/redservice_coverage/{origin_dane}/{dest_dane}` — RedServi coverage. ⚠️ The handler truncates DANE codes longer than 5 chars to 5 via `IF(LENGTH('${input}')>5, SUBSTR('${input}',1,5), '${input}')` (controllers/web.js:2123-2124), and that's exactly the SQL-injection site. See §16.1.

## 10. Brazil ICMS endpoint

**Route:** `GET /brazil/icms/{origin}/{destination}` (routes/web.js:587-599).
**Handler:** `queryBrazilIcms` (controllers/web.js:2034+).

Returns the ICMS interstate tax percentage between two Brazilian states (2-letter codes, e.g., `SP` → `RJ`).

```sql
SELECT value FROM brazil_states_icms WHERE origin_state = ? AND destination_state = ?
```

**Schema documentation gap:** `brazil_states_icms` is **NOT in `g1_information_schema_geocodes.csv`** (verified by content scan — no rows match). So the table exists in production but its schema is undocumented in the canonical CSV dumps.

The MCP wraps this as `getBrazilIcms(client, originState, destinationState)` (`_docs/COUNTRY_RULES_REFERENCE.md` §2.3). Used when building BR-BR rate/generate payloads.

## 11. Coordinates & distance

### 11.1 `/coordinates/{country_code}` (controllers/web.js:2240-2287)

Lat/long lookup. Inputs are query-string params (`state`, `locality`, `zipcode`) or just country. Returns lat/lng from `geocode_info`. The handler builds a dynamic WHERE clause via `whereConditions.join(" AND ")`, but **values are parameterized** via `?` placeholders — the WHERE structure is dynamic, not the values. This is a code smell (hard to grep for SQL pattern) but not an injection point.

### 11.2 `/distance/{country_code}/{origin_zip}/{destination_zip}` (controllers/web.js:2289+)

Computes great-circle distance between two postal codes' lat/lng pairs using the `haversine-distance` npm package. Query string `unit` (Joi-validated to `'km' | 'mi'`, default `'km'`).

⚪ Iteration 2 should trace the exact SQL and any caching.

## 12. Coverage tables

The geocodes DB hosts ~32 coverage tables, one per major carrier or carrier+country combination. Per `g6_coverage_tables_row_counts.csv`:

| Table | Rows | Carrier / use | Endpoint that reads it |
|-------|-----:|---------------|------------------------|
| `amazon_coverage` | 162,409 | Amazon Logistics | ⚪ no route in `routes/web.js` reads it directly — orphan table or carriers PHP reads it via `DB::connection('geocodes')` |
| `bluedart_coverage` | 12,558 | Blue Dart (IN) | `/bluedart/pincode/{pincode}` |
| `buslog_coverage` | 2,855 | Buslog (BR) | `/buslog/{state}/{postal}`, `/buslog/{postal}` |
| `cainiao_origin_coverage` | 1,832 | Cainiao (ES origin scope) | ⚪ orphan or carriers-direct |
| `cex_peninsular_plus_coverage` | 430 | CEX Peninsular Plus (ES) | `/cex/{origin_pcode}/{dest_pcode}` |
| `ctt_coverage` | 3,136 | CTT Express (ES/PT) | `/cttExpress/...` 🔴 col-aliasing bug |
| `fletes_mexico_coverage` | 54 | Fletes Mexico | ⚪ |
| `jtexpress_coverage` | 96,234 | J&T Express | ⚪ |
| `loggi_coverage` | 31,391 | Loggi (BR) | `/loggi/{postal}/{state}/{type}/{svc}` |
| `paquetexpress_coverage` | 95,457 | Paquetexpress (MX) | ⚪ no direct route — consumed by carriers PHP via DB::connection('geocodes') |
| `paquetexpress_postal_code_distances` | 66,049 | Paquetexpress distances (MX) | ⚪ |
| `postalcode_correos_es_coverage` | 14,746 | Correos España | `/correos/es/{postal}` |
| `tdn_coverage` | 10,966 | TDN | ⚪ |
| `tdn_international_coverage` | 422 | TDN intl | ⚪ |
| `totalexpress_coverage` | 37,692 | Total Express (BR) | ⚪ |
| `urbano_coverage` | 22,812 | Urbano (PE) | ⚪ |
| `xpressbees_coverage` | 3,407 | XpressBees (IN) | `/xpressbees/pincode/{pincode}` |
| `zipcode_classification` | 52 | Generic classification | ⚪ |

**Total:** 18 coverage tables in g6, ~575,000+ rows combined. **Orphan tables** (no direct route, presumably consumed by carriers PHP via `DB::connection('geocodes')`): `amazon_coverage`, `cainiao_origin_coverage`, `fletes_mexico_coverage`, `jtexpress_coverage`, `paquetexpress_coverage`, `paquetexpress_postal_code_distances`, `tdn_coverage`, `tdn_international_coverage`, `totalexpress_coverage`, `urbano_coverage`, `zipcode_classification`. These exist only for the PHP carriers backend. ⚪ Verify each has a corresponding consumer in carriers PHP code in iter 2.

### 12.1 Other coverage-related tables NOT in g6

The `g1_information_schema_geocodes.csv` schema dump shows additional tables not in the row-count snapshot:
- `pincodes_delhivery`, `pincodes_delhivery_coverage` — Delhivery (IN) ⚪ row count
- `pincodes_bluedart` (master) ⚪
- `pincodes_xpressbees`, `pincodes_ekart`, `pincodes_dtdc`, `pincodes_gati`, `pincodes_ecomexpress` — IN carrier pincode tables
- `andreani_origin_coverage`, `andreani_destination_coverage` — AR
- `postalcode_correo_ar_sameday` — AR same-day
- `postalcode_dhl_es_coverage` — DHL ES
- `seur_geoinfo`, `seur_peninsular` — Spain SEUR (`g15_seur_peninsular_joined.csv` has the joined sample)
- `transaher_coverage`, `transaher_states` — CO Transaher
- `deprisa_coverage`, `deprisa_coverage_centers`, `deprisa_coverage_v2` — CO Deprisa
- `redservi_coverage` — CO RedServi
- `forza_header_codes` — BR Forza
- `shippify_coverage` — BR Shippify
- `fazt_origin_coverage`, `fazt_coverage` — CL FAZT
- `postalcode_ivoy` — MX Ivoy
- `continent_country` — meta
- `catalog_carrier_charge_rules` — additional charges
- `zones_india_b2b` — India B2B zones (90 rows; see §13.3)
- `carrier_extended_zone` — master extended-zone table (see §13)
- `carrier_ferry_zone` — ferry zones (see §13)
- `brazil_states_icms` — ⚪ NOT in g1, but used by `/brazil/icms/...` (see §10) — schema gap

## 13. Extended zones — master table

### 13.1 `carrier_extended_zone`

The single global zone-flagging table. Per `g3_carrier_extended_zone_kinds.csv`:

| `kind` | Rows |
|--------|-----:|
| `extended_zone` | **221,066** (csv:row 2) |
| `peripheral_locations` | **1,279** (csv:row 3) |

Total **222,345 rows** across all carriers and countries.

### 13.2 Per-carrier breakdown (from `g2_carrier_extended_zone_summary.csv`)

Top 5 carriers by `zipcode_count`:

| Carrier | Country | Kind | Zipcodes | Unique cities |
|---------|---------|------|---------:|--------------:|
| Chronopost | US | extended_zone | 29,346 | 0 (csv:row 103) |
| Chronopost | BR | extended_zone | 25,665 | 0 (csv:row 17) |
| Chronopost | CN | extended_zone | 20,201 | 0 (csv:row 26) |
| Chronopost | FI | extended_zone | 19,554 | 0 (csv:row 37) |
| Chronopost | IN | extended_zone | 13,494 | 0 (csv:row 53) |
| Seur | ES | extended_zone | 12,267 | 1 (csv:row 117) |
| Chronopost | MX | extended_zone | 10,488 | 0 (csv:row 69) |
| Chronopost | ID | extended_zone | 9,873 | 0 (csv:row 51) |
| Chronopost | TW | extended_zone | 6,000 | 0 (csv:row 102) |
| Cainiao | ES | extended_zone | 6,116 | 49 (csv:row 3) |
| Chronopost | ES | extended_zone | 5,185 | 0 (csv:row 36) |
| Chronopost | SE | extended_zone | 4,392 | 0 (csv:row 94) |
| Chronopost | MY | extended_zone | 4,356 | 0 (csv:row 70) |
| Chronopost | JP | extended_zone | 3,816 | 0 (csv:row 57) |
| Chronopost | CO | extended_zone | 3,277 | 0 (csv:row 27) |
| Brt | IT | extended_zone | **2,616** | 2,580 (csv:row 2) |
| Seur | EE | extended_zone | 2,248 | 1 (csv:row 116) |
| ... | | | | |

Notable carriers: **Chronopost** dominates the international zone count (the bulk of rows above), reflecting its broad international scope. **Brt IT 2,616** and **Seur ES 12,267** match prior `_docs/CARRIERS_DEEP_REFERENCE.md` §13.4 claims (verified). **PosteItaliane IT** has 332 extended_zone + 1,279 peripheral_locations rows (csv:row 112-113). 

⚪ The full per-carrier×country matrix (`g2` has 124 rows, `g16_carrier_extended_zone_per_country_summary.csv` has 5,585 bytes) — read in iter 2 for completeness.

### 13.3 India B2B zones (`zones_india_b2b`)

Per `g13_zones_india_b2b_summary.csv`: 90 rows total. The table is a 9×9 matrix of letter-coded zones:

Letter codes: **N1, N2, E, NE, W1, W2, S1, S2, C** (9 zones × 9 zones = 81 origin-destination pairs; the 9 missing rows likely cover edge cases or N=zone=N variants — ⚪ verify by reading the full 90 rows in iter 2).

Used by `queryZoneDelhivery` (controllers/web.js, `/delhivery/zone/{origin}/{destination}`) which returns the matching zone identifier.

### 13.4 Ferry zones (`carrier_ferry_zone`)

Per `g5b_carrier_ferry_zone_summary.csv` (51 bytes, 2 lines): a single carrier-country pair with row count ⚪ (need to read the file in iter 2 to confirm — file size suggests 1-2 carriers, likely BRT IT 109 ferry CPs as documented in `CARRIERS_DEEP_REFERENCE.md` §13.5).

### 13.5 Master validator endpoint — `/extended_zone/{carrier}/{country}/{zipcode}`

`queryExtendendZoneCarrierValidator` (controllers/web.js:2080-2110) is the canonical extended-zone check. **Two SQL injection sites** — see §16.1. The handler:

1. Queries `carrier_extended_zone` for `count(*) WHERE carrier_controller = '{carrier_name}'` (line 2085, **interpolated**) — checks that the carrier is registered.
2. Queries again with `carrier_controller`, `country_code`, `destination_zipcode` all interpolated (lines 2098-2100) — returns `extended_coverage: true|false`.

**Note:** the column is `destination_zipcode` (not just `zipcode`), implying this table only flags destination side. ⚪ Confirm origin side is handled differently or not.

## 14. External integrations

### 14.1 VIACEP (Brazil postal-code fallback)

**Endpoint:** `${VIACEP_API_HOSTNAME}/ws/{cep}/json` (libraries/util.js:32, free public API).

**When triggered** (controllers/web.js:64-65, 71-74):
- BR postal-code request returns no DB row → call VIACEP, INSERT result into `geocode_info`.
- BR postal-code request returns row with `street IS NULL` → call VIACEP, UPDATE the row's street.

**Insert payload** (libraries/util.js:154-203):

```sql
INSERT INTO geocode_info
(iso, country, language, region1, region2, region3, region4,
 locality, postcode, street, suburb, iso2, stat, timezone, utc)
VALUES ('BR','Brasil','PT', stateName, info.localidade, info.localidade, '',
        info.localidade, info.cep, street, info.bairro,
        'BR-' + stateName, info.ibge,
        'America/Sao_Paulo', '-03:00');
```

**Risks:**
- **No validation** of VIACEP fields. If VIACEP returns malformed data (long strings, special characters), they are inserted as-is. Parameterized query prevents SQL injection at the protocol level, but a poisoned row enters the canonical DB.
- **Hardcoded timezone `America/Sao_Paulo` and UTC `-03:00`** for ALL Brazil VIACEP-sourced rows. Brazil has multiple time zones (Manaus UTC-4, Acre UTC-5). This is wrong for ~5 states. Documented as a known issue.
- **No flag** distinguishing VIACEP-sourced rows from authoritative ones. Downstream consumers (the MCP, the carriers PHP backend) cannot tell whether a Brazilian zipcode response is officially curated or VIACEP-imported.

**Cross-service impact:** the VIACEP insert is silent and immediate. The next request for the same postal code (any consumer, any service) will read the VIACEP-sourced row from the DB (or Redis if cached). There is no way to "expire" a VIACEP-sourced row except by manual intervention.

### 14.2 ENVIA_QUERIES (state resolver)

**Endpoint:** `${ENVIA_QUERIES_HOSTNAME}/state/{country_code}/{state_code}` (web.middleware.js:24).

**When triggered:** `getState` middleware on `GET /locate/{country_code}/{state_code}/{locate}` only.

**Cache strategy:** Redis key `state.{cc}.{state_code}`, TTL 0 (persistent). One cache miss per (country, state) pair, ever.

**Risk:** if queries is unreachable AND the cache has no entry, the route fails with `Boom.badData()`. There is no in-process state catalog (like `list_states`) that could serve as a fallback — the middleware unilaterally throws.

### 14.3 ECART_API (apparently unused in geocodes)

`webhook.middleware.js` is dead code. Documented for completeness only. If it WERE wired, it would call `${ECART_API_HOSTNAME}/api/v2/webhooks` with a bearer token from `request.pre.store.token`.

## 15. Cross-check pass

This section documents drift between this iter-1 doc and:
1. `_meta/analysis-geocodes.md` (prior monorepo analysis).
2. `_docs/backend-reality-check/geocodes-findings.md` (Session A audit).
3. `_docs/COUNTRY_RULES_REFERENCE.md` (MCP local replication).
4. The five Phase-3 explorer agents' raw outputs.

### 15.1 Route count drift (prior 52 → actual 48)

Both `geocodes-findings.md` line 7 ("52 endpoints públicos") AND the Phase-3 endpoint-inventory agent claimed 52 routes. **Verified count is 48** (`grep -c "method: '" services/geocodes/routes/web.js` → 48; `grep -c "path: '"` → 48). The "extra 4" in prior counts likely came from miscounting the SEUR identify chain (one route, two handlers) or from grouping route variants under separate counts.

The prior `geocodes-findings.md` table also lists endpoints that are not in the current source, suggesting a mix of deprecated routes that were removed since that audit. ⚪ Diff against the historical commit referenced in the prior doc to see what was removed.

### 15.2 Line-number drift (`_meta/analysis-geocodes.md`)

| Prior claim | Verified | Status |
|-------------|----------|--------|
| SQL injection at `controllers/web.js:2085, :2123` | ✅ exact match (`carrier_extended_zone` line 2085, `redservi_coverage` line 2123) | confirmed |
| `multipleStatements: true` at `config/database.js:20` | ✅ verified | confirmed |
| `POST /flush` public at `routes/web.js:134` | ✅ lines 134-140 | confirmed |
| Bug SQL CTT missing comma at `controllers/web.js:2003` | ✅ confirmed; classification correction below | confirmed line, classification bug |
| Cache key bug at line 161 | ⚪ deferred to iter 2 | not verified |
| File cache path at line 22 + `controllers/files.js:11` | ⚪ deferred to iter 2 | not verified |
| `usageCounter` no-op at line 1384 | ✅ verified (lines 1384-1386: `return true;`) | confirmed |
| `'use strinct'` typo at `controllers/web.js:1` | ⚪ not yet checked but routes/web.js:1 has `'user strict'` (different typo) | partial |

**Classification correction — CTT bug:** prior reality-check called this a "syntax error". It is NOT. The actual behavior:

```sql
SELECT
    origin_country_code         -- line 2003 (no trailing comma — interpreted as alias scope)
    origin_province,            -- line 2004 (becomes the column ALIAS for origin_country_code)
    ...
```

MySQL parses this as `SELECT origin_country_code AS origin_province` — i.e., the result columns are `origin_province` (containing `origin_country_code` data) plus the rest. The query EXECUTES successfully but `origin_province` field returns the wrong data and the actual `origin_province` column is missing from the result. Endpoint behaves silently incorrectly, NOT loudly broken. Worse from a debugging perspective.

### 15.3 Drift between geocodes' authoritative rules and the MCP's local replication

Cross-referencing `controllers/web.js:1729-1776` (geocodes) against `ai-agent/envia-mcp-server/src/services/country-rules.ts` (MCP) and `ai-agent/envia-mcp-server/_docs/COUNTRY_RULES_REFERENCE.md` (MCP doc):

#### EU country list — ALIGNED

Both have exactly 27 entries with the same ISO codes. ✅ No drift.

#### Exceptional territories — DRIFTED

| Code | Geocodes `excStates` | MCP `EXCEPTIONAL_TERRITORIES` | Notes |
|------|:---------------------:|:------------------------------:|-------|
| FR-GF | ✅ | ✅ | French Guiana |
| FR-GP | ✅ | ✅ | Guadeloupe |
| FR-MQ | ✅ | ✅ | Martinique |
| FR-YT | ✅ | ✅ | Mayotte |
| FR-RE | ✅ | ✅ | Réunion |
| PT-20 | ✅ | ✅ | Azores |
| PT-30 | ✅ | ✅ | Madeira |
| ES-CN | ✅ | ✅ | Canarias (HASC) |
| ES-TF | ✅ | ✅ | Canarias-Tenerife (HASC) |
| ES-GC | ✅ | ✅ | Canarias-Gran Canaria (HASC) |
| **ES-35** | ❌ | ✅ | Canarias-Las Palmas (numeric province code) — MCP-only |
| **ES-38** | ❌ | ✅ | Canarias-Sta. Cruz (numeric province code) — MCP-only |
| NL-SX | ✅ | ✅ | Sint Maarten |
| ES-CE | ✅ | ❌ | Ceuta — geocodes-only |
| ES-ML | ✅ | ❌ | Melilla — geocodes-only |
| **FR-MC** | ❌ | ✅ | Monaco — MCP-only (Monaco is its own country, MC, not a French territory; this is an MCP error) |

**Total drift:** 4 codes differ. MCP includes 3 not in geocodes (ES-35, ES-38, FR-MC); geocodes includes 2 not in MCP (ES-CE, ES-ML).

**Operational consequence:**
- A shipment from mainland ES (state code `ES-MD`) to Las Palmas using state code `ES-35` would: hit MCP's local rule and be flagged as exceptional (no taxes, BOL required), but if MCP delegates to geocodes' `/location-requirements` it would be classified as same-country with taxes applied. **Result depends on which side does the check first.**
- A shipment from FR (mainland) to Monaco (`FR-MC` if encoded as a French region, or `MC` if encoded as Monaco country) — MCP flags as exceptional, geocodes does not.
- A shipment to Ceuta (`ES-CE`) or Melilla (`ES-ML`) — geocodes flags as exceptional (no taxes), MCP does NOT (would apply intra-Spain rule).

**Recommendation:** sync the lists. Authoritative source should be geocodes; MCP should remove ES-35, ES-38, FR-MC and add ES-CE, ES-ML. **Surface to user as a decision.**

#### Postal-code transformation — DRIFTED

| Country | Geocodes `fixZipcode` | MCP `transformPostalCode` |
|---------|----------------------|---------------------------|
| BR | ✅ dash at position 5 | ✅ same |
| AR | strip non-digits | strip leading char (different rule) |
| US | (no case in fixZipcode) | normalize ZIP+4 / truncate to 5 |
| CA | space at position 3 | (not handled) |
| SE / GR / TW | space at position 3 (regex-gated) | (not handled) |
| NL | space at position 4 (regex-gated) | (not handled) |
| MX | hardcoded MX-specific transformations | (not handled) |
| JP | (postcode-with-dash JSON, position 3) | (not handled) |
| PT | (postcode-with-dash JSON, position 4) | (not handled) |
| PL | (postcode-with-dash JSON, position 2) | (not handled) |
| AI / KY | (postcode-with-dash JSON) | (not handled) |

**Operational consequence:** if MCP normalizes a postal code differently than geocodes, the cache key mismatch can produce false misses (and trigger VIACEP fallback for BR). Worse, the MCP can submit a postal code in a format the geocodes endpoint never sees, leading to "not found" errors.

**Recommendation:** MCP should rely on geocodes' `fixZipcode` server-side; do NOT pre-transform on the client. The current MCP partial replication is risky. Document as a P2 cleanup. ⚪ Confirm whether the MCP's `transformPostalCode` is consumed before calling geocodes or just for client-side display.

### 15.4 Drift summary

| Drift | Severity | Source |
|-------|----------|--------|
| Route count 52→48 (in 2 prior docs) | low (doc-only) | `geocodes-findings.md`, Phase-3 agent 1 |
| Exceptional territories ES-35/ES-38/FR-MC vs ES-CE/ES-ML | **medium** (operational tax behavior) | MCP `country-rules.ts` |
| Postal-code transformation rules (6 countries differ) | **medium** (cache misses, format mismatches) | MCP `country-rules.ts` |
| CTT endpoint "syntax error" misclassification | low (audit accuracy) | `geocodes-findings.md` |
| `usage_counter` MX-only? US? regex semantics? | ⚪ pending | not yet verified |

## 16. Security findings

### 16.1 SQL injection — three confirmed sites (verbatim quotes)

#### Site 1: `queryExtendendZoneCarrierValidator` — `controllers/web.js:2080-2110`

```js
let querycarrierExist = `
    SELECT count(*) AS counter
    FROM carrier_extended_zone
    WHERE carrier_controller = '${request.params.carrier_name}';   // line 2085
`;

let queryExtendedZone = `
    SELECT IF(COUNT(*), true, false) AS extended_coverage
    FROM carrier_extended_zone
    WHERE carrier_controller = '${request.params.carrier_name}'    // line 2098
        AND country_code     = '${request.params.country_code}'    // line 2099
        AND destination_zipcode = '${request.params.zipcode}';     // line 2100
`;
```

**Three** template-literal interpolations of URL-path params. Joi schema (`routes/web.js:622-625`) requires `min(2)` / `min(4)` length but does NOT reject special characters. Payload like `carrier_name=' OR '1'='1` makes the query return all rows; combined with `multipleStatements: true` (config/database.js:20), an attacker can chain arbitrary SQL.

#### Site 2: `queryRedserviCoverage` — `controllers/web.js:2112-2134`

```js
let queryCoverage = `
    SELECT origin_dane_code, origin_city_name, origin_department_name,
           destination_dane_code, destination_city_name, destination_department_name,
           delivery_time_hours
    FROM redservi_coverage
    WHERE origin_dane_code = IF(LENGTH('${request.params.origin_dane_code}')>5,
                                SUBSTR('${request.params.origin_dane_code}',1,5),
                                '${request.params.origin_dane_code}')   // line 2123
        AND destination_dane_code = IF(LENGTH('${request.params.destination_dane_code}')>5,
                                       SUBSTR('${request.params.destination_dane_code}',1,5),
                                       '${request.params.destination_dane_code}'); // line 2124
`;
```

Six interpolations across two lines. The IF/LENGTH/SUBSTR pattern is a complex expression — the dev presumably believed string interpolation was needed because parametrized queries wouldn't allow expressions. **It is incorrect**: parameterizing the value once and reusing the placeholder works. Same `multipleStatements`-amplified risk.

#### Site 3 (lower severity): `getCoordinates` dynamic WHERE — `controllers/web.js:2240-2287`

The Phase-3 infrastructure agent flagged this as a SQL-injection candidate. **It is NOT.** The handler builds a list of WHERE conditions, each of which uses `?` placeholders (lines 2249, 2253, 2257-2258), with values pushed onto `queryParams` and passed to `Db.execute(sqlQuery, queryParams)` (line 2281). The `${whereClause}` template literal (line 2277) substitutes the AND-joined static SQL fragments — **all values are parameterized**. This is a code smell (hard to grep) but not an injection point.

#### Other endpoints — parameterized correctly

Every other handler reviewed in iter 1 uses parameterized queries via `Db.query(sql, params)` or `Db.execute(sql, params)` with `?` placeholders. ⚪ Iter 2 should grep for `\${request\.params\.|request\.payload\.|request\.query\.` inside `controllers/web.js` to confirm no other interpolation site was missed.

### 16.2 `POST /flush` — public Redis wipe

`routes/web.js:134-140` declares the route with `auth: false`. `controllers/web.js:1013-1016` calls `RedisUtil.flush(client)` which calls `client.flushdb()`. Anyone with network access to the geocodes hostname can invalidate every cached state simultaneously. Cross-service impact: the carriers PHP, the MCP, queries, and any direct consumer experience cache-stampede latency.

**Mitigation paths:**
- Require an internal-only header (`X-Internal-Secret`) via a custom `pre` handler.
- Restrict the route to a private port (geocodes already supports `PRIVATE_PORT` per `server.js:82-87`).
- Remove the route entirely; flush via Heroku CLI or RedisLabs dashboard when needed.

### 16.3 `multipleStatements: true`

`config/database.js:20`. Enables stacked queries on the MySQL connection. There is **no documented justification** for this setting — none of the queries reviewed in iter 1 use multi-statement batches. Disabling would shrink the SQL-injection blast radius substantially.

### 16.4 Permissive CORS

`server.js:22`: `origin: ['*']`. Allows any browser origin. Since geocodes is internal-network-only in production, this is mostly inert (the Heroku-host blocker at `server.js:67-72` ensures no browser can reach a `*.herokuapp.com` host directly), but it's an unnecessary lax setting.

### 16.5 Heroku-host substring filter

`server.js:67-72`:

```js
server.ext('onPreHandler', (request, response) => {
    if (process.env.NODE_ENV === 'production' && /herokuapp/.test(request.info.host)) {
        throw new Boom.notFound();
    }
    return response.continue;
});
```

Substring match (`/herokuapp/`) is unanchored. A host like `legitsite.com` would not match, but `attacker-herokuapp.com` would (correctly blocked) and so would `mysite.herokuapp-proxy.com` (false positive). Replace with anchored regex `^[^.]+\.herokuapp\.com$`.

### 16.6 Misc

- **Two strict-mode typos**: `routes/web.js:1` says `'user strict'`; `controllers/web.js:1` says `"use strinct"`. Both effectively make the file run in NON-strict mode, masking subtle bugs (e.g., assignment to undeclared variables).
- **No test suite** (`package.json` test script: `echo "Error: no test specified" && exit 1`). Coverage = 0%. Sonar config expects `./coverage/lcov.info` which is never generated.
- **`axios ^0.23.0`** is severely outdated (current 1.7+). Several known vulnerabilities in 0.x. ⚪ Run `npm audit` in iter 2.

## 17. MCP coverage gap analysis

The MCP today consumes 3 geocodes endpoints internally (no LLM-visible tool wraps geocodes directly):

| MCP helper | Geocodes endpoint |
|------------|-------------------|
| `getAddressRequirements` | `POST /location-requirements` |
| `resolveDaneCode` | `GET /locate/CO/{state?}/{city}` |
| `getBrazilIcms` | `GET /brazil/icms/{origin}/{destination}` |

Plus `envia_validate_address` (LLM-visible) which the MCP routes to the carriers shipping-base `/zipcode` endpoint, NOT directly to geocodes (the response includes some geocodes-derived fields).

### 17.1 Geocodes endpoints NOT consumed by the MCP today

Out of 48 geocodes routes, the MCP exposes 0 LLM-visible tools and consumes 3 in internal helpers. **45 routes are invisible to the MCP.**

Endpoints that COULD make sense as future internal helpers (NOT user-facing tools — per LESSON L-S2 the agent should not invoke admin/dev endpoints):

| Endpoint | Could close which gap? |
|----------|------------------------|
| `GET /list/states/{cc}` | State-code dropdowns / validation when building addresses (already covered by `/generic-form`?) |
| `GET /list/localities/{cc}/{state}` | Locality auto-complete (UX improvement; depends on portal) |
| `GET /continent-country/{cc}` | Auto-classify intl shipments (currently MCP doesn't need this) |
| `POST /additional_charges` | Surcharge preview before generate — could feed `quote_shipment` add-on display (Gap 1 from `_docs/ADDITIONAL_SERVICES_CATALOG_VERIFIED.md`) |
| `GET /extended_zone/{carrier}/{cc}/{zip}` | Pre-flight a destination for extended-zone surcharge (would warn user before generate) — but ⚠️ SQL injection means MCP must NOT pass user input here until backend is fixed |
| `GET /coordinates/{cc}` and `/distance/{cc}/{o}/{d}` | Smart pickup-vs-drop-off UX, distance-aware suggestions — low priority |

### 17.2 Endpoints that are NOT good MCP candidates

Per LESSON L-S2 (typical-portal-user test), the following make NO sense as agent-visible:

- `POST /flush` — admin / DoS vector.
- `POST /usage-counter` — no-op stub anyway.
- All carrier-specific coverage endpoints (`/delhivery`, `/bluedart`, `/loggi`, etc.) — these are operational lookups consumed by the carriers PHP backend; the agent doesn't need them, and surfacing them would confuse users.
- `GET /list/zipcode/{cc}` — returns potentially millions of postal codes; only useful for batch processing.

### 17.3 The coverage gap is mostly a doc gap

The MCP's 3-endpoint usage is **deliberately minimal** (per L-S5 reuse existing infrastructure, plus the portal-user filter). The risk is not "MCP under-uses geocodes"; the risk is "MCP partially replicates geocodes rules in `country-rules.ts` and drifts" (see §15.3). The fix is to remove duplication, not to add tools.

## 18. Open questions

For the backend team. Each question maps to a specific file/CSV/SQL.

1. **`brazil_states_icms` schema.** Not in `g1_information_schema_geocodes.csv`. What columns exist? Is the table populated for all 27×27 = 729 state pairs, or sparse? Run `SELECT COUNT(*), COUNT(DISTINCT origin_state) FROM brazil_states_icms`.
2. **`usage_counter` semantics.** `list_localities.usage_counter` is used for sorting in `/locate`. The `/usage-counter` endpoint is a no-op (line 1384-1386). What process actually increments the counter? Cron? Manual? Was it ever wired and then disabled?
3. **EU exceptional territories — Ceuta/Melilla and Monaco.** Is the difference between geocodes' `excStates` (has ES-CE, ES-ML; no FR-MC) and the MCP's `EXCEPTIONAL_TERRITORIES` (has FR-MC, ES-35, ES-38; no ES-CE, ES-ML) intentional? See §15.3.
4. **GB/EN/SC/WL/NI codes — design intent.** ISO 3166-1 alpha-2 has only `GB`. The geocodes `greatBritain`/`unitedKingdom` arrays carry `EN`, `SC`, `WL`, `NI`. Are these ever sent by callers? If not, simplify to `[GB]`.
5. **`controllers/web.js:2003` CTT bug.** The missing comma silently merges columns. How long has this endpoint been returning incorrect data? Are downstream consumers (carriers PHP CTT integration?) compensating?
6. **VIACEP timezone hardcoding.** All BR-VIACEP-imported rows get `America/Sao_Paulo` and `-03:00`. Is anyone using the `timezone` field in geocodes data for delivery hour-limit logic? If yes, Manaus and other zones produce wrong results.
7. **VIACEP trust boundary.** Are imported rows flagged in any way? Could a `source` column (`'envia'|'viacep'`) be added so consumers can prefer authoritative data?
8. **Orphan coverage tables.** `amazon_coverage` (162k rows), `jtexpress_coverage` (96k), `paquetexpress_coverage` (95k), and 8 others have no route in `routes/web.js`. They are presumably read by carriers PHP via `DB::connection('geocodes')`. List the consuming carriers / classes.
9. **`carrier_extended_zone.destination_zipcode` only?** The `queryExtendendZoneCarrierValidator` filters by destination_zipcode but not origin. Are origins flagged elsewhere? In `paquetexpress_postal_code_distances`?
10. **`postcode-with-dash.json` vs `fixZipcode` body.** The JSON has 6 countries; the function body handles 6+ different countries. Why two sources of truth?
11. **`store.middleware.js` and `webhook.middleware.js` — really unused?** Dead code or legacy paths waiting to be wired?
12. **Heroku stack.** `app.json` references `heroku-18` — EOL. Migration to `heroku-22` or container deploys ⚪.
13. **`access_tokens.type_id` semantics in geocodes.** `strategies.js` accepts type 1 (with expiry) and type 2 (no expiry). Same pattern as carriers Guard.php (which accepts 1, 2, 7). Why does geocodes only accept 1, 2 and not 7?
14. **SQL injection — fix path.** Lines 2080-2110 and 2112-2134 must be parameterized. Risk of regression if the IF/LENGTH/SUBSTR expression is rewritten naively (e.g., losing the truncation behavior for >5-digit DANE codes).

## 19. References

### 19.1 In the geocodes repo

- `services/geocodes/server.js` — bootstrap (90 lines).
- `services/geocodes/routes/web.js` — 48 routes (723 lines).
- `services/geocodes/controllers/web.js` — handlers (2,349 lines, the god file).
- `services/geocodes/middlewares/web.middleware.js` — fixZipcode/cleanLocateQuery/getState (135 lines).
- `services/geocodes/libraries/util.js` — VIACEP integration + helpers (291 lines).
- `services/geocodes/libraries/redisUtil.js` — cache abstraction (69 lines).
- `services/geocodes/config/database.js` — pool config (23 lines).
- `services/geocodes/authorization/strategies.js` — token_user (43 lines, unused at runtime).
- `services/geocodes/libraries/postcode-with-dash.json` — 6-country dash config.

### 19.2 Carriers knowledge-base CSVs (DB snapshots)

- `services/carriers/knowledge-base/queries/g1_information_schema_geocodes.csv` — full schema (32+ tables).
- `g2_carrier_extended_zone_summary.csv` — per-carrier×country zone counts (124 rows).
- `g3_carrier_extended_zone_kinds.csv` — `extended_zone` 221,066 + `peripheral_locations` 1,279.
- `g4_carrier_extended_zone_sample.csv` — 85 KB sample rows.
- `g5a/b_carrier_ferry_zone_*` — ferry zones schema + summary.
- `g6_coverage_tables_row_counts.csv` — 18 coverage tables, total ~575k rows.
- `g6b_per_table_zone_breakdown.csv` — per-table zone breakdown.
- `g7_pincode_info_delhivery_summary.csv` — Delhivery summary.
- `g8_carrier_country_zones.csv` — large breakdown (227 KB).
- `g9_additional_tables_schema.csv` — additional tables.
- `g11-g16` — country/carrier-specific samples (Spain SEUR joined, India B2B, Paquetexpress, etc.).

### 19.3 Cross-references in MCP repo

- `_docs/CARRIERS_DEEP_REFERENCE.md` §16.2 (Geocodes integration from carriers' perspective).
- `_docs/CARRIERS_DEEP_REFERENCE.md` §13 (Extended zones — geocodes-data heavy).
- `_docs/COUNTRY_RULES_REFERENCE.md` (MCP local replication, drift target).
- `_docs/BACKEND_ROUTING_REFERENCE.md` §2.3 (current MCP→geocodes integration).
- `_docs/backend-reality-check/geocodes-findings.md` (Session A audit, partially superseded by this doc).
- `_meta/analysis-geocodes.md` (monorepo-level audit, partially superseded by this doc).
- `src/services/geocodes-helpers.ts` — current MCP internal helpers.
- `src/services/country-rules.ts` — local replication (drift source per §15.3).

---

## Self-assessment — am I sure this is complete?

**No.** This is iteration 1 of this doc. Coverage estimate: **~70-75% of the geocodes service surface**.

What's solid:
- Architecture, stack, file inventory.
- Route inventory (48 routes) — verified.
- `addressRequirements` decision engine — verbatim quoted, decision-tree explained.
- 3 SQL injection sites — verbatim quotes, classification corrected.
- VIACEP fallback — full trace including risks.
- Drift report (geocodes ↔ MCP `country-rules.ts`) — concrete, with operational consequences.
- Open questions — 14 concrete asks for backend team.

What's weak (deferred to iter 2/3):
1. Per-handler SQL queries for the 18 carrier-coverage endpoints (§12) — only 3-4 reviewed in detail; the rest depend on agent reports that haven't been independently cross-checked line-by-line.
2. The `g8_carrier_country_zones.csv` (227 KB) and `g4_carrier_extended_zone_sample.csv` (85 KB) — not yet read in detail; would refine §13.
3. The locate-handler (`queryLocate` and `queryLocateV2`) detailed logic — only summarized in §8; not traced.
4. `getCoordinates` and `getDistanceOriginDestination` SQL — summarized but not deep-read.
5. Cache TTL inventory — only 6 of ~15 endpoints documented.
6. Schema dump (`g1`) full inventory — only ~25 tables named; the file has more rows.
7. The `/seur/identify/...` chain handler — only summarized.
8. Confirmation of `_meta/analysis-geocodes.md` claims about cache key bug at line 161, file cache path at line 22.

Iter 2 should:
- Trace the remaining handler SQL line-by-line.
- Read the full `g1` and produce a complete table-name inventory.
- Cross-check the 18 carrier-coverage handlers against `g6` row counts and `g1` schema.
- Confirm the 3 outstanding `_meta` claims.
- Read `controllers/files.js` and document the file cache.

Iter 3 should:
- Finalize the drift report with concrete fix recommendations.
- Document MCP gap fixes (specific files / functions to update).
- Produce the final cross-check pass and self-assessment with honest coverage %.

This iter-1 doc is a **reasonable transferable starting point** for any future session working on geocodes + MCP integration, but it is **not** the final state. Iteration 2 will close the structural gaps; iteration 3 will sharpen the recommendations.
