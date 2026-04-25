# Additional Services Catalog — Verified Coverage

> Date verified: 2026-04-25 against `queries-test.envia.com`.
> Endpoint: `GET /additional-services/{country_code}/{international}/{shipment_type}`.
> Verifies what `envia_list_additional_services` actually returns by combination.

## 1. Coverage matrix

| Combination | HTTP | Categories | Services | Notes |
|-------------|------|-----------:|---------:|-------|
| MX parcel domestic | 200 | 16 | 22 | **Richest catalog**. Full FedEx suite + 5 signatures + dangerous_good + insurance variants |
| MX LTL domestic | 200 | 5 | 14 | Full LTL set: liftgate, hydraulic, appointments, residential pickup |
| US parcel domestic | 200 | 5 | 8 | Mid catalog. 2 signatures, hazmat, controlled export |
| BR parcel domestic | 200 | 4 | 5 | Reduced. Only 2 signatures (indirect, electronic). NO `envia_insurance` |
| BR LTL domestic | 200 | 2 | 2 | Minimal. Insurance + liftgate_pickup only |
| CO parcel domestic | 200 | 3 | 3 | Insurance + COD + return_to_sender. **No signatures, no FedEx-specific** |
| AR parcel domestic | 200 | 3 | 3 | Same as CO. Only `envia_insurance` (no carrier-native) |
| MX → US intl parcel | 200 | 5 | 7 | Insurance variants + FedEx ETD + 2 signatures + hold_at_location. **No COD** |
| MX → BR intl parcel | 200 | 3 | 5 | Insurance + FedEx ETD + hold_at_location only |
| US → MX intl parcel | 200 | 5 | 7 | Same as MX → US |

## 2. Critical findings

### 2.1 Catalog richness varies dramatically by country (factor 7×)

MX domestic parcel returns **22 services** in **16 categories**. CO and AR return only **3 services** in **3 categories**. Same `shipment_type=1`, same `international=0`.

Implication: the agent must NOT assume the same catalog applies across LATAM. A user in Colombia asking "¿qué firmas tienes?" will get nothing — there are no signature services exposed for CO domestic. Today the agent has no way to know this without calling the endpoint per request.

### 2.2 Insurance type availability is country-dependent

| Country / mode | Insurance services exposed |
|----------------|----------------------------|
| MX parcel domestic | `envia_insurance`, `high_value_protection` |
| MX LTL domestic | `insurance` (carrier-native only) |
| US parcel domestic | `envia_insurance`, `insurance` |
| BR parcel domestic | `insurance` (carrier-native only) |
| BR LTL domestic | `insurance` |
| CO parcel domestic | `insurance` |
| AR parcel domestic | `envia_insurance` |
| MX → BR intl | `insurance`, `envia_insurance`, `high_value_protection` (all 3) |
| MX → US intl | `envia_insurance`, `high_value_protection` |
| US → MX intl | `envia_insurance`, `high_value_protection` |

The MCP `insurance_type` enum hardcodes `'envia_insurance' | 'insurance' | 'high_value_protection'` (`src/tools/create-label.ts:311`). This is correct in shape but a user saying "asegura mi envío" without specifying the variant cannot be served safely without first checking which variants exist for that country. The agent today does not gate on this.

### 2.3 COD only available domestic (LATAM)

`cash_on_delivery` appears in: MX, BR, CO, AR (all domestic parcel).
Does NOT appear in: any international combination, US domestic, any LTL.

The CEO doc lists "¿Puedo crear un envío con pago contra entrega?" as Sofía priority. Today's MCP supports it via `cod_amount` shortcut, but a user asking it for an international shipment will be silently rejected by the carrier rather than warned upfront.

### 2.4 5 signature variants only in MX domestic parcel

| Country / mode | Signature services |
|----------------|--------------------|
| MX parcel domestic | direct, electronic, no_signature_required, indirect_signature_required, adult_signature_required |
| US parcel domestic | electronic, direct |
| BR parcel domestic | indirect, electronic |
| CO / AR parcel domestic | none |
| Intl (MX→US, US→MX) | electronic, direct |
| Intl (MX→BR) | none |

The CEO doc has questions like "¿Diferencia entre las 5 firmas?" — that question only makes sense in MX. For other countries the available set is smaller.

### 2.5 LTL has its own service vocabulary

`MX LTL domestic` uses `liftgate_pickup`, `liftgate_delivery`, `hydraulic_lift`, `delivery_appointment`, `pickup_appointment`, `pickup_collection`, `delivery_collection`, `handling`, `pickup_residential_zone`. None of these appear in any parcel combination. The doc memory's split between "Sobre/Caja vs Tarima/Camión" is real and confirmed by the API.

`BR LTL domestic` only returns 2 services (insurance + liftgate_pickup) — much poorer than MX LTL.

### 2.6 International strips most services

International combinations top out at 5–7 services. Specifically lost vs MX domestic:

- COD (any direction)
- Saturday pickup / saturday_service
- Future day shipping
- Third party consignee
- International broker select
- Ship alert / priority alert
- Dangerous goods
- 3 of 5 signatures (only direct + electronic survive)
- return_to_sender

This means the agent's response set for an international quote is fundamentally smaller than for domestic. Users coming from a "domestic mental model" will ask for things that simply aren't available.

## 3. Backend data quality issues found

These should be reported to the queries / carriers teams:

### 3.1 Duplicate service registration

`MX parcel domestic` returns `dangerous_good` twice in the `dangerous_goods` category (different `category_id` likely, same code). Probable duplicate row in the catalog table.

### 3.2 Category naming inconsistencies

In `MX LTL domestic`:
- Category `lifgate_pickup` is misspelled (should be `liftgate_pickup`).
- Categories `liftgate_delivery`, `lifgate_pickup`, `pickup_residential` each contain a single service whose code matches the category name. These appear to be wrapper categories that should probably be merged under `general`.

In `MX parcel domestic`:
- Category `Ship_alert` uses inconsistent capitalization vs `priority_alert`, `saturday_pickup`, `future_day_shipping`.

These are not blocking but produce noise in the agent's output.

### 3.3 `saturday_pickup` vs `saturday_service` naming asymmetry

MX domestic uses `saturday_pickup`. US domestic uses `saturday_service` (under `delivery_residential` category). Same conceptual service, different code. The MCP cannot reconcile these without a hardcoded synonym table.

### 3.4 `hold_at_location` appears in MX domestic + all international combinations BUT NOT in US domestic parcel

Verified: not present in `US_parcel_domestic.json`. Either backend gap or carrier-rule artifact. Worth confirming with carriers team.

## 4. Implications for the MCP

### 4.1 Confirmed gaps from prior analysis

- **Gap 1 (cost calc dynamic):** still real. None of these endpoints expose a per-service price; the catalog only lists availability.
- **Gap 2 (carrier filter):** backend does NOT filter by carrier in this endpoint. The catalog is country/intl/shipment_type only. To answer "what does FedEx specifically offer", one must combine `list_carriers` + this catalog and apply a hardcoded knowledge of which services are FedEx-only (e.g. `fedex_etd`, `priority_alert`, `ship_alert`, `int_broker_select`). That mapping is not in the MCP today.
- **Gap 3 (catalog coverage):** RESOLVED by this verification — full per-combination coverage is now documented.

### 4.2 New gaps surfaced by verification

- **Gap 7 (regional asymmetry not exposed to agent):** the agent today does not know that CO has 3 services and MX has 22. When a Colombian user asks "¿qué tienes?" the agent should not start enumerating MX-style options. Today the agent sees only what the endpoint returns for that specific country, which is correct, but the **conversational priors** (what the agent assumes is "normal") are MX-biased because that's the richest catalog.
- **Gap 8 (insurance variant ambiguity by country):** when a user says "agrega seguro" the agent should choose `envia_insurance` if available, fall back to `insurance` if not. Today this logic does not exist explicitly; it depends on the LLM picking correctly. Worth codifying as a small helper or documenting in the tool description.
- **Gap 9 (international restrictions not surfaced upfront):** an agent asked "agrégale COD a este envío MX→US" will pass it to `create_label` and the carrier rejects. The agent should consult the catalog first and respond "COD is not available for international shipments from MX". This is a `mapCarrierError` or pre-check gap.

## 5. Recommendations — concrete and small

| # | Action | Effort | Type |
|---|--------|--------|------|
| 1 | Add this doc as the agent's reference for "what's normal per country" — already done by writing this file | XS | Done |
| 2 | Report 4 backend data-quality issues (§3.1–3.4) to queries / carriers team via shared backlog | XS | Backlog item |
| 3 | Update `list_additional_services` tool description to mention catalog richness varies by country (so the agent does not over-promise) | XS | Doc / description |
| 4 | Add a small helper that, given a country + intl + shipment_type, returns a one-line summary suitable for the agent's working memory ("MX domestic: 22 services; CO domestic: 3 services") — optional internal helper | S | Internal helper |
| 5 | When `insurance_type` is omitted but user says "asegura", the tool resolves the appropriate variant from the catalog automatically with a graceful fallback. Document this behavior or implement | S | Tool extension |
| 6 | Pre-validate destination + shipment_type before requesting COD in `create_label`; if catalog does not include `cash_on_delivery` for that combination, reject with a clear error | S | Tool extension |

Total: 0 net new tools. 2 small extensions of existing tools. 1 doc update. 4 backlog items for backend team. Aligned with the principle "tools are infrastructure, content is editorial".

## 6. Raw data location

10 sandbox responses saved at `/tmp/addsvc/*.json` during verification. These are not committed (sandbox dumps), but the per-file service inventory is captured in §1 and §2 of this doc.

If you want any specific combination re-verified later, the curl pattern is:

```bash
TOKEN="<sandbox-token>"
BASE="https://queries-test.envia.com/additional-services"
curl -sS "$BASE/{CC}/{0|1}/{shipment_type}" -H "Authorization: Bearer $TOKEN"
# add ?destination_country={CC} when international=1
```

---

# Iteration 2 — Deep schema analysis (2026-04-25)

> Triggered by user feedback: first iteration treated service entries as
> flat code+name pairs and missed several distinctions (high-value
> protection vs envía_insurance vs carrier-native insurance, multi-field
> form schemas, surcharges that look like services). This section is a
> rigorous re-analysis. Total combinations tested: 19 (was 10).

## 7. Total catalog — 43 unique services across 19 combinations

Extended verification covered: MX/US/BR/CO/AR/ES/CL/PE/GT/IN parcel
domestic, MX/BR/US LTL domestic, MX→US/MX→BR/MX→CO/MX→ES/US→MX/BR→MX
international parcel.

Total unique services found: **43** (memory had 35, all MX-scoped).

## 8. Service classification by FORM COMPLEXITY (the critical lens)

Each service in the catalog ships a `json_structure` field with the form
schema for the UI. This determines what data the MCP must send. Sorting
services by complexity:

### 8.1 Boolean / flag (27 services) — MCP supports OK

Just send `{ service: "name" }`. No data needed.

`acknowledgment_receipt`, `adult_signature_required`, `dangerous_good`,
`delivery_residential_zone`, `direct_signature`, `electronic_signature`,
`future_day_shipping`, `handling`, `hold_at_location`, `hold_for_pickup`,
`hydraulic_lift`, `indirect_signature_required`,
`international_broker_select`, `international_controlled_export`,
`liftgate_delivery`, `liftgate_pickup`, `no_signature_required`,
`original_invoice`, `pickup_residential_zone`, `pickup_schedule`,
`priority_alert`, `return_to_sender`, `reverse_pickup`, `saturday_pickup`,
`saturday_service`, `ship_alert`, `third_party_consigne`.

### 8.2 Amount-only (4 services) — MCP supports OK

Send `{ service: "name", data: { amount: N } }`.

| Service | tooltip_amount default | Notes |
|---------|-----------------------|-------|
| `envia_insurance` | **2000.00** | Envia's own insurance product |
| `high_value_protection` | **2000.00** | Premium / high-value tier (separate product) |
| `insurance` | (none) | Carrier-native (FedEx Declared Value, etc.) |
| `cash_on_delivery` | (none) | Amount = collection amount in destination currency |

### 8.3 Multi-field form (7 services) — **MCP DOES NOT SUPPORT — critical gap**

These services require fields beyond `amount`. The MCP's
`buildAdditionalServices` (`src/builders/additional-service.ts`) only
emits `data: { amount }`. **Anything else is dropped. The carrier API
will reject these services if the user requests them.**

| Service | Required extra fields | Effect of MCP gap |
|---------|----------------------|-------------------|
| `electronic_trade_document` (FedEx ETD) | `invoice_type` (select 1=upload PDF, 2=auto-generate), conditionally `file` (PDF) for option 1, conditionally `logo` (PNG/JPG) for option 2 | If user asks "agrega ETD", MCP sends bare service flag. Carrier rejects or processes with defaults. |
| `hazmat` | `content_type` (select: HAZMAT / CREMATEDREMAINS / FRAGILE / PERISHABLE / PHARMACEUTICALS / MEDICAL SUPPLIES / LIVES) | If user says "envío frágil/perecedero", MCP cannot encode the type. |
| `delivery_appointment` (LTL) | `date` (required) | LTL appointment scheduling cannot be requested. |
| `pickup_appointment` (LTL) | `date` (required) | Same. |
| `delivery_schedule` (LTL) | `date` (required) | Same. |
| `pickup_collection` (LTL) | `select` (string) | LTL pickup collection variant cannot be selected. |
| `delivery_collection` (LTL) | `select` (string) | LTL delivery collection variant cannot be selected. |

### 8.4 Surcharges leaking into the catalog (5 services) — likely backend bug

Found ONLY in US LTL domestic. These are **carrier surcharges**, not
electable add-ons. They should not appear as services the user can pick;
they apply automatically based on carrier rules.

`fuel`, `state_charge`, `california_capacity`, `security_charge`,
`inside_pickup`.

If the agent or user toggles these on, behavior is undefined. **Likely
backend modeling bug** — carrier surcharges leaking into the
additional-services catalog. Should be reported.

`security_charge` also appeared in MX→ES intl. Same concern.

## 9. Insurance product taxonomy — three DISTINCT products

The MCP `insurance_type` enum is correct in shape but the three values
are not interchangeable:

### 9.1 `envia_insurance` ("Seguro Envía")

- **Owner:** Envia (cross-carrier product).
- **Default coverage hint:** $2,000.00 (per `tooltip_amount`).
- **Availability:** 14 of 19 combos tested. The most universally
  available — works in MX/US/BR/CO/AR/ES/CL/PE/GT/IN domestic + most
  intl.
- **Use when:** User wants Envia's protection, regardless of carrier.
- **Claim flow:** Through Envia's support, not the carrier.

### 9.2 `high_value_protection` (premium tier)

- **Owner:** Envia (separate product from envia_insurance).
- **Default coverage hint:** $2,000.00 (same default, but it's a
  PREMIUM tier — likely allows higher caps).
- **Availability:** 7 of 19 combos. Mostly MX domestic parcel + 6
  international combos. NOT available in BR/CO/AR/ES/CL/PE/GT/IN
  domestic.
- **Use when:** Declared value is high enough that envia_insurance's
  cap doesn't suffice.
- **Distinction not surfaced today:** the MCP's tool description does
  not explain the difference. The agent may pick either at random. The
  user community probably doesn't even know there are two products.

### 9.3 `insurance` (carrier-native)

- **Owner:** The carrier (FedEx Declared Value, DHL Insurance, etc.).
- **No tooltip_amount default.**
- **Availability:** 10 of 19 combos. Strong presence in BR/MX-LTL/
  US/GT/intl. Notably absent in CL/PE/IN/CO/AR/ES domestic.
- **Use when:** User specifically wants carrier-backed insurance, or
  when Envia products don't apply (BR LTL only has this one, for
  example).
- **Claim flow:** Through the carrier, not Envia.

### 9.4 Mutual exclusivity

The MCP enforces "only one insurance type at a time" client-side via
`validateInsuranceExclusivity`. This is correct — backend may or may
not enforce it, but client-side gate prevents bad calls.

## 10. Country availability — sparse for non-MX

| Country / mode | Total services | Insurance available | COD | Signatures | Multi-field |
|----------------|---------------:|--------------------|-----|------------|-------------|
| MX parcel domestic | 22 | env+hvp | ✅ | 5 variants | dangerous_good, ship_alert, priority_alert |
| MX LTL domestic | 14 | insurance | ❌ | ❌ | 7 services with date/select forms |
| US parcel domestic | 8 | env+ins | ❌ | 2 | hazmat |
| US LTL domestic | 10 (5 real + 5 surcharges) | insurance | ❌ | ❌ | (LTL) |
| BR parcel domestic | 5 | insurance | ✅ | 2 | – |
| BR LTL domestic | 2 | insurance | ❌ | ❌ | – |
| CO parcel domestic | 3 | insurance | ✅ | ❌ | – |
| AR parcel domestic | 3 | env | ✅ | ❌ | – |
| GT parcel domestic | 3 | env+ins | ✅ | ❌ | – |
| IN parcel domestic | 4 | env | ✅ | 1 | – |
| ES parcel domestic | 2 | env | ✅ | ❌ | – |
| CL parcel domestic | 2 | env | ❌ | 1 | – |
| PE parcel domestic | 2 | env | ✅ | ❌ | – |
| MX → US intl | 7 | env+hvp | ❌ | 2 | electronic_trade_document |
| MX → BR intl | 5 | env+hvp+ins | ❌ | ❌ | electronic_trade_document |
| MX → CO intl | 5 | env+hvp+ins | ❌ | ❌ | electronic_trade_document |
| MX → ES intl | 6 | env+hvp | ✅ | ❌ | electronic_trade_document |
| US → MX intl | 7 | env+hvp | ❌ | 2 | electronic_trade_document |
| BR → MX intl | 5 | env+hvp+ins | ❌ | ❌ | electronic_trade_document |

**env** = envia_insurance · **hvp** = high_value_protection · **ins** = carrier-native insurance.

Headline: **outside MX, the agent has very little to offer**. For ES/CL/
PE/CO/AR/GT/IN domestic parcel, the catalog rarely exceeds 4 services.

## 11. Updated gap list — 4 new gaps from this iteration

In addition to gaps 1–9 captured in the original doc:

### Gap 10 (CRITICAL) — Multi-field services unsupported by MCP

**Evidence:** `src/builders/additional-service.ts` line 47 only emits
`{ service, data: { amount } }`. 7 services in the catalog need other
fields (file uploads, selects with enum values, dates).

**Impact:** The MCP cannot correctly request:
- FedEx ETD (electronic_trade_document)
- Hazmat / fragile / perishable / pharmaceuticals / medical / lives /
  cremated remains shipments (hazmat)
- LTL appointments (delivery / pickup / schedule date)
- LTL pickup_collection / delivery_collection variants

If a user asks "agrega ETD" or "envío frágil" or "agenda entrega para el
viernes 30", the MCP either drops the structured fields silently or the
carrier rejects the create_label call.

**Resolution options:**

A. Extend `buildAdditionalServices` to accept arbitrary `data` payload
   per service (typed loosely as `Record<string, unknown>`), and the
   tool schema accepts `data` in addition to `amount`. Backend does
   the validation.

B. Add per-service typed builders (one for ETD, one for hazmat, etc.).
   More verbose but stricter.

**Recommendation:** Option A. Single change, supports all current and
future multi-field services without per-service code.

**Effort:** S (~2-3h with tests).

### Gap 11 — tooltip_amount defaults not propagated

**Evidence:** Catalog returns `tooltip_amount: "2000.00"` for both
`envia_insurance` and `high_value_protection`. MCP does not read this
field.

**Impact:** When a user says "asegura mi envío" without an explicit
amount and the MCP receives no `package_declared_value`, the request
either fails or sends amount=0. The catalog's own default (2000) could
be used as a fallback, but isn't.

**Resolution:** Read `tooltip_amount` from the catalog response in
`fetchAvailableAdditionalServices`, attach it to the
`AdditionalServiceInfo` interface, and have the agent surface it as
"using default coverage of $2000" when amount is missing.

**Effort:** XS.

### Gap 12 — `high_value_protection` vs `envia_insurance` distinction invisible

**Evidence:** Both are Envia products with same tooltip_amount default.
The catalog descriptions are "Seguro Envía" and "High Value Protection".
The MCP enum exposes both but the tool description does not explain
when to use which.

**Impact:** When the agent picks insurance autonomously, it may choose
suboptimally — `envia_insurance` for a $50,000 declared value when
`high_value_protection` is the appropriate product, or vice versa.

**Resolution:** Either (a) document the difference in the
`requiredApiKeySchema` description for `insurance_type`, or (b) add a
helper that resolves the appropriate variant from declared value
thresholds (Envia product team must define the threshold).

**Effort:** XS for doc; S for resolver helper.

### Gap 13 — Surcharges leaking into the additional-services catalog

**Evidence:** US LTL domestic returns `fuel`, `state_charge`,
`california_capacity`, `security_charge`, `inside_pickup` in the
`general` category as if they were electable services. They are
carrier surcharges (apply automatically by carrier rules).

`security_charge` also appeared in MX → ES intl.

**Impact:** The agent or a user toggling these creates undefined
behavior. Catalog is misleading.

**Resolution:** Backend / queries team responsibility — flag these as
non-electable in the catalog, or move them to a different endpoint.

**Effort:** Backend backlog item.

## 12. Updated recommendations summary

| # | Action | Effort | Type |
|---|--------|--------|------|
| 1-6 | Same as v1 doc, still applicable | — | — |
| 7 | **Gap 10 fix (multi-field services)** — extend `buildAdditionalServices` to accept arbitrary data payload per service. Update tool schema. **CRITICAL gap, currently silent failures.** | S | MCP code |
| 8 | Gap 11 fix — propagate tooltip_amount as fallback | XS | MCP code |
| 9 | Gap 12 fix — document insurance product taxonomy in tool description; consider resolver helper | XS-S | Doc + optional code |
| 10 | Gap 13 report — escalate surcharges-leaking issue to backend team | XS | Backlog |
| 11 | Backend report — 4 data quality issues from §3 (duplicates, typos, naming) plus the 5+ surcharges from §8.4 | XS | Backlog |
| 12 | Tool description update — `list_additional_services` should mention catalog richness varies dramatically by country (MX 22 services, others 2-5) | XS | Doc |

**Net new tools needed: 0.** All gaps resolved by extensions of existing
tools or by editorial / backend coordination.

## 13. Closing observations from iteration 2

- The catalog is **dramatically richer than the V1 frontend memory
  documented** (43 vs 35 services), and the variance per country is
  much wider than I initially captured.
- The **`json_structure` field** on each service entry is the actual
  contract for what data must be sent. Until iteration 1 I was treating
  the catalog as a flat list. The iteration here exposes that 7 of 43
  services REQUIRE structured data the MCP does not support today.
- The **insurance taxonomy** is more nuanced than a simple enum —
  three distinct products with different defaults, owners, claim flows,
  and availability. The MCP exposes them but does not differentiate
  them for the agent or the user.
- **High Value Protection specifically** (Jose's call-out) is a
  separate Envia product from Envía Seguro, available in only 7/19
  combos, with the same default amount but presumably higher caps.
  Neither the agent nor the documentation surfaces the distinction.
- **Iteration discipline matters.** Iteration 1 looked complete on
  its surface and was committed. The user pushed back; iteration 2
  found 4 new gaps and 5+ surcharge leaks. **Apply the cross-check
  pass principle (LESSON L-T4) at each level: tool synthesis,
  catalog inventory, gap analysis.**

---

# Iteration 3 — Backend code verification + business rules (2026-04-25)

> Triggered by user clarification: high_value_protection rule was
> miscoded (memory said "MX origin only"; user confirms it's "MX as
> origin OR destination"); user asks for verification at code/DB/service
> level instead of catalog inference.
> Source-of-truth files inspected:
> - `services/queries/routes/service.routes.js:118` — endpoint route definition.
> - `services/queries/controllers/service.controller.js:399-498` — handler with full SQL.
> - `services/queries/routes/company.routes.js:724` + `controllers/company.controller.js:2173-2212` — separate prices endpoint.

## 14. Verified backend logic — the real SQL behind /additional-services

The endpoint `GET /additional-services/{country_code}/{international}/{shipment_type}` runs this query:

```sql
SELECT cat.*, cas.*, f.json_structure
FROM services AS s
JOIN locales AS l ON l.id = s.locale_id
JOIN additional_service_prices AS asp ON s.id = asp.service_id
JOIN catalog_additional_services AS cas ON cas.id = asp.additional_service_id
                                       AND cas.shipment_type_id = ?
JOIN catalog_additional_services_categories AS cat ON cat.id = cas.category_id
JOIN catalog_additional_service_forms AS f ON f.id = cas.form_id
WHERE s.international IN (?)        -- single value or [intl, 2]
  AND l.country_code IN (?)         -- single country or [origin, destination]
  AND s.shipment_type_id = ?
  AND s.active IS TRUE
  AND cas.active IS TRUE
  AND cas.visible IS TRUE
  AND asp.mandatory IS FALSE        -- only optional services
  AND asp.active IS TRUE
GROUP BY cas.id
ORDER BY cat.index;
```

And the bidirectional logic:

```js
if (request.params.international == 1 && request.query.destination_country) {
    queryParams[1].push(2);                                   // s.international IN (1, 2)
    queryParams[2].push(request.query.destination_country);   // country_code IN (origin, destination)
}
```

### 14.1 The `services.international` field has THREE values

- **0** = domestic only.
- **1** = international, origin-bound (service tied to origin country).
- **2** = international, bidirectional (service offered when origin OR destination matches the country_code).

This explains the entire bidirectional rule. `high_value_protection`'s SQL row in BD has `international=2` and locale `country_code=MX`. When you ship CO→MX, the controller adds `2` to the international filter and `MX` to the country list, so MX-bound services with `international=2` are returned. **Your rule is implemented in BD, not a catalog bug.**

### 14.2 `high_value_protection` rule — VERIFIED 100% by 30 sandbox combinations + SQL logic

| Direction | Combos tested | HV present where MX is in pair | HV present where MX is NOT in pair |
|-----------|--------------:|--------------------------------|------------------------------------|
| Origin MX | 5 (MX→US,BR,CO,ES) + MX domestic | 5/5 ✅ | — |
| Destination MX | 6 (CO,AR,ES,GT,BR,US → MX) | 6/6 ✅ | — |
| Neither origin nor destination MX | 6 (BR↔ES, BR↔US, US↔ES, CL→CO) | — | 0/6 ✅ (correctly absent) |

**Conclusion:** the user's corrected rule "MX as origin or destination" matches the catalog perfectly. Iteration 2's claim that BR→MX and US→MX were "false positives" was **wrong** — they are correct.

The only restriction the catalog does NOT encode is **carrier exclusivity** (UPS-only). That part of the rule lives somewhere else (probably in `services` table or in carrier-level checks at generate time, not in the additional-services endpoint).

## 15. The `tooltip_amount` field is NOT per-product — correction to iteration 2

Iteration 2 said: "tooltip_amount default $2,000 for both envia_insurance and high_value_protection". **This is wrong.** Real backend code:

```js
const planTypePricesQuery = `
    select activation_price from plan_type_prices WHERE plan_type_id = 2 and locale_id = ?;
`;
const default_insurance_amount = planTypePrices[0][0]?.activation_price;
// ...
let child = {
    ...
    tooltip_amount: default_insurance_amount,   // SAME value for every service
    ...
};
```

**Reality:**

- A single `default_insurance_amount` is fetched once from `plan_type_prices` for `plan_type_id = 2` and the **logged-in user's locale_id** (NOT the shipment's origin country).
- That same value is attached to EVERY service in the response — including services that have nothing to do with insurance (signatures, hazmat, hold_at_location all show the same `tooltip_amount`).
- It only makes business sense for `envia_insurance`. For everything else, it is noise.

### Implications

- The MCP should not infer per-service defaults from `tooltip_amount`. It only applies to Envia Seguro.
- The default depends on the agent user's profile country, not on the shipment route. Two users querying the same combo can get different `tooltip_amount` values.
- `plan_type_id = 2` must be the Envia Seguro plan in `plan_types` table — needs BD confirmation.

## 16. Filter `asp.mandatory IS FALSE` hides the obligatory services

The endpoint **deliberately excludes mandatory services** from the catalog. If a service is configured with `additional_service_prices.mandatory = TRUE` for a given `service_id`, it does not appear in the response.

### Hypothesis (needs BD verification): why envia_insurance is missing in BR/CO domestic

Catalog observation: `envia_insurance` is missing in BR domestic parcel, CO domestic parcel, and all LTL combinations. User confirmed the rule "el llamado `insurance` solo aplica en Brasil y Colombia por reglamentaciones del país".

A consistent interpretation:
- In BR/CO, insurance is regulatorily mandatory.
- The mandatory insurance is wired as `insurance` (carrier-native, FedEx Declared Value or Correios equivalent), NOT `envia_insurance`.
- That mandatory insurance is configured with `mandatory=TRUE` for shipments inside BR/CO, so the `envia_insurance` opt-in product is not offered (it would be redundant/conflicting with the mandatory one).
- The carrier-native `insurance` we see exposed in BR/CO catalog is a separate row with `mandatory=FALSE`, perhaps because the user can opt to declare a higher value than the regulatory minimum.

**This hypothesis must be validated against BD.** Concrete query for backend team:

```sql
-- Find all mandatory additional services in BR and CO domestic parcel
SELECT cas.name, cas.id AS cas_id, asp.amount, asp.mandatory, s.id AS service_id, s.name AS service_name, s.international, l.country_code
FROM additional_service_prices asp
JOIN catalog_additional_services cas ON cas.id = asp.additional_service_id
JOIN services s ON s.id = asp.service_id
JOIN locales l ON l.id = s.locale_id
WHERE l.country_code IN ('BR','CO')
  AND s.shipment_type_id = 1
  AND s.international = 0
  AND asp.mandatory = TRUE
  AND asp.active = TRUE
  AND s.active = TRUE;
```

If `envia_insurance` shows up there, the hypothesis is confirmed. If it does not, the absence is for a different reason (perhaps `envia_insurance` is simply not active in BR/CO domestic).

## 17. New endpoint discovered — `/additional-services/prices/{service_id}` (closes Gap 1 partially)

Found in `services/queries/routes/company.routes.js:724` and handled at `controllers/company.controller.js:2173-2212`. Returns the price row for each additional service tied to a specific carrier service, including company-custom pricing:

```sql
SELECT cas.id, cas.name, l.currency, l.currency_symbol, asp.apply_to,
       IF(ascp.id IS NOT NULL AND ascp.active = 1, ascp.amount, asp.amount) AS amount,
       IF(ascp.id IS NOT NULL AND ascp.active = 1, ascp.minimum_amount, asp.minimum_amount) AS minimum_amount,
       IF(ascp.id IS NOT NULL AND ascp.active = 1, ascp.operation_id, asp.operation_id) AS operation_id,
       IF(ascp.id IS NOT NULL AND ascp.active = 1, TRUE, FALSE) AS is_custom,
       cpo.description AS operator
FROM catalog_additional_services AS cas
JOIN additional_service_prices AS asp ON cas.id = asp.additional_service_id
JOIN catalog_price_operations AS cpo ON cpo.id = asp.operation_id
LEFT JOIN additional_service_custom_prices AS ascp
    ON ascp.additional_service_price_id = asp.id
    AND ascp.company_id = (?)
JOIN services AS s ON s.id = asp.service_id
JOIN locales AS l ON l.id = s.locale_id
WHERE cas.active AND cas.visible AND s.active AND asp.active AND s.id = (?);
```

### Key insights from this endpoint

- **Real prices exist.** `asp.amount` is the catalog price; `ascp.amount` overrides it per company. So negotiated rates are honored.
- **Operation types matter.** `catalog_price_operations.description` tells whether the price is a flat amount, a percentage, or another operation. Without parsing this, a raw `amount` value is misleading.
- **`apply_to`** — present in the query but its semantics are not in the controller. Likely `to_value` (e.g. percentage of declared value) vs `to_weight` etc.
- **Currency-aware.** `l.currency` and `l.currency_symbol` come from the carrier service's locale.
- **Per-service granularity.** You query by `service_id` (a carrier service like "FedEx Express MX"), and the response lists all its enabled add-ons with prices.

### Gap 1 status update

**Gap 1 ("cost calc dynamic for additional services") is now PARTIALLY CLOSED at the backend** — the endpoint exists. The MCP just doesn't expose it.

To fully close Gap 1, the MCP should either:

A. **Add a new tool `getAdditionalServicePrices(service_id)`** that wraps this endpoint. The agent can call it after `quote_shipment` to know "agregar Envia Seguro a DHL te cuesta $X, a FedEx te cuesta $Y".

B. **Augment `quote_shipment` to inline price the requested add-ons.** Requires backend extension because the rate endpoint does not accept `additional_services` as input today (verified in iteration 1).

Option A is independent and faster (no carriers backend change). Recommended.

## 18. Catalog table model — explains the `insurance` id=14 vs id=52 issue

From the schema implied by joins:

```
catalog_additional_services (cas)
   ├─ id (e.g. 14, 52, 169 for HV, etc.)
   ├─ name (the string code, NOT unique by itself)
   ├─ shipment_type_id  ← THE KEY DIFFERENTIATOR
   ├─ category_id, form_id, active, visible, ...

catalog_additional_services_categories (cat)
catalog_additional_service_forms (f) — holds json_structure
```

So `name` is not the primary key — `id` is. Two rows can share `name='insurance'` if their `shipment_type_id` differs (one for parcel=1, one for LTL=2). The catalog response correctly returns both with their distinct IDs; iteration 2's framing as "name collision bug" was technically inaccurate. **It's the MCP's responsibility to use `id` (or the (name, shipment_type) pair) to disambiguate** when sending to create_label. Today the MCP sends just the `name` string, which means the carrier API must disambiguate from context — fragile but not necessarily wrong if the carrier API also indexes by (name, shipment_type).

This warrants verification with the carriers (rate/generate) team to confirm they handle the disambiguation correctly.

## 19. Updated taxonomy — definitive (with user-confirmed rules)

| Product | Code | Origin | Destination | Carrier exclusive | Applies LTL | Available domestic | Available intl |
|---------|------|--------|-------------|-------------------|-------------|--------------------|----------------|
| **Envia Seguro** (default) | `envia_insurance` | Any country where it's active and not mandatory-blocked | Any | No (cross-carrier) | **No** (BD-confirmed by absence in 3/3 LTL combos) | MX, US, AR, ES, CL, PE, GT, IN parcel ✅. **NOT BR, CO domestic** (likely `mandatory=TRUE` interaction) | Most intl combos with MX involved |
| **Alto Valor** | `high_value_protection` | **MX only (services.international=2 + locale=MX)** | **OR** MX | **UPS only** (rule is OUTSIDE additional-services endpoint, lives in carriers/services tier) | No (BD-confirmed) | MX parcel domestic ✅ | All intl combos with MX origin or destination ✅ |
| **Insurance regulatory (BR/CO)** | `insurance` (id=52, parcel) | BR / CO domestic by regulation. Catalog also surfaces in some other contexts | – | Carrier-native | No | BR, CO domestic parcel. **Also exposed in US, GT, intl combos with MX/BR/CO involved — needs verification: are these legitimate or backend over-exposure?** | When carrier rules permit |
| **Insurance LTL declared value** | `insurance` (id=14, LTL) | Cross-country LTL | – | Carrier-native LTL | **Yes only** | MX LTL, BR LTL, US LTL | – |

User-confirmed rules (this iteration):
- Envia Seguro is the default product Envia offers across the platform.
- Alto Valor is exclusive UPS + MX origin OR destination.
- The `insurance` code applies in BR/CO by regulation; in other contexts the catalog may be exposing it without proper filter (needs BD check).

Rules NOT YET confirmed (still on the open-questions list):
- Coverage caps for Envia Seguro and Alto Valor (numerical limits).
- Pricing model for each (% of declared, fixed, tiered).
- Claim flow specifics.
- Whether Alto Valor + Envia Seguro can coexist on a shipment (the MCP enforces "one insurance only" client-side, but is that aligned with business rules?).

## 20. New gaps from iteration 3

### Gap 17 — Alto Valor's UPS exclusivity is NOT in the additional-services endpoint

Verified: the endpoint does not filter by carrier. `high_value_protection` appears in MX parcel domestic regardless of which carrier the user has configured. The UPS-only rule must live in:

- `services` table — perhaps `s.id` of UPS Express MX is the only one with this `additional_service` linked.
- Or the carrier integration code at generate time.

To fully validate: query

```sql
SELECT s.id, s.name, c.name AS carrier, l.country_code, asp.mandatory
FROM additional_service_prices asp
JOIN services s ON s.id = asp.service_id
JOIN carriers c ON c.id = s.carrier_id
JOIN catalog_additional_services cas ON cas.id = asp.additional_service_id
JOIN locales l ON l.id = s.locale_id
WHERE cas.name = 'high_value_protection'
  AND asp.active = TRUE;
```

If the only rows returned have `c.name LIKE 'UPS%'` and `l.country_code = 'MX'`, the rule is enforced at the `services` table tier. If other carriers appear, the rule is enforced higher up (carrier integration code) and the additional-services endpoint is providing misleading availability.

**MCP impact:** today the agent has no way to know that Alto Valor requires UPS until create_label fails. It should pre-validate.

### Gap 18 — Mandatory services hidden from the catalog

Verified by SQL: `asp.mandatory IS FALSE` is hardcoded in the controller. Mandatory additional services (e.g. potentially the regulatory insurance in BR/CO) are not visible to the agent. If a user asks "qué seguros aplican a mi envío", the agent can only enumerate optional ones. Mandatory ones are silently applied (or not, depending on the carrier).

Resolution: an additional internal endpoint or controller variant that returns mandatory + optional. Or a separate tool `getMandatoryServicesForRoute(country, shipment_type, intl)` that exposes the mandatory subset.

### Gap 19 — `apply_to` and `operation_id` semantics not documented

The prices endpoint returns these fields. Without knowing their semantics, prices cannot be correctly displayed or summed. Examples (hypothetical):
- `apply_to=to_value`, `operation=multiply`, `amount=0.05` → 5% of declared value.
- `apply_to=fixed`, `operation=add`, `amount=50` → flat $50.
- `apply_to=to_weight`, `operation=multiply`, `amount=1.20` → $1.20 per kilogram.

These need documentation from backend. Attempted reading of `catalog_price_operations`: not in this controller. Probably worth a quick BD query.

## 21. Open questions — converted into BD/code queries the backend team can answer

Replacing the prose list of "incógnitas" from iteration 2 with concrete queries:

| # | Question | Where the answer lives |
|---|----------|-----------------------|
| 1 | Coverage caps for Envia Seguro and Alto Valor | Likely in `plan_type_prices` (`activation_price` is the default, but cap may be elsewhere) or in `catalog_additional_services.json_structure.rules.max` — verify. |
| 2 | Pricing model per product | `additional_service_prices` (asp.amount + asp.operation_id + asp.apply_to). Run query in §20 Gap 19. |
| 3 | UPS exclusivity for Alto Valor | Run query in §20 Gap 17. |
| 4 | Why no `envia_insurance` in BR/CO domestic | Run query in §16 hypothesis. |
| 5 | Why no `envia_insurance` in LTL | Same query as #4 but with `s.shipment_type_id = 2`. |
| 6 | Mandatory vs optional differentiation | Run `SELECT * FROM additional_service_prices WHERE mandatory=TRUE AND active=TRUE` grouped by service_id. |
| 7 | FedEx-branded services exclusivity | Run §20 Gap 17 pattern with `cas.name IN ('priority_alert', 'ship_alert', 'fedex_etd', 'third_party_consigne', 'int_broker_select')`. |
| 8 | Rule for `electronic_trade_document` (auto-generated vs upload) | Read carriers integration code for `etd` handling. |
| 9 | Hazmat handling per carrier | Read carrier `Generate.php` files for `hazmat` / `dangerous_good`. |
| 10 | `reverse_pickup` for India — what carrier | Query `services` joined with `catalog_additional_services` where `cas.name='reverse_pickup'` and `l.country_code='IN'`. |
| 11 | `acknowledgment_receipt` BR — which carrier | Same pattern with `cas.name='acknowledgment_receipt'` and `l.country_code='BR'`. |
| 12 | Sandbox vs production catalog parity | Run the same controller in production. Compare bytes/categories per combo. |
| 13 | Country-specific signature support | Check carrier integration code per country to see signature_support flags. |
| 14 | Hold-at-location absence in US domestic | Query `additional_service_prices` for `cas.name='hold_at_location'` joined with `services` where `l.country_code='US'` and `s.international=0`. |
| 15 | LTL appointment `date` format / timezone | Read `json_structure` for `delivery_appointment` carefully + carrier integration code. |
| 16 | Whether Alto Valor + Envia Seguro can coexist | Business rule, ask Product. MCP enforces "one only" today; is that aligned? |

## 22. Closing — am I sure everything is captured?

**No. Honest answer.**

This iteration significantly tightened the analysis at the controller-SQL level for the additional-services endpoint, identified a real prices endpoint (Gap 1 partially closed), corrected two material errors from iteration 2 (HV bidirectional rule, tooltip_amount semantics), and converted the 15 open prose questions from iteration 2 into 16 concrete BD/code queries the backend team can resolve in a single sitting.

What is still NOT verified:
- BD content of the tables (`services`, `additional_service_prices`, `plan_type_prices`, `catalog_additional_services`, `catalog_price_operations`). Without DB read access, the controller logic tells me HOW the data is filtered but not WHAT data is in there.
- Production-vs-sandbox parity.
- Carrier integration code's enforcement of carrier-exclusive rules (UPS/FedEx).
- The exact relationship between Envia Seguro and Alto Valor (premium tier? alternative product? mutually exclusive?).

**Recommended next step:** schedule a 30-minute working session with one backend engineer who has DB and carriers/queries code access. Hand them §21 (the 16 questions) and §16/§20 (the SQL hypotheses to verify). Should resolve everything in one session.

After that, the analysis is **complete and trustworthy**. Until then, this doc is the most accurate available, with explicitly flagged uncertainties.

