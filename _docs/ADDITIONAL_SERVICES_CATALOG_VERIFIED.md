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

