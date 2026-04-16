# Inventario de Tools MCP — Validado contra V1 en producción

**Fecha:** 2026-04-16
**Criterio:** Source of truth = V1 en producción (shipping.envia.com + ship-test.envia.com). V2 es referencia aspiracional pero NO autoridad.

**Leyenda:**
- 🟢 **V1-SAFE:** Endpoint verificado en V1, respuesta funcional. Tool listo para el agente del portal.
- 🟡 **V1-PARTIAL:** Endpoint existe en V1 pero con limitaciones conocidas (respuesta incompleta, bug en sandbox, etc.). Usable con workarounds.
- 🔵 **V1-EXISTS-HIDDEN:** Endpoint backend existe en V1 pero no hay UI user-facing. Decisión case-by-case.
- 🟠 **V2-ONLY-BACKEND-REAL:** Nueva UI en V2, backend subyacente sí existe y funciona. Puede incluirse si queremos aspirar a paridad.
- 🔴 **V2-ONLY-MOCK:** V2 frontend tiene mock data, backend no listo. DESCARTAR.
- ⚫ **ADMIN-ONLY:** Existe pero NO es user-facing típico (admin/SRE/onboarding). Descartar para agente de portal.
- 🟣 **INTERNAL-HELPER:** El agente lo usa internamente para construir respuestas, NO se expone al LLM.

---

## Tools MCP actuales (90) — clasificación

### 🎯 Flujo Core: Cotizar + Generar

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_quote_shipment` | 🟢 V1-SAFE | POST /ship/rate verified. Flagship tool. |
| `envia_create_label` | 🟢 V1-SAFE | POST /ship/generate verified. Multimode manual+ecommerce bien. |
| `envia_validate_address` | 🟢 V1-SAFE | GET /zipcode verified. Usado antes de rate. |
| `envia_list_carriers` | 🟢 V1-SAFE | GET /available-carrier verified. V1 lo usa en carrier dropdown. |
| `envia_list_additional_services` | 🟢 V1-SAFE | GET /available-service verified. V1 lo expone en "Ver más servicios adicionales". |
| `envia_classify_hscode` | 🟢 V1-SAFE | POST /utils/classify-hscode. V1 Productos lo usa para HS code editable. |
| `envia_create_commercial_invoice` | 🟡 V1-PARTIAL | Existe pero **se genera automático en generate para carriers intl**. Usuario promedio NO lo pide. Candidato a 🟣 INTERNAL. |

### 📦 Flujo Core: Mis Envíos (consulta)

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_list_shipments` | 🟢 V1-SAFE | GET /shipments verified. Pantalla principal de V1. |
| `envia_get_shipment_detail` | 🟢 V1-SAFE | GET /guide/{tracking} verified. Side panel V1. |
| `envia_get_shipments_status` | 🟢 V1-SAFE | GET /shipments-status verified. V1 cards en Dashboard. |
| `envia_get_shipments_cod` | 🟢 V1-SAFE | GET /shipments/cod verified. Sección COD V1. |
| `envia_get_cod_counters` | 🟢 V1-SAFE | GET /shipments/cod/count verified. |
| `envia_get_shipments_surcharges` | 🟢 V1-SAFE | GET /shipments/surcharges verified. V1 Sobrecargos. |
| `envia_get_shipments_ndr` | 🟡 V1-PARTIAL | Backend `type` param broken en sandbox (422). Mencionado en reference_ndr_api.md. Tool usa client-side filter como workaround. |
| `envia_get_shipment_invoices` | 🟢 V1-SAFE | GET /shipments/invoices verified. |

### 🚀 Flujo Core: Tracking + Cancel + Pickup

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_track_package` | 🟢 V1-SAFE | POST /ship/generaltrack (público) verified. Usado para tracking de usuario. |
| `envia_get_shipment_history` | 🟢 V1-SAFE | GET /guide/{month}/{year} verified. |
| `envia_cancel_shipment` | 🟢 V1-SAFE | POST /ship/cancel verified. ⚠️ **Respuesta necesita enriquecerse**: no reporta monto reembolsado ni si excedió límite diario (plan V2 §2). |
| `envia_schedule_pickup` | 🟢 V1-SAFE | POST /ship/pickup verified. V1 "Solicitar Recolección". |
| `envia_track_authenticated` | 🔴 **DROP** | **Duplicado funcional de track_package**. Confunde al agente. Sandbox rota (Track.php:33). El agente NO debe tener esta ambigüedad. |
| `envia_track_pickup` | 🟡 V1-PARTIAL | POST /ship/pickuptrack. Sandbox devuelve "company_id on null" sin confirmation real. En prod funciona. |
| `envia_cancel_pickup` | 🟢 V1-SAFE | POST /ship/pickupcancel. Schema validado (confirmation string + locale int). |

### 📋 Flujo Core: Tickets de soporte

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_list_tickets` | 🟡 V1-PARTIAL | reference_tickets_api.md: **list endpoint broken en sandbox**, funciona en prod. |
| `envia_get_ticket_detail` | 🟢 V1-SAFE | |
| `envia_get_ticket_comments` | 🟢 V1-SAFE | |
| `envia_create_ticket` | 🟢 V1-SAFE | Valida duplicados por shipment_id + type_id. |
| `envia_add_ticket_comment` | 🟢 V1-SAFE | |
| `envia_rate_ticket` | 🟢 V1-SAFE | One-time rating (no upsert), plan V2 documentó. |
| `envia_get_ticket_types` | 🟢 V1-SAFE | |

### 🛒 Flujo Core: Órdenes Ecommerce

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_list_orders` | 🟡 V1-PARTIAL | GET /v4/orders verified. **Pierde 11 campos críticos V4** (fulfillment_status_id, cod_active/value por paquete, HS codes, country_code_origin, fulfillment_info, fraud_risk, partial_available, order_comment, assigned_package, return_reason) — ampliar respuesta. |
| `envia_get_orders_count` | 🟢 V1-SAFE | GET /v2/orders-count verified. V1 cards usan este. |
| `envia_list_shops` | 🟢 V1-SAFE | GET /company/shops verified. |
| `envia_get_ecommerce_order` | 🟡 V1-PARTIAL | Mismos 11 campos V4 faltantes. |
| `envia_update_order_address` | 🟢 V1-SAFE | PUT /orders/{shop_id}/{order_id}/address verified reference_ordenes_api.md. |
| `envia_update_order_packages` | 🟢 V1-SAFE | V1 Modificar paquete. |
| `envia_select_order_service` | 🟢 V1-SAFE | V1 Cotizar → seleccionar servicio. |
| `envia_fulfill_order` | 🟢 V1-SAFE | POST /orders/{shop}/{id}/fulfillment/order-shipments verified. V1 fulfill flow. ⚠️ Irreversible — advertir en descripción. |
| `envia_get_order_filter_options` | 🟢 V1-SAFE | V1 filtros avanzados. |
| `envia_manage_order_tags` | 🟢 V1-SAFE | V1 columna Etiquetas (feature NUEVA pero backend funcional). |
| `envia_generate_packing_slip` | 🟢 V1-SAFE | V1 "Descargar > Packing slip". |
| `envia_generate_picking_list` | 🟢 V1-SAFE | V1 "Descargar > Picking list". |
| `envia_get_orders_analytics` | 🟢 V1-SAFE | GET /orders/orders-information-by-status. |

### 📍 Direcciones / Paquetes / Clientes

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_list_addresses` | 🟢 V1-SAFE | V1 /settings/addresses. |
| `envia_create_address` | 🟡 V1-PARTIAL | **No valida generic-form** del país — guarda direcciones inválidas que rompen rate después. |
| `envia_update_address` | 🟡 V1-PARTIAL | Mismo issue generic-form. |
| `envia_delete_address` | 🟢 V1-SAFE | V1 valida no-favorita-de-shop. |
| `envia_set_default_address` | 🟢 V1-SAFE | |
| `envia_get_default_address` | 🟢 V1-SAFE | |
| `envia_list_packages` | 🟢 V1-SAFE | V1 /settings/packages. |
| `envia_create_package` | 🟢 V1-SAFE | |
| `envia_delete_package` | 🟢 V1-SAFE | |
| `envia_list_clients` | 🟢 V1-SAFE | reference_clients_api.md verified. |
| `envia_get_client_detail` | 🟢 V1-SAFE | |
| `envia_create_client` | 🟡 V1-PARTIAL | Mismo issue generic-form. |
| `envia_update_client` | 🟡 V1-PARTIAL | Mismo issue generic-form. |
| `envia_delete_client` | 🟢 V1-SAFE | |
| `envia_get_clients_summary` | 🟢 V1-SAFE | |

### 🏢 Empresa / Configuración / Carriers (Settings V1)

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_list_company_users` | 🟢 V1-SAFE | V1 /settings/users. |
| `envia_list_company_shops` | 🟢 V1-SAFE | |
| `envia_get_carrier_config` | 🟢 V1-SAFE | V1 /settings/carriers (página de config de paqueterías, la más importante). |
| `envia_get_notification_settings` | 🟢 V1-SAFE | |
| `envia_list_api_tokens` | 🟢 V1-SAFE | V1 /settings/developers. |
| `envia_list_webhooks` | 🟢 V1-SAFE | V1 /settings/developers. |
| `envia_create_webhook` | ⚫ ADMIN-ONLY | Dev task, 1-time setup. Descartar para agente. |
| `envia_update_webhook` | ⚫ ADMIN-ONLY | Ídem. |
| `envia_delete_webhook` | ⚫ ADMIN-ONLY | Ídem. |
| `envia_list_checkout_rules` | 🔵 V1-EXISTS-HIDDEN | Backend existe, **sin UI en V1 ni V2** (reference_v1_backend_capabilities). Solo B2B/integraciones. **Descartar** del agente. |
| `envia_create_checkout_rule` | 🔵 → DROP | Mismo razonamiento. |
| `envia_update_checkout_rule` | 🔵 → DROP | Mismo razonamiento. |
| `envia_delete_checkout_rule` | 🔵 → DROP | Mismo razonamiento. |

### 📊 Analytics

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_get_monthly_analytics` | 🟢 V1-SAFE | GET /analytics/get-monthly-analytics-data. V1 dashboard usa. |
| `envia_get_carriers_stats` | 🟢 V1-SAFE | GET /analytics/carriers-stats. V1 carrier comparison. |
| `envia_get_packages_module` | 🟢 V1-SAFE | GET /analytics/packages-module. V1 volumen por paquete. |
| `envia_get_issues_analytics` | 🟢 V1-SAFE | GET /analytics/issues-module. V1 incidencias. |
| `envia_get_shipments_by_status` | 🟢 V1-SAFE | GET /reports/dashboard/guides-per-status. V1 reportes. |

### 🔔 Notificaciones (Buyer Experience)

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_get_notification_prices` | 🟢 V1-SAFE | GET /notifications/prices. |
| `envia_list_notifications` | 🟢 V1-SAFE | GET /company/notifications. |
| `envia_get_notification_config` | 🟢 V1-SAFE | GET /config/notification. |

### 🏷️ Productos + Billing + DCe

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_list_products` | 🟢 V1-SAFE | V1 /products (964 productos activos). |
| `envia_get_billing_info` | 🟢 V1-SAFE | V1 Mi Compañía > Facturación. |
| `envia_check_billing_info` | 🟢 V1-SAFE | |
| `envia_get_dce_status` | 🟢 V1-SAFE | V1 BR-specific. |

### 📜 Carriers avanzados (Manifest, BOL, NDR, Complement, Locate)

| Tool | V1 Status | Notas |
|------|-----------|-------|
| `envia_generate_manifest` | 🟢 V1-SAFE | V1 ecommerce "Descargar > Crear manifiesto". |
| `envia_generate_bill_of_lading` | 🟡 V1-PARTIAL | **Se genera automático en generate** para FedEx intl y UPS BR. Usuario promedio NO lo pide explícito. Mantener como 🟣 INTERNAL o para casos edge. |
| `envia_submit_nd_report` | 🟢 V1-SAFE | V1 "Con Incidencias" card tiene esto. |
| `envia_generate_complement` | 🟢 V1-SAFE | SAT MX carta porte complement. V1 BR-specific. |
| `envia_locate_city` | 🟣 **INTERNAL-HELPER** | Endpoint público Colombia DANE. El usuario NO lo pide como tal — el agente lo usa internamente para resolver "Bogotá" → DANE code. **No exponer como tool conversacional.** |

---

## Tools NUEVOS propuestos — validados contra V1

### 🟢 V1-SAFE (agregar a v1 del agente del portal)

| Tool | Razón | Endpoint V1 verified |
|------|-------|---------------------|
| `envia_get_company_info` | V1 Mi Compañía page (info, plan, balance, KYC, intl toggle, credit, insurance) | GET /company-info ✅ verificado queries:company.routes.js:670 |
| `envia_get_my_salesman` | V1 tiene agente asignado (aunque no page dedicada, sí es info del usuario) | `companyUtils.getPrimaryAgentInfo(company_id)` retorna `{name, phone, lada}` ✅ verificado about_yourself_v2_controller.js:419 |
| `envia_get_balance_info` | V1 Mi Compañía muestra saldo, plan, crédito | GET /company/credit-info ✅ verificado queries:company.routes.js:1199 |
| `envia_ai_parse_address` | **Deployado en sandbox** (antes 404, ahora 400 por payload). Diferenciador conversacional fuerte. | POST /ai/shipping/parse-address ✅ |
| `envia_ai_rate` | Rate multi-carrier con NLP. Complementa ai_parse_address. | POST /ai/shipping/rate (existía antes, confirmado funcional) |

### 🟣 INTERNAL-HELPERS (el agente los usa internamente, NO se exponen al LLM)

| Helper | Usado para | Reemplaza lógica incompleta en |
|--------|------------|-------------------------------|
| `getAddressRequirements` | Decidir items[] obligatorios al armar rate/generate. Reemplaza tax-rules.ts replicado. | `src/services/tax-rules.ts` |
| `checkCarrierCoverage` | Validar que el carrier cubra la ruta antes de cotizar. | Nuevo |
| `resolveDaneCode` | "Bogotá" → "11001000" automático para CO. | `src/utils/address-resolver.ts` parcial |
| `getCarrierConstraints` | Conocer límites por carrier (COD max, insurance caps, volumetric factor, address format) antes de armar request. | Nuevo — CRÍTICO |
| `getBrazilIcms` | Incluir tasa ICMS en quotes BR. | Nuevo |
| `fulfillmentSync` | Cerrar loop con ecommerce después de create_label. | Nuevo — puede ser side-effect automático del create_label, no tool separado. |

**Nota crítica:** Estos helpers NO deben aparecer en la lista de tools disponibles al agente LLM. Deben ser funciones internas que el MCP usa dentro de `envia_quote_shipment`, `envia_create_label`, etc. Si el agente LLM los ve, los llamará innecesariamente y confundirá al usuario.

### 🟠 V2-ONLY con backend real (decisión case-by-case)

| Tool potencial | Estado V2 | Backend V1 | Recomendación para v1 del agente |
|----------------|-----------|-----------|--------------------------------|
| Shipping Rules CRUD | ✅ Implementado Fase 1 (12 files, real APIs) | ✅ /config/{shop_id}/shipping-rules existe | **DIFERIR a v2 del agente** — configuración compleja, mejor UI |
| WhatsApp COD config | ✅ Fase 1 (toggle real, analytics mock) | ✅ Backend real | **INCLUIR solo toggle** (`envia_toggle_whatsapp_cod`), NO analytics |
| Buyer Experience editors | ⚠️ Form-based (no Unlayer) | ✅ /config/tracking/page, /config/shipment/email | **DIFERIR** — UI-intensive |
| Carrier Intelligence | ✅ 11 files, real API + frontend calc | ✅ packages-module usado | Los 5 tools de analytics cubren la info. **Ya están.** |
| Returns Portal | ⏳ Ready pero no implementado | ✅ Sin nuevo backend | **DIFERIR** hasta que el portal lo tenga |

### 🔴 V2-ONLY mock o no confirmado (DESCARTAR)

Ningún tool propuesto cae aquí — los hallazgos del reality check sobre "fulfillment_status_id mapping", "V4 campos perdidos", etc. son todos V1-verified, solo que el MCP los ignora.

### ⚫ ADMIN-ONLY (descartar para agente del portal)

- `envia_create_webhook` / `envia_update_webhook` / `envia_delete_webhook` — dev task
- `envia_create_checkout_rule` / `envia_update_checkout_rule` / `envia_delete_checkout_rule` — sin UI en V1 ni V2
- HTTP multi-tenant auth layer del audit previo — no aplica (agente vive dentro del portal, hereda auth)
- Todo el inventario accounts para multi-tenant (switch_company, list_my_companies como tools expuestos) — no es necesario si el agente vive en la sesión del usuario logueado
- Validación HMAC de webhooks, KYC/KYB submissions — onboarding/admin
- Drafts bulk upload — power user

---

## Resumen cuantitativo

| Categoría | Count | % |
|-----------|-------|---|
| 🟢 V1-SAFE (mantener as-is) | 54 | 60% |
| 🟡 V1-PARTIAL (mantener + enriquecer respuesta) | 14 | 15% |
| 🔴 DROP (drop del MCP) | 1 (`track_authenticated`) | 1% |
| 🔵/⚫ ADMIN/HIDDEN (drop del agente, mantener en MCP técnico) | 7 (webhook CRUD ×3, checkout rules ×4) | 8% |
| 🟣 Reclasificar como INTERNAL-HELPER | 2 (`locate_city`, `create_commercial_invoice`) | 2% |
| **Tools NUEVOS a agregar (V1-safe)** | **+5** | |

**V1 inicial del agente del portal: 68 tools user-facing + 6 helpers internos = 74 tools totales** (vs 90 actuales).

**Diferencial:**
- **-1** drop: track_authenticated
- **-7** quitar del agente (mantener en MCP técnico o eliminar): webhook CRUD + checkout rules CRUD
- **-2** reclassificar internal: locate_city + create_commercial_invoice
- **+5** agregar V1-safe: company_info, salesman, balance_info, ai_parse_address, ai_rate
- **+6** helpers internos (no expuestos al LLM)

---

## Flujos del usuario cubiertos (y no cubiertos)

### ✅ 100% cubierto en v1 del agente
- Cotizar / generar etiqueta (con ampliación ecommerce)
- Consultar mis envíos, últimos envíos, reportes, filtros
- Tracking de un envío o todos
- Cancelar envío (con monto reembolsado)
- Programar recolección
- Gestionar tickets de soporte (abrir, comentar, calificar, consultar)
- Órdenes ecommerce (listar, cumplir, cotizar, editar)
- Mis direcciones, paquetes, clientes, productos
- Mi empresa, usuarios, saldo, salesman, plan, KYC
- Analytics (mensual, por carrier, sobrecargos, incidencias)
- Carriers activos / configurados
- Notificaciones configuradas y precios
- DCe Brasil (estado)

### ⚠️ Parcialmente cubierto (requiere ampliación de respuesta)
- Órdenes ecommerce: campos V4 críticos perdidos
- Cancelar: no reporta monto reembolsado
- Direcciones/clientes: crea sin validar generic-form

### ❌ NO cubierto en v1 (esperar V2 maduro)
- Editar Shipping Rules conversacionalmente
- Editar Tracking Page / Email Templates
- Returns Portal operations
- Bulk draft upload (Excel)

### 🚫 Decidido NO cubrir
- Crear/editar/eliminar webhooks (dev task)
- Checkout rules CRUD (no UI V1 ni V2)
- Multi-tenant HTTP auth operations (no aplica)
- KYC/KYB submissions (onboarding)

---

## Implicaciones para el Sprint 0 revisado

Con este scope, Sprint 0 se simplifica y enfoca:

1. **Drop `envia_track_authenticated`** — conflicto de nomenclatura con track_package.
2. **Reclassificar como INTERNAL:** locate_city, create_commercial_invoice.
3. **Mover a MCP técnico (fuera del agente LLM):** webhook CRUD, checkout rules CRUD (7 tools).
4. **Agregar 5 tools V1-safe nuevos:** company_info, my_salesman, balance_info, ai_parse_address, ai_rate.
5. **Ampliar respuesta de 14 tools V1-PARTIAL** — especialmente list_orders y get_ecommerce_order (11 campos V4).
6. **Construir 6 helpers internos** — NO exponerlos al LLM, usarlos dentro de quote/create/etc.
7. **Error map a 15+ códigos** con mensajes accionables.
8. **Ampliar cancel response** — monto reembolsado + razón.
9. **Generic-form en create-address/update-address/create-client/update-client** — evitar datos inválidos.

**Efecto neto:** el agente tiene **menos tools visibles (74 vs 90)** pero **cada tool es 100% V1-safe y tiene respuesta completa equivalente a lo que el usuario vería en la UI**. Los 6 helpers internos hacen el trabajo pesado sin molestar al LLM con opciones.
