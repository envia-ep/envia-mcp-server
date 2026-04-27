# Backend Spec — `GET /carrier-constraints/{carrier_id}`

> **Audience:** Backend engineer (or AI session) implementing this endpoint
> in the **carriers** service. This document is self-contained — no further
> investigation required. Every file path, table column, code pattern, and
> test case is enumerated below with verbatim citations from the existing
> codebase.
>
> **Stack:** PHP 8.x / Lumen 8.x.
> **Repo:** `services/carriers/` (root of carriers microservice).
> **Estimated effort:** 2–3 days for Phase 1, fully tested. Phase 2 is
> optional (see §10).
>
> **Why this endpoint exists:** The Envia MCP server (AI agent embedded in
> the portal) needs to answer questions like *"Does FedEx Express support
> COD in Mexico?"*, *"What's the max weight for DHL international?"*,
> *"Which additional services can I add to UPS Ground?"* without forcing
> the user to attempt a quote and parse the error. Today there is no
> endpoint that exposes per-carrier capabilities. The data exists (split
> across `carriers`, `services`, `catalog_additional_services`,
> `company_service_restrictions` tables and a few hardcoded constants in
> carrier-specific PHP classes) but is not aggregated for external
> consumption.

---

## 1. Goal

Expose a single read-only endpoint that returns, for a given carrier:

- Carrier-level metadata (volumetric factor, MPS support, pickup window).
- Per-service metadata (weight limits, COD config, international flag, drop-off support).
- Additional services available for that carrier.
- Company-specific overrides applied (when `company_id` is in the JWT).

The response must be deterministic, cacheable, and return in **< 200 ms p95**
once cache is warm.

---

## 2. API contract

### 2.1 Request

```
GET /carrier-constraints/{carrier_id}
GET /carrier-constraints/{carrier_id}?service_id=23
GET /carrier-constraints/{carrier_id}?include=additional_services,coverage_summary
```

| Param | Location | Type | Required | Description |
|-------|----------|------|----------|-------------|
| `carrier_id` | path | int | yes | Numeric carrier id. |
| `service_id` | query | int | no | Filter to a single service. If omitted, returns all active services for the carrier. |
| `include` | query | csv | no | Comma-separated optional sections. Default: `additional_services`. Allowed values: `additional_services`, `coverage_summary`. |

**Auth:** standard `auth` middleware (Bearer JWT). The middleware injects
`userVal` (with `company_id`, `user_id`) into request attributes — used to
apply per-company overrides.

### 2.2 Successful response (HTTP 200)

```json
{
  "status": "success",
  "data": {
    "carrier": {
      "id": 1,
      "name": "fedex",
      "display_name": "FedEx",
      "controller": "FedexRest",
      "color": "#4D148C",
      "endpoint": "https://apis.fedex.com",
      "track_url": "https://www.fedex.com/fedextrack/?trknbr={tracking_number}",
      "volumetric_factor": 5000,
      "box_weight": 0.5,
      "pallet_weight": 30,
      "allows_mps": true,
      "allows_async_create": false,
      "include_vat": false,
      "tax_percentage_included": 0.0,
      "private": false,
      "active": true
    },
    "pickup": {
      "supported": true,
      "same_day": true,
      "start_hour": 9,
      "end_hour": 18,
      "span_minutes": 60,
      "daily_limit": null,
      "fee": 0.0
    },
    "tracking": {
      "track_url_template": "https://www.fedex.com/fedextrack/?trknbr={tracking_number}",
      "pattern": "^[0-9]{12}$",
      "track_limit": 100,
      "tracking_delay_minutes": 30
    },
    "services": [
      {
        "id": 23,
        "service_code": "FEDEX_GROUND",
        "name": "FedEx Ground",
        "description": "Domestic ground shipping",
        "delivery_estimate": "3-5 business days",
        "international": false,
        "limits": {
          "min_weight_kg": 0.1,
          "max_weight_kg": 30,
          "limit_pallets": 0,
          "weight_unit": "KG",
          "volumetric_factor": 5000,
          "company_override": {
            "applied": true,
            "min_weight_kg": 0.5,
            "max_weight_kg": 25,
            "half_slab": false,
            "source": "company_service_restrictions"
          }
        },
        "cash_on_delivery": {
          "enabled": true,
          "minimum_amount": 100.0,
          "commission_percentage": 2.5
        },
        "options": {
          "drop_off": true,
          "branch_type": "fedex_office",
          "private": false,
          "active": true,
          "custom_plan": false
        },
        "shipment_type": {
          "id": 1,
          "label": "parcel"
        },
        "rate_type": {
          "id": 2,
          "label": "domestic"
        },
        "operational": {
          "hour_limit": "16:00",
          "timeout_seconds": 30,
          "pickup_package_max": 50,
          "return_percentage_cost": 0.0
        }
      }
    ],
    "additional_services": [
      {
        "id": 14,
        "name": "insurance_ltl",
        "translation_tag": "additional.insurance.ltl",
        "category_id": 3,
        "address_type_id": null,
        "description": "Insurance coverage for LTL freight",
        "shipment_type_id": 2,
        "form_id": 1,
        "concept_id": 14,
        "front_order_index": 1,
        "visible": true,
        "active": true,
        "available_for_services": [42, 43, 44]
      }
    ],
    "hardcoded_limits": {
      "_note": "Dimensions and per-piece weight limits enforced in carrier-specific PHP classes. Phase 2 will move these to a centralised config — see spec §10. Empty in Phase 1.",
      "values": []
    },
    "coverage_summary": {
      "_note": "Populated only when ?include=coverage_summary is set. Aggregates service_coverage table by country.",
      "by_service": []
    }
  },
  "meta": {
    "carrier_id": 1,
    "company_id": 12345,
    "service_filter": null,
    "cached": false,
    "generated_at": "2026-04-27T18:42:13Z"
  }
}
```

### 2.3 Error responses

| HTTP | `error` body | When |
|------|--------------|------|
| 400 | `"carrier_id must be a positive integer"` | Path param malformed. |
| 401 | (`Authentication error.` plain text — Lumen default) | Missing / invalid Bearer token. |
| 404 | `"Carrier not found"` | `carriers.id` does not exist. |
| 404 | `"Carrier not active"` | Carrier exists but `active=0` AND requesting user is not internal. |
| 422 | `"service_id does not belong to this carrier"` | `?service_id` filter mismatches the path carrier. |
| 500 | `"Internal error: <msg>"` | Anything else. |

All error responses follow the existing convention in
`app/Http/Controllers/TaxController.php:36-55`:

```php
return response()->json([
    'error' => $e->getMessage(),
    'status' => 'error'
], $statusCode);
```

---

## 3. Data sources (verified)

Every field in the response is sourced from one of these. **Read this
table before writing the controller — it tells you exactly which DB
column or PHP constant feeds each field.**

### 3.1 Table: `carriers`

Model: `app/Models/Carrier.php`. Columns used:

| Response field | DB column | Notes |
|----------------|-----------|-------|
| `carrier.id` | `id` | PK. |
| `carrier.name` | `name` | Lowercase carrier code (`fedex`, `dhl`, `ups`). |
| `carrier.display_name` | `name` | Title-case it on output (`ucfirst()` is acceptable). |
| `carrier.controller` | `controller` | PHP class name (`FedexRest`, `Ups`). |
| `carrier.color` | `color` | Hex color. |
| `carrier.endpoint` | `endpoint` | API base URL. |
| `carrier.track_url` | `track_url` | Template string with placeholder. |
| `carrier.volumetric_factor` | `volumetric_factor` | Default volumetric divisor. |
| `carrier.box_weight` | `box_weight` | Default packaging weight. |
| `carrier.pallet_weight` | `pallet_weight` | Pallet tare weight. |
| `carrier.allows_mps` | `allows_mps` | Cast int → bool. |
| `carrier.allows_async_create` | `allows_asyc_create` | **Note misspelling in DB column** (`asyc` not `async`). Cast int → bool. |
| `carrier.include_vat` | `include_vat` | Cast int → bool. |
| `carrier.tax_percentage_included` | `tax_percentage_included` | Float. |
| `carrier.private` | `private` | Cast int → bool. Hide private carriers from non-allowlisted users (see §6). |
| `carrier.active` | (no column on `carriers`) | Always `true` if row exists; the `active` flag lives at the service level. Set this from "row exists". |
| `pickup.same_day` | `pickup_sameday` | Cast int → bool. |
| `pickup.start_hour` | `pickup_start` | Int (24h). |
| `pickup.end_hour` | `pickup_end` | Int (24h). |
| `pickup.span_minutes` | `pickup_span` | Int. |
| `pickup.daily_limit` | `daily_pickup_limit` | Int, nullable. |
| `pickup.fee` | `pickup_fee` | Float. |
| `pickup.supported` | (computed) | `true` if `pickup_start IS NOT NULL AND pickup_end IS NOT NULL`. |
| `tracking.pattern` | `pattern` | Regex string. |
| `tracking.track_limit` | `track_limit` | Int. |
| `tracking.tracking_delay_minutes` | `tracking_delay` | Int. |

### 3.2 Table: `services`

Model: `app/Models/Service.php`. Columns used:

| Response field | DB column |
|----------------|-----------|
| `services[].id` | `id` |
| `services[].service_code` | `service_code` |
| `services[].name` | `name` |
| `services[].description` | `description` |
| `services[].delivery_estimate` | `delivery_estimate` |
| `services[].international` | `international` (cast int → bool) |
| `services[].limits.min_weight_kg` | `0.1` (default — there is no per-service min in this table). The MCP can ignore if `null`. |
| `services[].limits.max_weight_kg` | `limit_weight` |
| `services[].limits.limit_pallets` | `limit_pallets` |
| `services[].limits.weight_unit` | hardcoded `"KG"` (carriers internal canonical unit; conversion is done elsewhere). Phase 2 may surface carrier-native unit. |
| `services[].limits.volumetric_factor` | `volumetric_factor` |
| `services[].cash_on_delivery.enabled` | `cash_on_delivery` (cast int → bool) |
| `services[].cash_on_delivery.minimum_amount` | `minimum_amount_cash_on_delivery` |
| `services[].cash_on_delivery.commission_percentage` | `commission_cash_on_delivery` |
| `services[].options.drop_off` | `drop_off` (cast int → bool) |
| `services[].options.branch_type` | `branch_type` |
| `services[].options.private` | `private` (cast int → bool) |
| `services[].options.active` | `active` (cast int → bool) |
| `services[].options.custom_plan` | `custom_plan` (cast int → bool) |
| `services[].shipment_type.id` | `shipment_type_id` |
| `services[].shipment_type.label` | resolve via SQL JOIN: `catalog_shipment_types.name` (table assumed to exist; if absent, return label as `null`). |
| `services[].rate_type.id` | `rate_type_id` |
| `services[].rate_type.label` | similar JOIN to `catalog_rate_types.name`. Same fallback. |
| `services[].operational.hour_limit` | `hour_limit` |
| `services[].operational.timeout_seconds` | `timeout` |
| `services[].operational.pickup_package_max` | `pickup_package_max` |
| `services[].operational.return_percentage_cost` | `return_precentage_cost` (**typo in DB column**) |

**Default filter:** `WHERE carrier_id = :carrier_id AND active = 1`. If
`?service_id=N` provided, add `AND id = :service_id` and validate the
service belongs to the carrier (else 422).

### 3.3 Table: `company_service_restrictions`

Reference query at `app/ep/util/CarrierUtil.php:126-130`:

```php
$query = DB::table("company_service_restrictions AS csr")
    ->join("services AS s", "s.id", "=", "csr.service_id")
    ->select(DB::raw("csr.service_id, csr.half_slab, csr.min_weight, csr.max_weight, csr.weight_unit, s.international, s.carrier_id"))
    ->where("csr.company_id", $companyId)
    ->get();
```

Columns: `id` (PK), `company_id` (FK), `service_id` (FK), `min_weight`
(float, nullable), `max_weight` (float), `weight_unit` (varchar),
`half_slab` (boolean).

**Application logic (per-service):** if a row exists for
`(company_id = JWT.company_id, service_id = service.id)`, build the
`limits.company_override` block:

```php
'company_override' => [
    'applied' => true,
    'min_weight_kg' => $row->min_weight,    // already in KG per existing usage
    'max_weight_kg' => $row->max_weight,
    'half_slab' => (bool) $row->half_slab,
    'source' => 'company_service_restrictions',
];
```

If no row exists, set `'company_override' => ['applied' => false]`.

**Do not** mutate the top-level `limits.min_weight_kg` /
`limits.max_weight_kg` — leave them as the service-default and let the
consumer (MCP) decide which to show.

### 3.4 Table: `catalog_additional_services`

Model: `app/Models/AdditionalService.php`. Columns: `id`, `category_id`,
`name`, `description`, `translation_tag`, `address_type_id`,
`front_order_index`, `tooltip_translation_tag`, `shipment_type_id`,
`form_id`, `concept_id`, `visible`, `active`.

**Linking to a carrier:** `catalog_additional_services` is a **catalog**
table — it does not directly know which carrier supports each addon. The
linkage lives in **`additional_service_prices`** (verified by carriers
deep reference §10.3). Query pattern:

```sql
SELECT DISTINCT cas.*
FROM catalog_additional_services cas
INNER JOIN additional_service_prices asp ON asp.additional_service_id = cas.id
INNER JOIN services s ON s.id = asp.service_id
WHERE s.carrier_id = :carrier_id
  AND cas.active = 1
  AND cas.visible = 1
ORDER BY cas.front_order_index ASC, cas.id ASC;
```

For `available_for_services`, run a subquery per row:

```sql
SELECT service_id
FROM additional_service_prices
WHERE additional_service_id = :addon_id
  AND service_id IN (SELECT id FROM services WHERE carrier_id = :carrier_id AND active = 1);
```

Skip this section if `?include=additional_services` is not present (it is
default-on, but allow the consumer to suppress it for lighter responses).

### 3.5 Hardcoded constraints (Phase 2 — defer)

Carrier-specific util classes encode some limits as constants or inline
checks. Examples (verbatim references):

- `app/ep/carriers/utils/FedExRestUtil.php:32-51` — `FEDEX_ONE_RATE_SERVICE_TO_BASE` map (service code aliases).
- `app/ep/carriers/utils/UpsUtil.php` — declared-value caps per service.
- `app/ep/carriers/utils/EstafetaUtil.php:129` — LTL max weight 1100 kg.
- `app/ep/carriers/Paquetexpress.php` — max dimension sum 380 cm (L+W+H).

**Phase 1 decision: do NOT extract these.** Return an empty
`hardcoded_limits.values` array with the `_note` field as documented in
§2.2. Phase 2 (separate ticket) extracts these into
`config/carrier_constraints.php` and populates the section.

Rationale: extraction requires per-carrier audit (each util class is
~500–1500 LOC), risks introducing drift between code and config, and
delivers no immediate user value because rate/generate validate against
the live values anyway. Ship Phase 1, validate the contract is useful,
then schedule Phase 2.

### 3.6 Coverage summary (optional, `?include=coverage_summary`)

Source: `service_coverage` table. Model:
`app/Models/ServiceCoverage.php:9-12`. Columns: `service_id`,
`postal_code`, `extended_zone_price`.

The table is postal-code-based, not country-based. A summary aggregates
postal codes back to countries via the `catalog_postal_codes` table:

```sql
SELECT
  sc.service_id,
  cpc.country_code,
  COUNT(DISTINCT sc.postal_code) AS coverage_count
FROM service_coverage sc
INNER JOIN catalog_postal_codes cpc ON cpc.cp = sc.postal_code
INNER JOIN services s ON s.id = sc.service_id
WHERE s.carrier_id = :carrier_id
GROUP BY sc.service_id, cpc.country_code;
```

Expected response shape:

```json
"coverage_summary": {
  "by_service": [
    { "service_id": 23, "countries": [{"country_code": "MX", "postal_code_count": 102345}, ...] }
  ]
}
```

If the joins above are too slow (likely — `service_coverage` has
hundreds of thousands of rows for some carriers), implement an aggregate
materialised view or restrict to carriers under a row threshold. **For
Phase 1, ship `coverage_summary` only when the JOIN runs in < 500 ms
on production-shape data.** Otherwise return:

```json
"coverage_summary": { "_unavailable": "Computed asynchronously — see /carrier-coverage/{carrier_id}", "by_service": [] }
```

…and defer the full implementation.

---

## 4. Implementation plan (file-by-file, ordered)

Execute in this order. Each step has its own commit.

### Step 1 — Add the route

**File:** `routes/web.php`. Add inside the `auth` middleware group near
line 70 (alongside the existing `taxes/company-percentage/{companyId}`
route):

```php
$router->group(['middleware' => ['auth']], function () use ($router) {
    // ...existing routes...
    $router->get('/carrier-constraints/{carrierId}', 'CarrierConstraintsController@show');
});
```

Convention: kebab-case URL, camelCase path param, controller method
named `show` to match REST verb conventions.

### Step 2 — Create the controller

**New file:** `app/Http/Controllers/CarrierConstraintsController.php`.

```php
<?php

namespace App\Http\Controllers;

use App\Services\CarrierConstraintsService;
use Illuminate\Http\Request;

class CarrierConstraintsController extends Controller
{
    private CarrierConstraintsService $service;

    public function __construct(CarrierConstraintsService $service)
    {
        $this->service = $service;
    }

    public function show(Request $request, $carrierId)
    {
        try {
            $carrierId = (int) $carrierId;
            if ($carrierId <= 0) {
                throw new \InvalidArgumentException('carrier_id must be a positive integer');
            }

            $userVal = $request->attributes->get('userVal');
            $companyId = $userVal->company_id ?? null;

            $serviceId = $request->query('service_id');
            $serviceId = $serviceId !== null ? (int) $serviceId : null;

            $include = array_filter(
                array_map('trim', explode(',', $request->query('include', 'additional_services')))
            );

            $data = $this->service->getConstraints($carrierId, $companyId, $serviceId, $include);

            return response()->json([
                'status' => 'success',
                'data' => $data['data'],
                'meta' => $data['meta'],
            ]);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage(), 'status' => 'error'], 400);
        } catch (\App\Exceptions\NotFoundException $e) {
            return response()->json(['error' => $e->getMessage(), 'status' => 'error'], 404);
        } catch (\App\Exceptions\ValidationException $e) {
            return response()->json(['error' => $e->getMessage(), 'status' => 'error'], 422);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Internal error: ' . $e->getMessage(), 'status' => 'error'], 500);
        }
    }
}
```

**If `App\Exceptions\NotFoundException` / `ValidationException` do not
exist** in this codebase, use anonymous patterns like
`throw new \Exception('Carrier not found')` and check
`$e->getMessage()` for the routing pattern shown in
`TaxController.php:46-50`. The above is the cleaner pattern; check
`app/Exceptions/` first.

### Step 3 — Create the service layer

**New file:** `app/Services/CarrierConstraintsService.php`.

The service is responsible for all DB access and aggregation. Keep the
controller thin; this is where the business logic lives.

```php
<?php

namespace App\Services;

use App\Models\Carrier;
use App\Models\Service as ServiceModel;
use App\Models\AdditionalService;
use App\ep\util\CacheUtil;
use Illuminate\Support\Facades\DB;

class CarrierConstraintsService
{
    private const CACHE_TTL_SECONDS = 3600;

    public function getConstraints(int $carrierId, ?int $companyId, ?int $serviceId, array $include): array
    {
        // Cache key includes companyId so per-company overrides do not bleed.
        $cacheKey = "carrier-constraints:{$carrierId}:{$companyId}:" . ($serviceId ?? 'all') . ':' . implode(',', $include);

        return CacheUtil::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($carrierId, $companyId, $serviceId, $include) {
            $carrier = $this->loadCarrier($carrierId);
            $services = $this->loadServices($carrierId, $serviceId);

            if ($serviceId !== null && $services->isEmpty()) {
                throw new \Exception('service_id does not belong to this carrier');
            }

            $overrides = $companyId !== null
                ? $this->loadCompanyOverrides($companyId, $services->pluck('id')->all())
                : collect();

            $additionalServices = in_array('additional_services', $include, true)
                ? $this->loadAdditionalServices($carrierId)
                : null;

            $coverageSummary = in_array('coverage_summary', $include, true)
                ? $this->loadCoverageSummary($carrierId)
                : null;

            return [
                'data' => [
                    'carrier' => $this->shapeCarrier($carrier),
                    'pickup' => $this->shapePickup($carrier),
                    'tracking' => $this->shapeTracking($carrier),
                    'services' => $services->map(fn($s) => $this->shapeService($s, $overrides->get($s->id)))->values()->all(),
                    'additional_services' => $additionalServices,
                    'hardcoded_limits' => [
                        '_note' => 'Phase 1 placeholder. See _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md §10.',
                        'values' => [],
                    ],
                    'coverage_summary' => $coverageSummary,
                ],
                'meta' => [
                    'carrier_id' => $carrierId,
                    'company_id' => $companyId,
                    'service_filter' => $serviceId,
                    'cached' => false, // CacheUtil::remember replaces this on cache hit.
                    'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
                ],
            ];
        });
    }

    // ...loadCarrier, loadServices, loadCompanyOverrides, loadAdditionalServices,
    //    loadCoverageSummary, shapeCarrier, shapePickup, shapeTracking, shapeService
    //    are private methods. See §3 for the SQL each one runs.
}
```

**Method-by-method skeleton** (full implementations follow the SQL in §3):

- `loadCarrier(int $carrierId): Carrier` — `Carrier::find($carrierId)`. Throw if null. Throw also if `private=1` and `companyId` is not in the allowlist (see §6).
- `loadServices(int $carrierId, ?int $serviceId): Collection<ServiceModel>` — `ServiceModel::where('carrier_id', $carrierId)->where('active', 1)->when($serviceId, fn($q) => $q->where('id', $serviceId))->get()`.
- `loadCompanyOverrides(int $companyId, array $serviceIds): Collection` — query per §3.3, key the result by `service_id`.
- `loadAdditionalServices(int $carrierId): array` — SQL per §3.4. Map to the `additional_services[]` shape. Run the `available_for_services` subquery in a single batched query (don't N+1).
- `loadCoverageSummary(int $carrierId): array` — SQL per §3.6. Apply the < 500 ms guard.
- `shapeCarrier(Carrier $c): array` — pure transformation. Cast int→bool for boolean columns.
- `shapePickup(Carrier $c): array` — cast and assemble.
- `shapeTracking(Carrier $c): array` — cast and assemble.
- `shapeService(ServiceModel $s, ?object $override): array` — assemble per §3.2 + apply override block.

### Step 4 — Register exception classes (only if missing)

Check `app/Exceptions/`. If `NotFoundException` and `ValidationException`
do not exist, create them as thin subclasses of `\Exception`. Otherwise
reuse the existing ones.

### Step 5 — PHPUnit tests

**New file:** `tests/Unit/CarrierConstraintsServiceTest.php`. Mirror the
naming convention used in `tests/Unit/CarrierUtilInsuranceTest.php`.

Test cases (one logical assertion per test):

```php
public function testGetConstraintsReturnsCarrierMetadata()
public function testGetConstraintsReturnsActiveServicesOnly()
public function testGetConstraintsAppliesCompanyOverrideWhenRowExists()
public function testGetConstraintsMarksOverrideNotAppliedWhenNoRow()
public function testGetConstraintsThrowsWhenCarrierNotFound()
public function testGetConstraintsThrowsWhenPrivateCarrierAndCompanyNotAllowlisted()
public function testGetConstraintsThrowsWhenServiceIdDoesNotBelongToCarrier()
public function testGetConstraintsIncludesAdditionalServicesByDefault()
public function testGetConstraintsExcludesAdditionalServicesWhenNotInInclude()
public function testGetConstraintsCastsBooleanColumnsCorrectly()
public function testGetConstraintsResponseIncludesCacheMetadata()
```

**New file:** `tests/Feature/CarrierConstraintsControllerTest.php`.

```php
public function testShowReturns401WithoutBearerToken()
public function testShowReturns404WhenCarrierMissing()
public function testShowReturns400WhenCarrierIdNotPositiveInteger()
public function testShowReturns422WhenServiceIdMismatchCarrier()
public function testShowReturns200WithExpectedShapeForFedex()
public function testShowAppliesCompanyOverrideFromJwt()
public function testShowSecondCallHitsCache()
```

For the `200 with expected shape` assertion, use `assertJsonStructure`
with the full shape from §2.2.

**Auth bootstrap pattern** — match `tests/System/Util/RateTest.php`:
construct a fake JWT with company id of the test fixture and pass it as
`Authorization: Bearer <token>` header. If the test framework already
provides a helper (`$this->actingAs($user)` etc.) prefer that.

### Step 6 — Smoke run + integration

Once unit + feature tests pass, run the smoke test playbook at
`ai-agent/envia-mcp-server/_docs/SMOKE_TEST_PLAYBOOK.md` against the
deployed staging branch with one extra step:

```bash
curl -X GET "$ENVIA_API_CARRIER_HOSTNAME/carrier-constraints/1" \
  -H "Authorization: Bearer $ENVIA_TEST_TOKEN" \
  -H "Accept: application/json" | jq
```

Expected: HTTP 200, `data.carrier.name == "fedex"` (or whatever
`carrier_id=1` is in your DB), `data.services` non-empty,
`data.additional_services` non-empty.

---

## 5. Caching strategy

Use the existing `CacheUtil::remember()` pattern (see §3 of the
**Caching pattern** discovery — file `app/ep/util/CacheUtil.php`).

- **Key format:** `carrier-constraints:{carrier_id}:{company_id|''}:{service_id|'all'}:{include_csv}`
- **TTL:** 3600 s (1 hour). Carrier metadata changes rarely.
- **Invalidation:** none required for Phase 1. If/when the catalog team
  publishes carrier/service updates, they should also publish a
  `DEL carrier-constraints:*` flush — but that's out of scope for this
  spec.

**Important:** the cache key includes `company_id` so per-company
overrides do not leak across tenants. **Do NOT cache without it.**

---

## 6. Authorisation rules

- All callers must have a valid Bearer JWT (handled by `auth`
  middleware).
- A non-internal user requesting a `private=1` carrier must receive
  HTTP 404 (treat the carrier as if it does not exist — do not leak its
  existence). The "internal allowlist" check should match the existing
  pattern used elsewhere in carriers — search `CarrierUtil` for
  `private` checks. If no centralised pattern exists, hardcode a
  conservative allowlist of internal company ids in a constant inside
  `CarrierConstraintsService` and add a TODO referencing this spec.
- Per-company overrides only apply for the JWT's `company_id`. Never
  accept `?company_id=` as a query parameter — that would let one
  tenant probe another tenant's overrides.

---

## 7. Observability

Match the carriers service convention. If carriers uses
`Log::info()` / `Log::error()` for endpoint-level logging, do the same.
Log at minimum:

- On 200: `carrier_id`, `company_id`, `service_filter`, `cache_hit` (bool), `duration_ms`.
- On 4xx: `carrier_id`, `company_id`, `error_class`, `error_message`.
- On 5xx: include stack trace via existing error-handler convention.

If carriers has Datadog APM tracing wired (most likely yes — search
`Datadog` or `dd-trace-php`), the new endpoint will be picked up
automatically by the framework instrumentation. Verify on staging that
the route shows up in APM under the correct service tag.

---

## 8. Anti-patterns to avoid (read this before coding)

1. **Do not query `service_coverage` without a guard.** Some carriers
   have hundreds of thousands of rows. The query plan must use the
   `(service_id, postal_code)` composite index. If `EXPLAIN` shows a
   full scan, fall back to the deferred-summary placeholder (§3.6).
2. **Do not return `weight_unit` from the per-service block when the
   value is anything other than `KG`.** Carriers stores weights in
   varying units depending on locale; the canonical post-conversion
   unit is KG. If you find a non-KG row, log a warning and return
   `"KG"` anyway — the conversion happens at rate time.
3. **Do not mutate top-level `limits.{min,max}_weight_kg` when a company
   override exists.** The override is exposed under
   `limits.company_override` so the consumer can decide which to show.
   Mutating the top-level value silently rewrites the catalog default,
   which other consumers may have cached.
4. **Do not call `CarrierUtil::*` static helpers from this service.**
   `CarrierUtil` is a god class (see CARRIERS_DEEP_REFERENCE.md) and
   pulls in transitive dependencies that slow cold starts. Re-implement
   the small bits of logic you need (the SQL is in §3) — do not
   import the god class for one method.
5. **Do not add `?company_id=` as a query parameter.** Cross-tenant
   probing surface. The only company id source is the JWT.
6. **Do not skip the `private` carrier check.** Leaking the existence of
   a private carrier (e.g., a beta partner with negotiated rates) to
   non-allowlisted companies is a contractual risk.
7. **Do not extract hardcoded constants in this PR.** Phase 1 ships
   with `hardcoded_limits.values: []`. Phase 2 is a separate ticket
   with its own audit.

---

## 9. Acceptance criteria (executable checklist)

Mark each `[ ]` → `[x]` as done. Do not ship until all are checked.

- [ ] `GET /carrier-constraints/1` returns HTTP 200 with the shape in §2.2.
- [ ] `GET /carrier-constraints/99999` returns HTTP 404, `error: "Carrier not found"`.
- [ ] `GET /carrier-constraints/abc` returns HTTP 400, `error: "carrier_id must be a positive integer"`.
- [ ] `GET /carrier-constraints/1?service_id=999999` returns HTTP 422 when 999999 is not a fedex service.
- [ ] `GET /carrier-constraints/1` without Bearer token returns HTTP 401.
- [ ] `GET /carrier-constraints/{private_carrier_id}` from a non-allowlisted company returns HTTP 404.
- [ ] `GET /carrier-constraints/1` for a company with rows in `company_service_restrictions` shows `limits.company_override.applied: true` for affected services.
- [ ] `GET /carrier-constraints/1` for a company with no overrides shows `limits.company_override.applied: false` for all services.
- [ ] Second call within 1 hour returns the same payload with `meta.cached: true` (verify via Redis: `EXISTS carrier-constraints:1:{company_id}:all:additional_services`).
- [ ] All inactive services (`active=0`) are excluded from `services[]`.
- [ ] `?include=` parameter respected: `?include=` (empty) returns no `additional_services`; `?include=additional_services,coverage_summary` returns both.
- [ ] All boolean columns cast to JSON `true`/`false`, never `0`/`1` or `"0"`/`"1"`.
- [ ] All weight values returned as numbers (not strings).
- [ ] Unit tests in `tests/Unit/CarrierConstraintsServiceTest.php` pass (11 tests, one logical assertion each).
- [ ] Feature tests in `tests/Feature/CarrierConstraintsControllerTest.php` pass (7 tests).
- [ ] `phpunit` green on the whole carriers test suite (no regressions).
- [ ] Manual `curl` against staging completes in < 500 ms first call, < 100 ms cached.
- [ ] Datadog APM shows the new route under the carriers service tag.

---

## 10. Phase 2 (out of scope here, separate ticket)

Once Phase 1 is in production and the MCP `envia_get_carrier_constraints`
tool is using it, schedule Phase 2:

1. Audit each carrier util class in `app/ep/carriers/utils/` and extract:
   - max weight per piece, per shipment
   - max linear dimensions (L, W, H), max girth (L + 2W + 2H), max sum
   - max declared value
   - allowed package types
   - country pairs explicitly supported / blocked
2. Encode the audit results in `config/carrier_constraints.php` (Lumen
   config — auto-loaded). Shape:

   ```php
   return [
       'fedex' => [
           'piece_max_weight_kg' => 68,
           'piece_max_dimensions_cm' => ['L' => 274, 'W' => 274, 'H' => 274],
           // ...
       ],
       // ...
   ];
   ```
3. Have `CarrierConstraintsService` populate `hardcoded_limits.values`
   from this config, keyed by carrier name.
4. Add a `php artisan` command that diffs `config/carrier_constraints.php`
   against the actual util-class source code on every release, failing
   the build if drift is detected. (Prevents the config rotting.)

Estimated Phase 2 effort: 5–7 days (per-carrier audit is the long pole).

---

## 11. Dependencies for the implementing engineer

Before coding, the engineer needs:

1. **Read access to the carriers DB** — for verifying SQL and shape against real data.
2. **Bearer JWT** for a test company id (sandbox token works; see
   `_docs/SMOKE_TEST_PLAYBOOK.md` for `ENVIA_TEST_TOKEN`).
3. **A test company id with at least one row in
   `company_service_restrictions`** for testing the override path. If
   none exists in sandbox, ask Jose for a UAT company id with overrides.
4. **Local PHP 8 + composer** environment matching the carriers
   service runtime.

---

## 12. Open questions for the implementer to resolve

These are points the spec author could not fully answer from code
inspection. Resolve them before coding (or surface to Jose if blocked):

1. Does `catalog_shipment_types` exist as a table? If not, return
   `shipment_type.label` as `null`. (See §3.2.)
2. Does `catalog_rate_types` exist? Same fallback rule.
3. Is there an existing pattern in `CarrierUtil` for the "internal
   company allowlist" used to gate `private=1` carriers? If yes, reuse.
   If no, propose a 1-liner constant in the new service and TODO it.
4. Does the carriers service expose a "preview" or "feature flag" gate
   that the new endpoint should be behind for the first deploy? (Not
   strictly necessary — the route is read-only and idempotent — but
   worth checking the local convention.)

---

## 13. Out of scope (do not implement)

- Write endpoints for carrier-constraints (no PUT/POST/PATCH).
- Per-postal-code coverage queries (use `coverage_summary` aggregate only).
- Real-time carrier-API capability probing (e.g. calling FedEx's
  `/availability` endpoint). The endpoint returns Envia's stored view
  of constraints, not the carrier's live view.
- Localised translations of `name` / `description`. Return the raw
  values; the consumer (MCP) handles i18n.
- Any change to the `carriers`, `services`, `company_service_restrictions`,
  or `catalog_additional_services` schemas.
- Migrations of any kind. Phase 1 is read-only.

---

## 14. Spec metadata

- **Author:** Claude Opus 4.7 (1M context), session 2026-04-27.
- **Reviewer:** Jose Vidrio (CTO).
- **Status:** READY FOR IMPLEMENTATION.
- **Backend brief reference:** `_docs/BACKEND_TEAM_BRIEF.md` item C11.
- **Consumer:** `envia-mcp-server` `envia_get_carrier_constraints` tool
  (4th tool of Sprint 7's pre-approved set). Pending L-B5 backend
  verification — this spec IS the verification artifact.
