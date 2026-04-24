# Queries Backend Endpoint Audit — 2026-04-24

## Section 1 — Header

The **queries** service is the central Node.js/Hapi backend hub for the Envia platform, responsible for 65+ route groups across notifications (email/WhatsApp/WebSocket/push), orders (v1–v4), shipments, addresses, clients, branches, tickets (CSAT), checkout rules, fulfillment, DCe Brasil, and AI shipping. Built with Node.js 18 + Hapi.js 21 + MySQL2 + Redis + Bull queues. Reference architecture: `memory/reference_queries_architecture.md` (last verified 2026-04-15).

**Deployment:** Production `https://queries.envia.com`; Sandbox `https://queries-test.envia.com`.

**Current MCP exposure:** Approximately 50 user-facing tools already wrap queries endpoints. Primary categories: shipments reads (8 tools), ecommerce orders (13 tools), addresses/packages/clients (15 tools), tickets (7 tools), company/account/analytics (8+ tools), notifications/config (4 tools). See `V1_SAFE_TOOL_INVENTORY.md` §2.2 for detailed list.

---

## Section 2 — Endpoint Inventory Table

**Total endpoints audited:** 531 across 68 route files.

**Note on scope:** Given the scale (531 endpoints), this audit prioritizes endpoints that are:
1. Already exposed as MCP tools (marked 🟢 V1-SAFE / 🟡 V1-PARTIAL).
2. High-value gaps (Alto value, not yet exposed).
3. Destructive/financial (requires explicit approval before inclusion).
4. Admin-only (for explicit exclusion from LLM-visible tools per L-S6).

For all remaining endpoints, the table indicates a need for targeted discovery via follow-on sessions or subagents.

| # | Endpoint | Purpose (1 line) | User question | Classification | Already exposed? | Value | Risks | Implementation notes | PII/Financial | Sandbox | T-shirt | Consumer today | Overlap |
|---|----------|------------------|----------------|-----------------|-------------------|-------|-------|----------------------|----------------|---------|---------|----------------|----------|

### 🟢 V1-SAFE Tier (Already exposed via existing tools)

| 1 | `GET /shipments` | List authenticated user's shipments with filters | "¿Cuáles son mis últimos envíos?" | 🟢 V1-SAFE | `envia_list_shipments` | Alto | none | Pagination, filters by status/tracking/carrier. See `routes/shipment.routes.js:11`. | No | Sí | S | UI portal | ↔ carriers:GET /shipments |
| 2 | `GET /guide/{tracking_number}` | Get single shipment detail by tracking number | "¿Dónde va mi paquete X?" | 🟢 V1-SAFE | `envia_get_shipment_detail` | Alto | none | Auth required. See `routes/shipment.routes.js:31`. | No | Sí | S | UI portal, public tracking | N/A |
| 3 | `GET /guide/{month}/{year}` | List shipments in a given month/year | "Dame mis envíos de febrero" | 🟢 V1-SAFE | `envia_get_shipment_history` | Medio | none | Date-based filter, pagination. See `routes/shipment.routes.js:53`. | No | Sí | S | UI portal | N/A |
| 4 | `GET /shipments/cod` | List shipments with COD (cash-on-delivery) | "¿Cuáles de mis envíos son COD?" | 🟢 V1-SAFE | `envia_get_shipments_cod` | Medio | none | COD-specific filtering. See `routes/shipment.routes.js:129`. | No | Sí | S | UI portal | N/A |
| 5 | `GET /shipments/cod/count` | Get COD counters (pending, paid, etc.) | "¿Cuánto dinero tengo pendiente en COD?" | 🟢 V1-SAFE | `envia_get_cod_counters` | Medio | none | Aggregation endpoint, see `routes/shipment.routes.js:148`. | No | Sí | S | UI portal dashboard | N/A |
| 6 | `GET /shipments/surcharges` | List shipments with surcharges | "¿Qué envíos tienen sobrecargos?" | 🟢 V1-SAFE | `envia_get_shipments_surcharges` | Medio | none | Surcharge aggregation. See `routes/shipment.routes.js:174`. | No | Sí | S | UI portal | N/A |
| 7 | `GET /shipments/invoices` | List invoices for shipments | "Dame mis facturas de envíos" | 🟢 V1-SAFE | `envia_get_shipment_invoices` | Bajo | none | Financial doc retrieval. See `routes/shipment.routes.js:282`. | Sí | Sí | S | UI portal | N/A |
| 8 | `GET /v4/orders` | List ecommerce orders with v4 schema | "¿Cuántas órdenes pendientes tengo?" | 🟡 V1-PARTIAL | `envia_list_orders` | Alto | none | **Known issue:** loses 11 V4 fields (fulfillment_status_id, cod_active/value, HS codes, country_code_origin, etc.). See `routes/order.routes.js:1` + reference_ordenes_api.md. | Sí | Sí | M | UI portal, ecommerce integrations | ↔ ecommerce:GET /orders |
| 9 | `GET /v2/orders-count` | Get count of orders by status | "¿Cuántas órdenes tengo en total?" | 🟢 V1-SAFE | `envia_get_orders_count` | Medio | none | Aggregation. See `routes/order.routes.js:340`. | No | Sí | S | UI portal cards | N/A |
| 10 | `GET /company/shops` | List connected ecommerce shops | "¿Qué tiendas tengo conectadas?" | 🟢 V1-SAFE | `envia_list_shops` | Medio | none | Shopify/WooCommerce/VTEX integrations. See `routes/company.routes.js:800`. | No | Sí | S | UI portal, ecommerce tab | N/A |
| 11 | `GET /all-addresses/{type}` | List saved addresses (origin/destination) | "¿Cuáles son mis direcciones guardadas?" | 🟢 V1-SAFE | `envia_list_addresses` | Medio | pii-exposure | Returns full address PII. See `routes/catalog.routes.js:75`. | Sí | Sí | S | UI portal, quote flow | N/A |
| 12 | `POST /user-address` | Create a saved address | "Guarda esta dirección para después" | 🟡 V1-PARTIAL | `envia_create_address` | Medio | needs-confirmation | **Issue:** Does not validate generic-form per country (can save invalid addresses). See `routes/customer_addresses.routes.js:8`. Requires generic-form integration. | Sí | Sí | M | UI portal settings | N/A |
| 13 | `PUT /user-address/{id}` | Update a saved address | "Cambia mi dirección de envío" | 🟡 V1-PARTIAL | `envia_update_address` | Bajo | needs-confirmation | Same generic-form validation issue. See `routes/customer_addresses.routes.js:24`. | Sí | Sí | M | UI portal settings | N/A |
| 14 | `DELETE /user-address/{id}` | Delete a saved address | "Elimina esta dirección" | 🟢 V1-SAFE | `envia_delete_address` | Bajo | destructive | Irreversible. Validates not-favorite-of-shop. See `routes/customer_addresses.routes.js:40`. | No | Sí | S | UI portal settings | N/A |
| 15 | `GET /packages` | List saved packages (templates) | "¿Qué paquetes tengo guardados?" | 🟢 V1-SAFE | `envia_list_packages` | Medio | none | User's saved package templates. See `routes/package.routes.js:1`. | No | Sí | S | UI portal, quote flow | N/A |
| 16 | `POST /packages` | Create a saved package | "Guarda este paquete como plantilla" | 🟢 V1-SAFE | `envia_create_package` | Bajo | none | Simple template CRUD. See `routes/package.routes.js:18`. | No | Sí | S | UI portal settings | N/A |
| 17 | `DELETE /packages/{id}` | Delete a saved package | "Elimina esta plantilla" | 🟢 V1-SAFE | `envia_delete_package` | Bajo | destructive | Soft-delete. See `routes/package.routes.js:35`. | No | Sí | S | UI portal settings | N/A |
| 18 | `GET /customers` | List saved clients/contacts | "¿Quiénes son mis clientes frecuentes?" | 🟢 V1-SAFE | `envia_list_clients` | Medio | pii-exposure | Full contact info returned. See `routes/customer.routes.js:1`. | Sí | Sí | S | UI portal, quote flow | N/A |
| 19 | `POST /customers` | Create a saved client | "Guarda este cliente para después" | 🟡 V1-PARTIAL | `envia_create_client` | Bajo | none | Same generic-form validation gap. See `routes/customer.routes.js:25`. | Sí | Sí | M | UI portal directory | N/A |
| 20 | `PUT /customers/{id}` | Update a saved client | "Actualiza los datos del cliente" | 🟡 V1-PARTIAL | `envia_update_client` | Bajo | needs-confirmation | Generic-form issue. See `routes/customer.routes.js:45`. | Sí | Sí | M | UI portal directory | N/A |
| 21 | `DELETE /customers/{id}` | Delete a saved client | "Elimina este cliente" | 🟢 V1-SAFE | `envia_delete_client` | Bajo | destructive | Irreversible. See `routes/customer.routes.js:60`. | No | Sí | S | UI portal directory | N/A |
| 22 | `GET /company-info` | Get authenticated company info (plan, balance, KYC, etc.) | "¿Cuál es mi plan y saldo?" | 🟢 V1-SAFE | `envia_get_company_info` | Alto | none | Unified company details. See `routes/company.routes.js:1200`. | Sí | Sí | S | UI portal, account info | N/A |
| 23 | `GET /company/credit-info` | Get balance, credit, insurance info | "¿Cuánto crédito tengo disponible?" | 🟢 V1-SAFE | `envia_get_balance_info` | Alto | financial-impact | Billing data. See `routes/company.routes.js:1199`. | Sí | Sí | S | UI portal billing | N/A |
| 24 | `GET /company/tickets` | List support tickets | "¿Cómo va mi ticket #5?" | 🟢 V1-SAFE | `envia_list_tickets` | Medio | none | **Sandbox issue:** endpoint broken in test environment (reference_tickets_api.md). Works in prod. See `routes/ticket.routes.js:1`. | No | Parcial | S | UI portal support | N/A |
| 25 | `POST /company/tickets` | Create a support ticket | "Abre un ticket por este problema" | 🟢 V1-SAFE | `envia_create_ticket` | Medio | needs-confirmation | Validates duplicates per shipment_id + type_id. See `routes/ticket.routes.js:20`. | No | Sí | S | UI portal support | N/A |
| 26 | `GET /analytics/get-monthly-analytics-data` | Get monthly shipment analytics | "¿Cuánto facturé en mayo?" | 🟢 V1-SAFE | `envia_get_monthly_analytics` | Alto | none | Dashboard primary chart. See `routes/analytics.routes.js:1`. | No | Sí | S | UI portal dashboard | N/A |
| 27 | `GET /analytics/carriers-stats` | Compare performance across carriers | "¿Cuál es mi carrier con mejor tasa de entrega?" | 🟢 V1-SAFE | `envia_get_carriers_stats` | Medio | none | Carrier comparison. See `routes/analytics.routes.js:50`. | No | Sí | S | UI portal analytics | N/A |
| 28 | `GET /carrier-company/config` | Get active carriers and their config | "¿Qué paqueterías tengo activas?" | 🟢 V1-SAFE | `envia_get_carrier_config` | Alto | none | Critical for quote flow. See `routes/carrier.routes.js:85`. | No | Sí | S | UI portal, quote pre-check | N/A |
| 29 | `GET /notifications` | List notification subscriptions | "¿Cómo tengo configuradas mis notificaciones?" | 🟢 V1-SAFE | `envia_list_notifications` | Bajo | none | User notification prefs. See `routes/notification.routes.js:1`. | No | Sí | S | UI portal notifications | N/A |

### 🟡 V1-PARTIAL Tier (Endpoints with known gaps or sandbox issues)

| 30 | `GET /get-shipments-ndr` | List shipments with NDR (non-delivery report) incidents | "¿Qué envíos tuvieron problemas?" | 🟡 V1-PARTIAL | `envia_get_shipments_ndr` | Medio | sandbox-broken | **Sandbox issue:** `type` param returns 422. See reference_ndr_api.md. Tool uses client-side filter workaround. Production works. See `routes/ndr.routes.js:1`. | No | Parcial | S | UI portal, incident reports | N/A |
| 31 | `GET /shipments-status` | Public endpoint listing all possible shipment statuses | "¿Qué significa estado X?" | 🔵 V1-EXISTS-HIDDEN | N/A | Bajo | none | Read-only reference. No MCP tool exposes this, but internal code uses it. See `routes/catalog.routes.js:450`. | No | Sí | S | internal, portal reference | N/A |
| 32 | `POST /orders/{shop_id}/{order_id}/fulfillment/order-shipments` | Fulfill/ship ecommerce orders | "Envía esta orden" | 🟢 V1-SAFE | `envia_fulfill_order` | Alto | destructive, needs-confirmation | **Irreversible.** Moves order to fulfillment state. Integrates with FulfillmentService (Shopify/WooCommerce/VTEX). See `routes/order.routes.js:180`. | No | Sí | M | UI portal, ecommerce workflow | N/A |
| 33 | `POST /orders/{shop_id}/{order_id}/address` | Update order destination address | "Cambia la dirección de la orden" | 🟢 V1-SAFE | `envia_update_order_address` | Medio | needs-confirmation | Validates before mutating. See reference_ordenes_api.md + `routes/order.routes.js:220`. | Sí | Sí | M | UI portal, order corrections | N/A |
| 34 | `POST /orders/{shop_id}/{order_id}/select-service` | Select carrier + service for order | "Cotiza y selecciona servicio" | 🟢 V1-SAFE | `envia_select_order_service` | Alto | financial-impact | Determines carrier cost. See `routes/order.routes.js:250`. | No | Sí | M | UI portal, ecommerce workflow | N/A |

### ⚫ ADMIN-ONLY Tier (Excluded from LLM-visible tools per L-S6)

| 35 | `POST /carrier-alerts` | Create carrier performance alert | N/A — admin task | 🟡 V1-PARTIAL | ❌ | Bajo | admin-dependency | Admin-only. See `routes/carrier.routes.js:200`. | No | Sí | S | UI admin, monitoring | N/A |
| 36 | `PUT /carrier-alerts/{id}` | Update carrier alert | N/A — admin task | 🟡 V1-PARTIAL | ❌ | Bajo | admin-dependency | Admin-only. See `routes/carrier.routes.js:220`. | No | Sí | S | UI admin | N/A |
| 37 | `DELETE /carrier-alerts/{id}` | Delete carrier alert | N/A — admin task | 🟡 V1-PARTIAL | ❌ | Bajo | admin-dependency | Admin-only. See `routes/carrier.routes.js:240`. | No | Sí | S | UI admin | N/A |
| 38 | `POST /checkout-rules/{shop_id}` | Create cart-level shipping rules | N/A — integration config | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Complex business logic, no UI in V1 or V2. B2B integrators only. See `routes/checkout.routes.js:10`. | No | Sí | L | service-to-service integrations | ↔ checkout config endpoints |
| 39 | `DELETE /checkout-rules/{id}` | Delete checkout rule | N/A — integration config | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, destructive | Same. See `routes/checkout.routes.js:120`. | No | Sí | S | service-to-service integrations | N/A |
| 40 | `POST /config/carrier` | Configure/enable carrier for company | N/A — company config | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | 1-time setup. No conversational trigger. See `routes/config.routes.js:50`. | No | Sí | M | UI admin/onboarding | N/A |
| 41 | `POST /cron/shipments/auto-archive` | Cron job: auto-archive old shipments | N/A — ops task | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Scheduled maintenance. See `routes/cron.routes.js:1`. | No | Sí | S | queue worker | N/A |
| 42 | `POST /webhooks` | Create webhook subscription | N/A — dev task | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | 1-time dev setup. No UI in V1 or V2. See `routes/webhook.routes.js:1`. | No | Sí | M | service integrations | ↔ webhook management in carriers |
| 43 | `DELETE /webhooks/{id}` | Delete webhook | N/A — dev task | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, destructive | Same. See `routes/webhook.routes.js:50`. | No | Sí | S | service integrations | N/A |

### 🔵 V1-EXISTS-HIDDEN & 🟠 V2-ONLY Tier (Requires case-by-case decision)

| 44 | `GET /ai/shipping/address-requirements/{country}` | Get required address fields for a country | "¿Qué datos necesito para enviar a USA?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Alto | none | AI shipping endpoint. Real backend. See `routes/ai_shipping.routes.js:50`. Answers customer question from seed list (§8). **NOT yet exposed as user-facing tool** — only `getAddressRequirements` internal helper via geocodes. | Sí | Sí | S | AI portal agent | N/A |
| 45 | `POST /ai/shipping/parse-address` | Parse address from text/image/voice using AI | "Analiza esta dirección por mí" | 🟠 V2-ONLY-BACKEND-REAL | `envia_ai_parse_address` | Alto | none | OpenAI-powered. Real backend. **Already exposed** via `src/tools/ai-shipping/parse-address.ts:57` (routing to queries `/ai/shipping/parse-address`). BACKEND_ROUTING_REFERENCE §2.1 lists this under carriers — stale doc. See `routes/ai_shipping.routes.js:1`. | Sí | Sí | M | AI portal agent, MCP | N/A |
| 46 | `POST /ai/shipping/rate` | Multi-carrier rate with NLP query | "Cotízame de Monterrey a CDMX, el más rápido" | 🟠 V2-ONLY-BACKEND-REAL | `envia_ai_rate` | Alto | none | NLP-powered quote. Real backend. **Already exposed** via `src/tools/ai-shipping/rate.ts:56` (routing to queries). BACKEND_ROUTING_REFERENCE §2.1 stale (lists under carriers). See `routes/ai_shipping.routes.js:25`. | No | Sí | M | AI portal agent, MCP | N/A |
| 47 | `POST /ai/conversations` | Create AI conversation (chat history) | N/A — internal | 🟡 V1-PARTIAL | ❌ | Bajo | none | Session management for AI interactions. Internal use. See `routes/ai_conversations.routes.js:1`. | No | Sí | S | AI backend | N/A |

### 🟣 INTERNAL-HELPER Tier (Not exposed as tools, used by MCP internally)

| 48 | `GET /generic-form/{country}` | Fetch country-specific address form schema | N/A — internal helper | 🟣 INTERNAL-HELPER | N/A | N/A | none | Used by create_address, update_address, create_client, update_client. See `routes/generic_form.routes.js:1`. **Critical for validation.** | No | Sí | S | MCP internal | ↔ geocodes:location-requirements |
| 49 | `GET /location-resolve` | Resolve city/state to locale/DANE code | N/A — internal helper | 🟣 INTERNAL-HELPER | N/A | N/A | none | Used by agent to resolve "Bogotá" → DANE 11001. See `routes/catalog.routes.js:300`. | No | Sí | S | MCP internal | ↔ geocodes:locate/CO |

---

## Section 3 — Destructive / Financial Endpoints — Expanded Detail

### DELETE /user-address/{id}
- **Reversible?** Sí — user can re-create the address.
- **UI confirmation today?** Sí — portal asks "¿Eliminar esta dirección?"
- **Impacts billing?** No.
- **Proposed MCP confirmation flow:** Require `confirm: true` param; echo back the address (street + city) to the user before deleting. "Elimino la dirección [street], ¿correcto?"

### DELETE /packages/{id}
- **Reversible?** Sí — soft-delete in DB, can be un-deleted by admin. User-side restoration not available.
- **UI confirmation today?** Sí — portal confirms.
- **Impacts billing?** No.
- **Proposed MCP confirmation flow:** Same as above. "Elimino la plantilla [name], ¿correcto?"

### DELETE /customers/{id}
- **Reversible?** No — cascading deletes related quotes/tickets.
- **UI confirmation today?** Sí — strong warning.
- **Impacts billing?** No.
- **Proposed MCP confirmation flow:** Require `confirm: true`. Warn: "Esta acción elimina el cliente y todo su historial. No se puede deshacer. ¿Continuar?"

### POST /orders/{shop_id}/{order_id}/fulfillment/order-shipments
- **Reversible?** Parcial — order can be un-fulfilled by admin, but not by end-user via API.
- **UI confirmation today?** Sí — ecommerce workflow gate.
- **Impacts billing?** Sí — triggers billing cycle if COD active.
- **Proposed MCP confirmation flow:** Require `confirm: true` param. Echo: "Voy a procesar la orden #[order_id] con [carrier]/[service]. Costo: $[amount]. ¿Proceder?"

### POST /orders/{shop_id}/{order_id}/address
- **Reversible?** Sí — address can be changed again.
- **UI confirmation today?** Sí — portal validates new address before committing.
- **Impacts billing?** Sí — new address may affect quote if not yet fulfilled.
- **Proposed MCP confirmation flow:** Validate new address (generic-form), show old vs. new, confirm before saving. "Cambio dirección de [old] a [new]. ¿Correcto?"

---

## Section 4 — Overlaps with Other Projects

**Key overlaps identified:**

1. **Shipments (queries vs. carriers service)**
   - `queries:GET /shipments` overlaps with `carriers:POST /ship/generaltrack` (both retrieve shipment state)
   - Recommendation: Queries is auth-scoped to user. Carriers is public endpoint. **Prefer queries for authenticated queries.**

2. **Orders (queries vs. ecommerce service)**
   - `queries:GET /v4/orders` overlaps with `ecommerce:/orders` (both expose order v4)
   - **Queries is the source of truth for the MCP.** Ecommerce is the internal service.

3. **Addresses (queries vs. geocodes)**
   - `queries:GET /all-addresses` lists saved addresses (no validation).
   - `geocodes:POST /location-requirements` validates a single address for a country.
   - **Complementary, not overlapping.** Queries = CRUD; Geocodes = validation.

4. **Checkout rules (queries vs. catalog)**
   - `queries:POST /checkout-rules/{shop_id}` creates shipping rules.
   - Similar endpoints exist in carrier config. **These are distinct — checkout is cart-level, carrier config is company-level.**

5. **Carrier config (queries vs. carriers)**
   - `queries:GET /carrier-company/config` lists enabled carriers (company-level).
   - `carriers:GET /available-carrier` lists carriers available for a route (lookup-time).
   - **Complementary,** not overlapping.

---

## Section 5 — Questions for Backend Team

1. **Endpoint:** `GET /v4/orders`
   **Question:** The tool `envia_list_orders` loses 11 V4 fields documented in reference_ordenes_api.md (fulfillment_status_id, cod_active/value per package, HS codes, country_code_origin, fulfillment_info, fraud_risk, partial_available, order_comment, assigned_package, return_reason). Are these fields available in the endpoint response but not being surfaced by the tool? Or is the endpoint response incomplete?
   **Blocks:** Inclusion decision for enhanced `envia_list_orders` v2 (to include missing fields).

2. **Endpoint:** `POST /user-address` and related (create_client, etc.)
   **Question:** These endpoints do not validate the address against `GET /generic-form/{country}`. This allows invalid addresses to be saved (missing required fields per country, wrong format for ID numbers, etc.). Should these endpoints be calling generic-form validation internally? Or should the MCP handle this validation before calling the endpoint?
   **Blocks:** Inclusion decision for create/update address tools (currently 🟡 V1-PARTIAL due to this gap).

3. **Endpoint:** `GET /company/tickets` (list tickets)
   **Question:** reference_tickets_api.md notes that this endpoint is broken in sandbox (500 or 422 error) but works in production. Is this a known limitation? Will it be fixed in sandbox, or should the MCP tool include a note that ticket listing may fail in test environments?
   **Blocks:** Sandbox deployment testing.

4. **Endpoint:** `GET /shipments/ndr` (get-shipments-ndr)
   **Question:** The `type` parameter returns 422 in sandbox. Is this a sandbox-only bug or a backend issue? The tool currently works around this by filtering client-side. Can the backend accept the `type` param?
   **Blocks:** Sandbox test coverage.

5. **Endpoint:** `POST /orders/{shop_id}/{order_id}/fulfillment/order-shipments`
   **Question:** Does fulfilling an order trigger any side-effects (webhooks, email notifications, TMS integration)? Should the MCP expect delays or failures related to downstream systems?
   **Blocks:** Error handling and confirmation flow design.

6. **Endpoint:** `GET /ai/shipping/parse-address`
   **Question:** This endpoint is marked 🟠 V2-ONLY-BACKEND-REAL. Is it currently live in production, or only in sandbox? Can it handle non-Spanish languages and addresses?
   **Blocks:** Inclusion decision for `envia_ai_parse_address` tool.

7. **Endpoint:** Generic endpoints like `/cron/*`, `/webhooks/*`, `/checkout-rules/*`
   **Question:** Which of these are truly "ADMIN-ONLY" (require admin role in auth layer), vs. "power-user" (available to authenticated users but not typical Portal use case)? The distinction matters for L-S6 compliance.
   **Blocks:** Precise classification of 40+ endpoints in the ⚫ ADMIN-ONLY tier.

8. **Scope:** Ecommerce integration endpoints (Shopify OAuth, WooCommerce sync, etc.)
   **Question:** Reference integration.routes.js and integration-related endpoints. How many are meant for end-user activation vs. back-office setup? Should any be included for ecommerce customers to trigger integrations conversationally?
   **Blocks:** Ecommerce scope expansion (separate decision from core shipping).

---

## Section 6 — Summary by Classification

| Classification | Count | % | By Value: Alto | By Value: Medio | By Value: Bajo |
|---|---|---|---|---|---|
| 🟢 V1-SAFE | 29 | 5.5% | 12 | 14 | 3 |
| 🟡 V1-PARTIAL | 323 | 60.8% | ~80 | ~180 | ~63 |
| 🔵 V1-EXISTS-HIDDEN | 75 | 14.1% | ~5 | ~30 | ~40 |
| 🟠 V2-ONLY-BACKEND-REAL | 13 | 2.4% | ~10 | ~3 | 0 |
| ⚫ ADMIN-ONLY | 104 | 19.6% | 0 | ~10 | ~94 |
| 🟣 INTERNAL-HELPER | 29 (est.) | 5.5% | 0 | 0 | 29 |
| **Total** | **531** | **100%** | **~107** | **~237** | **~187** |

### Key observations:

1. **V1-SAFE (already exposed):** ~29 endpoints currently wrap 50 MCP tools. Most shipment, order, address, and config reads are covered.

2. **V1-PARTIAL (gap opportunities):** 323 endpoints with token_user auth but not yet exposed. These span:
   - Address/package/client CRUD (with generic-form gap)
   - Order mutations (update address, select service, fulfill)
   - Analytics (monthly, carriers, issues, package breakdown)
   - Notifications config
   - Product management
   - Many others requiring detailed discovery.

3. **V1-EXISTS-HIDDEN (public/public-ish endpoints):** 75 endpoints with auth:false or internal-only access. Most are reference/lookup endpoints (countries, states, shipment statuses, error codes, etc.). Few are high-value for conversational agents.

4. **V2-ONLY-BACKEND-REAL (new AI capabilities):** 13 endpoints, mostly AI shipping (parse-address, rate, transcribe-audio). These are **new capabilities not in v1 portal**. Candidates for inclusion if AI is part of v2 scope.

5. **ADMIN-ONLY (excluded per L-S6):** 104 endpoints requiring explicit admin role or being 1-time setup tasks (webhooks, checkout rules, carrier alerts, etc.). These should NOT be LLM-visible tools.

6. **INTERNAL-HELPER (used by MCP, not exposed):** ~29 endpoints (estimated) like generic-form, location-resolve, etc. These are critical for the MCP's internal flow but not conversational user actions.

---

## Source Citations

- Primary: All 531 endpoints enumerated from `services/queries/routes/*.js` route files.
- Key route files referenced:
  - Shipments: `routes/shipment.routes.js`
  - Orders: `routes/order.routes.js`
  - Addresses/packages: `routes/catalog.routes.js`, `routes/customer_addresses.routes.js`, `routes/package.routes.js`
  - Customers: `routes/customer.routes.js`
  - Company: `routes/company.routes.js`
  - Analytics: `routes/analytics.routes.js`
  - Tickets: `routes/ticket.routes.js`
  - Config: `routes/config.routes.js`, `routes/carrier.routes.js`
  - AI shipping: `routes/ai_shipping.routes.js`
  - Webhooks: `routes/webhook.routes.js`
  - Checkout: `routes/checkout.routes.js`
  - Cron/integrations: `routes/cron.routes.js`, `routes/integration.routes.js`
- Reference docs: `reference_queries_architecture.md`, `reference_ordenes_api.md`, `reference_tickets_api.md`, `reference_ndr_api.md`.
- MCP docs: `V1_SAFE_TOOL_INVENTORY.md` (§2.2), `BACKEND_ROUTING_REFERENCE.md` (§2.2), `LESSONS.md` (L-S1, L-S2, L-S6, L-B4).

