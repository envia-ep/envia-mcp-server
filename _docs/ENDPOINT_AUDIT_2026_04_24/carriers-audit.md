# Carriers Backend Endpoint Audit — 2026-04-24

## 1. Header

The **carriers service** (`services/carriers/`, PHP/Lumen 8.x) is the revenue engine and operational core of Envia. It normalizes API calls to 116+ carrier integrations (116 carriers documented in `analysis-carriers.md`) across 15+ countries for rate quoting, label generation, tracking, cancellations, pickups, and advanced document generation (manifests, BOLs, complements). Reference architecture: `memory/reference_carriers_architecture.md` + `analysis-carriers.md` (monorepo root).

**Deployment:**
- Production: `https://api.envia.com`
- Sandbox: `https://api-test.envia.com`
- Stack: Lumen 8.x, PHP 8.3+, MySQL, Redis, JWT auth

**Current MCP exposure:** 19 tools wrap carriers endpoints:
1. `envia_quote_shipment` → POST /ship/rate
2. `envia_create_label` → POST /ship/generate
3. `envia_track_package` → POST /ship/generaltrack
4. `envia_cancel_shipment` → POST /ship/cancel
5. `envia_schedule_pickup` → POST /ship/pickup
6. `envia_track_pickup` → POST /ship/pickuptrack
7. `envia_cancel_pickup` → POST /ship/pickupcancel
8. `envia_validate_address` → GET /zipcode/{country}/{code} (via geocodes service, not carriers)
9. `envia_list_carriers` → GET /available-carrier (via queries service, not carriers)
10. `envia_list_additional_services` → GET /available-service (via queries service, not carriers)
11. `envia_classify_hscode` → POST /utils/classify-hscode
12. `envia_create_commercial_invoice` → POST /ship/commercial-invoice (aliased as POST /ship/billoflading)
13. `envia_generate_manifest` → POST /ship/manifest
14. `envia_generate_bill_of_lading` → POST /ship/billoflading
15. `envia_submit_nd_report` → POST /ship/ndreport
16. `envia_generate_complement` → POST /ship/complement
17. `envia_ai_parse_address` → POST /ai/shipping/parse-address
18. `envia_ai_rate` → POST /ai/shipping/rate
19. `envia_get_shipment_history` → GET /guide/{month}/{year}

---

## 2. Endpoint Inventory

| # | Endpoint | Purpose (1 line) | User question it enables | Classification | Already exposed? | Value | Risks | Implementation notes | PII/Financial | Sandbox | T-shirt | Consumer today | Overlap |
|---|----------|------------------|------------------------|-----------------|-------------------|-------|-------|----------------------|---------------|---------|--------|------------------|---------|
| 1 | POST /ship/rate | Request carrier rate quotes for a shipment route and package dimensions | "¿Cuánto me cuesta mandar de X a Y?" | 🟢 V1-SAFE | `envia_quote_shipment` | Alto | `financial-impact` | Returns 5–40 carrier options with price, delivery time, services. Standard MCP tool. | Sí | Sí | XS | UI portal, MCP portal agent | ↔ queries:GET /available-carrier (parallel; rate requires more payload) |
| 2 | POST /ship/generate | Create a shipping label with carrier integration, document generation, ecommerce sync | "Crea la etiqueta con la paquetería más barata" | 🟢 V1-SAFE | `envia_create_label` | Alto | `financial-impact`, `needs-confirmation` | Irreversible shipment creation. Core MCP tool. Fires ecommerce sync side-effect if `order_identifier` present. | Sí | Sí | XS | UI portal, MCP portal agent, ecommerce service | ↔ queries:POST /v4/orders/{shop}/{order}/fulfillment/order-shipments |
| 3 | POST /ship/generaltrack | Public tracking lookup (no auth required) | "¿Dónde va mi paquete con tracking Z?" | 🟢 V1-SAFE | `envia_track_package` | Alto | none | Public endpoint; returns tracking events. Exposed to MCP portal agent. | No | Sí | XS | public (no auth), UI portal, MCP agent | ↔ queries:GET /shipments/{tracking} (v4; alternate source) |
| 4 | POST /ship/cancel | Reverse a shipment, void label, request refund | "Cancela el envío con tracking Z" | 🟢 V1-SAFE | `envia_cancel_shipment` | Alto | `destructive`, `financial-impact`, `needs-confirmation` | Irreversible if >24h from label creation. Returns refund amount. V1_SAFE_TOOL_INVENTORY notes missing refund detail. | Sí | Sí | XS | UI portal, MCP agent | none |
| 5 | POST /ship/track | Authenticated tracking lookup (internal) | "¿Dónde va mi envío interno?" | 🟡 V1-PARTIAL | ❌ | Bajo | none | `/ship/track` is NOT a public route; user would use generaltrack instead. Duplicates generaltrack. | No | Sí | XS | unclear (legacy?) | ↔ /ship/generaltrack, ↔ queries:GET /shipments/{tracking} |
| 6 | POST /ship/pickup | Schedule a carrier pickup for shipment labels | "Agenda una recolección para mañana" | 🟢 V1-SAFE | `envia_schedule_pickup` | Alto | `needs-confirmation` | Creates pickup request; carrier confirms or rejects. V1_SAFE. | No | Sí | XS | UI portal, MCP agent | ↔ queries:POST /pickups (alternate route via queries) |
| 7 | POST /ship/pickuptrack | Track a scheduled pickup by confirmation code | "¿Dónde está mi recolección?" | 🟡 V1-PARTIAL | `envia_track_pickup` | Medio | `sandbox-broken` | Sandbox broken (returns "company_id on null"); prod works. Reference: V1_SAFE_TOOL_INVENTORY. | No | No | S | UI portal | none |
| 8 | POST /ship/pickupcancel | Cancel a scheduled pickup (opposite of pickup) | "Cancela la recolección que solicité" | 🟢 V1-SAFE | `envia_cancel_pickup` | Medio | `destructive`, `needs-confirmation` | Reverses a pickup request. Validated schema (confirmation string + locale). | No | Sí | S | UI portal | none |
| 9 | POST /ship/billoflading | Generate bill of lading (advanced document for intl shipments, FedEx/UPS) | "¿Necesito un BOL para envíos a USA?" | 🟡 V1-PARTIAL | `envia_generate_bill_of_lading` | Bajo | none | **Auto-generated during POST /ship/generate for FedEx intl + UPS BR.** User rarely requests explicitly. Classify as 🟣 INTERNAL (side-effect of generate). | Sí | Sí | S | service-to-service (internal) | ↔ /ship/generate (side-effect) |
| 10 | POST /ship/commercial-invoice | Generate customs invoice (intl shipments) | "¿Necesito una factura comercial para aduanas?" | 🟡 V1-PARTIAL | `envia_create_commercial_invoice` | Bajo | none | **Auto-generated during POST /ship/generate for intl shipments.** Route aliased to billoflading internally (Ship.php:61). Classify as 🟣 INTERNAL. | Sí | Sí | S | service-to-service (internal) | ↔ /ship/generate (side-effect) |
| 11 | POST /ship/manifest | Generate shipment manifest (aggregate label doc for ecommerce batch) | "Dame mi manifesto del día" | 🟢 V1-SAFE | `envia_generate_manifest` | Alto | none | Returns PDF manifest for batch of labels. V1 ecommerce UI uses this. Standard MCP tool. | No | Sí | S | UI portal ecommerce, MCP agent | none |
| 12 | POST /ship/ndreport | Submit non-delivery (NDR) report to carrier with photo/evidence | "Mi paquete no se entregó, quiero reportarlo" | 🟢 V1-SAFE | `envia_submit_nd_report` | Medio | none | Submits incident report to carrier. V1 "Incidencias" card uses this. Requires shipment already in failed state. | No | Sí | S | UI portal, MCP agent | none |
| 13 | POST /ship/complement | Generate SAT Mexico carta porte complement (MX tax document) | "¿Qué documento extra necesito para MX?" | 🟢 V1-SAFE | `envia_generate_complement` | Bajo | none | MX-specific tax document. Auto-generated during generate for MX intl. Classify as 🟣 INTERNAL (side-effect). | Sí | Sí | S | service-to-service (internal, MX only) | ↔ /ship/generate (side-effect) |
| 14 | POST /ship/branches | Find carrier branch/drop-off points by address | "¿Cuál es el punto de entrega más cercano?" | 🔵 V1-EXISTS-HIDDEN | ❌ | Medio | none | Used internally by rate/generate to find branch coords; **not exposed in V1 UI as standalone search tool.** Backend exists and functional. Candidate for v1-agent if user demand clear. Reference: BranchUtil.php (app/ep/util/). | No | Sí | M | service-to-service (internal) | ↔ queries:POST /checkout (may consume branches indirectly) |
| 15 | POST /ship/{action} | Dynamic action dispatcher (catch-all for unspecified actions) | N/A — internal routing | ⚫ ADMIN-ONLY | ❌ | Bajo | none | Catch-all route (Ship.php line 33). Maps action param to action class. Used for testing new carriers / ad-hoc actions. Not a user-facing endpoint; never expose. | No | Sí | N/A | service-to-service (testing) | ↔ specific /ship/* routes |
| 16 | POST /v1/ship/{action} | V1 API (raw carrier responses, legacy auth via AuthV1) | "Necesito la respuesta sin procesar del carrier" | 🟡 V1-PARTIAL | ❌ | Bajo | `admin-dependency` | Legacy API returning raw carrier payloads. Only integrators/B2B use directly. AuthV1 + ValidateAccess middleware required. **Defer from MCP; v1 is abstracted.** | No | Sí | N/A | public API (integrators) | ↔ /ship/{action} (v2) |
| 17 | POST /v2/ship/{action} | V2 API (new payload format, batch mode, backup rules) | "Cotízame varios shipments en paralelo" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | Supports multi-shipment batches + checkout backup rules fallback (ShipV2.php). No middleware auth (Util::actionsWithoutGuard checks internally). **Portal V2 has UI; backend functional. Candidate for v1-agent if V2 UX stabilizes.** | Sí | Sí | M | UI portal V2 (experimental) | ↔ /ship/{action} (v1 main) |
| 18 | POST /v2/checkout/{ecommerce}/{shopId} | WooCommerce checkout integration (rate for ecommerce cart) | "¿Cuánto cuesta mandar los items en mi carrito?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | WooCommerce-specific; requires `user-agent-woocommerce` header. **Not a conversational user action for portal MCP; skip.** | Sí | Sí | M | WooCommerce integrations only | ↔ /ship/rate (core) |
| 19 | POST /utils/classify-hscode | Classify product into HS code for customs (Zonos integration) | "¿Cuál es el código arancelario de mis zapatos?" | 🟢 V1-SAFE | `envia_classify_hscode` | Medio | `requires-kyc` | Calls Zonos API. Returns HS code options + alternatives. V1 Productos editor uses this. **KYC required by Zonos; handled server-side.** | No | Sí | S | UI portal products, MCP agent | ↔ queries:POST /v2/products/{id} (product data) |
| 20 | POST /locate | Resolve Colombia city to DANE code (geocode helper) | "¿Cuál es el código DANE de Bogotá?" | 🟣 INTERNAL-HELPER | ❌ | Bajo | none | CheckoutUtil::getFixedCity() wrapper. **MCP uses internally via address resolver, never exposed as tool.** Colombia-specific. | No | Sí | N/A | service-to-service (internal) | ↔ geocodes:GET /locate/CO/{state}/{city} |
| 21 | POST /plan-quote | Database-driven quote by company plan definition | "¿Cuál es el precio según mi plan?" | 🟡 V1-PARTIAL | ❌ | Bajo | none | PlanDefinition::getQuoteByPlan(). No middleware. **Legacy admin utility; plans fetch is now via queries. Skip.** | No | Sí | S | UI portal (legacy), admin | ↔ queries:GET /plan/{id} |
| 22 | POST /v2/plan-quote-ws | Overweight surcharge re-quote (v2 enhancement) | "¿Cuánto cuesta si el paquete pesa más?" | 🟡 V1-PARTIAL | ❌ | Bajo | none | OverweightUtil::requoteForOverweigh(). **Internal helper for ecommerce batch processing; not conversational.** | No | Sí | S | service-to-service (ecommerce) | ↔ /ship/rate |
| 23 | GET /ship[/{action}] | Catalog documentation redirect (Swagger/Postman pointer) | N/A — not a query | ⚫ ADMIN-ONLY | ❌ | Bajo | none | Redirects to `https://docs.envia.com/?version=latest`. **Not an API endpoint; skip.** | No | Sí | N/A | documentation portal | none |
| 24 | GET / | Catalog documentation redirect (same as above) | N/A — not a query | ⚫ ADMIN-ONLY | ❌ | Bajo | none | Redirects to docs. **Not an API endpoint; skip.** | No | Sí | N/A | documentation portal | none |
| 25 | POST / | Catalog documentation redirect (same as above) | N/A — not a query | ⚫ ADMIN-ONLY | ❌ | Bajo | none | Redirects to docs. **Not an API endpoint; skip.** | No | Sí | N/A | documentation portal | none |
| 26 | GET /cron/{function} | Dynamic cron task dispatcher | N/A — internal maintenance | ⚫ ADMIN-ONLY | ❌ | Bajo | `no-auth-enforcement` | **🔴 CRITICAL SECURITY ISSUE (analysis-carriers.md §8).** Invokes Cron::$function() with no auth. Unauthenticated remote code execution risk. **NEVER expose. Fix in backend immediately.** | No | Sí | N/A | SRE/internal operations | none |
| 27 | GET /status | Health check endpoint | N/A — internal monitoring | ⚫ ADMIN-ONLY | ❌ | Bajo | none | Returns `ok` string. Used by monitoring/load balancers. **Not a user query; skip.** | No | Sí | N/A | monitoring, load balancers | none |
| 28 | GET /taxes/company-percentage/{companyId} | Get tax rate for a company (Brazil ICMS, VAT, etc.) | "¿Qué tasa fiscal aplica a mi empresa?" | 🟡 V1-PARTIAL | ❌ | Bajo | `requires-kyc` | Requires `auth` middleware + company_id path param. TaxCalculator::calculateCompanyTaxPercentage(). **KYC status required for accuracy; handled server-side. Internal utility; low user demand. Defer.** | No | Sí | S | UI portal (tax config), internal | ↔ queries:GET /company-info (plan/locale context) |
| 29 | POST /taxes/calculate | Calculate shipment taxes (ICMS Brazil, VAT intl, etc.) | "¿Cuántos impuestos voy a pagar en este envío?" | 🟡 V1-PARTIAL | ❌ | Bajo | `requires-kyc` | Requires `auth` middleware. FormRequest validation (ShipmentConceptsRequest). **Complex multi-country logic; KYC-dependent. Currently internal. Expose if user demand grows.** | Sí | Sí | M | service-to-service (internal) | ↔ /ship/rate (includes some taxes already) |
| 30 | GET /zonos/process-all | Process all pending Zonos customs clearance orders (batch) | N/A — internal batch job | ⚫ ADMIN-ONLY | ❌ | Bajo | `admin-dependency`, `destructive` | **Blocked in prod (authV1 + isProd check).** Dev/sandbox only. **Never expose; this is a mass-processing job.** | No | No | N/A | SRE/operations | ↔ /zonos/process/{shipmentId} (per-shipment) |
| 31 | GET /zonos/process/{shipmentId} | Process a specific Zonos customs clearance order | "¿Puedo procesar este envío para aduanas?" | 🔵 V1-EXISTS-HIDDEN | ❌ | Bajo | `admin-dependency` | Auth via `authV1` (line 47–48) or `auth` (line 53–55). Returns success/fail for Zonos processing. **Exists but no V1 UI for it. B2B/integrator-only. Defer from MCP.** | No | Sí | S | service-to-service (B2B integrations) | ↔ /zonos/process-all (single-order variant) |
| 32 | GET /zonos/status | Get status of all pending Zonos orders | "¿Qué órdenes de aduanas están pendientes?" | 🔵 V1-EXISTS-HIDDEN | ❌ | Bajo | none | Returns metadata on Zonos::getPendingOrFailedOrders(). **No V1 UI; B2B/ops-only. Defer.** | No | Sí | S | service-to-service (B2B), SRE | ↔ /zonos/process-all, /zonos/process/{shipmentId} |
| 33 | GET /guide/{month}/{year} | Shipment history archive (shipments created in a specific month/year) | "Dame mis envíos del mes pasado" | 🟢 V1-SAFE | `envia_get_shipment_history` | Medio | none | Returns array of shipment refs by month. V1 history view uses this. Standard MCP tool. | No | Sí | S | UI portal, MCP agent | ↔ queries:GET /shipments?date_range=... (alternate filter) |

---

## 3. Destructive / Financial Endpoints — Expanded Detail

### POST /ship/generate (Label creation)
- **Reversible?** Parcial. Can cancel up to 24h; after 24h label is final.
- **Has UI confirmation today?** Sí. Portal shows "Crear etiqueta" button with warning modal ("Este envío no se podrá editar después").
- **Impacts billing?** Sí. Charges company account immediately; COD fees apply if selected. Refund only if cancelled within 24h.
- **Proposed MCP confirmation flow if exposed:** Already exposed (`envia_create_label`). Existing tool asks for confirmation via natural language ("Voy a crear la etiqueta…"). Response includes `isDangerous: true` to signal to agent it's irreversible. Confirm via `confirm: true` param (already supported).

### POST /ship/cancel (Shipment cancellation)
- **Reversible?** Sí. Cancellation voids the label and reverses the charge (minus any carrier fees or refund limits by country).
- **Has UI confirmation today?** Sí. Portal shows "Cancelar" with confirmation modal ("Se reembolsará X monto a tu saldo").
- **Impacts billing?** Sí. Refunds amount minus carrier fees. Daily refund limits apply by country/plan.
- **Proposed MCP confirmation flow if exposed:** Already exposed (`envia_cancel_shipment`). Requires `tracking_number` + `reason` (optional). Response includes refund amount + remaining daily limit. Tool should echo back ("Voy a cancelar el envío #Z y reembolsar $X").

### POST /ship/pickup (Pickup scheduling)
- **Reversible?** Sí. Can cancel pickup via POST /ship/pickupcancel.
- **Has UI confirmation today?** Sí. Portal shows "Solicitar recolección" + date/time picker. Confirmation summary displayed before submit.
- **Impacts billing?** No (included in shipping plan). Some carriers may charge if pickup cancelled <24h before.
- **Proposed MCP confirmation flow if exposed:** Already exposed (`envia_schedule_pickup`). Requires `date` + optional `time_from`/`time_to`. Tool should echo back scheduled date and confirm via `confirm: true`.

### POST /ship/pickupcancel (Pickup cancellation)
- **Reversible?** No. Once cancelled, must schedule a new pickup.
- **Has UI confirmation today?** Sí. Portal asks "¿Seguro?" before confirming.
- **Impacts billing?** Potentially (carrier fees if <24h). Not always charged; depends on carrier.
- **Proposed MCP confirmation flow if exposed:** Already exposed (`envia_cancel_pickup`). Requires `confirmation_id` (from original pickup response). Echo back "Voy a cancelar la recolección #X" and require `confirm: true`.

---

## 4. Overlaps with Other Projects

The following endpoints share responsibility or duplicate functionality across services:

### Rate / Quote
- **carriers' POST /ship/rate** overlaps with **queries' GET /available-carrier**
  - Recommendation: POST /ship/rate is the primary (Envia-owned, auth'd). GET /available-carrier provides filtered carrier list; rate provides prices. Both should coexist. MCP uses both (quote_shipment uses rate; list_carriers uses available-carrier).

### Label Generation
- **carriers' POST /ship/generate** overlaps with **queries' POST /v4/orders/{shop}/{order}/fulfillment/order-shipments**
  - Recommendation: POST /ship/generate is primary for single shipments. queries' fulfillment endpoint is ecommerce-specific. Side-effect sync (syncFulfillment) connects them. Use generate as primary MCP tool.

### Tracking
- **carriers' POST /ship/generaltrack** overlaps with **queries' GET /shipments/{tracking}** (via queries service)
  - Recommendation: POST /ship/generaltrack is public, simpler. queries GET is authenticated, richer data. MCP uses generaltrack for public lookups. Both valid; queries version adds auth layer.

### Pickup Management
- **carriers' POST /ship/pickup** overlaps with **queries' POST /pickups** (via queries service)
  - Recommendation: carriers endpoint is primary (orchestrates carrier integration). queries endpoint manages company pickup history. Both needed; use carriers as MCP tool.

### Branch / Drop-off Points
- **carriers' POST /ship/branches** (internal) may overlap with **checkout backup rules** + **queries' POST /checkout** (ecommerce)
  - Recommendation: branches is internal helper. Checkout route consumes it. No direct user exposure needed yet.

### Zonos Customs Processing
- **carriers' GET /zonos/process/{shipmentId}** overlaps with B2B integrator workflows
  - Recommendation: Exists but no V1 UI. Defer from portal MCP. May expose as admin tool in separate admin-MCP v2.

---

## 5. Questions for Backend Team

1. **Endpoint:** POST /ship/track
   **Question:** Is `/ship/track` a production route? Routes file (web.php:24) defines it, but it is NOT listed in BACKEND_ROUTING_REFERENCE.md or any reference doc as an actively used endpoint. `envia_track_package` tool uses POST /ship/generaltrack instead (public, no auth). Is `/ship/track` a legacy duplicate that should be removed?
   **Blocks:** Endpoint classification (currently 🟡 V1-PARTIAL but may be ⚫ ADMIN-ONLY or deprecated).

2. **Endpoint:** POST /v2/ship/{action}
   **Question:** The route (web.php:61) has NO middleware defined. ShipV2::process() calls Guard::authenticate() internally (ShipV2.php:33) only if not in the `actionsWithoutGuard` list (Util::actionsWithoutGuard($action)). Which V2 actions require auth and which don't? Is this intentional or a security gap?
   **Blocks:** Auth enforcement verification; risk classification (currently 🟠 but may need `no-auth-enforcement` flag if some actions are truly public).

3. **Endpoint:** GET /cron/{function}
   **Question:** This endpoint has NO auth enforcement (analysis-carriers.md §8 confirms it as a critical security issue). Is this a known 0-day / TODO, or intentional? What is the remediation timeline?
   **Blocks:** Security posture; MCP decision (never expose, but backend risk exists).

4. **Endpoint:** POST /ship/branches
   **Question:** Is branches a user-facing operation (e.g., "find drop-off points near my location") or purely internal (used during rate/generate)? If user-facing, should it be exposed as a standalone MCP tool?
   **Blocks:** Value + classification decision. Currently classified as 🔵 V1-EXISTS-HIDDEN, Medio.

5. **Endpoint:** POST /taxes/calculate
   **Question:** What is the minimum KYC status required for accurate tax calculation? Does the endpoint validate KYC server-side, or does client (MCP) need to pre-check?
   **Blocks:** Implementation safety; confirm KYC dependency.

6. **Endpoint:** POST /v2/checkout/{ecommerce}/{shopId}
   **Question:** Is this endpoint actively used in production, or is it WooCommerce-specific and/or experimental? Should it be in scope for portal MCP (non-WooCommerce users)?
   **Blocks:** Value + use-case clarity.

7. **Endpoint:** GET /zonos/process-all and GET /zonos/process/{shipmentId}
   **Question:** These are marked as authV1 required. Is Zonos integration (customs clearance) a customer-facing feature in any portal, or is it B2B/integrator-only? No mention in reference docs.
   **Blocks:** Customer demand + scope clarity.

---

## 6. Summary by Classification

**Total: 33 endpoints** (including documentation redirects and internal utilities)

🟢 V1-SAFE:              10 endpoints (30%)
🟡 V1-PARTIAL:           10 endpoints (30%)
🔵 V1-EXISTS-HIDDEN:      4 endpoints (12%)
🟠 V2-ONLY-BACKEND-REAL:  2 endpoints (6%)
⚫ ADMIN-ONLY:            7 endpoints (21%)
🟣 INTERNAL-HELPER:       0 (reclassified from V1-PARTIAL; see Overlaps)

**By value (excluding ⚫ ADMIN-ONLY and 🟣 INTERNAL):**
- Alto: 5 endpoints (rate, generate, generaltrack, cancel, manifest)
- Medio: 7 endpoints (track, pickuptrack, pickupcancel, ndreport, classify-hscode, company-tax, zonos-specific)
- Bajo: 14 endpoints (billoflading, complement, branches, v1 API, v2 API, checkout, catch-all, plan-quote, overweight-quote, locate, tax-calculate, zonos-batch, documentation, health)

**Already exposed in MCP (19 tools):**
- 🟢 V1-SAFE: 12 of 10 (see note below)
- 🟡 V1-PARTIAL: 4 of 10
- 🟣 INTERNAL-HELPER (not visible to LLM): 2 (commercial-invoice, bill-of-lading, locate)
- ⚫ ADMIN-ONLY (intentionally not exposed): 0

**Note on count:** Some endpoints are multi-routed (e.g., POST /ship/commercial-invoice is aliased to POST /ship/billoflading in Ship.php:61) or are auto-generated side-effects (e.g., manifests generated during POST /ship/generate). The 19 tools cover the primary flows; side-effect generators are reclassified as 🟣 INTERNAL.

**Candidates NOT yet exposed (Bajo + Medio value, actionable user demand):**
- POST /ship/branches (find drop-off; Medio, 🔵 exists but hidden)
- GET /guide/{month}/{year} — **ALREADY EXPOSED** as `envia_get_shipment_history`; added to inventory but was expected.
- POST /taxes/calculate (tax breakdown; Bajo-Medio, 🟡 partial, complex logic)
- POST /v2/ship/{action} batch mode (Medio, 🟠, but requires V2 UI stabilization first)

---

## 7. Notes on Endpoint Discovery & Verification

- **Source of truth:** `services/carriers/routes/web.php` (routes), `app/Http/Controllers/{ApiController,UtilsController,TaxController,ZonosController}.php` (handlers), `app/ep/Ship.php` + action classes (business logic).
- **Verification approach:** Scanned all route definitions, cross-referenced with reference docs (`memory/reference_carriers_architecture.md`, `analysis-carriers.md`, `V1_SAFE_TOOL_INVENTORY.md`). No sandbox curl tests performed (not in scope for audit; verification phase comes in decision session).
- **Security issues flagged:** Cron endpoint with no auth (critical), CORS open globally (noted in analysis-carriers.md but outside scope of this audit).
- **Reclassifications from prior analysis:**
  - `envia_create_commercial_invoice` → reclassified as 🟣 INTERNAL (auto-generated during generate).
  - `envia_generate_bill_of_lading` → reclassified as 🟣 INTERNAL (same reason).
  - `envia_locate_city` → not exposed to LLM (internal DANE resolver).
- **Organizational ownership:** All 33 endpoints are owned by the carriers team (Jose's org). No cross-vertical delegation issues (ecart-payment is NOT directly wrapped, per L-S7).

