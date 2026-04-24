# MASTER SUMMARY — Endpoint Audit for MCP Portal-Agent Expansion

**Date:** 2026-04-24
**Author:** Opus 4.7 (1M context) synthesis from 6 parallel Explore subagent audits
**Scope:** 6 backends (carriers, queries, geocodes, ecommerce+eshops+ecartApiOauth, admon-monorepo, accounts)
**Purpose:** Decision-ready matrix for the follow-up session where Jose picks what to expose as new MCP tools.

> This is a decision tool. Each section is optimized so Jose can pick Top Opportunities without opening the 6 per-project audits. Detailed rows and citations are in the per-project files.

---

## 0. Caveats & inventory gaps (read first)

Two audits sampled rather than fully itemized (defensible because the dominant classification is ⚫ ADMIN-ONLY):
- **queries**: 49 rows itemized from ~531 routes. V1-SAFE, Alto gaps, and destructive endpoints are fully enumerated; the 323 "V1-PARTIAL token-auth" endpoints are classified aggregately.
- **admin-monorepo**: 24 rows itemized from 648 routes. The 14 non-`auth` public endpoints and all overlaps with queries are enumerated individually; the 620 ⚫ rows are counted but not itemized. Defer-entirely recommendation makes full enumeration low-ROI.
- **accounts**: 137 endpoints counted from source; inventory table compressed into category-level rows.

One audit was materially incomplete and was closed by a supplementary doc:
- **eshops portion of the ecommerce trio**: original audit reported 39 eshops endpoints, but `services/eshops/routes/` actually contains **492** (v1: 202, v2: 253, v3: 22, modules: 15). A supplementary audit (`eshops-supplementary.md`) closes the v2/v3/modules gap with file-by-file route counts + classification skeleton + security findings. It confirms the v1 ⚫-dominant pattern holds (≈87% ⚫) and that **zero Alto gaps exist in eshops v2/v3** — every user-facing operation overlaps a queries endpoint already exposed. Full per-row itemization deferred unless eshops expansion is reopened.

Spot-checks performed (L-T4 — target ~18, achieved 17): 17 specific claims verified against source, including:
- ✅ carriers `POST /v2/ship/{action}` at `services/carriers/routes/web.php:61` (no inline middleware).
- ✅ carriers `/cron/{function}` unauth'd at `routes/web.php:65`.
- ✅ queries `/shipments` `auth: 'token_user'` at `routes/shipment.routes.js:11`.
- ✅ queries `/company-info` exists at `routes/company.routes.js:670` (original audit cited `:1200` — **wrong line, endpoint exists**).
- ✅ queries `POST /customers/{customer_id}/addresses` at `routes/customer_addresses.routes.js:8` (original audit cited `POST /user-address` — endpoint path is actually `/customers/{customer_id}/addresses`, minor citation drift; classification correct).
- ✅ geocodes `/location-requirements` at `routes/web.js:466` (audit cited `:465`, off-by-one).
- ✅ geocodes `/flush` public at `routes/web.js:135`.
- ✅ geocodes `/extended_zone` SQL injection surface at `controllers/web.js` around line 2085.
- ✅ ecommerce `/admin/webhook/{shop}/reset/cache` at `services/ecommerce/routes/webhookAdmin.js:67` (audit cited `:75`, slight drift).
- ✅ eshops `PUT /api/v3/orders/delivered` auth:false at `services/eshops/routes/v3/orders.routes.js:80`.
- ✅ eshops `auth: false` total: 15 in v2 + 1 in v3 = 16 (audit cited "4 critical" — 4 destructive-with-no-auth is the subset, rest are expected marketplace callbacks).
- ✅ admon `/cron/cod/invoices` at `monorepos/admon-monorepo/backend/routes/cashOnDelivery.routes.js:141`.
- ✅ admon `/catalog/carriers` at `backend/routes/catalogs.routes.js:33`.
- ✅ accounts `/api/login` referenced in client code (backend endpoint verified).
- ✅ accounts `/api/kyb/{id}/review` used by `kyb/components/review-form.vue:369`.
- ✅ accounts canonical path `repos_extra/accounts/server/` (vs `services/accounts/`).
- ⚠️ Also discovered during spot-checks: **`BACKEND_ROUTING_REFERENCE.md §2.1` incorrectly routes `envia_ai_parse_address` and `envia_ai_rate` to carriers/shipping base.** Actual code (`src/tools/ai-shipping/parse-address.ts:57`, `rate.ts:56`) routes to queries. Doc drift. MUST refresh.
- ⚠️ Material correction during verification: these two AI tools were initially listed in Top Opportunities as "new". They are **already registered** — removed from the list. See §2 and §4.

---

## 1. Executive headline

**Total endpoints audited across 6 backends:** ~1,525 (with gaps noted above).

Aggregated classification (from per-project counts):

| Classification | carriers | queries | geocodes | ecom-trio* | admon | accounts | **Total** | **%** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 🟢 V1-SAFE | 10 | 29 | 1 | 4 | 0 | 14 | **58** | 3.8% |
| 🟡 V1-PARTIAL | 10 | 323 | 0 | 1 | 0 | 11 | **345** | 22.6% |
| 🔵 V1-EXISTS-HIDDEN | 4 | 75 | 2 | 1 | 6 | 11 | **99** | 6.5% |
| 🟠 V2-ONLY-BACKEND-REAL | 2 | 13 | 40 | 0 | 14 | 23 | **92** | 6.0% |
| ⚫ ADMIN-ONLY | 7 | 104 | 2 | 70 | 620 | 74 | **877** | 57.5% |
| 🟣 INTERNAL-HELPER | 0 | 29 | 3 | 0 | 8 | 0 | **40** | 2.6% |
| unclear | — | — | — | — | — | 4 | **4** | 0.3% |
| **Total** | **33** | **531** | **48** | **76** | **648** | **137** | **1,473** | — |

*ecom-trio = ecommerce + eshops (v1 only itemized) + ecartApiOauth.
Missing from totals: eshops v2/v3/modules ≈ 290 routes; expected to add ~270 ⚫ + ~20 🟠/🟡.

**Aggregated by Value** (excluding ⚫ and 🟣):

| Value | Total | Notes |
|---|---:|---|
| Alto | ~11 | Very few true gaps. AI-shipping cluster in queries is the main net-new opportunity. |
| Medio | ~40 | Mostly carrier coverage (geocodes), order mutations (queries), carrier advanced docs. |
| Bajo | ~300 | Dominated by catalog/reference, internal helpers, deprecated APIs. |

**Coverage gap (already-exposed / V1-SAFE):** 43/58 ≈ 74% of V1-SAFE rows are already exposed via the current 72 MCP tools. The remaining ~15 V1-SAFE endpoints are mostly eshops v2 order/product reads that **overlap with queries endpoints already exposed** — i.e. the true net-new V1-SAFE gap is close to zero.

**One-sentence headline:** the existing 72 tools already cover the V1-SAFE surface well (including the AI-shipping cluster, which verification revealed is already exposed); the real growth opportunities are (a) response-enrichment on 6 already-exposed tools, (b) one new tool — `envia_ai_address_requirements` — and (c) `carriers:/ship/branches` for drop-off points. Everything else is admin, duplicate, deferred, or a backend security item.

---

## 2. Top opportunities (decision-ready list)

Sorted by **Value ÷ T-shirt effort** (Alto/XS first, Bajo/L last). 🔴 = critical security finding that belongs to the backend team, not to MCP exposure.

| # | Source | Endpoint | T-shirt | Value | User question | Why it matters |
|---|---|---|---|---|---|---|
| 1 | queries | `GET /ai/shipping/address-requirements/{country}` | S | **Alto** | "¿Qué datos necesito para enviar a USA?" | Answers directly from seed §8. Today the MCP only has internal helper `getAddressRequirements` (via geocodes). Surfacing as user-facing tool closes a visible gap. **Verified NEW** — not in tool registry. |
| — | queries | `POST /ai/shipping/parse-address` | — | — | — | **Already exposed** as `envia_ai_parse_address` (src/tools/ai-shipping/parse-address.ts:57 — routes to queries). `BACKEND_ROUTING_REFERENCE.md §2.1` incorrectly lists under carriers; doc needs refresh. Not a new opportunity. |
| — | queries | `POST /ai/shipping/rate` | — | — | — | **Already exposed** as `envia_ai_rate` (src/tools/ai-shipping/rate.ts:56 — routes to queries). Same routing-doc discrepancy. Not a new opportunity. |
| 4 | carriers | `POST /ship/branches` | M | Medio | "¿Cuál es el punto de entrega más cercano?" | 🔵 hidden; backend functional. Seed §8 question answered. |
| 5 | queries (expand) | `GET /v4/orders` — surface 11 missing fields | XS | **Alto** | (many ecom questions) | Not a new endpoint — expand the already-exposed `envia_list_orders` to return fulfillment_status_id, cod_active/value per package, HS codes, country_code_origin, fulfillment_info, fraud_risk, partial_available, order_comment, assigned_package, return_reason. Already documented gap. |
| 6 | carriers (expand) | `POST /ship/cancel` — surface refund + daily-limit | XS | Medio | "Cancélalo; ¿cuánto recupero?" | Already exposed; response currently lacks refund amount + daily-limit context (noted in V1_SAFE_TOOL_INVENTORY). |
| 7 | queries (fix) | `POST /user-address`, `PUT /user-address/{id}`, `POST /customers`, `PUT /customers/{id}` | M | Medio | "Guarda esta dirección" | Already exposed as 🟡 V1-PARTIAL; today saves invalid addresses because generic-form validation is skipped. Adding an internal `GET /generic-form/{country}` pre-check (already available) upgrades 4 tools from partial to safe. |
| 8 | queries | `POST /ai/conversations` | S | Medio | N/A (internal) | 🟡 V1-PARTIAL. Useful if AI rate/parse land — gives the agent session state. Likely 🟣 internal helper rather than LLM-visible tool. |
| 9 | carriers | `POST /taxes/calculate` | M | Bajo-Medio | "¿Cuántos impuestos voy a pagar?" | 🟡 partial; multi-country, KYC-dependent. Defer until demand signal; today `location-requirements` (geocodes) answers the higher-level "do I need an invoice?" question. |
| 10 | carriers | `POST /v2/ship/{action}` (batch rate) | M | Medio | "Cotízame 5 envíos en paralelo" | 🟠 V2-ONLY; backend functional. Batch mode unlocks "Scan&Go"-style UX. Blocker: V2 UX stability. |
| 11 | carriers | `POST /v2/plan-quote-ws` (overweight re-quote) | S | Bajo | "¿Y si pesa más?" | 🟡; today consumed internally by ecommerce batch. Unlikely to merit standalone exposure. |
| 12 | queries | `GET /plan/{id}` | S | Bajo | "¿Cuánto cuesta el plan premium?" | 🔵 hidden; plan-comparison question. `envia_get_company_info` already returns current plan; this enables cross-plan comparison. |
| 13 | queries | `POST /orders/{shop}/{order}/select-service` (expand) | S | Medio | "Cotízame y selecciona servicio para mi orden ecom" | Already exposed; destructive+financial-impact — add explicit confirm flow if unambiguous. |
| 14 | queries | `POST /orders/{shop}/{order}/fulfillment/order-shipments` (expand) | S | **Alto** | "Envía esta orden" | Already exposed as `envia_fulfill_order`; confirm that confirmation flow echoes carrier + cost before firing. Irreversible. |
| 15 | carriers | `GET /zonos/process/{shipmentId}` | M | Bajo | "Procesa aduanas de mi envío" | 🔵 hidden; B2B only. Defer. |
| 16 | geocodes | `POST /location-requirements` | S | **Alto** | "¿Necesito factura comercial para US→PR?" | **🟣 INTERNAL-HELPER — keep internal.** Listed here because the audit confirmed `tax-rules.ts` in the MCP replicates this incompletely. Route everything through geocodes. |
| 17 | geocodes | `GET /brazil/icms/{origin}/{destination}` | S | **Alto** | (indirect, via BR quotes) | **🟣 — keep internal.** Critical for BR rate accuracy. |
| 18 | geocodes | `GET /locate/CO/{state}/{city}` (DANE) | S | Medio | (indirect, via CO quotes) | **🟣 — keep internal.** Ground-truth for Colombia address resolution. |
| 19 | queries | 3x analytics response enrichment | XS | Medio | "¿Cuál es mi NPS / entrega exitosa?" | Already exposed tools (`envia_get_monthly_analytics`, `envia_get_carriers_stats`, `envia_get_issues_analytics`); check for missing V1 fields. Deferred deep dive. |
| 20 | queries | `GET /shipments-status` (catalog) | XS | Bajo | "¿Qué significa estado X?" | 🔵 hidden; low value but near-free to expose as a static catalog tool. Could also be embedded into list-shipments response. |
| 21 | carriers (expand) | `envia_track_pickup` | — | Medio | "¿Dónde está mi recolección?" | 🟡 sandbox-broken — works in prod. Document + keep. |
| 22 | queries (expand) | `envia_get_shipments_ndr` | — | Medio | "¿Qué envíos tuvieron problemas?" | 🟡 sandbox `type` param 422 — works client-side. Document. |
| 23 | ecom-trio (recommend against) | `GET /api/v2/orders` (eshops) | M | Medio | "Órdenes de mi cuenta central" | 🟢 V1-SAFE but **overlaps queries /v4/orders which is already exposed**. Retire or explicitly keep queries primary. |
| 24 | ecom-trio (recommend against) | `POST /api/v3/orders/{id}/fulfillments` | M | Medio | (same) | Same overlap with queries fulfillment. |
| 25 | ecom-trio (defer) | `GET /label/create/{shop}/{order}` (ecommerce service) | M | Alto (on paper) | "Genera etiqueta para orden 1234" | 🔵 hidden; **overlaps queries fulfillment + `envia_create_label`**. Do NOT add a second path. |
| 26 | admon (defer) | `GET /company/get-origins/{company_id}` | S | Medio | "¿Desde dónde envío?" | 🟠; **cross-tenant-risk** if exposed. Queries has a company-scoped version — prefer that one. |
| 27 | admon (security) | `GET /cron/cod/invoices`, `POST /mailing/webhook`, `GET /clean/admin-notifications`, `GET /notification/pobox-reminder` | — | — | 🔴 **no-auth-enforcement** — backend team fix, NOT an MCP opportunity. |
| 28 | carriers (security) | `GET /cron/{function}` | — | — | 🔴 **Critical: unauth'd dispatcher.** Analysis-carriers.md §8 flagged this already. Fix backend; never expose. |
| 29 | geocodes (security) | `POST /flush`, `GET /extended_zone/*`, `GET /redservice_coverage/*` | — | — | 🔴 `/flush` is public DoS; extended_zone + redservice have SQL-injection surfaces. Never expose; backend team fix. |
| 30 | ecom-trio (security) | `PUT /api/v3/orders/delivered` (eshops), `GET /admin/webhook/{shop}/reset/cache` (ecommerce), `POST /api/v2/webhooks/actions/retry` (eshops), `POST /api/v2/webhooks/trigger` (eshops) | — | — | 🔴 `auth: false` on destructive + PII-deleting endpoints. Immediate backend team action. |

**Summary of actionable MCP opportunities (rows 1–26, excluding security items):**

- **True net-new Alto tools:** **1** — `envia_ai_address_requirements`. (Note: parse-address and rate turned out already-exposed; caught during verification pass.)
- **Response enrichment of existing tools:** 6 (list_orders V4 fields, cancel refund, generic-form validation on 4 address/client tools).
- **Medio candidates worth a second look:** ~6 (branches, batch-rate v2, overweight re-quote, plan comparison, ecom sync confirm flows, track_pickup/NDR sandbox workarounds).
- **Recommend against (overlaps):** 3 (eshops orders/products duplicate queries; ecommerce label-create duplicates fulfill).

---

## 3. Overlaps map

Endpoints across projects that answer the same user question. Primary ≠ the one the MCP should prefer; secondary is the one to retire or avoid.

| Category | Primary (prefer) | Secondary (avoid/retire) | Why |
|---|---|---|---|
| Shipment tracking | `carriers:POST /ship/generaltrack` (public) + `queries:GET /shipments/{tracking}` (auth'd) | `carriers:POST /ship/track` (legacy/unclear) | Queries adds auth layer; keep both paths. Retire `/ship/track`. |
| Order list | `queries:GET /v4/orders` | `eshops:GET /api/v2/orders`, `eshops:GET /api/v3/orders` | Queries is canonical + already exposed. eshops versions expose multi-tenant marketplace façade; agent does not need two paths. |
| Order fulfillment | `queries:POST /orders/.../fulfillment/order-shipments` | `ecommerce:GET /label/create/...`, `eshops:POST /api/v3/orders/{id}/fulfillments` | Queries is the canonical fulfill endpoint + already exposed. |
| Address list | `queries:GET /all-addresses/{type}` (auth-scoped) | `admon:GET /company/get-origins/{company_id}` | Admon accepts arbitrary `company_id` → cross-tenant-risk if exposed. |
| Address delete | `queries:DELETE /user-address/{id}` | `admon:DELETE /addresses/{id}` | Admon has no permission checks. |
| Payment methods | `queries:GET /company-info` (summary) | `admon:GET /company/get-payment-methods/{company_id}` | Admon returns full bank/card PII + cross-tenant-risk. |
| Catalogs (carriers, countries, plans, services) | `queries` versions (already wrapped by tools) | `admon:GET /catalog/*` | Admon includes draft/deprecated entries not safe for users. |
| Postal-code lookup | `carriers:GET /zipcode/{country}/{code}` | `geocodes:GET /zipcode/{country}/{zip}` | Already aligned: MCP uses carriers path. Geocodes has slightly richer fields (timezone, suburbs) but not needed today. |
| User profile / "¿Quién soy?" | `queries:GET /user-information` (via tools) | `accounts:GET /api/accounts/me` | Accounts duplicates queries with higher PII surface. |
| User companies | `queries:GET /company/user/companies` | `accounts:GET /api/companies/list` | Same duplication. |
| KYC status | `queries:GET /user-information` (`verification_status` field) | `accounts:GET /api/verifications` | Status is already in JWT; accounts detail is admin/onboarding. |
| Auto-generated documents | side-effect of `carriers:POST /ship/generate` | `carriers:POST /ship/bill-of-lading`, `carriers:POST /ship/commercial-invoice`, `carriers:POST /ship/complement` | Today exposed as separate tools; reclassify as 🟣 INTERNAL-HELPER — they fire automatically during generate. |

---

## 4. Tools to retire or expand

### Retire (from the existing 72)

| Tool | Reason |
|---|---|
| `envia_track_authenticated` | Already marked DROP in V1_SAFE_TOOL_INVENTORY — duplicate of `envia_track_package`, sandbox broken. |
| `envia_create_webhook`, `envia_update_webhook`, `envia_delete_webhook` | Dev/admin tasks, 1-time setup, not conversational (L-S6). |
| `envia_list_checkout_rules`, `envia_create_checkout_rule`, `envia_update_checkout_rule`, `envia_delete_checkout_rule` | No UI in V1 or V2; B2B integrator-only. |
| `envia_locate_city` | Should be 🟣 INTERNAL-HELPER, not an LLM-visible tool. |
| `envia_create_commercial_invoice`, `envia_generate_bill_of_lading` | Auto-generated as side-effect of `envia_create_label` — reclassify 🟣 INTERNAL. |

### Expand (already exposed, response is thin)

| Tool | Expansion | Effort |
|---|---|---|
| `envia_list_orders` + `envia_get_ecommerce_order` | Surface the 11 V4 fields (fulfillment_status_id, cod_active/value per package, HS codes, country_code_origin, fulfillment_info, fraud_risk, partial_available, order_comment, assigned_package, return_reason). | XS |
| `envia_cancel_shipment` | Include refund amount + daily-limit context in response. | XS |
| `envia_create_address`, `envia_update_address`, `envia_create_client`, `envia_update_client` | Pre-validate against `GET /generic-form/{country}` to prevent invalid entries. | M |
| `envia_get_shipments_ndr` | Add note about sandbox `type` param 422; client-side filter retained. | — |
| `envia_track_pickup` | Document sandbox behavior ("company_id on null"); prod works. | — |
| `envia_list_tickets` | Document sandbox list-endpoint bug; prod works. | — |

### Add (net-new tools)

| Tool candidate | Source | Classification | Effort |
|---|---|---|---|
| `envia_ai_address_requirements` | `queries:GET /ai/shipping/address-requirements/{country}` | 🟠 | S |
| `envia_find_drop_off` | `carriers:POST /ship/branches` | 🔵 | M |

(Previously proposed `envia_ai_parse_address` and `envia_ai_rate` removed — verified as already-registered in `src/tools/ai-shipping/`. BACKEND_ROUTING_REFERENCE.md §2.1 is stale on these two.)

---

## 5. Accounts-specific recommendation

**Decision: (c) DEFER entirely.**

**Evidence** (from `accounts-audit.md` §7–§8):

- **0 Alto, 2 Medio, 135 Bajo** across 137 endpoints — zero true user demand signals.
- **54% ⚫ ADMIN-ONLY + 17% 🟠 onboarding.** Passwords, 2FA, KYC, device management, invitations — all belong in the portal UI per L-S6.
- **10% High-sensitivity endpoints** (14/137) handle credentials, gov IDs, or have **no auth** (KYB review endpoint, webhook callbacks). An agent guessing an opaque ID could leak passports.
- **Every user-facing "¿Quién soy?" question is already answered by queries** (user-information, company/user/companies, verification_status). Accounts adds no unique capability.
- **Compliance risk:** credential changes routed via chat lose the portal's audit trail and confirmation UX — regulators assume sensitive actions happen in authenticated portal flows.

**Conditions for future reopening** (per accounts-audit §Conditions):
1. Accounts adds endpoints NOT covered by queries.
2. KYC workflow hardening lands (public endpoints get auth, IDs become UUIDs, webhook signatures verified).
3. Explicit regulatory approval for credential flows via agent.

Until then: **no accounts tools in v1.**

---

## 6. Pending questions for backend team (deduplicated, by owner)

### Carriers team (7)
1. `POST /ship/track` — is this legacy? `envia_track_package` uses `/ship/generaltrack`; `/ship/track` seems duplicate.
2. `POST /v2/ship/{action}` — which actions bypass auth (`Util::actionsWithoutGuard`)? Intentional or gap?
3. 🔴 `GET /cron/{function}` — no auth, RCE surface. Remediation timeline?
4. `POST /ship/branches` — user-facing operation, or purely internal during rate/generate?
5. `POST /taxes/calculate` — minimum KYC status for accurate calc? Backend-validated or client pre-check?
6. `POST /v2/checkout/{ecommerce}/{shopId}` — prod-active or WooCommerce-only experimental?
7. `GET /zonos/process{-all,/{id}}` — customer-facing in any portal, or B2B-only?

### Queries team (8)
1. `GET /v4/orders` — are the 11 missing V4 fields in the endpoint response but not surfaced by the tool, or absent from the response?
2. Generic-form validation — should create/update address+client call `GET /generic-form/{country}` internally, or delegate to MCP?
3. `GET /company/tickets` — sandbox broken (reference_tickets_api.md); known limitation, or fixable?
4. `GET /get-shipments-ndr` — can sandbox accept the `type` param (currently 422)?
5. `POST /orders/.../fulfillment/order-shipments` — side-effects (webhooks, emails, TMS)?
6. `POST /ai/shipping/parse-address` — live in production, or sandbox-only? Non-Spanish support?
7. Which of the 104 ⚫ endpoints are truly admin-role-gated vs. power-user-but-conversational?
8. Ecommerce integration endpoints (Shopify OAuth, WooCommerce sync) — user-activatable or back-office only?

### Geocodes team (6)
1. 🔴 SQL injection in `GET /extended_zone` + `GET /redservice_coverage` — parametrize queries (controllers/web.js:2085, 2123).
2. `POST /location-requirements` — deprecate `tax-rules.ts` replication in MCP? Route all decisions through this endpoint?
3. `GET /locate/CO/{state}/{city}` — return multiple matches ranked by population for disambiguation?
4. `GET /zipcode/{country}/{zip}` — VIACEP fallback auto-inserts to DB without validation. Mark as provisional?
5. India coverage endpoints (#17–25) — in scope for v2, or being sunsetted?
6. 🔴 `POST /flush` — public cache-invalidation endpoint. Add auth.

### Admon-monorepo team (7)
1. `PUT /company/guide/{tracking_number}` — handler is `getGuideByTrackingNumber` but method is PUT. Mutation? What fields?
2. All `company_id`-taking admin endpoints — does backend verify JWT company matches param, or is isolation missing?
3. 🔴 `auth: false` on `/cron/cod/invoices`, `/mailing/webhook`, `/clean/admin-notifications`, `/notification/pobox-reminder` — add cron token / HMAC.
4. `POST /refunds` — accepts `company_id`? Tenant verification? Approval flow?
5. `GET /users/{userId}` with `'me'` — does `/users/me` return authenticated user only?
6. Catalog diff admon vs. queries — does admon include draft/deprecated?
7. External webhooks (`/webhooks/ftl-verification`, `/webhooks/syntage`, `/mailing/webhook`) — HMAC signature validation present?

### Ecommerce trio team (plus shared ownership with queries) (5)
1. 🔴 `PUT /api/v3/orders/delivered` (eshops) — public endpoint that deletes customer PII. Add auth immediately.
2. 🔴 `POST /api/v2/webhooks/actions/retry` + `POST /api/v2/webhooks/trigger` (eshops) — public webhook DoS/replay surface. Add auth.
3. 🔴 `GET /admin/webhook/{shop}/reset/cache` (ecommerce) — public cache invalidator. Add auth.
4. Retire eshops v1 (202 routes) — timeline?
5. v2 + v3 — consolidate into single versioned API detecting tenancy? v3 tenancy (central DB) implications for MCP.

### Accounts team (7)
1. `services/accounts/` vs `repos_extra/accounts/` — same deployment or different?
2. 🔴 Webhooks without auth (`/webhooks/accounts/create-number`, Sumsub, DocuSign, Facebook) — HMAC verification? Secret storage?
3. 🔴 KYC/KYB endpoints (`GET /api/kyc/status/:id`, `PUT /api/kyb/:id/review`) — IDs opaque (UUID)? Rate-limited? TTL?
4. `GET /email-verification` + token — JWT short-lived, or replayable hash?
5. `_atid` JWT not httpOnly (per `_meta/accounts.md`) — XSS risk. Fix plan?
6. Node 14.19.x (EOL Apr 2023) — upgrade roadmap?
7. Sandbox available or production-only testing?

**Total questions: 40 across 6 teams.** 7 are 🔴 security/data-integrity issues that block MCP exposure decisions even if the underlying endpoint might be valuable.

---

## 7. Proposed execution priority

**Wave 1 — Response enrichment (XS, already-exposed tools)**
Effort: 1 day total. No new tool registration.
1. `envia_list_orders` / `envia_get_ecommerce_order` — surface 11 V4 fields.
2. `envia_cancel_shipment` — surface refund amount + daily-limit.
3. `envia_get_shipments_ndr`, `envia_track_pickup`, `envia_list_tickets` — add sandbox-limitation notes.
4. Document in LESSONS.md: "tool enrichment ≠ tool addition" pattern.

**Wave 2 — Safety fixes on existing tools (M)**
Effort: 1–2 days.
1. Generic-form pre-validation for `envia_create_address`, `envia_update_address`, `envia_create_client`, `envia_update_client` — upgrades 4 tools from 🟡 → 🟢.
2. Retire `envia_track_authenticated` + relabel `envia_create_commercial_invoice` and `envia_generate_bill_of_lading` as 🟣 INTERNAL-HELPER.
3. Deregister webhook CRUD + checkout rules CRUD from LLM-visible tools (7 tools removed from surface).

**Wave 3 — AI shipping + address requirements (S, 1 new tool)**
Effort: 1–2 days. Net-new capability.
1. `envia_ai_address_requirements` — surface `queries:GET /ai/shipping/address-requirements/{country}` as user-facing tool (today only internal via geocodes). Answers "¿Qué datos necesito para enviar a USA?"
2. Side-task: refresh `BACKEND_ROUTING_REFERENCE.md §2.1` — `envia_ai_parse_address` and `envia_ai_rate` hit queries, not carriers. Doc drift caught during this audit's verification pass.

**Wave 4 — Hidden/seed-question tools**
Effort: 2–3 days.
1. `envia_find_drop_off` from `carriers:POST /ship/branches` (Wave 4 preferred over Wave 3 if AI endpoints are still sandbox-only).
2. Optional: surface `/shipments-status` catalog as static tool.
3. Optional: `envia_compare_plans` from `queries:GET /plan/{id}`.

**Wave 5 — Security + cleanup**
Effort: coordination-heavy (not MCP code). No tool changes.
1. Coordinate with backend teams on the 7 🔴 items.
2. Document deprecations for eshops v1 (cross-team).
3. Decide admon-monorepo policy (current recommendation: defer entirely).
4. Eshops v2/v3 deep inventory follow-up session if any eshops tool is promoted.

---

## 8. What NOT to do (decisions this audit surfaces to avoid)

- **Do NOT add any accounts tools in v1.** §5 recommendation.
- **Do NOT add admon-monorepo tools.** 620 ⚫ + cross-tenant risk on `company_id`-taking endpoints + overlap with queries. Defer entire backend.
- **Do NOT add eshops order/product tools.** Overlaps queries `/v4/orders` which is already exposed. A second path confuses the agent.
- **Do NOT add ecommerce `/label/create`.** Overlaps `envia_create_label` + queries fulfillment.
- **Do NOT expose geocodes tax/coverage endpoints as LLM tools.** Keep as 🟣 INTERNAL-HELPER; most are 🟠 V2-ONLY and answer no direct customer question.
- **Do NOT wrap ecart-payment.** Out of scope per L-S7. Transitive calls through carriers/queries are fine and already accepted.
- **Do NOT deploy any tool until backend team closes the 7 🔴 security items** on the endpoints involved — for now, none of the proposed new tools depend on those endpoints, but verify.

---

## 9. Inventory coverage assessment

| Backend | Itemized | Total real | Coverage | Decision-critical rows covered? |
|---|---:|---:|---:|---|
| carriers | 33 | 32 | 100% | ✅ |
| queries | 49 | 531 | ~9% | ✅ — V1-SAFE + Alto gaps + destructive + admin samples all enumerated. 323 V1-PARTIAL aggregate. |
| geocodes | 48 | 49 | ~98% | ✅ |
| ecommerce + eshops v1 + ecartApiOauth | 76 | ~272 | ~28% | ✅ (see supplementary) |
| eshops v2 + v3 + modules (supplementary) | file-counts + classification skeleton + 16 auth:false enumerated | 290 | per-row: ~5% itemized, aggregate: 100% | ✅ for decision (defer-entirely on new tools; 4 critical 🔴 enumerated individually). |
| admon-monorepo | 24 | 648 | ~4% | ✅ for decision (defer-entirely; 14 public endpoints + overlaps with queries + 8 cross-tenant candidates all enumerated). |
| accounts | 137 counted | ~154 | ~89% | ✅ |

**Overall confidence for decision session:** High for the 6 project-level conclusions (add 1 new tool + expand 6 + retire 7; defer accounts + admon + eshops). The eshops v2/v3 supplementary closes what was previously a medium-confidence area. Per-row itemization of queries V1-PARTIAL (323 rows) and admon ⚫ (620 rows) remains aggregate-only — defensible because both recommendations are "aggregate action" (queries = expand existing tools, admon = defer entire backend) rather than per-row inclusion decisions.

---

## 10. Handoff notes

- **Output directory:** `_docs/ENDPOINT_AUDIT_2026_04_24/` — 8 files (this + 6 per-project + 1 supplementary for eshops v2/v3/modules).
- **No code changes.** `git diff src/` = empty.
- **Commit pending.** See message proposal in the conversation.
- **Next session:** decision session (Opus, separate) — read this MASTER_SUMMARY + §2 opportunity list + §4 retire/expand + §5 accounts recommendation. Produce per-wave inclusion decisions. Include `Step 0 — Read LESSONS.md` in that session's prompt.
- **Outstanding doc drift to fix (NOT a new tool, just a doc update):** `BACKEND_ROUTING_REFERENCE.md §2.1` lists `envia_ai_parse_address` and `envia_ai_rate` as targeting `shippingBase` (carriers). Actual implementation targets `queriesBase`. Small PR to refresh the doc.
- **Remaining risk:** eshops per-row itemization is aggregate (file counts + classification skeleton + security rows). If Jose wants to re-litigate specific eshops v2/v3 endpoints, a further targeted subagent is cheap.
- **LESSONS.md:** no new user corrections during this session. Nothing appended.
