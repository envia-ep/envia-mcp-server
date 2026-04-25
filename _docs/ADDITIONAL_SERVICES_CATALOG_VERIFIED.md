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
