# Carriers Service — Deep Reference

> **Purpose:** Single transferable knowledge document about the
> `services/carriers` PHP/Lumen 8.x backend. Built for any future
> session (Claude or human) that needs to operate, integrate, or
> extend this service without re-discovering its architecture and
> business rules.
>
> **Source of truth:**
> - `services/carriers/` repo (commit head as of 2026-04-25)
> - `services/carriers/knowledge-base/` (curated docs by the carriers team)
> - `services/carriers/ai-specs/specs/` (architecture standards)
> - DB dumps in `services/carriers/knowledge-base/queries/*.csv` (production snapshot)
>
> **Verification:** every quantitative claim in this doc cites
> `path:line` or `csv:row`. When inferring, this doc says "inferred"
> explicitly.
>
> **Iteration:** v1 of this doc. Sections marked 🟡 are partial; ⚪
> are still pending material that must be added in future iterations.

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Routes & endpoints](#2-routes--endpoints)
3. [Authentication & middleware stack](#3-authentication--middleware-stack)
4. [Dispatcher — Ship::process](#4-dispatcher--shipprocess)
5. [Action classes — the data context layer](#5-action-classes--the-data-context-layer)
6. [Carrier integration pattern (3-tier)](#6-carrier-integration-pattern-3-tier)
7. [Core actions — Rate, Generate, Track, Cancel, Pickup](#7-core-actions)
8. [Track-driven side effects](#8-track-driven-side-effects)
9. [Cancel + Refunds (TMS chain)](#9-cancel--refunds-tms-chain)
10. [Insurance products (3 distinct products)](#10-insurance-products)
11. [Cash on Delivery (COD)](#11-cash-on-delivery)
12. [Custom keys (llaves personalizadas)](#12-custom-keys)
13. [Extended zones](#13-extended-zones)
14. [Auxiliary actions (branches, manifest, BOL, NDR, general-track)](#14-auxiliary-actions) 🟡
15. [DB schema — critical observations](#15-db-schema-critical-observations)
16. [Inter-service dependencies](#16-inter-service-dependencies)
17. [MCP coverage gap analysis](#17-mcp-coverage-gap-analysis)
18. [Open questions for backend team](#18-open-questions)
19. [References & further reading](#19-references)

---

## 1. Architecture overview

### 1.1 Stack

- **Lumen 8.x / PHP 8.3.** Verified in `composer.json` (not shown here) and `CLAUDE.md`.
- 830 PHP files in `app/` (counted via `find app -name "*.php"`).
- 144 carrier integration files in `app/ep/carriers/` (counted via `ls app/ep/carriers/ | wc -l`). The number of distinct carriers in DB is 168 (`1_prod_carriers.csv`, 168 rows).
- Tests in `tests/Unit/` and `tests/System/Rate|Generate|Track|Cancel|Pickup/`.

### 1.2 Request flow (canonical)

```
HTTP Request → Lumen Router (routes/web.php)
  → Middleware stack (json-valid → action → auth → translate)
    → ApiController@shipRequest (app/Http/Controllers/ApiController.php)
      → Ship::process (app/ep/Ship.php)
        → Action class (app/ep/actions/Rate|Generate|Track|...)
          → schema validation (app/ep/schemas/<action>.v1.schema)
          → Action constructor builds $data context
        → Ship::handleCarrierAction (resolves carrier controller)
          → CarrierController::action($data)  ← static method on app/ep/carriers/<Name>.php
            → CarrierUtil (payload helpers) ↔ CarrierApi (HTTP/SOAP calls)
              → Response Breakdown (RateBreakdown, GenerateBreakdown, etc.)
        → Response wrapping (app/ep/responses/Response.php)
        → JSON
```

`Ship::process` (`app/ep/Ship.php:17-47`) is the central dispatcher. It is invoked by **every** `/ship/*` action via `ApiController@shipRequest`.

### 1.3 Key directories (verified via `ls app/`)

| Path | Role |
|------|------|
| `app/Http/Controllers/` | 5 controllers: `Controller`, `ApiController` (delegates everything to `Ship::process`), `ZonosController`, `TaxController`, `UtilsController` |
| `app/Http/Middleware/` | 13 middleware: `Auth`, `AuthV1`, `Authenticate`, `RequestValidator`, `GetAction`, `Translation`, `TokenHistory`, `CorsMiddleware`, `ValidateAccess`, `DevelopmentRoute`, `HerokuDomainMiddleware`, `UserAgentWoocommerce`, `ExampleMiddleware` |
| `app/ep/` | Domain core. Subdirs below. |
| `app/ep/actions/` | Action classes (Rate, Generate, Track, Cancel, Pickup, Branch, BillOfLading, Manifest, NDReport, GeneralTrack...) — schema-validated $data builders. |
| `app/ep/carriers/` | 144 carrier files. Each extends `AbstractCarrier`, implements `ICarrier` + `ICarrierRaw`. Static methods: `rate`, `generate`, `track`, `cancel`, `pickup`, `branch`, `billOfLading`, `manifest`, `nDreport`, `complement`, `advancedTrack`. |
| `app/ep/carriers/utils/` | Carrier-specific utility classes |
| `app/ep/services/` | API client classes per carrier (HTTP/SOAP I/O only — no business logic). |
| `app/ep/util/` | Shared utilities. **`CarrierUtil.php` is the god class — 7,734 lines.** Other key utils: `TmsUtil` (TMS calls), `Util` (parsers/helpers), `JwtUtil`, `LogUtil`. |
| `app/ep/libraries/Guard.php` | JWT auth logic (79 lines, see §3.3). |
| `app/ep/responses/` | Standardized `RateBreakdown`, `GenerateBreakdown`, `TrackBreakdown`, `CancelBreakdown`, `PickupBreakdown`. |
| `app/ep/exceptions/` | `InvalidValueException` (validation), `WebServiceException` (API failures), `ShowableExceptionV2` (user-facing). |
| `app/ep/schemas/` | JSON schemas per action (e.g. `rate.v1.schema`, `generate.v1.schema`, `cancel.v1.schema`). |
| `app/Models/` | 128+ Eloquent models. |
| `app/ep/v2/` | V2 dispatch layer (separate `ShipV2::process`). |
| `app/ep/traits/` | Shared traits — most notable: `CancelTrait::fullCancel` (refund flow logic). |
| `app/ep/python/` | Some Python integrations (carrier-specific). |
| `knowledge-base/` | Team-curated docs (per-action, per-carrier deep-dives, business rules). **Read first when investigating a topic.** |
| `ai-specs/specs/` | Architecture standards (`backend-standards.mdc`, `carrier-integration.mdc`, `documentation-standards.mdc`, `development-guide.mdc`). |

## 2. Routes & endpoints

`routes/web.php` is 72 lines. Complete inventory below.

### 2.1 Core ship/* actions (the revenue engine)

All dispatched through `ApiController@shipRequest` → `Ship::process`. Middleware stack varies per route (see column).

| Method | Path | Middleware (order) | Action class | Notes |
|--------|------|--------------------|--------------|-------|
| POST | `/ship/generaltrack` | `json-valid`, `action`, `translate` | `GeneralTrack` | **Public — no auth.** Read-only tracking for API clients. |
| POST | `/ship/webhooktest` | `json-valid`, `action`, `auth`, `dev-routes` | (webhook test handler) | Dev-only webhook tester. |
| POST | `/ship/generate` | `json-valid`, `action`, `auth`, `token-history`, `translate` | `Generate` | The only action with `token-history` middleware. Charges balance. |
| POST | `/ship/rate` | `json-valid`, `action`, `auth`, `translate` | `Rate` | Quotation. |
| POST | `/ship/cancel` | `json-valid`, `action`, `auth`, `translate` | `Cancel` | Triggers refund flow if eligible. |
| POST | `/ship/track` | `json-valid`, `action`, `auth`, `translate` | `Track` | **Internal use** — updates DB status. Triggers side effects. |
| POST | `/ship/pickup` | `json-valid`, `action`, `auth`, `translate` | `Pickup` | Schedule pickup. |
| POST | `/ship/billoflading` | same | `BillOfLading` | Generate commercial invoice / BOL. |
| POST | `/ship/commercial-invoice` | same | `BillOfLading` (alias) | Same handler — `Ship::getAction` aliases this to `billoflading` (see `Ship.php:61`). |
| POST | `/ship/complement` | same | `Complement` | Carta porte complement / SAT complement. |
| POST | `/ship/ndreport` | same | `NDReport` | Notify carrier action on delivery problem. |
| POST | `/ship/manifest` | same | `Manifest` | Generate pickup manifest document. |
| POST | `/ship/branches` | same | `Branch` | List carrier branches/locations. |
| POST | `/ship/{action}` | same | resolved dynamically | **Catch-all.** Lets any `Util::actionParser` action be dispatched. |

### 2.2 V1 / V2 routes

| Method | Path | Middleware | Notes |
|--------|------|-----------|-------|
| POST | `/v1/ship/{action}` | `json-valid`, `action`, `authV1`, `validate-access` | V1 API. Returns **raw carrier responses** (does not normalize). Different auth (`AuthV1`). |
| POST | `/v2/ship/{action}` | (none in router; auth handled by `ShipV2::process`) | V2 API. Separate dispatcher in `app/ep/v2/`. |
| POST | `/v2/checkout/{ecommerce}/{shopId}` | `user-agent-woocommerce` | E-commerce checkout flow (woocommerce specifically). |
| POST | `/v2/plan-quote-ws` | (none) | V2 plan quote. |

### 2.3 Auxiliary endpoints (non-ship)

| Method | Path | Middleware | Controller | Purpose |
|--------|------|-----------|------------|---------|
| POST | `/plan-quote` | `json-valid` | `ApiController@dbQuote` | Plan-based quotation (DB lookup, no carrier WS). |
| POST | `/locate` | `json-valid` | `ApiController@locateCity` | City lookup (geocodes-adjacent). |
| POST | `/utils/classify-hscode` | `json-valid` | `UtilsController@classifyHscode` | HS code classification for customs. |
| GET | `/zonos/process-all` | `authV1` | `ZonosController@processAllOrders` | Batch process Zonos orders. |
| GET | `/zonos/process/{shipmentId}` | `authV1` or `auth` | `ZonosController@processSpecificOrder` | Process one Zonos order. |
| GET | `/zonos/status` | `authV1` | `ZonosController@getOrdersStatus` | Zonos order status. |
| GET | `/taxes/company-percentage/{companyId}` | `auth` | `TaxController@companyTaxPercentage` | Company tax % lookup. |
| POST | `/taxes/calculate` | `auth` | `TaxController@taxCalculator` | Tax calculator. |
| GET, POST | `/`, `/ship[/{action}]` | (none) | `ApiController@showCatalog` | Catalog/info endpoint. |
| GET | `/cron/{function}` | (none) | `ApiController@cronRequest` | Cron entrypoint. |
| GET | `/status` | (none) | `ApiController@status` | Health/status check. |

### 2.4 Public vs authenticated

- **Public** (no auth): `/ship/generaltrack`, `/`, `/ship[/{action}]` (catalog), `/status`, `/cron/{function}`, `/plan-quote`, `/locate`, `/utils/classify-hscode`.
- **Authenticated** (`auth`): all other `/ship/*`, `/taxes/*`, `/zonos/process/{id}`.
- **AuthV1** (`authV1`): `/v1/ship/{action}`, `/zonos/process-all`, `/zonos/status`.

## 3. Authentication & middleware stack

### 3.1 Auth middleware (V2/V3 — current)

**File:** `app/Http/Middleware/Auth.php` (66 lines).

Two paths:

1. **Bearer token in `Authorization` header:**
   - Extracts the token after `Bearer `.
   - Resolves a guard class dynamically:
     - `App\ep\libraries\GuardV1` if `app('isProd') && env('PRIVATE_DYNO')` is true.
     - `App\ep\libraries\Guard` otherwise.
   - Calls `validateToken($token)`.
2. **`shopify-access` header:**
   - Calls `Guard::shopifyAuth($token)` directly.

If either succeeds, `$request->attributes->add(['userVal' => $userVal])` and proceeds. Otherwise returns `Authentication error.` 401.

### 3.2 AuthV1 middleware

For `/v1/ship/{action}` and Zonos batch endpoints. Uses different token validation logic.

### 3.3 Guard.php (token validation)

**File:** `app/ep/libraries/Guard.php` (79 lines).

`Guard::validateToken($token)` tries TWO mechanisms in order:

**1. `validateJwtToken($token)`** — decodes the token as JWT via `JwtUtil::decodeJWT`. If it has a `user_id` claim, returns the decoded object. Otherwise returns null.

**2. `validateDbToken($token)`** — looks up the token in the `access_tokens` table:

```sql
SELECT user_id, token, type_id, valid_until, access_ecommerce, company_id
FROM access_tokens
WHERE type_id IN (1, 2, 7)
  AND token = ?
```

Returns the row only if:
- For `type_id IN (1, 7)`: `valid_until > now()`.
- For `type_id = 2`: `company_id` is not empty.

Otherwise returns null.

`Guard::shopifyAuth($token)` — decodes the token with `SHOPIFY_JWT_KEY` (HS256), then if it has a `sid`, validates that `sid` against the `access_tokens` table with `access_ecommerce = sid`.

### 3.4 Token type semantics

`access_tokens.type_id` values (inferred from filter logic):

- **1** = personal access token (with expiration).
- **2** = company / API token (no expiration; requires `company_id`).
- **7** = some other token type with expiration.

The dual mechanism (JWT first, then DB lookup) means Envia supports **both** stateless JWTs and database-backed long-lived tokens. JWTs are typically the user-facing format (issued by accounts service); DB tokens are for integrations.

### 3.5 Other middleware

| Middleware | Purpose |
|-----------|---------|
| `json-valid` | Validates JSON body, parses into `$request->attributes['payload']`. |
| `action` (GetAction) | Reads `REQUEST_URI` last segment, sets `$request->attributes['action']`. |
| `translate` | Locale/translation handling. |
| `token-history` | Records the action in token history. **Only on `/ship/generate`.** |
| `dev-routes` | Restricts route to dev environment. |
| `validate-access` | V1 access validation. |
| `cors` | CORS headers. |
| `user-agent-woocommerce` | Used for `/v2/checkout/{ecommerce}/{shopId}`. |

## 4. Dispatcher — Ship::process

**File:** `app/ep/Ship.php` (230 lines).

### 4.1 Process flow (verified via line numbers)

`Ship::process(Request $request, $raw = false)` (line 17):

1. **Read inputs from request attributes** (line 19-23):
   - `$user = $request->attributes->get('userVal')` (set by Auth).
   - `$payload = $request->attributes->get('payload')` (set by json-valid).
   - `$headers = self::cleanHeaders($request->header())`.
   - `$checkout = $request->query('checkout') === "true"`.
   - `$action = self::getAction($request, $raw)` — returns the action attribute, plus `Raw` suffix if `$raw=true`. `commercial-invoice` is aliased to `billoflading` here (line 61).

2. **APM tagging** (line 26): `renameTransaction($action, $payload, $checkout)` — sets New Relic / Sentry span attributes including the carrier name.

3. **Shipment type resolution** (line 27): `setShipmentType($payload, $action)` — if no `$payload->shipment->type`, defaults to 1 (parcel). Otherwise uses `Util::shipmentTypeConverter`.

4. **Action name suffix** (line 29): `appendShipmentTypeToAction($action, $payload)` — if shipment type is set, appends `1` (parcel), `2` (LTL), or `3` (FTL) to the action name. So `generate` becomes `generate1` / `generate2` / `generate3`.

5. **Action class resolution** (line 30): `getActionClassName($action)` returns `\\App\\ep\\actions\\<Util::actionParser($action)>`. Parser maps action strings (e.g. `branches` → `Branch`, `cancel1` → `Cancel`, `generate2` → `GenerateLtl`).

6. **Action class instantiation** (line 32): `$data = new $className($user, $payload)` — runs the action constructor which validates JSON schema and builds `$data` context.

7. **Request context binding** (line 35-38): stores `$data`, `$payload`, `$headers` in `RequestContext` singleton for downstream use.

8. **Sentry + New Relic user data** (line 40-41): `setSentryData`, `setNewRelicData`.

9. **Dispatch** (line 43): `handleAction($action, $data, $payload)`.

10. **Exception handling** (line 44-46): on any throw → `handleException($e, $payload)`.

### 4.2 handleAction routing (line 117-128)

```php
private static function handleAction($action, $data, $payload)
{
    if ($action === "webhooktest") {
        return self::handleWebhookTest($action, $data);
    }
    if (!isset($data->carrier) && Util::actionsWithoutGuard($action)) {
        return self::handleActionWithoutGuard($action, $data);
    }
    return self::handleCarrierAction($action, $data);
}
```

`handleActionWithoutGuard` covers actions that do NOT require carrier dispatch (e.g. `generaltrack` when `data->data` already contains all results). For `generaltrack` it strips `customKey` from each guide (line 138-141) before responding.

### 4.3 handleCarrierAction (line 151-162)

```php
$carrierLocale = CarrierUtil::getCarrierLocale($data);
$carrierController = "\\App\\ep\\carriers\\" . CarrierUtil::carrierExists($data->carrier, $carrierLocale);

if (!method_exists($carrierController, $action)) {
    throw new InvalidActionException(...);
}
$responseData = $carrierController::$action($data);
return response()->json(new Response($action, $responseData));
```

Resolves the carrier controller via `CarrierUtil::carrierExists` (returns the class name as a string, e.g. `FedexRest`, `CargoExpreso`). Validates that the action method exists on that class. Calls the **static** method (e.g. `FedexRest::rate($data)`) and wraps the result in a standardized `Response`.

### 4.4 Exception flow (line 164-187)

`handleException`:
- Calls `ExceptionHandler::getErrorMsg($e)` to get a user-safe error response.
- If exception has `getDescription() === "Internal error"` → logs payload to `LogError` table (line 168).
- If exception has `$e->data` → calls `rollbackTransaction($e->data)` which calls `Util::rollbackTransaction($tmstkn, $chargeId)` → **TMS rollback for orphaned charges**.

This is the safety net when generate fails after charging: the exception carries the chargeId, and the rollback reverses the TMS charge.

## 5. Action classes — the data context layer

Every `/ship/*` action instantiates an action class under `app/ep/actions/`. The class:

1. Extends `Action` (`app/ep/actions/Action.php`) which validates the JSON body against a schema in `app/ep/schemas/<name>.v1.schema`.
2. Sets `$this->user` to either the numeric user_id (for simple cases) or a loaded `User` model (for actions that need company context).
3. Builds action-specific public properties.

This is the **single most important pattern** in the carriers service. Every action below uses it.

| Action | File | Schema | User loaded as |
|--------|------|--------|----------------|
| `Rate` | `Rate.php` | `rate.v1.schema` | `User` model with company, restrictions, billing |
| `RateLtl` | `RateLtl.php` | `rate.ltl.v1.schema` | same as Rate |
| `RateFtl` | `RateFtl.php` | `rate.ftl.v1.schema` | same as Rate, adds `$quoteId` |
| `Generate` | `Generate.php` | `generate.v1.schema` | `User` model + token context, debts, optional shop→company switch |
| `GenerateLtl` | `GenerateLtl.php` | `generate.ltl.v1.schema` | same |
| `GenerateFtl` | `GenerateFtl.php` | `generate.ftl.v1.schema` | same, adds `$generateId` |
| `Track` | `Track.php` | `track.v1.schema` | numeric user id only (no User model load) |
| `Cancel` | `Cancel.php` | `cancel.v1.schema` | `User` with company; admin replaces with shipment creator's user |
| `Pickup` | `Pickup.php` | `pickup.v1.schema` | `User` with company (admin can switch to another company) |
| `PickupLtl`, `PickupCancel`, `PickupTrack` | `Pickup*.php` | LTL variants | same |
| `Branch` | `Branch.php` | `branches.v1.schema` | auth token object only — no User Eloquent load |
| `BillOfLading` | `BillOfLading.php` | (BOL schema) | TBD ⚪ |
| `Manifest` | `Manifest.php` | (manifest schema) | TBD ⚪ |
| `NDReport` | `NDReport.php` | (NDR schema) | TBD ⚪ |
| `GeneralTrack` | `GeneralTrack.php` | (general-track schema) | numeric only |

**Note on user loading:** actions that need company-level context (Rate, Generate, Cancel, Pickup) load a `User` model with relations. Actions that operate on partial data (Track, Branch, GeneralTrack) keep the user as the raw token object. This is an explicit design decision — Track is internal and avoids loading `User` for performance.

## 6. Carrier integration pattern (3-tier)

Every carrier integration is exactly three files (`ai-specs/specs/carrier-integration.mdc` formalizes this).

| File | Location | Responsibility |
|------|----------|----------------|
| `<Carrier>.php` | `app/ep/carriers/` | **Controller.** Extends `AbstractCarrier`, implements `ICarrier` + `ICarrierRaw`. Holds the static methods called by `Ship::handleCarrierAction`: `rate()`, `generate()`, `track()`, `cancel()`, `pickup()`, `branch()`, `billOfLading()`, `advancedTrack()`, etc. |
| `<Carrier>Api.php` | `app/ep/services/` | **API client.** HTTP/SOAP calls only. Authentication, headers, raw request/response. **No business logic.** |
| `<Carrier>Util.php` | `app/ep/carriers/utils/` | **Carrier utility.** Payload formatting, response parsing, conversions, validation specific to the carrier. |

Examples (from `ai-specs/specs/carrier-integration.mdc` and `ls`):
- FedEx REST: `FedexRest.php` + `FedexRestApi.php` + `FedexRestUtil.php`.
- DHL: `Dhl.php` + `DhlApi.php` + `DhlUtil.php`.
- Estafeta: `Estafeta.php` + `EstafetaApi.php` + `EstafetaUtil.php`.

The pattern is enforced. Adding a new carrier means creating three files in those exact paths.

### 6.1 Action method signatures (the carrier interface)

Each carrier controller exposes static methods. The minimum set is defined by `ICarrier` and used by `Ship::handleCarrierAction`:

```php
public static function rate(Action $data)        // returns RateBreakdown[] or equivalent
public static function generate(Action $data)    // returns GenerateBreakdown
public static function track(Action $data)       // returns TrackBreakdown
public static function cancel(Action $data)      // returns CancelBreakdown
public static function pickup(Action $data)      // returns PickupBreakdown
```

Plus optional methods for auxiliary actions: `branch`, `billOfLading`, `manifest`, `nDreport`, `complement`, `advancedTrack`.

### 6.2 LTL/FTL variants

For LTL/FTL, methods are suffixed: `rate1` (parcel — same as `rate`), `rate2` (LTL), `rate3` (FTL). Same for `generate1/2/3`, `pickup1/2/3`, `cancel1/2/3`. Implemented per carrier as needed.

### 6.3 Shared utilities used by carriers

- `app/ep/util/CarrierUtil.php` (7,734 lines) — **god class.** Contains: address validation, coverage checks, weight/volume calculations, shipment persistence, status updates, token resolution, custom-key resolution, charge/refund triggers, etc. **Most carrier files call CarrierUtil heavily.**
- `app/ep/util/Util.php` — generic helpers (action parser, shipment type parser, currency, JSON helpers, transaction rollback).
- `app/ep/util/TmsUtil.php` (99 lines) — TMS HTTP calls (cancellation refund, COD payment, COD chargeback).
- `app/ep/util/JwtUtil.php` — JWT encoding/decoding.

## 7. Core actions

### 7.1 Rate — `POST /ship/rate`

Quotation. Optional service. Call this before generate.

**Action class:** `app/ep/actions/Rate.php`. Loads full `User` model (company context, restrictions, billing). Builds an Address-Package-Shipment-Settings context with `$international`, `$taxesApply` (delegates to `CarrierUtil::shouldApplyTaxes`), `$customKey`, `$pricePlans`.

**Carrier method called:** `Carrier::rate($data)` (or `rate1`/`rate2`/`rate3` for LTL/FTL).

**Returns:** array of rate options per carrier service (price, transit time, declared currency).

**Reference doc:** `knowledge-base/actions/rate/rate.md`. Carrier rate API modes (per-package vs MPS) covered in `knowledge-base/actions/rate/carrier-rating-api-modes.md`. ⚪

### 7.2 Generate — `POST /ship/generate`

Create shipment + obtain label. Consumes balance.

**Middleware difference:** the only `/ship/*` route with `token-history` middleware (records the action against the token).

**Action class:** `app/ep/actions/Generate.php`. Loads `User` with `overCharges` relation, TMS token on company, debts/status checks. Optional shop→company switch for warehouse shops. Sets `$transactionId = "{companyId}{time}"` via `uniqid()` (placeholder for transaction persistence). Has `loadPickupData()` that builds a nested `$pickup = new Pickup($userRaw, $request)` when pickup is requested alongside generate.

**International rule:** `$international = true` if origin and destination countries differ AND validates the company's international flag.

**Carrier method called:** `Carrier::generate($data)`. The carrier validates input, calls its WS, persists the shipment + tracking number, charges balance via TMS, returns `GenerateBreakdown` (label as base64 or URL, tracking number, totals).

**Charge/rollback flow:** if anything fails after the TMS charge, `Ship::handleException` → `rollbackTransaction($e->data)` → `Util::rollbackTransaction($tmstkn, $chargeId)` reverses the charge. This is the safety net.

**Reference doc:** `knowledge-base/actions/generate/generate.md`.

### 7.3 Track — `POST /ship/track`

**Internal use only.** Updates DB status. NOT for direct API client use — that's `generaltrack`.

**Action class:** `app/ep/actions/Track.php`. Inherits `$user` as numeric user_id only — no `User` Eloquent load (performance). Validates carrier+locale pair exists. Validates `count(trackingNumber) <= track_limit` (carrier's `track_limit` field, default cap 10 if null).

**Side effects (the major track-driven business logic):**

- `CarrierUtil::updateStatusWithDates` — DB status + event dates updated.
- `CarrierUtil::trackChangeOvercharges` — overweight charge to TMS if `status=Delivered` AND `carrier_weight > declared_weight`. Skipped if company in `company_overcharges_exceptions` OR custom key.
- COD payment trigger if `status=Delivered (3)` (see §8.2).
- COD chargeback if status leaves Delivered (4-hour delay; see §8.3).
- RTO charge if status becomes Returned (11) or Delivered at Origin (13).
- Cancel-but-used charge if status leaves Canceled (4).
- Notifications and webhooks may be sent.

**Reference doc:** `knowledge-base/actions/track/track.md`.

### 7.4 Cancel — `POST /ship/cancel`

**Action class:** `app/ep/actions/Cancel.php`. If requester is admin, `$user` is replaced with the shipment creator's user (so context is from the company that created the shipment, not the admin).

Builds:
- `$shipment` from `CarrierUtil::getShipmentToCancel($this)`.
- `$exceedRefundLimit = (admin) ? false : CarrierUtil::checkRefundLimit($shipment)`.
- `$customKey` if shipment has `custom_key`.

**Carrier method called:** `Carrier::cancel($data)`. Calls carrier's `cancelWS` (if supported), then `self::fullCancel($data, $validateRefund)` from `CancelTrait`.

**Refund flow detail:** see §9.

### 7.5 Pickup — `POST /ship/pickup`

**Action class:** `app/ep/actions/Pickup.php`. Admin can override company via `settings.companyId`. Resolves `$origin`, `$shipment` (with locale id from origin/import/third-party rules), `$fee` (validated against company balance if > 0).

**Special flag:** `$thirdParty = true` when tracked shipments use international third-party service (`services.international = 3`). This is the **fourth value** of the `services.international` field (the others: 0=domestic, 1=origin-bound, 2=bidirectional). Confirmed via `services` table and pickup.md doc.

**Special flag:** `$isImportPickup` when all referenced shipments are import pickups sharing the same destination locale.

**Carrier method called:** `Carrier::pickup($data)` (or `pickup1`/`pickup2`/`pickup3`). Runs `CarrierUtil::pickupValidations`, calls carrier WS, persists via `CarrierUtil::savePickup`. Returns `PickupBreakdown` (pickup number, saved ID, etc.).

## 8. Track-driven side effects

Track is the most consequential action — it has FIVE distinct side effects. All triggered from carrier-specific track flow (after `CarrierUtil::updateStatusWithDates`).

### 8.1 Overweight charge

**Trigger:** track flow detects `status = Delivered (3)` AND `carrier_weight > declared_weight`.

**Mechanism:** `CarrierUtil::trackChangeOvercharges($changeData)` calls TMS to charge the difference.

**Exceptions:**
- Company in `company_overcharges_exceptions` table → no charge.
- Custom carrier key configured → no charge (TMS resolves this).

**Reference doc:** `knowledge-base/actions/track/overweight.md` (concise — the deep dive is `carrier-services/carriers-v2/sobrepesos-deep-dive.md`, not yet read in this iteration ⚪).

### 8.2 COD payment

**Trigger:** track flow detects `status = Delivered (3)`.

**Mechanism:** `TmsUtil::processCashOnDelivery($data, $chargeback=false)` POSTs to `ENVIA_TMS_HOSTNAME/payment-cod` with `{ shipment_id }`. TMS validates again that status=3, computes amount, creates payment via Ecart Pay.

**Auth:** TMS-specific JWT minted from `company_id` (`TmsUtil.php:8-18`). Different from Envia portal JWT.

**Reference doc:** `knowledge-base/actions/track/cash-on-delivery.md` + deep-dive `carriers-v2/cod-deep-dive.md` (read).

### 8.3 COD chargeback

**Trigger:** track flow detects status LEAVES Delivered (was 3, now something else). E.g. paquete ya entregado pero el cliente dice que no llegó → status downgraded.

**Mechanism:** Same `TmsUtil::processCashOnDelivery($data, $chargeback=true)` but with route `/chargeback-cod` instead of `/payment-cod` (line 23 of TmsUtil).

**Delay:** **4-hour delay** before triggering (per `knowledge-base/general.md` Section 3) — to avoid spurious chargebacks from carrier status flapping.

### 8.4 Return to Origin (RTO)

**Trigger:** track flow detects new status = Returned (11) OR Delivered at Origin (13).

**Mechanism:** TMS check based on service config — some services include RTO charge in base fee, others charge separately.

**Reference doc:** `knowledge-base/actions/track/return-to-origin.md` ⚪

### 8.5 Cancel-but-used

**Trigger:** track flow detects status LEAVES Canceled (4) — i.e., the shipment was cancelled in the platform but the carrier actually used the label.

**Mechanism:** TMS charge for the used (but cancelled in platform) shipment.

**Reference doc:** `knowledge-base/actions/track/cancel-but-used.md` ⚪

### 8.6 Status code reference

| Status | Code | Triggers |
|--------|------|----------|
| Delivered | 3 | COD payment, overweight charge |
| Canceled | 4 | (leaving this state → cancel-but-used) |
| Returned | 11 | RTO charge |
| Delivered at Origin | 13 | RTO charge |

Other status codes exist but only these are direct side-effect triggers.

## 9. Cancel + Refunds (TMS chain)

Detailed in `knowledge-base/actions/cancel/refunds.md`. Summary:

### 9.1 Chain

```
POST /ship/cancel
  → ApiController@shipRequest
    → Ship::process
      → Cancel action constructor (loads shipment, exceedRefundLimit, customKey)
        → Ship::handleCarrierAction
          → Carrier::cancel($data)
            → carrier's cancelWS($data)
            → self::fullCancel($data, $validateRefund)  (CancelTrait)
              IF $exceedRefundLimit && $validateRefund:
                only cancelDBTransaction($data)  ← no TMS, no refund
              ELSE:
                TmsUtil::cancelShipmentRefund($data)  ← POST to TMS /cancellation
                shipment->refresh()
                if balance_returned != 1: emit cancellation event + log
                EcommerceUtil::cancelFulfillment($data)
                webhook + email
```

### 9.2 TmsUtil::cancelShipmentRefund

**File:** `app/ep/util/TmsUtil.php:68-98`.

POST to `ENVIA_TMS_HOSTNAME/cancellation` with:

```json
{ "shipment_id": <id>, "message": "Saldo devuelto al cliente" }
```

JWT auth: `{ company_id, user_id (admin's user_id if admin else regular user.id) }`, exp=30s.

On exception: caught, Sentry logged, returns `true` (so cancel flow continues with fulfillment cancel + notifications).

### 9.3 Refund limit (CarrierUtil::checkRefundLimit)

**Companies in whitelist** (`$companiesNotRefundLimit`): 70279, 456605, 75110, 649207 → never limited.

**For everyone else:** count cancelled shipments today (`utc_created_at >= date('Y-m-d')`) for same company + same `shipment_type_id` + same carrier + `balance_returned = 1` + `custom_key = 0`.

Limits per shipment_type:
- **1 (box/parcel):** 5
- **2 (pallet):** 2
- **3 (truck):** 5

If count ≥ limit → `exceedRefundLimit = true` → with `fullCancel($data, true)` skips TMS call.

### 9.4 Admin override

Admin user → `exceedRefundLimit = false` always → refund always requested.

### 9.5 Custom key

Shipment with `custom_key` → no refund applied. Enforced by TMS, not carriers — `TmsUtil::cancelShipmentRefund` is still called but TMS skips the refund.

### 9.6 fullCancel second arg ($validateRefund)

Each carrier decides whether to pass `true` or `false` to `fullCancel`. Examples (from refunds.md):
- `true`: Tdn, Sendex, Starken, Usps.
- `false` or condition: CargoExpreso (always `FullCancel($data)` = no validate), FedexRest (only validate in MX and `company != 5093`).

This decides whether the refund-limit check runs.

## 10. Insurance products

**THREE distinct products. The MCP `insurance_type` enum is correct in shape but the documentation does not differentiate them.** Source: `knowledge-base/carrier-services/carriers-v2/envia-insurance-deep-dive.md` and `ups-alto-valor-deep-dive.md`.

### 10.1 Envia Seguro (`envia_insurance`) — the default cross-carrier product

| Attribute | Value |
|-----------|-------|
| **Owner** | Envia (cross-carrier) |
| **Coverage cap** | **5,000 USD per package** (or local equivalent at current FX) |
| **Minimum** | 1,000 MXN equivalent |
| **Cost** | **1% of declared value + IVA** |
| **Country minimums (per package, before IVA)** | MX 10 MXN, US 1 USD, ES 1 EUR, CO 0 COP, others vary |
| **Coverage scope** | Damage, missing items, total loss by theft or extraction |
| **Validity** | From contracting until 48 business hours after delivery (or loss report) |
| **Claim flow** | Through Envia platform form. 48h to file, 5 days for docs, 72h for non-conformity |
| **Reimbursement formula** | `min(declared, invoice_value) × 0.80 (deductible) × severity%` where severity = 25%/50%/100% (light/moderate-functional/irreparable) and theft/loss = base rule no severity reduction |
| **NOT covered** | All electronics (any value), used/refurbished/collector items, prohibited items, customs/government inspections, oficial documents, indirect losses |
| **Available in catalog** | 14 of 19 sandbox combinations tested (verified in `ADDITIONAL_SERVICES_CATALOG_VERIFIED.md`). **Not present in MX/US/BR LTL or BR/CO domestic parcel** (because of regulatory `insurance` displacement in BR/CO). |
| **Tooltip default in catalog** | $2,000 (from `plan_type_prices.activation_price` for `plan_type_id=2`, locale_id of logged-in user) — NOT the cap, just a UI hint |

### 10.2 High Value Protection (`high_value_protection`) — UPS-only premium

| Attribute | Value |
|-----------|-------|
| **Owner** | UPS (Envia is intermediary) |
| **Carrier exclusivity** | **UPS ONLY** — no other carrier supports it |
| **Country rule** | **MX as origin OR destination.** Verified by 30 sandbox combinations (11/11 positive when MX involved, 0/6 negative when MX not involved). Backend SQL: `services.international = 2` + locale `country_code=MX` + bidirectional country IN clause when destination provided. |
| **Coverage caps** | Domestic UPS: 125,000 MXN per package, 500,000 MXN per shipment. International UPS: 10,000 USD per package, 50,000 USD per shipment. |
| **Minimum declared value** | National MX > 1,000 MXN. International > 100 USD. |
| **Cost** | Variable (per company contract) |
| **Coverage scope (DIFFERENT from Envia Seguro)** | Damage and loss in transit by UPS for misc, documents, jewelry, miscellaneous goods. **DOES cover electronics and jewelry** (this is the key reason to use it over Envia Seguro). |
| **NOT covered** | Customs losses/damages, fraud/impostor cases, prohibited items |
| **Operational requirements** | **Neutral packaging (no logos/marks)**, double box, internal cushioning ≥2 layers bubble wrap, ≥2.5cm clearance from walls, 100% fill, H-tape with reinforced adhesive, single label per box visible, copy of guide inside |
| **Claim window for jewelry/watches** | **48 hours** (stricter than other goods) |
| **Documentation** | Invoice or proof of value. Reimbursement = min(invoice, declared, repair cost) up to caps |
| **Available services** | 9 UPS Mexico services: Saver, Standard, Standard Import, Worldwide Express, Worldwide Express Import, Worldwide Express Plus, Worldwide Express Plus Import, Worldwide Saver, Worldwide Saver Import |
| **Available in catalog** | 7 of 19 combinations (MX domestic + 6 intl combos with MX origin or destination) |

### 10.3 `insurance` (carrier-native / regulatory) — actually two distinct products under one name

The catalog returns rows with `name='insurance'` but TWO different `id`s:

| ID | Description | Shipment type | Used for |
|----|-------------|---------------|----------|
| 14 | "Seguro (LTL)" | 2 (LTL) | LTL declared value (carrier-native) |
| 52 | "Insurance (Carrier)" | 1 (parcel) | BR/CO domestic regulatory insurance + carrier-native in some other contexts |

**Per Jose's confirmation:** the `insurance` code applies in **Brazil and Colombia by country regulation** (mandatory declared-value mechanism). The `insurance` rows in non-BR/CO contexts (US, GT, MX-LTL) are different — likely carrier-native LTL declared value or carrier-specific surcharges.

**Functionally for the customer in CO/BR:**
- Domestic CO/BR: only "Seguro" toggle visible (no "Envía Seguro"). Coverage = 5,000 USD equivalent. Same exclusions, same claim flow as Envia Seguro.
- Outbound international CO/BR: both "Seguro" + "Envía Seguro" coexist (with some route exceptions, e.g. BR→Peru only has "Seguro").
- Reimbursement, deductible, severity scale: identical to Envia Seguro standard.

**Internal technical distinction:**
- `envia_insurance` → UI shows "Envía Seguro" — cross-carrier Envia product.
- `insurance` → UI shows "Seguro" — local regulatory product.
- Difference: the `insurance` is regulatory/automatic in BR/CO domestic; `envia_insurance` is opt-in.

### 10.4 Custom keys + insurance interaction

Per `llaves-personalizadas-deep-dive.md`: when a company has custom keys configured for a carrier, **Envia Seguro is processed internally with the name `insurance`** (instead of `envia_insurance`). Functionally identical — same 5,000 USD cap, same exclusions, same claim flow. Just an internal naming difference.

### 10.5 Mutual exclusivity

The MCP enforces "only one insurance type at a time" via `validateInsuranceExclusivity` (`src/builders/additional-service.ts`). Backend enforcement TBD ⚪. In the UI: in CO/BR international outbound, both `insurance` and `envia_insurance` can coexist on the same shipment (per envia-insurance-deep-dive.md §10.1). So the MCP's exclusivity rule may be too strict for that case ⚪.

## 11. Cash on Delivery

Source: `knowledge-base/carrier-services/carriers-v2/cod-deep-dive.md`.

### 11.1 General rules (all carriers with COD)

- **Payment in cash only.**
- **Maximum per shipment: 10,000 MXN** equivalent. Platform-level cap. Carriers may have lower internal caps.
- **Settlement days: Tuesdays and Fridays only.** Envia transfers collected COD to Ecart Pay on these days.
- **Commission deducted** at settlement.

### 11.2 Carriers with COD enabled (verified per cod-deep-dive.md §5)

| Country | Carriers / services |
|---------|---------------------|
| **Mexico** | FedEx **only via "Nacional Económico COD"** service (`ground_cod`). Other FedEx MX services NO. Some local carriers also support it. |
| **Colombia** | Coordinadora (Ground + Ecommerce). Other locals possibly. |
| **Spain** | Correos España, Correos Express, CTT Express, BRT Italy (when applicable to ES/IT shipments). |
| **Brazil** | Jadlog (several services). |
| **Chile** | Some local carriers. |
| **India** | **Strong COD market.** Delhivery, BlueDart, Ekart, Amazon India, XpressBees. |
| **United States** | UPS variable per service. **FedEx US: NOT enabled** in platform (although FedEx US itself supports COD up to 10k USD). |
| **Guatemala** | Cargo Expreso. |

### 11.3 Pricing (commission)

Two coexisting configurations:

**11.3.1 Service-level config:** each COD-enabled service has min commission + base %. E.g. FedEx "Nacional Económico COD" MX: minimum **10,000 MXN per package** (yes, very high). Coordinadora Ground CO: minimum 5,000 COP at service level.

**11.3.2 Addon-level config:** some carriers charge via separate addon with formula `max(% × cod_amount, fixed_min)`. Catalog approximations:

| Country | % | Min per package |
|---------|---|----------------|
| Mexico | varies per carrier | 3,500–10,000 MXN |
| Colombia | 3.0%–3.5% | 3,000–3,500 COP |
| Chile | varies | varies |

**Dynamic resolution required for exact cost.** Use `/additional-services/prices/{service_id}` (queries) — see §17 and §11 of `ADDITIONAL_SERVICES_CATALOG_VERIFIED.md`.

### 11.4 Money flow timeline

```
Day 0:  Sender creates COD guide with amount X
Day D:  Carrier delivers + collects X cash from recipient
Day D+1..D+3: Carrier reports collected COD to Envia
Next Tue/Fri: Envia transfers X (minus commission) to Ecart Pay
                + applies AUTOMATIC compensation against any negative balance / overdue invoices
From Ecart Pay: Customer requests withdrawal → 3 business days to bank
```

### 11.5 Risk to remitter

**Per T&C §3.13:** if recipient does NOT pay, the **remitter is fully responsible for the unpaid amount** in the Envia platform. Carrier and Envia don't absorb the loss.

### 11.6 Automatic compensation (T&C §3.13 — sensitive)

User authorizes Envia to **compensate, retain, and apply** any COD amount against:
- Negative account balances
- Overdue invoices
- Any pending Envia debt

No additional authorization needed (granted at T&C acceptance). Process:
1. If user has negative balance/overdue invoices → Envia instructs Ecart Pay to apply COD to debts.
2. Apply as account balance recharge OR direct invoice payment.
3. Notify user.
4. Remainder (if any) settled normally.

## 12. Custom keys (llaves personalizadas)

Source: `knowledge-base/carrier-services/carriers-v2/llaves-personalizadas-deep-dive.md`.

### 12.1 What they are

Customer's own carrier credentials (FedEx account#, UPS access keys, DHL keys) registered with Envia. When configured, Envia quotes/generates using the customer's carrier account → access to **customer's pre-negotiated rates** (typically 30-50% cheaper for high-volume customers).

### 12.2 Carriers that support custom keys

Practically: FedEx, UPS, DHL (the big 3 with API+credential pattern). Smaller national carriers don't support this — customers use Envia's negotiated rates instead.

### 12.3 What changes when custom keys are active

- **Quote:** rates come back as customer's contract rates from carrier.
- **Generate:** label issued under customer's carrier account; carrier bills customer directly.
- **Billing split:** customer pays carrier for shipping + Envia for platform admin fee (`custom_key_cost` field on shipment).
- **Insurance internal naming:** Envia Seguro is processed as `insurance` instead of `envia_insurance` (same product to customer, internal technical difference).
- **Surcharges (fuel, residential, signature):** carriers may bill these directly to customer's account, bypassing Envia.

### 12.4 Storage

Credentials stored **encrypted (AES)** in Envia. Never appear in plain text. Onboarded via support (handoff pattern).

### 12.5 Field reference

Shipment table columns relevant:
- `custom_key` — boolean flag, set when generated under customer's keys.
- `custom_key_cost` — Envia's admin fee for this shipment.

### 12.6 Refund interaction

Per §9.5: shipments with `custom_key` → no refund applied (TMS skips). The carrier billed the customer directly; Envia has nothing to refund.

## 13. Extended zones

Source: `knowledge-base/carrier-services/carriers-v2/extended-zone-deep-dive.md`.

### 13.1 What it is

Automatic surcharge applied when origin or destination is outside carrier's standard coverage area (rural, remote islands, low-density). **NOT optional, customer cannot disable.**

### 13.2 Calculation methods

| Method | Carriers using it | Detail |
|--------|------------------|--------|
| **Flat rate** | FedEx Mexico (220 MXN per shipment) | Fixed, regardless of weight/value |
| **Percentage on carrier's reported charge** | FedEx US, UPS US (carrier reports cost in vivo, Envia adds 10% margin) | Variable — only known after live quote |
| **Per-weight** | Some LTL/intl carriers | Per kg with optional minimum |
| **Embedded in service base price** | Some carriers | No separate line — included in rate |

### 13.3 Classification mechanisms

| Mechanism | Carriers | How |
|-----------|---------|-----|
| **Master tables of postal codes** | Paquetexpress MX (~144,000 CPs in two tables), European carriers (BRT, Cainiao, Chronopost, PosteItaliane, Seur), India (Delhivery, BlueDart, etc.) | DB lookup |
| **Live carrier WS** | FedEx US, UPS, DHL | Carrier returns extended zone charge in rate response |
| **Hardcoded logic** | InPost España (Baleares/Canarias auto), Delhivery India (metro vs non-metro), BRT Italy (south/Sicily/Sardinia) | Code rules |

### 13.4 Country-specific complexity (highlights)

- **Spain CTT Express:** 5 categories: PENINSULAR (1,612), Peninsular Plus (433), REGIONAL (309), PROVINCIAL (47), **NO PERMITIDO (735 — shipment is rejected)**.
- **Spain SEUR:** 5 tiers (Madrid, Provincial, Limítrofes, Regional, Peninsular) + 12,267 extended-zone CPs in universal table.
- **Italy BRT:** 2,616 extended CPs + 109 ferry CPs (Sicily/Sardinia ferry fee separate from extended zone).
- **France/intl Chronopost:** classifies almost all non-France destinations as extended (US 29,346 CPs, BR 25,665, CN 20,201, FI 19,554, IN 13,494, RO 12,630, MX 10,488, etc.).
- **India:** zones with letter codes (D, D2, E, N1, N2, NE, W1, W2, S1, S2, C). Delhivery has 6.6M origin×destination pairs.
- **Brazil Loggi:** zone codes like `SP RED`, `MG INT 4`, `RJ CAP` — 100+ categories.

### 13.5 Adjacent surcharges (similar but distinct)

| Surcharge | Carriers | Detail |
|-----------|---------|--------|
| **Ferry fee** | BRT Italy, some España carriers | Sea transport surcharge — applies IN ADDITION to extended_zone |
| **Remote area** | Some carriers | Stricter than extended zone, separate charge |
| **Both extended** | Some | Double charge if origin AND destination are both extended |
| **OOA / ODA (India)** | Delhivery | Out of Delivery Area — same semantic as extended zone |
| **State Charge (India B2B)** | Delhivery LTL | Crossing states surcharge, stacks on extended_zone |
| **No Permitido** | CTT España | Not a charge — flat rejection |

### 13.6 Customer options

Cannot remove the charge. Can:
1. Switch carrier (different classification).
2. Change destination to non-extended nearby (e.g. send to carrier's branch).
3. Consolidate multiple shipments into one.

## 14. Auxiliary actions 🟡 — partial coverage

Limited material in this iteration. Tracked for next pass:

- **Bill of Lading / Commercial Invoice** (`POST /ship/billoflading` ≡ `/ship/commercial-invoice`): action class `BillOfLading`. Schema TBD ⚪. Reference: `knowledge-base/actions/bill-of-lading/bill-of-lading.md` ⚪.
- **Manifest** (`POST /ship/manifest`): action class `Manifest`. Optional `handleActionWithoutGuard` path. Reference: `knowledge-base/actions/manifest/manifest.md` ⚪.
- **NDR Report** (`POST /ship/ndreport`): action class `NDReport`. Reports carrier action codes for delivery problems (retry, change address, return, etc.). Reference: `knowledge-base/actions/ndr-report/ndr-report.md` ⚪.
- **General Track** (`POST /ship/generaltrack`): action class `GeneralTrack`. **Public, no auth.** Returns movement history without DB updates. Strips `customKey` from response (Ship.php:138-141). Reference: `knowledge-base/actions/general-track/general-track.md` ⚪.
- **Complement** (`POST /ship/complement`): SAT carta porte complement (Mexico fiscal). Reference TBD ⚪.

## 15. DB schema — critical observations

From `knowledge-base/queries/*.csv` (production DB dumps).

### 15.1 Carriers (`1_prod_carriers.csv`)

**168 rows.** Columns include: `carrier_id`, `carrier_name`, `controller` (matches PHP class name), `carrier_description`, `locale_id`, `carrier_country_code`, `carrier_country_name`, `carrier_currency`, `priority`, `is_private`, `allows_mps`, `allows_asyc_create`, `box_weight`, `pallet_weight`, `carrier_volumetric_factor`, `carrier_volumetric_unit`, `include_vat`, `tax_percentage_included`, `pickup_fee`, `daily_pickup_limit`, `pickup_sameday`, `pickup_start`, `pickup_end`, `pickup_span`, `pickup_limit`, `track_limit`, `tracking_delay`, `endpoint`, `track_url`, `webhook_token`.

**Critical fields for the agent:**
- `track_limit` — max tracking numbers per `/ship/track` request (default cap 10 if NULL).
- `pickup_start` / `pickup_end` — daily pickup window in carrier's local hours.
- `daily_pickup_limit` — max pickups per day.
- `carrier_volumetric_factor` — common values: 5000 (most), some have 6000, very few different. **Per LESSON L-S4: do NOT trust code inferences; the factor lives in this table.**
- `is_private` — boolean, identifies private carriers (only available to specific companies via `company_private_carriers`).
- `allows_mps` — supports Multi-Package Shipments.

### 15.2 Services (`2_prod_services.csv`)

**473 rows.** This is the carrier × service grid. Columns: `carrier_name`, `carrier_controller`, `service_id`, `service_code_internal`, `service_name`, `service_description`, `service_code_carrier`, `international`, `service_scope`, `shipment_type_id`, `shipment_type_name`, `delivery_type_code`, `delivery_type`.

**Critical: `services.international` has 4 values (verified by extracting the distinct set):**

| Value | Meaning |
|-------|---------|
| **0** | Domestic only |
| **1** | International, origin-bound (only when origin country matches the service's locale) |
| **2** | International, **bidirectional** (origin OR destination matches locale) — high_value_protection uses this |
| **3** | International, **third-party** (e.g. import shipments where neither origin nor destination is the service's locale, but a third-party billing arrangement applies) — used by Pickup's `$thirdParty` flag |

The bidirectional logic is implemented in queries' `additionalServices` controller (`services/queries/controllers/service.controller.js:399-440`): when `international=1` is requested AND a destination_country is provided, the query adds `2` to the IN clause and the destination country to the country IN clause. This is what makes high_value_protection appear in CO→MX, BR→MX, US→MX, etc.

### 15.3 Locales (`12_prod_locales.csv`)

**232 rows.** Columns: `id`, `country_code`, `country_name`, `currency`, `currency_symbol`, `language_id`, `exchange_rate_to_usd`, `shipment_avg_cost`, `continent`, `country_verification`, `locale_operation`, `invoice_type_amount`, `updated_at`.

Multiple locale rows per country are common (one per language/currency variant).

### 15.4 Catalog tables

Available CSVs:
- `7_prod_catalog_additional_services.csv` — master catalog of additional services (the rows joined in the catalog endpoint).
- `3_prod_additional_service_prices.csv` — pricing per service × additional_service. Has `mandatory` and `active` flags.
- `5_prod_additional_service_plan_definitions.csv` — plan-based definitions.
- `6_prod_additional_service_custom_prices_*.csv` — company-specific overrides.
- `4_prod_additional_service_conditions.csv` — conditions.
- `8_prod_catalog_price_operations.csv` — operation types (% / fixed / tiered) for prices.
- `9_prod_carrier_surcharge_codes.csv` — surcharge codes per carrier.
- `11_prod_catalog_shipment_types.csv` — shipment types (1/2/3 = parcel/LTL/FTL).
- `13_prod_catalog_delivery_estimates.csv` — delivery time estimates.
- `14_prod_catalog_volumetrict_factor.csv` — volumetric factor catalog.
- `15_prod_crossborder_companies.csv` — companies with crossborder enabled.
- `17d_prod_schemas.csv`, `17f_prod_contenido_forms.csv`, `17g_prod_que_addons.csv` — schemas, content forms, addons (TBD ⚪).
- `g1_information_schema_geocodes.csv` — geocodes table schemas.
- Multiple zone tables: `g2`-`g16` (extended zones, ferry zones, India pincodes, Spain zones, Paquetexpress zones).

These dumps are the **canonical reference** for what's in production. Use them BEFORE inferring from controllers.

## 16. Inter-service dependencies

The carriers service is the hub but depends on several others.

### 16.1 TMS (Transaction Management Service) via `ENVIA_TMS_HOSTNAME`

**Calls made by carriers:**

| Endpoint | Trigger | Purpose | Code reference |
|----------|---------|---------|----------------|
| `POST /apply` (or similar) | `Generate` action | Charge balance for shipment | `Util::applyTransaction` ⚪ |
| `POST /rollback` | `Ship::handleException` | Reverse charge on generate failure | `Util::rollbackTransaction` |
| `POST /payment-cod` | Track flow detects status=Delivered (3) | Trigger COD payment via Ecart Pay | `TmsUtil::processCashOnDelivery($data, false)` |
| `POST /chargeback-cod` | Track flow detects status leaves Delivered | Trigger COD chargeback (with 4h delay) | `TmsUtil::processCashOnDelivery($data, true)` |
| `POST /cancellation` | `CancelTrait::fullCancel` | Refund balance to customer | `TmsUtil::cancelShipmentRefund` |
| (overweight charge) | Track flow detects overweight | Charge overweight fee | `CarrierUtil::trackChangeOvercharges` ⚪ |
| (RTO charge) | Track flow detects status 11 or 13 | Charge RTO if config requires | ⚪ |
| (cancel-but-used charge) | Track flow detects status leaves 4 | Charge for cancelled-but-used shipment | ⚪ |

**Auth:** TMS-specific JWT minted from `company_id` (and `user_id` for cancellation). 30-second expiration. NOT the same as Envia portal JWT (per Sprint 2 verification — see `_docs/SPRINT_2_BLOCKERS.md`).

### 16.2 Geocodes via `ENVIA_GEOCODES_HOSTNAME` (or default `https://geocodes.envia.com`)

**Calls (mostly via `CarrierUtil` / `Address` model, not yet fully traced ⚪):**

- `POST /location-requirements` — tax-rules + items[] requirement (Brazil/India domestic-as-international, US↔PR, ES→Canarias, FR→Overseas, intra-EU). Used by `CarrierUtil::shouldApplyTaxes` and rate/generate.
- `GET /locate/CO/{state?}/{city}` — Colombia DANE code resolution.
- `GET /brazil/icms/{origin}/{destination}` — Brazil interstate ICMS.
- `GET /zipcode/{country}/{code}` — postal code lookup.

Geocodes has NO sandbox. All carriers point at production geocodes regardless of environment.

### 16.3 Queries via `ENVIA_QUERIES_HOSTNAME` ⚪

Limited direct calls from carriers. The relationship is mostly the other direction (queries calls carriers). One known case: notification triggers from track flow → queries' `/notification` endpoint.

### 16.4 S3

Label storage. Bucket name TBD ⚪.

### 16.5 Redis

Token caching, response caching. Config in `.env`. TBD ⚪.

### 16.6 Carrier APIs (external)

168 distinct carriers. Each has its own auth pattern. Custom keys per company supported via `config_custom_keys` table (decrypted at runtime via `CarrierUtil::decryptToken`).

### 16.7 Sentry + New Relic

Active in `Ship.php:196-228`. Sets user/company tags on every request.

## 17. MCP coverage gap analysis

The MCP currently exposes 72 user-facing tools. Of those, ~19 hit the carriers service (per `_docs/BACKEND_ROUTING_REFERENCE.md`). What does carriers expose that the MCP does NOT?

### 17.1 Endpoints exposed by carriers, in MCP today

✅ rate, generate, track, cancel, pickup, branches (search-branches), schedule-pickup, track-pickup, cancel-pickup, manifest, bill-of-lading, ndr-report, complement, validate-address (zipcode), list-carriers, list-additional-services, classify-hscode, ai-parse-address, ai-rate, get-shipment-history, create-commercial-invoice (alias of BOL).

### 17.2 Endpoints exposed by carriers, NOT in MCP today

| Endpoint | Why not exposed |
|----------|----------------|
| `POST /plan-quote` (legacy) | DB-based plan quote. Legacy mechanism. Probably superseded by `quote_shipment`. |
| `POST /v2/plan-quote-ws` | V2 plan quote. Same reason. |
| `POST /v2/checkout/{ecommerce}/{shopId}` | Ecommerce checkout flow. Not user-facing in chat. |
| `POST /locate` | City lookup. Internal helper (geocodes alternative). Could be wrapped if needed. |
| `GET /zonos/*` | Cross-border via Zonos. Specialized batch flow — admin-tinted. |
| `GET /taxes/company-percentage/{companyId}` | Tax % for a company. Could be exposed as user-facing tool. |
| `POST /taxes/calculate` | Tax calculator. Could be exposed. |
| `POST /v1/ship/*` (raw) | V1 returns raw carrier responses. Useful for debugging but not for end-users. |
| `POST /ship/{action}` (catch-all) | Reserved for future actions. |

### 17.3 MCP infrastructure gaps (from prior iterations)

- **Multi-field additional services** (Gap 10 — see `ADDITIONAL_SERVICES_CATALOG_VERIFIED.md`): MCP `buildAdditionalServices` only emits `{ service, data: { amount } }`. Cannot send `electronic_trade_document` (FedEx ETD), `hazmat`, `delivery_appointment`, `pickup_appointment` (LTL date), `delivery_collection`/`pickup_collection`. SILENT failure today.
- **Carrier-restricted services** (Gap 17): high_value_protection requires UPS; FedEx-branded services (priority_alert, ship_alert, fedex_etd, third_party_consigne, int_broker_select) require FedEx. MCP doesn't validate before sending. Carriers reject at generate.
- **Mandatory services hidden** (Gap 18): catalog filters `mandatory IS FALSE`. Agent never sees mandatory regulatory ones (e.g. CO/BR domestic insurance is regulatory).
- **`apply_to` and `operation_id` semantics** (Gap 19): not documented. Real prices need parsing of these.
- **No tool wraps `/additional-services/prices/{service_id}`** (queries endpoint, not carriers, but related): would close Gap 1 (cost calc dynamic for add-ons).

### 17.4 Coverage gap by domain

| Domain | MCP coverage | Gap |
|--------|--------------|-----|
| Quote / rate | ✅ via `quote_shipment` | Inputs lack `additional_services` to price add-ons inline |
| Create label | ✅ via `create_label` | Multi-field add-ons silently dropped (Gap 10) |
| Track public | ✅ via `track_package` (uses `/ship/generaltrack`) | None major |
| Track internal | ❌ Not exposed (not appropriate — internal use only) | OK |
| Cancel | ✅ via `cancel_shipment` | Refund amount not surfaced in response |
| Pickup | ✅ via `schedule_pickup`, `track_pickup`, `cancel_pickup` | Pickup recurrence not supported |
| Branches | ✅ via `envia_search_branches` | None |
| Manifest | ✅ via `generate_manifest` | None major |
| BOL | ✅ via `generate_bill_of_lading` | None major |
| NDR | ✅ via `submit_nd_report` | None major |
| Complement | ✅ via `generate_complement` | None major |
| Tax calc | ❌ Not exposed | Possible gap if user asks "¿cuánto IVA me cobran?" |
| Insurance dynamic resolve | ❌ partial | Auto-pick `envia_insurance` vs `high_value_protection` from declared value + carrier (Gap 12) |

## 18. Open questions

For backend team to answer in a focused session. Each question maps to a specific BD query or code path.

1. **Track side effects exact code paths.** `CarrierUtil::trackChangeOvercharges` flow. Read code and document.
2. **`services.international = 3` exact semantics.** Inferred as third-party. Confirm via `services` rows + `Pickup` action `$thirdParty` use.
3. **Validation of insurance exclusivity at backend.** Does carrier reject when both `envia_insurance` and `high_value_protection` sent? Or only client-side enforcement?
4. **`plan_type_prices` definition.** What `plan_type_id` values exist? Is `plan_type_id=2` "envia_insurance plan" specifically? What other plan_type ids and what `activation_price` do they store?
5. **`additional_service_prices.mandatory=TRUE` rows.** Run query: which services have mandatory addons? Does `envia_insurance` show up in BR/CO? Does carrier-native `insurance` show up there? Validates §10.3 hypothesis.
6. **High Value Protection at services table.** Run query joining `additional_service_prices` × `services` × `carriers` × `catalog_additional_services` for `cas.name='high_value_protection'`. Does it return ONLY `c.name LIKE 'UPS%'` rows? If yes, UPS exclusivity is enforced at services tier. If no, lives in carrier integration code.
7. **Carrier-branded services exclusivity** (priority_alert, ship_alert, fedex_etd, third_party_consigne, int_broker_select). Same query pattern as #6.
8. **Refund limit constants.** Where are `5/2/5` for box/pallet/truck stored? Hardcoded in `CarrierUtil::checkRefundLimit` ⚪ — verify code.
9. **Companies whitelist for refund limit** (`$companiesNotRefundLimit = [70279, 456605, 75110, 649207]`). Where defined? Static array in `CarrierUtil` or DB? ⚪
10. **Cancel-but-used + RTO + overweight TMS endpoint paths.** TmsUtil only documents `/payment-cod`, `/chargeback-cod`, `/cancellation`. Where do overweight, RTO, cancel-but-used hit TMS? ⚪
11. **`CarrierUtil` size 7,734 lines.** What are the major sections? Is there a pre-existing `_docs/` of CarrierUtil's responsibilities? ⚪
12. **`CarrierUtil::shouldApplyTaxes` exact rules.** The function delegates to geocodes' `/location-requirements`, but the wrapper logic? ⚪
13. **`AbstractCarrier` parent class.** Methods provided to all carriers. Default implementations. ⚪
14. **JWT keys.** What private/public keys does Guard's JWT accept? Where are they stored? Rotation policy? ⚪
15. **Sandbox response shape parity vs production.** Many `_research/` docs hint at differences. Document the known ones. ⚪
16. **Rate WS modes.** `carrier-rating-api-modes.md` covers per-package vs MPS distinction. Read in next iteration. ⚪
17. **The sobrepesos (overweight) deep-dive.** `carriers-v2/sobrepesos-deep-dive.md` not yet read in this iteration. ⚪
18. **Mercancía prohibida list.** `carriers-v2/mercancia-prohibida.md` not yet read. ⚪
19. **Reclamos y reembolsos.** `carriers-v2/reclamos-y-reembolsos.md` not yet read. ⚪
20. **Pickup deep-dive.** `carriers-v2/pickup-deep-dive.md` not yet read. ⚪
21. **Handoff pattern.** `carriers-v2/handoff-pattern.md` heavily referenced but not yet read. ⚪
22. **Prior notice FDA deep-dive.** `carriers-v2/prior-notice-fda-deep-dive.md` not yet read. ⚪
23. **Carrier-specific docs**. 70+ `carriers-v2/<carrier>.md` files — only sampled. Per-carrier reference for nuanced behavior (e.g. FedEx country-specific quirks). ⚪
24. **Migrations / models / schemas.** Eloquent models and schemas not yet inventoried. ⚪
25. **Cron jobs (`/cron/{function}`)**. What functions run via cron? ⚪

## 19. References

### 19.1 Inside the carriers repo

**Routes & dispatcher:**
- `routes/web.php` — all routes (72 lines).
- `app/Http/Controllers/ApiController.php` — entry point, delegates to Ship.
- `app/ep/Ship.php` — central dispatcher (230 lines).
- `app/Http/Middleware/Auth.php` — bearer auth (66 lines).
- `app/ep/libraries/Guard.php` — token validation (79 lines).
- `app/ep/util/TmsUtil.php` — TMS HTTP calls (99 lines).

**Action classes:** `app/ep/actions/` — Rate, Generate, Track, Cancel, Pickup, Branch, BillOfLading, Manifest, NDReport, GeneralTrack + LTL/FTL/Raw variants.

**Carrier integrations:** `app/ep/carriers/` (controllers, 144 files), `app/ep/services/` (API clients), `app/ep/carriers/utils/` (utilities).

**Shared utilities:** `app/ep/util/CarrierUtil.php` (god class), `Util.php`, `JwtUtil.php`, `LogUtil.php`, `TmsUtil.php`.

**Standardized responses:** `app/ep/responses/` — RateBreakdown, GenerateBreakdown, etc.

**Schemas:** `app/ep/schemas/` — JSON validation schemas per action.

**Specs:** `ai-specs/specs/backend-standards.mdc`, `carrier-integration.mdc`, `documentation-standards.mdc`, `development-guide.mdc`.

**Curated knowledge:** `knowledge-base/` — read first before code-spelunking. Maps to topic, not file structure.

### 19.2 Knowledge base highlights (read-priority order for next iteration)

Already read:
- ✅ `knowledge-base/general.md`
- ✅ `knowledge-base/general/backend-conventions.md`
- ✅ `knowledge-base/actions/README.md`
- ✅ `knowledge-base/actions/rate/rate.md`
- ✅ `knowledge-base/actions/generate/generate.md`
- ✅ `knowledge-base/actions/track/track.md`
- ✅ `knowledge-base/actions/cancel/cancel.md`
- ✅ `knowledge-base/actions/pickup/pickup.md`
- ✅ `knowledge-base/actions/branches/branches.md`
- ✅ `knowledge-base/actions/cancel/refunds.md`
- ✅ `knowledge-base/actions/track/overweight.md`
- ✅ `knowledge-base/actions/track/cash-on-delivery.md`
- ✅ `knowledge-base/carrier-services/carriers-v2/cod-deep-dive.md`
- ✅ `knowledge-base/carrier-services/carriers-v2/llaves-personalizadas-deep-dive.md`
- ✅ `knowledge-base/carrier-services/carriers-v2/extended-zone-deep-dive.md`
- ✅ `knowledge-base/carrier-services/carriers-v2/envia-insurance-deep-dive.md`
- ✅ `knowledge-base/carrier-services/carriers-v2/ups-alto-valor-deep-dive.md`

Pending for next iteration ⚪:
- `knowledge-base/actions/track/chargebacks-cod.md`
- `knowledge-base/actions/track/return-to-origin.md`
- `knowledge-base/actions/track/cancel-but-used.md`
- `knowledge-base/actions/general-track/general-track.md`
- `knowledge-base/actions/manifest/manifest.md`
- `knowledge-base/actions/bill-of-lading/bill-of-lading.md`
- `knowledge-base/actions/ndr-report/ndr-report.md`
- `knowledge-base/actions/rate/carrier-rating-api-modes.md`
- `knowledge-base/carrier-services/MASTER-REFERENCE.md`
- `knowledge-base/carrier-services/technical-flows.md`
- `knowledge-base/carrier-services/services-matrix-top-10.md`
- `knowledge-base/carrier-services/carriers-v2/sobrepesos-deep-dive.md` (overweight)
- `knowledge-base/carrier-services/carriers-v2/mercancia-prohibida.md`
- `knowledge-base/carrier-services/carriers-v2/reclamos-y-reembolsos.md`
- `knowledge-base/carrier-services/carriers-v2/pickup-deep-dive.md`
- `knowledge-base/carrier-services/carriers-v2/handoff-pattern.md`
- `knowledge-base/carrier-services/carriers-v2/prior-notice-fda-deep-dive.md`
- `knowledge-base/carrier-services/carriers-v2/INDEX.md`
- 70+ per-carrier docs in `carriers-v2/` — read by need (FedEx, UPS, DHL, Estafeta first)

### 19.3 Cross-references in MCP repo

- `_docs/BACKEND_ROUTING_REFERENCE.md` — which MCP tool hits which backend.
- `_docs/COUNTRY_RULES_REFERENCE.md` — country-specific address rules.
- `_docs/ADDITIONAL_SERVICES_CATALOG_VERIFIED.md` — additional-services deep dive (3 iterations).
- `_docs/DECISIONS_2026_04_17.md` — Decisions A-E for v1 scope.
- `_docs/SPRINT_2_BLOCKERS.md` — TMS auth incompatibility.
- `_docs/V1_SAFE_TOOL_INVENTORY.md` — current MCP tool inventory.
- `_docs/LESSONS.md` — methodological corrections from prior sessions.

---

## Self-assessment — am I sure this is complete?

**No.** This is iteration 1 of this doc. Sections marked 🟡 are partial; ⚪ items in §18 (Open questions) and §19.2 (pending reads) are explicit gaps. Iteration 2 must:

1. Read all 25 pending items in §18 + §19.2.
2. Spelunk `CarrierUtil.php` (7,734 lines) for major sections.
3. Inventory `app/Models/` (128+ models).
4. Read 5-10 carrier-specific deep-dives for representative breadth (FedEx, UPS, DHL, Estafeta, Coordinadora, Paquetexpress, Correios, Sendcloud-equivalents, Delhivery, BlueDart).
5. Verify §15.4 catalog tables by reading the CSVs in detail.
6. Cross-check at least 5 quantitative claims against source.
7. Document remaining auxiliary actions (BOL, manifest, NDR, complement, general-track) at full §7-level depth.
8. Document the MCP gaps with concrete fix proposals (effort estimates, file paths to touch).

This iteration delivers the **architectural skeleton + business rules for 5 of the 10 ship/* actions + 3 of the 5 track side-effects + complete coverage of insurance/COD/custom-keys/extended-zones**. That's roughly 60-70% of what a full reference should contain. Adequate as a transferable starting point for any future session, but **not the final state**.
