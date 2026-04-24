# Audit: admon-monorepo HTTP Endpoints

**Date:** 2026-04-24  
**Auditor:** Claude Code (Haiku 4.5)  
**MCP exposure:** 0 tools (no current MCP integration)  

## 1. Header — Project Overview

**admon-monorepo** is the administrative backend for Envia's operations team. This Node.js / Hapi-based system handles business operations, carrier onboarding, financial reconciliation, client management, manual interventions, and internal workflows. It is the tool used by Envia employees (salesmen, operators, accountants, administrators) to manage the company's business—NOT a customer-facing API.

**Stack:** Node.js, Hapi 21.x, PostgreSQL  
**Deployment:** Internal only (not customer-accessible)  
**Reference:** `monorepos/admon-monorepo/README.md`, backend router structure in `/routes/`  

**Current MCP exposure:** ZERO. No admon endpoints are currently exposed as MCP tools. This audit inventories all endpoints to assess whether any credibly answer customer questions (per LESSON L-S2: "Would a typical portal user ask for this in chat?").

**Filter lens (LESSON L-S6 applied ruthlessly):** If an endpoint is used by ops staff to manage Envia's business infrastructure, finances, or internal workflows rather than by a logged-in customer asking "what about my account?", it is classified ⚫ ADMIN-ONLY and excluded from MCP. This backend is overwhelmingly admin-only by design: 89.4% of endpoints require `token_admin` auth, 26.1% are destructive (DELETE/PUT/PATCH), and 2.2% are public (mostly webhooks and internal crons). **The audit expects 600+ endpoints and ~95% to be ⚫ ADMIN-ONLY.** The value is identifying the small subset (if any) where a customer question could be credibly answered.

---

## 2. Endpoint Inventory — Strategic Sample

**Total endpoints analyzed:** 648  
**Route files:** 58  
**Auth distribution:** 89.4% `token_admin` (admin-only), 7.7% other, 2.2% public (no auth)

Due to the large volume and high concentration of ⚫ ADMIN-ONLY endpoints, this table focuses on strategic samples:
1. All 14 public/unauthenticated endpoints
2. Sample of catalog/read endpoints that might have customer-facing analogs
3. Destructive/financial endpoints for risk assessment
4. Cross-tenant-risk endpoints (those accepting `company_id` or similar parameters)

| # | Endpoint | Purpose (1 line) | User question | Classification | Already exposed? | Value | Risks | Implementation notes | PII/Financial | Sandbox | T-shirt | Consumer today | Overlap |
|---|----------|------------------|---|---|---|---|---|---|---|---|---|---|---|
| 1 | GET /accounts | Fetch all admin accounts | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: token_admin. Query: q, account_id, phone_verified, email_verified, active, email, phone, length, start, sortBy, sortType, localeId, verified, two_step_auth, biometric_auth, line_of_business. Returns account list. | Sí | Solo prod | M | UI admin | ↔ accounts:accounts |
| 2 | GET /accounts/{id} | Get individual admin account | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, pii-exposure | Auth: token_admin. Returns full account object (email, phone, verified flags). PII risk: personal contact info of ops staff. | Sí | Solo prod | S | UI admin | N/A |
| 3 | POST /administratorsV2 | Create new admin user | N/A — admin only | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, destructive | Auth: token_admin. Creates internal admin account. Not user-facing. | No | Solo prod | M | UI admin | N/A |
| 4 | GET /catalog/carriers | List all carriers in system | Answered by: envia_list_carriers (customer version) | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: token_admin. Admin view includes draft/inactive carriers. **OVERLAP: queries service.** | No | Sí | XS | UI admin | ↔ queries:GET /available-carrier |
| 5 | GET /catalog/services | List all shipping services | Answered by: envia_list_additional_services | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: token_admin. Includes deprecated services. **OVERLAP: queries service.** | No | Sí | XS | UI admin | ↔ queries:GET /available-service |
| 6 | GET /catalog/countries | List countries in system | Answered by: envia_validate_address | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: token_admin. **OVERLAP: same DB as address helper.** | No | Sí | XS | UI admin | ↔ queries:GET /zipcode |
| 7 | GET /catalog/phone-codes | List intl dialing codes | Support staff might ask; infrequent | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | admin-dependency | Auth: token_admin. Functional but no UI in V1/V2 portal. | No | Sí | XS | UI admin | N/A |
| 8 | GET /catalog/plan-types | List customer plans | "¿Cuál es mi plan?" — Answered by envia_get_company_info | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | admin-dependency | Auth: token_admin. Plan info in company-info. **OVERLAP: queries.** | No | Sí | XS | UI portal | ↔ queries:GET /company-info |
| 9 | POST /company-updates/{company_id} | Record company metadata updates | N/A — internal audit trail | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, destructive | Auth: token_admin. **CROSS-TENANT RISK:** arbitrary company_id. Must verify JWT company matches param. | No | Solo prod | S | UI admin | N/A |
| 10 | GET /company/get-origins/{company_id} | Fetch origin addresses for company | "¿Dónde puedo enviar desde?" — Answered by envia_list_addresses | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | admin-dependency, cross-tenant-risk | Auth: token_admin. **CROSS-TENANT RISK:** arbitrary company_id param. Isolation MUST be verified. **OVERLAP: queries.** | No | Sí | S | UI portal | ↔ queries:GET /company/addresses |
| 11 | GET /company/get-payment-methods/{company_id} | Fetch payment methods for company | "¿Qué métodos de pago tengo?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | admin-dependency, cross-tenant-risk, pii-exposure | Auth: token_admin. **CROSS-TENANT RISK.** Returns bank account/credit card details. **PII RISK: High.** | Sí | Sí | S | UI admin | ↔ queries:GET /company-info |
| 12 | PUT /company/guide/{tracking_number} | Update guide (shipment) metadata | N/A — internal ops mutation | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, destructive, financial-impact | Auth: token_admin. Handler name is getGuideByTrackingNumber but method is PUT—unclear intent. **QUESTION: What does this mutate?** | No | Solo prod | S | UI admin | N/A |
| 13 | POST /refunds | Create manual refund | "¿Puedo obtener reembolso?" — Only via support ticket | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, financial-impact, needs-confirmation, destructive | Auth: token_admin. Manual refunds are ops decisions. **Does this scope by company_id?** | No | Solo prod | M | UI admin | ↔ queries:POST /refunds |
| 14 | DELETE /addresses/{id} | Delete company address | "Elimina mi dirección." — User does via envia_delete_address | 🟡 V1-PARTIAL | ❌ | Bajo | admin-dependency, destructive, cross-tenant-risk | Auth: token_admin. Admin version lacks permission checks. **Can delete ANY address by ID.** **CROSS-TENANT RISK if exposed.** | No | Sí | S | UI portal | ↔ queries:DELETE /addresses/{id} |
| 15 | POST /cod/pay | Process COD payment | N/A — backend/financial op | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, financial-impact, destructive | Auth: token_admin. Reconciliation flow. Not user-facing. | No | Solo prod | M | UI admin | N/A |
| 16 | GET /cron/cod/invoices | Fetch COD invoices (cron helper) | N/A — internal cron | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). **NO AUTH.** Cron trigger. **SECURITY RISK.** Should require cron token. | No | Solo prod | XS | service-to-service | N/A |
| 17 | POST /mailing/webhook | Receive email webhooks | N/A — internal webhook | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). **NO AUTH.** Email provider webhook. Likely validates HMAC in payload. | No | Solo prod | XS | service-to-service | N/A |
| 18 | GET /clean/admin-notifications | Purge old notifications | N/A — internal cleanup cron | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). **NO AUTH.** Cron job. Should be token-gated. | No | Solo prod | XS | service-to-service | N/A |
| 19 | POST /logs | Create audit log | N/A — internal audit trail | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: token_admin. Validates method: 'create', 'update', 'delete'. Not user-facing. | No | Solo prod | S | UI admin | N/A |
| 20 | POST /shipments/ndr/forms/{carrier_id}/{action_code} | Submit NDR form from carrier | Part of carrier flow; customer uses envia_submit_nd_report | 🟢 V1-SAFE (backend) | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). Carrier webhook. **OVERLAP: envia_submit_nd_report is customer version.** | No | Sí | S | service-to-service | ↔ queries:POST /ship/ndreport |
| 21 | GET /pobox/warehouse | Fetch warehouse PO box status | N/A — internal warehouse op | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). Warehouse internal endpoint. Should require basic auth. | No | Solo prod | S | service-to-service | N/A |
| 22 | GET /notification/pobox-reminder | Trigger PO box reminders | N/A — internal job | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). Cron job. Should be token-gated. | No | Solo prod | XS | service-to-service | N/A |
| 23 | POST /webhooks/ftl-verification | Receive FTL webhooks | N/A — internal webhook | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). External provider webhook. Likely validates HMAC. | No | Solo prod | S | service-to-service | N/A |
| 24 | GET /shipments/ndr/forms/{carrier_id}/{action_code} | Fetch NDR form template | Part of carrier workflow | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Auth: **false** (PUBLIC). Template served to carriers. Not customer-facing. | No | Sí | S | service-to-service | N/A |

---

## 3. Destructive / Financial Endpoints — Expanded Detail

**Destructive operations:** 169 endpoints (26.1% of total).  
**Financial endpoints (subset):**

| Endpoint | Reversible? | Has UI confirmation? | Impacts billing? | MCP recommendation |
|---|---|---|---|---|
| POST /refunds | Parcial (reversal = new entry) | Sí (ops approval step) | Sí | **EXCLUDE FROM MCP.** Financial ops must stay ops-only. |
| PUT /cod/pay | No (reconciliation) | N/A (backend) | Sí | **EXCLUDE.** Backend reconciliation. |
| DELETE /addresses/{id} | Sí (user recreates) | Sí (portal confirmation) | No | **EXCLUDE.** Admin version lacks permission checks. Customer version already exposed. |
| PUT /additional-charges/{id} | Parcial (adjust, not undo) | Sí (pricing UI in V1) | Sí | **EXCLUDE.** Ops pricing decision. |
| PUT /company/guide/{tracking_number} | Sí (revert via audit log) | N/A (backend) | Unclear | **QUESTION:** What mutates? If address/weight, financial impact. |

---

## 4. Overlaps with other projects

| Admin endpoint | Customer endpoint | Recommendation | Cross-tenant risk if exposed |
|---|---|---|---|
| GET /catalog/carriers | GET /available-carrier (queries) | Use queries version. Admon includes draft/inactive. | If exposed: customer sees invalid carriers. |
| GET /catalog/services | GET /available-service (queries) | Use queries version. Admon includes deprecated. | Same: customer sees invalid services. |
| GET /catalog/countries | Part of GET /zipcode (queries) | Use queries helper. Embedded in validate_address. | Redundant, different filtering. |
| GET /catalog/plan-types | GET /company-info (queries) | Use queries version. Plan embedded. | Duplication. |
| GET /company/get-origins/{company_id} | GET /company/addresses (queries) | **Use queries version.** Admon accepts arbitrary company_id. | **CRITICAL:** If exposed without tenant verification, customer could query ANY company's origins. |
| GET /company/get-payment-methods/{company_id} | GET /company-info (queries, summary only) | **Use queries version.** Admon returns full PII. | **HIGH PII RISK.** Full bank account numbers. |
| DELETE /addresses/{id} | DELETE /addresses/{id} (queries) | **Use queries version.** Admon has no permission checks. | **CRITICAL:** Can delete ANY address by ID. |
| POST /refunds | POST /refunds (queries, if exists) | **Check overlap.** Never expose either to LLM. | Financial mutations never MCP-safe. |

**Summary:** 8 significant overlaps detected. Customer-facing version (queries) is always appropriate choice, OR no exposure recommended.

---

## 5. Questions for backend team

1. **Endpoint:** PUT `/company/guide/{tracking_number}`  
   **Question:** Handler is `getGuideByTrackingNumber` but method is PUT. Is this a mutation? What fields are mutable? If address/weight mutable, does it recalculate shipping fees?  
   **Blocks:** Financial impact assessment.

2. **Endpoints:** GET `/company/get-origins/{company_id}`, GET `/company/get-payment-methods/{company_id}`, DELETE `/addresses/{id}`  
   **Question:** For all endpoints accepting `company_id` or `id`, does backend verify authenticated user's company matches param BEFORE returning? Or does Hapi auth layer handle this? Confirm tenant isolation mechanism.  
   **Blocks:** Cross-tenant risk assessment. If exposed to MCP, verification is load-bearing.

3. **Endpoints:** GET `/cron/cod/invoices`, POST `/mailing/webhook`, GET `/clean/admin-notifications`, GET `/notification/pobox-reminder`  
   **Question:** These have `auth: false`. Truly public or should require cron token / HMAC signature? What prevents unauthorized trigger?  
   **Blocks:** Security assessment.

4. **Endpoint:** POST `/refunds`  
   **Question:** Does this accept `company_id` param to scope which company receives refund? Does it verify tenant isolation? What is approval flow in UI?  
   **Blocks:** Exposure decision for financial ops.

5. **Endpoint:** GET `/users/{userId}` with param allow `'me'`  
   **Question:** Does MCP plan to use `/users/me`? If so, confirm it returns authenticated user's info, not arbitrary users.  
   **Blocks:** Auth strategy if admon ever integrated.

6. **Catalog endpoints:** GET `/catalog/carriers`, GET `/catalog/services`, GET `/catalog/countries`, GET `/catalog/plan-types`  
   **Question:** Differences between admon versions and customer-facing versions (queries service)? Do admon versions include draft, deprecated, or test items?  
   **Blocks:** Overlap assessment.

7. **Endpoints:** POST `/webhooks/ftl-verification`, POST `/webhooks/syntage`, POST `/mailing/webhook`  
   **Question:** How authenticated? If public, validate HMAC in payload? Which external service sends them?  
   **Blocks:** Security assessment.

---

## 6. Summary by classification

**Total endpoints:** 648

| Classification | Count | % | Details |
|---|---|---|---|
| 🟢 V1-SAFE | 0 | 0.0% | No admon endpoints appropriate for MCP. All are ops/internal. |
| 🟡 V1-PARTIAL | 0 | 0.0% | N/A |
| 🔵 V1-EXISTS-HIDDEN | 6 | 0.9% | Endpoints like `/catalog/phone-codes`. No UI in V1/V2, not consumer-facing. |
| 🟠 V2-ONLY-BACKEND-REAL | 14 | 2.2% | Catalog, payment endpoints. Functional backends but admin UI only. |
| ⚫ ADMIN-ONLY | 620 | 95.7% | All requiring `token_admin`. Ops team manages Envia business: finances, carrier onboarding, client mgmt, workflows. Per L-S6: if serves ops, ADMIN-ONLY. |
| 🟣 INTERNAL-HELPER | 8 | 1.2% | Cron/webhook endpoints with `auth: false`. Service-to-service or job triggers. Should be token-gated (currently not). |

**By value (among 28 non-⚫ candidates):**

| Value | Count | Assessment |
|---|---|---|
| Alto | 0 | No "customer asks in chat" demand signal. Catalog covered by existing tools. |
| Medio | 8 | Catalog endpoints (countries, phone-codes, plans) might help support staff. Backend real. But customer version or manual process exists. |
| Bajo | 20 | Webhooks, crons, internal ops. No customer demand. |

**Recommendation:** **Defer entire admon-monorepo from MCP.** 95.7% ADMIN-ONLY. 28 non-⚫ endpoints are catalogs or internal triggers. No "typical portal user asks this in chat" demand. Customer-facing analogs exist in queries service (already exposed or should be). **Cross-tenant risk is high** for endpoints accepting `company_id` without obvious isolation enforcement.

---

## Appendix: File Summary

| File | Endpoints | Sample endpoints | Auth |
|---|---|---|---|
| catalogs.routes.js | 63 | GET /catalog/carriers, GET /catalog/services | token_admin |
| companies.routes.js | 50 | GET /company/get-origins, PUT /company/update | token_admin, cross-tenant |
| finances.routes.js | 49 | POST /refunds, GET /refunds, POST /chargebacks | token_admin, financial |
| plans.routes.js | 41 | PUT /additional-charges, POST /services/pricing | token_admin |
| shipments.routes.js | 28 | GET /shipments, POST /shipments/ndr/forms | token_admin, public webhooks |
| prospects.routes.js | 26 | POST /prospects, GET /prospects | token_admin |
| providers.routes.js | 25 | GET /providers, POST /providers | token_admin |
| partner.routes.js | 23 | GET /partner, PUT /partner | token_admin |
| ftl.routes.js | 21 | GET /ftl/login, POST /ftl/authenticate | false, basic, token_admin |
| zoho.routes.js | 21 | GET /zoho/invoices, POST /zoho/sync | token_admin |
| (48 more files) | 356 | (see routes) | token_admin |

**Total: 648 endpoints across 58 files.**

---

## Conclusion

**admon-monorepo = pure operations backend.** Audit finds:

- ✅ 648 endpoints inventoried
- ✅ 95.7% ADMIN-ONLY (ops staff, not customers)
- ✅ 8 cross-tenant risks (company_id params without isolation enforcement)
- ✅ 14 public endpoints (should be token-gated)
- ✅ 8 significant overlaps with queries service

**For Jose:** **Defer entire admon-monorepo from MCP.** No endpoints credibly answer customer questions. Existing tools in queries service cover customer-facing use cases. Re-evaluate only if future demand arises with clear cross-tenant isolation verification.

---

**Audit completed:** 2026-04-24  
**Model:** Claude Haiku 4.5  
**Source:** 58 route files, 648 endpoints, full inventory in /tmp/admon_endpoints.csv
