# Backend Spec — `GET /carrier-constraints/{carrier_id}`

**Version:** v3 — backend round-2 reviewed 2026-04-27 (FINAL CONTRACT)
**v1 commit:** `899d347` (initial spec)
**v2 commit:** `bb56391` (round-1 decisions applied)
**v3 changes:** 10 round-2 decisions applied. See "Diff vs v2" + "Diff vs v1" sections below.

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

## Diff vs v2

v3 incorporates **10 decisions from the backend round-2 review (2026-04-27)**. The most consequential is #1 — it resolves a contradiction in v2 between §2.3 (200 with empty services) and §3.7+§6 (404 for private/disabled). Implementers familiar with v2 should focus on these.

| # | Decision | Spec section | Diff |
|---|----------|--------------|------|
| 1 | **CRITICAL** — strict 404/200/422 hierarchy: private/disabled carriers → 404; empty services → 200+`meta._note`; `service_id` mismatch → 422; `service_id` filtered by company → 200+`meta._note` | §2.3, §3.7, §6 | Changed |
| 2 | `coverage_summary` opt-in (only when `?include=coverage_summary`) — sparse fieldset | §2.1, §2.2, §3.6 | Changed |
| 3 | Additional services filter on company-visible services subset (closes leak) | §3.4 | Changed |
| 4 | `service_id` filtered by company → 200 empty + `meta._note` (consistent with #1) | §2.3, §3.7 | Changed |
| 5 | `volumetric_factor_id` shape stable: always present, `null` when unset | §2.2, §3.1 | Changed |
| 6 | `carrier.active` removed (redundant — any carrier in 200 is active by contract per #1) | §2.2, §3.1 | Removed |
| 7 | `company_service_restrictions` PK metadata corrected: composite `(company_id, service_id)`, no `id` | §3.3 | Fixed |
| 8 | Cache wraps `data` only; `meta` (esp. `generated_at`) built per-request — `CacheUtil` unmodified | §4, §5, §9 | Changed |
| 9 | Controller validates ints with `FILTER_VALIDATE_INT` — defends against `"abc"`, `"123abc"` | §4 | Changed |
| 10 | §12 reframed as "Verified assumptions" — `catalog_shipment_types`, `catalog_rate_types`, `carriers.track_url_site`, `company_private_carriers` all confirmed by backend | §12 | Changed |

---

## Diff vs v1

v2 incorporated 13 decisions from the backend round-1 code review (2026-04-27). Kept here for full historical traceability.

| # | Decision | Spec section | Diff |
|---|----------|--------------|------|
| 1 | Filter by JWT company, not global catalog | §3.7 (new) | Added |
| 2 | Apply `company_private_services` filter | §3.7 | Added |
| 3 | Apply `config_disabled_carriers` and `config_disabled_services` filters | §3.7 | Added |
| 4 | `international` becomes triple field (bool + code + scope) | §2.2, §3.2 | Changed |
| 5 | `volumetric_factor` is actual divisor; `volumetric_factor_id` added | §2.2, §3.1 | Changed |
| 6 | Dual `track_url`: `envia_track_url_template` + `carrier_track_url_template` | §2.2, §3.1 | Changed |
| 7 | Filter `additional_service_prices.active = 1` | §3.4 | Changed |
| 8 | Correct `coverage_summary` SQL (uses `carriers.locale_id → locales.country_code`) | §3.6 | Changed |
| 9 | `coverage_summary` stays placeholder in Phase 1 | §2.2, §3.6 | Changed |
| 10 | Omit `carrier.endpoint` from response (security) | §2.2, §3.1, §6 | Removed |
| 11 | Remove "Carrier not active" 404; replace with 200 + empty services + `meta._note` | §2.2, §2.3, §6 | Changed |
| 12 | Strict 400 vs 422 distinction | §2.3 | Changed |
| 13 | Remove `meta.cached` (Datadog APM tracks hit/miss) | §2.2, §5, §9 | Removed |

---

## 1. Goal

Expose a single read-only endpoint that returns, for a given carrier:

- Carrier-level metadata (volumetric factor, MPS support, pickup window).
- Per-service metadata (weight limits, COD config, international scope, drop-off support).
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
| `include` | query | csv | no | Comma-separated optional sections (sparse fieldset). Default: `additional_services`. Allowed values: `additional_services`, `coverage_summary`. **Sections NOT requested are OMITTED from the response entirely** (not returned as `null`). |

**Auth:** standard `auth` middleware (Bearer JWT). The middleware injects
`userVal` (with `company_id`, `user_id`) into request attributes — used to
apply per-company filters (§3.7) and overrides.

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
      "volumetric_factor": 5000,
      "volumetric_factor_id": 12,
      "box_weight": 0.5,
      "pallet_weight": 30,
      "allows_mps": true,
      "allows_async_create": false,
      "include_vat": false,
      "tax_percentage_included": 0.0,
      "private": false
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
      "envia_track_url_template": "https://...envia.com/track/{tracking_number}",
      "carrier_track_url_template": "https://www.fedex.com/fedextrack/?trknbr={tracking_number}",
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
        "international_code": 0,
        "international_scope": "national",
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
    }
    // D2 v3: coverage_summary appears here ONLY when ?include=coverage_summary
    //        was passed. When omitted, the entire field is absent from data.
    //        See §3.6 for the placeholder shape.
  },
  "meta": {
    "carrier_id": 1,
    "company_id": 12345,
    "service_filter": null,
    "generated_at": "2026-04-27T18:42:13Z"
  }
}
```

**Notes on the example above:**

- `carrier.endpoint` is **not included** — internal carrier API URLs are not exposed (D10, §6).
- `carrier.active` is **not included** — redundant per D6 v3, since any carrier surfaced in a 200 response is accessible by contract (inaccessible carriers return 404 per D1 v3).
- `meta.cached` is **not included** — cache hit/miss is tracked via Datadog APM span attributes (D13, §5).
- `coverage_summary` is **omitted** unless `?include=coverage_summary` is passed (D2 v3 sparse fieldset). When requested, the Phase 1 placeholder shape is returned (see §3.6).
- When carrier exists but has no services available for the requesting company (D1 v3), `services` is `[]` and `meta` gains `"_note": "Carrier exists but has no services available for your company."`.

### 2.3 Error responses (D1 v3 hierarchy)

The HTTP status hierarchy follows a strict no-leak posture for inaccessible carriers and a permissive 200-empty for service-level filtering:

| HTTP | Trigger | `error` body | Notes |
|------|---------|--------------|-------|
| 400 | `carrier_id` not a positive integer (e.g. `"abc"`, `0`, `-1`) | `"carrier_id must be a positive integer"` | Validate with `FILTER_VALIDATE_INT` (D9 v3). |
| 400 | `service_id` not a positive integer | `"service_id must be a positive integer"` | Same. |
| 400 | `include` contains unknown value | `"include accepts only: additional_services, coverage_summary"` | |
| 401 | Missing/invalid Bearer token | (default Lumen 401) | |
| 404 | `carriers.id` does not exist in DB | `"Carrier not found"` | |
| 404 | Carrier exists but is `private=1` AND requesting company is NOT in the allowlist (`company_private_carriers`) | `"Carrier not found"` | **Conservative no-leak posture** — do NOT reveal that the carrier exists. (D1 v3) |
| 404 | Carrier is in `config_disabled_carriers` for the requesting company | `"Carrier not found"` | Same no-leak posture. (D1 v3) |
| 422 | `service_id` valid but doesn't belong to this carrier | `"service_id does not belong to this carrier"` | The carrier ID is correct; the service ID is for a different carrier or doesn't exist at all. (D1 v3) |
| 500 | Anything else | `"Internal error: <msg>"` | |

**200 responses with empty services (D1 v3):** these are NOT errors. They occur when:

- The carrier passes the §3.7 visibility checks (not private/disabled for this company), AND
- After applying §3.7 service-level filters (`company_private_services`, `config_disabled_services`), the resulting service list is empty.

In that case the response is HTTP 200 with `data.services: []`, `data.additional_services: []`, and `meta._note` set:

- General empty case: `meta._note: "Carrier exists but has no services available for your company"`.
- `service_id` provided but filtered by `config_disabled_services` for this company: `meta._note: "The requested service is not available for your company"` (D4 v3).

This split between 404 (no-leak) and 200-empty (informative) is intentional: 404 means "I won't tell you whether this exists or not"; 200-empty means "yes, the carrier is real for you, but this particular query returns nothing usable".

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
| ~~`carrier.endpoint`~~ | ~~`endpoint`~~ | **D10: Omitted.** Internal carrier API URL is not exposed — security risk. |
| `carrier.volumetric_factor` | `volumetric_factor` | **D5: actual volumetric divisor** (resolved from `catalog_volumetrict_factor.factor` via FK). Most common value: 5000. |
| `carrier.volumetric_factor_id` | `volumetric_factor_id` | **D5 v3: Always present in response. `null` when unset in DB** (shape stable for typed consumers — never sparse). |
| `carrier.box_weight` | `box_weight` | Default packaging weight. |
| `carrier.pallet_weight` | `pallet_weight` | Pallet tare weight. |
| `carrier.allows_mps` | `allows_mps` | Cast int → bool. |
| `carrier.allows_async_create` | `allows_asyc_create` | **Note misspelling in DB column** (`asyc` not `async`). Cast int → bool. |
| `carrier.include_vat` | `include_vat` | Cast int → bool. |
| `carrier.tax_percentage_included` | `tax_percentage_included` | Float. |
| `carrier.private` | `private` | Cast int → bool. |
| ~~`carrier.active`~~ | (n/a) | **D6 v3: Removed.** There is no `active` column on the `carriers` table. Per the strict 404/200 hierarchy in §2.3 (D1 v3), any carrier surfaced in a 200 response is accessible by contract — the field would be redundant noise. |
| `pickup.same_day` | `pickup_sameday` | Cast int → bool. |
| `pickup.start_hour` | `pickup_start` | Int (24h). |
| `pickup.end_hour` | `pickup_end` | Int (24h). |
| `pickup.span_minutes` | `pickup_span` | Int. |
| `pickup.daily_limit` | `daily_pickup_limit` | Int, nullable. |
| `pickup.fee` | `pickup_fee` | Float. |
| `pickup.supported` | (computed) | `true` if `pickup_start IS NOT NULL AND pickup_end IS NOT NULL`. |
| `tracking.envia_track_url_template` | `track_url` | **D6: Envia-hosted tracking page URL.** |
| `tracking.carrier_track_url_template` | `track_url_site` | **D6: Carrier's own tracking page URL.** |
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
| `services[].international` | `international` (cast int → bool: `> 0`) |
| `services[].international_code` | `international` (raw int: 0, 1, 2, or 3) |
| `services[].international_scope` | `international` (mapped via table below) |
| `services[].limits.min_weight_kg` | `0.1` (default — there is no per-service min in this table). The MCP can ignore if `null`. |
| `services[].limits.max_weight_kg` | `limit_weight` |
| `services[].limits.limit_pallets` | `limit_pallets` |
| `services[].limits.weight_unit` | hardcoded `"KG"` (carriers internal canonical unit). |
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
| `services[].shipment_type.label` | resolve via SQL JOIN: `catalog_shipment_types.name` (fallback: `null`). |
| `services[].rate_type.id` | `rate_type_id` |
| `services[].rate_type.label` | similar JOIN to `catalog_rate_types.name`. Same fallback. |
| `services[].operational.hour_limit` | `hour_limit` |
| `services[].operational.timeout_seconds` | `timeout` |
| `services[].operational.pickup_package_max` | `pickup_package_max` |
| `services[].operational.return_percentage_cost` | `return_precentage_cost` (**typo in DB column**) |

**D4 — `international` triple field mapping:**

The `services.international` column is an integer with 4 distinct values. Expose all three representations:

| `international_code` | `international` (bool) | `international_scope` | Source reference |
|---|---|---|---|
| `0` | `false` | `"national"` | domestic / nacional |
| `1` | `true` | `"international"` | international export |
| `2` | `true` | `"import"` | import — `Service.php:84`: `is_import = international == 2` |
| `3` | `true` | `"thirdparty"` | third-party international — `CarrierUtil.php:406` |

Implementation pattern:

```php
'international' => $s->international > 0,
'international_code' => (int) $s->international,
'international_scope' => match((int) $s->international) {
    0 => 'national',
    1 => 'international',
    2 => 'import',
    3 => 'thirdparty',
    default => 'national',
},
```

**Default filter:** `WHERE carrier_id = :carrier_id AND active = 1`. If
`?service_id=N` provided, add `AND id = :service_id` and validate the
service belongs to the carrier (else 422). Company filters from §3.7 are
applied before or as part of this query.

### 3.3 Table: `company_service_restrictions`

Reference query at `app/ep/util/CarrierUtil.php:126-130`:

```php
$query = DB::table("company_service_restrictions AS csr")
    ->join("services AS s", "s.id", "=", "csr.service_id")
    ->select(DB::raw("csr.service_id, csr.half_slab, csr.min_weight, csr.max_weight, csr.weight_unit, s.international, s.carrier_id"))
    ->where("csr.company_id", $companyId)
    ->get();
```

Columns: `company_id` (FK), `service_id` (FK), `min_weight` (float,
nullable), `max_weight` (float), `weight_unit` (varchar), `half_slab`
(boolean).

**D7 v3 — PK metadata correction:** the table uses a **composite primary
key** `(company_id, service_id)`. There is no autoincrement `id` column.
Earlier drafts of this spec listed `id (PK)`; that was incorrect.

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
  AND asp.active = 1
ORDER BY cas.front_order_index ASC, cas.id ASC;
```

**D7:** `AND asp.active = 1` is required in the `WHERE` clause. Services
without an active price row are not purchasable — they must not appear in
the additional services catalog.

**D3 v3 — Filter on company-visible services subset:** The `s.carrier_id =
:carrier_id` join above must be **further restricted to the service IDs
that survive §3.7 filtering** (i.e. the post-`company_private_services` /
`config_disabled_services` subset for the requesting company). Otherwise
add-ons may leak from privately-disabled services into the response.

The implementer must compute the visible-service-IDs first (per §3.7) and
inject them as a bounded `IN (...)` clause:

```sql
SELECT DISTINCT cas.*
FROM catalog_additional_services cas
INNER JOIN additional_service_prices asp ON asp.additional_service_id = cas.id
INNER JOIN services s ON s.id = asp.service_id
WHERE s.id IN (:visible_service_ids)   -- D3 v3: company-filtered subset only
  AND cas.active = 1
  AND cas.visible = 1
  AND asp.active = 1
ORDER BY cas.front_order_index ASC, cas.id ASC;
```

For `available_for_services`, the subquery is constrained to the same
visible subset:

```sql
SELECT service_id
FROM additional_service_prices
WHERE additional_service_id = :addon_id
  AND service_id IN (:visible_service_ids);   -- D3 v3
```

Skip this section if `?include=additional_services` is not present (it is
default-on, but allow the consumer to suppress it for lighter responses).

### 3.5 Hardcoded constraints (Phase 2 — defer)

Carrier-specific util classes encode some limits as constants or inline
checks. Examples (verbatim references):

- `app/ep/carriers/utils/FedExRestUtil.php:32-51` — `FEDEX_ONE_RATE_SERVICE_TO_BASE` map.
- `app/ep/carriers/utils/UpsUtil.php` — declared-value caps per service.
- `app/ep/carriers/utils/EstafetaUtil.php:129` — LTL max weight 1100 kg.
- `app/ep/carriers/Paquetexpress.php` — max dimension sum 380 cm (L+W+H).

**Phase 1 decision: do NOT extract these.** Return an empty
`hardcoded_limits.values` array with the `_note` field as documented in
§2.2. Phase 2 (separate ticket) extracts these into
`config/carrier_constraints.php` and populates the section.

### 3.6 Coverage summary (optional, `?include=coverage_summary`)

**D2 v3 — Sparse fieldset:** The `coverage_summary` block is **omitted from
the response entirely** when `?include=coverage_summary` is not in the
query string. It is NOT returned as `null`, NOT as an empty placeholder —
the field key is simply absent from `data`. Consumers should check field
presence (`isset` / `?.`) before reading.

When the section IS requested, return the placeholder shape (D9 v3 below).

Source: `service_coverage` table. Model:
`app/Models/ServiceCoverage.php:9-12`. Columns: `service_id`,
`postal_code`, `extended_zone_price`.

**D8 — Corrected SQL:** The v1 spec used `catalog_postal_codes.country_code`
which does not exist. The correct approach uses `carriers.locale_id →
locales.country_code`:

```sql
SELECT
  sc.service_id,
  l.country_code,
  COUNT(DISTINCT sc.postal_code) AS coverage_count
FROM service_coverage sc
INNER JOIN services s ON s.id = sc.service_id
INNER JOIN carriers c ON c.id = s.carrier_id
INNER JOIN locales l ON l.id = c.locale_id
WHERE s.carrier_id = :carrier_id
GROUP BY sc.service_id, l.country_code;
```

**D9 — Phase 1 behaviour:** When `?include=coverage_summary` is requested,
return the placeholder shape below. Do **NOT** fail the request or return
an error. The MCP tool renders `_unavailable` as a "pending Phase 2" message.

```json
"coverage_summary": {
  "_unavailable": "Computed asynchronously — pending Phase 2",
  "by_service": []
}
```

The full SQL above is documented for Phase 2 reference. Do not implement
the live query in Phase 1 — the `service_coverage` table has hundreds of
thousands of rows for some carriers, and the query plan requires performance
validation (EXPLAIN + materialized view consideration) before production use.

Phase 2 coverage summary deliverable is listed in §10.

### 3.7 Filtering by company (D1, D2, D3)

All results reflect the availability for the company identified by the JWT's
`company_id`, **not the global catalog**. Four tables gate what is returned:

| Table | Effect |
|-------|--------|
| `company_private_carriers` | Carriers explicitly enabled for this company. If a carrier is "private" (`carriers.private = 1`), it only appears if the company has a row here. |
| `company_private_services` | **D2:** Services explicitly enabled for this company. Apply this filter when loading services for the carrier. |
| `config_disabled_carriers` | **D3:** Carriers explicitly disabled for this company. Exclude any carrier with a row here. |
| `config_disabled_services` | **D3:** Services explicitly disabled for this company. The join is bounded by carrier services only (not a full-table scan) — add `AND cds.service_id IN (SELECT id FROM services WHERE carrier_id = :carrier_id)` to avoid performance issues. |

**Implementation pattern for private carriers (D1):**

A non-internal user requesting a `private=1` carrier that has no
`company_private_carriers` row for their company should receive `HTTP 404`
(treat the carrier as if it does not exist — do not leak its existence).
Alternatively, if the company is in the disabled list via
`config_disabled_carriers`, also return `HTTP 404`.

**Implementation pattern for services with no company access (D1 v3, D11):**

If the carrier exists but all its services are filtered out (via
`company_private_services` or `config_disabled_services`), return:

```json
{
  "status": "success",
  "data": { ..., "services": [] },
  "meta": {
    "carrier_id": 1,
    "company_id": 12345,
    "service_filter": null,
    "generated_at": "...",
    "_note": "Carrier exists but has no services available for your company."
  }
}
```

Do **NOT** return a 404. The MCP tool handles the empty-services case
gracefully with the `_note` field.

**D4 v3 — `service_id` filtered by company:** When the caller provides
`?service_id=N` and:

- N exists in the `services` table AND `services.carrier_id` matches the
  path `carrier_id` (so it's NOT a 422 mismatch), AND
- N is filtered out for this company (via `company_private_services` or
  `config_disabled_services`),

…return `HTTP 200` with `services: []` and a more specific note:

```json
"meta": {
  ...,
  "_note": "The requested service is not available for your company."
}
```

Rationale: 200-empty is consistent with "availability real for this
company" semantics. Returning 422 here would leak that the service exists
globally — the conservative posture is to treat company-level
unavailability as "as if it did not exist for you", same as the carrier-level
404 case in §2.3.

**Decision tree for `?service_id=N`:**

| Condition | HTTP | Body |
|---|---|---|
| N is not a positive integer | 400 | `"service_id must be a positive integer"` |
| N is a positive integer but does NOT exist in `services` OR exists but `services.carrier_id` ≠ path carrier | 422 | `"service_id does not belong to this carrier"` |
| N belongs to the carrier but is filtered out by `company_private_services` or `config_disabled_services` for this company | 200 | `services: []` + `meta._note` (specific message above) |
| N belongs to the carrier and is visible to this company | 200 | normal response with `services: [matching service]` |

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
            // D9 v3: validate with FILTER_VALIDATE_INT — defends against
            // strings like "abc" (which (int) would silently coerce to 0)
            // and "123abc" (coerced to 123). FILTER_VALIDATE_INT returns
            // false on any non-pure-integer input.
            $validatedCarrierId = filter_var(
                $carrierId,
                FILTER_VALIDATE_INT,
                ['options' => ['min_range' => 1]],
            );
            if ($validatedCarrierId === false) {
                throw new \InvalidArgumentException('carrier_id must be a positive integer');
            }
            $carrierId = $validatedCarrierId;

            $userVal = $request->attributes->get('userVal');
            $companyId = $userVal->company_id ?? null;

            $serviceIdRaw = $request->query('service_id');
            $serviceId = null;
            if ($serviceIdRaw !== null) {
                $validatedServiceId = filter_var(
                    $serviceIdRaw,
                    FILTER_VALIDATE_INT,
                    ['options' => ['min_range' => 1]],
                );
                if ($validatedServiceId === false) {
                    throw new \InvalidArgumentException('service_id must be a positive integer');
                }
                $serviceId = $validatedServiceId;
            }

            $includeRaw = $request->query('include', 'additional_services');
            $include = array_filter(
                array_map('trim', explode(',', $includeRaw))
            );

            $allowedIncludes = ['additional_services', 'coverage_summary'];
            foreach ($include as $val) {
                if (!in_array($val, $allowedIncludes, true)) {
                    throw new \InvalidArgumentException(
                        'include accepts only: additional_services, coverage_summary'
                    );
                }
            }

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

**D12 note:** `\InvalidArgumentException` covers all 400 cases (malformed
carrier_id, malformed service_id, unknown include value). The 422 case
(`service_id valid but does not belong to carrier`) is thrown from the
service layer as `\App\Exceptions\ValidationException`.

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
        // Cache key includes companyId so per-company filters/overrides do not bleed.
        $cacheKey = "carrier-constraints:{$carrierId}:{$companyId}:" . ($serviceId ?? 'all') . ':' . implode(',', $include);

        // D8 v3 — cache wraps `data` ONLY. `meta` (especially generated_at,
        // and the conditional _note) is built per-request, AFTER the cache
        // lookup, so timestamps reflect response time and notes can adapt
        // to the live filter state. CacheUtil is unmodified.
        $data = CacheUtil::remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($carrierId, $companyId, $serviceId, $include) {
            $carrier = $this->loadCarrier($carrierId, $companyId);
            $services = $this->loadServices($carrierId, $serviceId, $companyId);

            // D1 v3 — service_id mismatch (does not belong to carrier) → 422
            // The "filtered out by company" path returns empty services here
            // (200 + meta._note built outside the closure).
            if ($serviceId !== null && $this->serviceIdBelongsToOtherCarrier($serviceId, $carrierId)) {
                throw new \App\Exceptions\ValidationException('service_id does not belong to this carrier');
            }

            $overrides = $companyId !== null
                ? $this->loadCompanyOverrides($companyId, $services->pluck('id')->all())
                : collect();

            $visibleServiceIds = $services->pluck('id')->all();

            // D3 v3 — additional services filtered against company-visible subset
            $additionalServices = in_array('additional_services', $include, true)
                ? $this->loadAdditionalServices($carrierId, $visibleServiceIds)
                : null;

            // D2 v3 — coverage_summary key is omitted entirely when not requested
            $shapedData = [
                'carrier' => $this->shapeCarrier($carrier),
                'pickup' => $this->shapePickup($carrier),
                'tracking' => $this->shapeTracking($carrier),
                'services' => $services->map(fn($s) => $this->shapeService($s, $overrides->get($s->id)))->values()->all(),
                'additional_services' => $additionalServices,
                'hardcoded_limits' => [
                    '_note' => 'Phase 1 placeholder. See _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md §10.',
                    'values' => [],
                ],
            ];
            if (in_array('coverage_summary', $include, true)) {
                $shapedData['coverage_summary'] = $this->loadCoverageSummary($carrierId);
            }

            return $shapedData;
        });

        // D8 v3 — meta is built outside CacheUtil. generated_at is always now()
        // and _note adapts to the (cached) services array.
        $meta = [
            'carrier_id' => $carrierId,
            'company_id' => $companyId,
            'service_filter' => $serviceId,
            'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
        $serviceCount = count($data['services'] ?? []);
        if ($serviceCount === 0) {
            // D1/D4 v3 — distinguish "no services at all" vs "specific service filtered for company"
            $meta['_note'] = $serviceId !== null
                ? 'The requested service is not available for your company.'
                : 'Carrier exists but has no services available for your company.';
        }

        return [
            'data' => $data,
            'meta' => $meta,
        ];
    }

    // ...loadCarrier, loadServices, loadCompanyOverrides, loadAdditionalServices,
    //    loadCoverageSummary, shapeCarrier, shapePickup, shapeTracking, shapeService
    //    are private methods. See §3 for the SQL each one runs.
}
```

**Method-by-method skeleton:**

- `loadCarrier(int $carrierId, ?int $companyId): Carrier` — `Carrier::find($carrierId)`. Throw `NotFoundException` if null. Apply private/disabled checks from §3.7 (treat filtered carriers as not found via `NotFoundException`).
- `loadServices(int $carrierId, ?int $serviceId, ?int $companyId): Collection<ServiceModel>` — query per §3.2, with company filters from §3.7 applied.
- `loadCompanyOverrides(int $companyId, array $serviceIds): Collection` — query per §3.3, key the result by `service_id`.
- `loadAdditionalServices(int $carrierId): array` — SQL per §3.4 (includes `AND asp.active = 1`). Batch the `available_for_services` subquery (no N+1).
- `loadCoverageSummary(int $carrierId): array` — Phase 1: return `['_unavailable' => 'Computed asynchronously — pending Phase 2', 'by_service' => []]` always.
- `loadAdditionalServices(int $carrierId, array $visibleServiceIds): array` — D3 v3: SQL joins are bounded by `s.id IN (:visibleServiceIds)`, NOT just `s.carrier_id = :carrierId`. If `$visibleServiceIds` is empty the function returns `[]` immediately.
- `serviceIdBelongsToOtherCarrier(int $serviceId, int $carrierId): bool` — D1 v3 helper: returns true if `$serviceId` exists in `services` but with a different `carrier_id` (or doesn't exist at all). Used by the controller layer to distinguish 422 (mismatch) from 200-empty (filtered for company).
- `shapeCarrier(Carrier $c): array` — pure transformation. Cast int→bool. **Exclude `endpoint` field (D10).** **Exclude `active` field (D6 v3).** Include `volumetric_factor_id` always — set to `null` when DB column is null (D5 v3).
- `shapePickup(Carrier $c): array` — cast and assemble.
- `shapeTracking(Carrier $c): array` — include `envia_track_url_template` (from `track_url`) and `carrier_track_url_template` (from `track_url_site`). **No `track_url_template` key** (D6).
- `shapeService(ServiceModel $s, ?object $override): array` — assemble per §3.2. Include all three international fields (D4). Apply override block.

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
// D4: international triple field
public function testGetConstraintsMapsInternationalCodeToScope()
// D5: volumetric_factor_id is optional
public function testGetConstraintsOmitsVolumetricFactorIdWhenNull()
// D11: empty services returns 200 + meta._note
public function testGetConstraintsReturnsMetaNoteWhenServicesEmpty()
// D13: meta.cached is never in the response
public function testGetConstraintsDoesNotIncludeCachedInMeta()
```

**New file:** `tests/Feature/CarrierConstraintsControllerTest.php`.

```php
public function testShowReturns401WithoutBearerToken()
public function testShowReturns404WhenCarrierMissing()
public function testShowReturns404WhenCarrierIsPrivateAndCompanyNotAllowlisted()  // D1 v3
public function testShowReturns404WhenCarrierIsInConfigDisabledCarriers()        // D1 v3
public function testShowReturns400WhenCarrierIdNotPositiveInteger()              // D9 v3 (FILTER_VALIDATE_INT)
public function testShowReturns400WhenCarrierIdIsNonNumericString()              // D9 v3 ("abc" → 400, NOT 0)
public function testShowReturns400WhenCarrierIdIsAlphanumericString()            // D9 v3 ("123abc" → 400)
public function testShowReturns400WhenServiceIdNotPositiveInteger()
public function testShowReturns400WhenIncludeValueUnknown()
public function testShowReturns422WhenServiceIdBelongsToOtherCarrier()           // D1 v3 mismatch path
public function testShowReturns200WithExpectedShapeForFedex()
public function testShowAppliesCompanyOverrideFromJwt()
public function testShowReturns200WithEmptyServicesAndGenericNoteForDisabledServices()  // D1 v3 carrier-level
public function testShowReturns200WithEmptyServicesAndSpecificNoteForFilteredServiceId() // D4 v3 service-level
public function testShowOmitsCoverageSummaryWhenNotInInclude()                   // D2 v3
public function testShowIncludesCoverageSummaryPlaceholderWhenRequested()        // D2 v3 + D9 v3
public function testShowMetaGeneratedAtReflectsCurrentTimeNotCacheFillTime()     // D8 v3
```

For the `200 with expected shape` assertion, use `assertJsonStructure`
with the full shape from §2.2. Verify:
- `carrier.endpoint` is absent (D10)
- `carrier.active` is absent (D6 v3)
- `meta.cached` is absent (D13)
- `data.coverage_summary` is absent unless `?include=coverage_summary` was passed (D2 v3)
- `tracking.envia_track_url_template` and `tracking.carrier_track_url_template` are both present (D6)
- `services[0].international_code` and `services[0].international_scope` are present (D4)
- `carrier.volumetric_factor_id` is present and either a number or `null` (D5 v3 — never absent)

**Auth bootstrap pattern** — match `tests/System/Util/RateTest.php`.

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
`data.additional_services` non-empty, `data.carrier.endpoint` absent,
`meta.cached` absent.

---

## 5. Caching strategy

Use the existing `CacheUtil::remember()` pattern (see `app/ep/util/CacheUtil.php`).

- **Key format:** `carrier-constraints:{carrier_id}:{company_id|''}:{service_id|'all'}:{include_csv}`
- **TTL:** 3600 s (1 hour). Carrier metadata changes rarely.
- **Invalidation:** none required for Phase 1.

**Important:** the cache key includes `company_id` so per-company
filters and overrides do not leak across tenants. **Do NOT cache without it.**

**D8 v3 — Cache scope:** `CacheUtil::remember()` wraps **`data` only**.
`meta` (especially `meta.generated_at` and the conditional `meta._note`)
is constructed in the controller AFTER the cache lookup, so:

- `generated_at` always reflects the actual response time, never the
  time the data was originally cached.
- `_note` adapts to the live filter state (e.g. when an admin disables
  the last service for a company mid-cache-window, the next call still
  returns the cached `data` but the `_note` is freshly evaluated).

**`CacheUtil` itself is not modified.** This decision (v3) avoids touching
a cross-cutting utility used by 30+ controllers in the carriers service.

**D13 — Cache observability:** cache hit/miss is **not** included in the
response body. The `meta.cached` field from v1 is removed. Instead, track
cache performance via Datadog APM span attributes on `CacheUtil::remember`.
Verify cache state directly with Redis:

```bash
EXISTS carrier-constraints:{carrier_id}:{company_id}:all:additional_services
```

If the key exists, the cache is warm. If absent, the next call will populate it.

---

## 6. Authorisation rules

- All callers must have a valid Bearer JWT (handled by `auth` middleware).
- **D10 — Internal URL protection:** `carrier.endpoint` (the internal carrier API base URL) is never exposed in the response. Leaking these URLs would expose internal infrastructure topology to portal users.
- **Private carrier access:** A non-internal user requesting a `private=1` carrier that has no `company_private_carriers` row for their company must receive HTTP 404 (treat as non-existent — do not leak its existence). See §3.7.
- **Disabled carrier access:** A carrier in `config_disabled_carriers` for the requesting company also returns HTTP 404.
- **D11 — Empty services semantics:** A carrier that is accessible but has no services available for the requesting company (all filtered by §3.7) returns HTTP 200 with `services: []` and `meta._note`. This is NOT a 404.
- Per-company overrides only apply for the JWT's `company_id`. Never accept `?company_id=` as a query parameter — that would let one tenant probe another tenant's overrides.

---

## 7. Observability

Match the carriers service convention. Log at minimum:

- On 200: `carrier_id`, `company_id`, `service_filter`, `duration_ms`.
- On 4xx: `carrier_id`, `company_id`, `error_class`, `error_message`.
- On 5xx: include stack trace via existing error-handler convention.

If carriers has Datadog APM tracing wired, the new endpoint will be picked
up automatically by the framework instrumentation.

---

## 8. Anti-patterns to avoid (read this before coding)

1. **Do not query `service_coverage` without a guard.** Some carriers
   have hundreds of thousands of rows. Phase 1 returns the placeholder; Phase 2
   requires EXPLAIN verification.
2. **Do not return `weight_unit` as anything other than `"KG"`.** Log a warning
   if a non-KG row is found but return `"KG"` anyway.
3. **Do not mutate top-level `limits.{min,max}_weight_kg` when a company override
   exists.** The override is exposed under `limits.company_override`.
4. **Do not call `CarrierUtil::*` static helpers from this service.**
   `CarrierUtil` is a god class — re-implement the small bits of logic you need.
5. **Do not add `?company_id=` as a query parameter.** Cross-tenant probing surface.
6. **Do not skip the `private` carrier and disabled-carrier checks** (§3.7).
7. **Do not extract hardcoded constants in this PR.** Phase 1 ships with
   `hardcoded_limits.values: []`. Phase 2 is a separate ticket.
8. **Do not include `carrier.endpoint` in the response.** D10 decision — security.
9. **Do not include `meta.cached` in the response.** D13 decision — use Datadog APM.
10. **Do not include `carrier.active` in the response.** D6 v3 decision — redundant per the strict 404/200 hierarchy in §2.3.
11. **Do not return `"Carrier not active"` as a 404 error.** Replaced in v3 by the strict hierarchy: private/disabled → 404; empty services → 200 + `meta._note`.
12. **Do not include `coverage_summary` when not requested.** D2 v3 — the field is absent (not `null`) when `?include=coverage_summary` was not passed.
13. **Do not modify `CacheUtil` or other shared utilities** to surface metadata in the response. D8 v3 — cache `data` only and build `meta` per-request.
14. **Do not use `(int) $carrierId` for path-param validation.** D9 v3 — `(int) "abc"` silently coerces to `0` and `(int) "123abc"` to `123`. Always use `FILTER_VALIDATE_INT` with `min_range: 1`.

---

## 9. Acceptance criteria (executable checklist)

Mark each `[ ]` → `[x]` as done. Do not ship until all are checked.

**Happy path:**
- [ ] `GET /carrier-constraints/1` returns HTTP 200 with the shape in §2.2.
- [ ] Response contains `tracking.envia_track_url_template` AND `tracking.carrier_track_url_template` (D6).
- [ ] Response contains `services[0].international` (bool), `services[0].international_code` (int), `services[0].international_scope` (string) — all three (D4).
- [ ] Response contains `carrier.volumetric_factor_id` always — value is either `number` or `null`, never absent (D5 v3).
- [ ] Response does **NOT** contain `carrier.endpoint` (D10).
- [ ] Response does **NOT** contain `carrier.active` (D6 v3).
- [ ] Response does **NOT** contain `meta.cached` (D13).
- [ ] Response does **NOT** contain `data.coverage_summary` unless `?include=coverage_summary` is passed (D2 v3).

**Error paths (D1 v3 hierarchy + D9 v3 input validation):**
- [ ] `GET /carrier-constraints/99999` returns HTTP 404, `error: "Carrier not found"`.
- [ ] `GET /carrier-constraints/abc` returns HTTP 400 (`FILTER_VALIDATE_INT` rejects).
- [ ] `GET /carrier-constraints/123abc` returns HTTP 400 (D9 v3 — would have been silently coerced to 123 with `(int)`).
- [ ] `GET /carrier-constraints/1?service_id=0` returns HTTP 400.
- [ ] `GET /carrier-constraints/1?include=bad_value` returns HTTP 400.
- [ ] `GET /carrier-constraints/1` without Bearer token returns HTTP 401.
- [ ] `GET /carrier-constraints/{private_carrier_id}` from a non-allowlisted company returns HTTP 404 (no leak).
- [ ] `GET /carrier-constraints/{config_disabled_carrier_id}` returns HTTP 404 (no leak).
- [ ] `GET /carrier-constraints/1?service_id=999999` returns HTTP 422 when service exists for a different carrier or doesn't exist.

**200 + empty services semantics (D1, D4 v3):**
- [ ] Carrier accessible but all services filtered for company → HTTP 200 + `services: []` + `meta._note: "Carrier exists but has no services available for your company."` (D1 v3).
- [ ] `?service_id=N` where N belongs to carrier but is filtered for company → HTTP 200 + `services: []` + `meta._note: "The requested service is not available for your company."` (D4 v3).

**Company override:**
- [ ] Company with rows in `company_service_restrictions` shows `limits.company_override.applied: true` on affected services.
- [ ] Company with no overrides shows `limits.company_override.applied: false` on all services.

**Cache (D8 v3):**
- [ ] Two calls 5+ seconds apart return the same `data` (cached) but DIFFERENT `meta.generated_at` values — proves cache wraps `data` only.
- [ ] Cache state confirmed via Redis: `EXISTS carrier-constraints:1:{company_id}:all:additional_services` returns 1 after the first call.

**Type discipline:**
- [ ] All boolean columns cast to JSON `true`/`false`, never `0`/`1` or `"0"`/`"1"`.
- [ ] All weight values returned as numbers (not strings).
- [ ] `carrier.volumetric_factor_id` is JSON `number` or JSON `null`, never JSON `"null"` string.

**Tests + ops:**
- [ ] Unit tests in `tests/Unit/CarrierConstraintsServiceTest.php` pass.
- [ ] Feature tests in `tests/Feature/CarrierConstraintsControllerTest.php` pass.
- [ ] `phpunit` green on the whole carriers test suite (no regressions).
- [ ] Manual `curl` against staging completes in < 500 ms first call.
- [ ] Datadog APM shows the new route under the carriers service tag.

---

## 10. Phase 2 (out of scope here, separate ticket)

Once Phase 1 is in production and the MCP `envia_get_carrier_constraints`
tool is using it, schedule Phase 2:

1. **Coverage summary:** implement the live SQL from §3.6 with materialized
   view or row-count guard. Remove the `_unavailable` placeholder.
2. **Hardcoded limits:** audit each carrier util class and extract constants into
   `config/carrier_constraints.php`. Populate `hardcoded_limits.values`.
3. Add a `php artisan` command that diffs config against source code on each release.

Estimated Phase 2 effort: 5–7 days (per-carrier audit is the long pole).

---

## 11. Dependencies for the implementing engineer

Before coding, the engineer needs:

1. **Read access to the carriers DB** — for verifying SQL and shape against real data.
2. **Bearer JWT** for a test company id (sandbox token works; see
   `_docs/SMOKE_TEST_PLAYBOOK.md` for `ENVIA_TEST_TOKEN`).
3. **A test company id with at least one row in
   `company_service_restrictions`** for testing the override path.
4. **Local PHP 8 + composer** environment matching the carriers service runtime.

---

## 12. Verified assumptions (D10 v3 — no open questions remain)

In v1/v2 this section listed open questions for the implementer. The
backend round-2 review (2026-04-27) **verified all four** against
production schema and code. Restated here as confirmed assumptions:

| # | Assumption | Verified | Source |
|---|---|---|---|
| 1 | `catalog_shipment_types` exists as a real table with a `name` column | ✓ | Backend round-2 review |
| 2 | `catalog_rate_types` exists as a real table with a `name` column | ✓ | Backend round-2 review |
| 3 | `carriers.track_url_site` exists as a column (used for `carrier_track_url_template`, D6) | ✓ | Backend round-2 review |
| 4 | `company_private_carriers` table exists and is the canonical allowlist for `private=1` carriers | ✓ | Backend round-2 review |

The implementer can take the SQL in §3.1, §3.2, §3.3, §3.4 at face value.
No verification round-trips required.

---

## 13. Out of scope (do not implement)

- Write endpoints for carrier-constraints (no PUT/POST/PATCH).
- Per-postal-code coverage queries (use `coverage_summary` aggregate only).
- Real-time carrier-API capability probing.
- Localised translations of `name` / `description`.
- Any schema changes.
- Migrations of any kind. Phase 1 is read-only.

---

## 14. Spec metadata

- **Author (v1):** Claude Opus 4.7 (1M context), session 2026-04-27.
- **v2 author:** Claude Sonnet 4.6, 2026-04-27 (13 round-1 backend-review decisions applied).
- **v3 author:** Claude Opus 4.7 (1M context), 2026-04-27 (10 round-2 decisions applied).
- **Reviewer:** Jose Vidrio (CTO).
- **Backend round-1 reviewer:** equipo backend, 2026-04-27.
- **Backend round-2 reviewer:** equipo backend, 2026-04-27.
- **Status:** READY FOR IMPLEMENTATION (v3 — final contract, all open questions resolved).
- **Backend brief reference:** `_docs/BACKEND_TEAM_BRIEF.md` item C11.
- **Consumer:** `envia-mcp-server` `envia_get_carrier_constraints` tool
  (4th tool of Sprint 7's pre-approved set). MCP code aligned to v3 contract
  in this same commit.
