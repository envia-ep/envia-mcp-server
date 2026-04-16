# Fases 6-12: Guía de Preparación para Sesiones de Implementación

> **Propósito:** Este documento compila toda la información necesaria para que un agente pueda verificar APIs y generar prompts de implementación para las 7 fases restantes del MCP server.

## Estado Actual

- **90 tools** implementados (Fases 0-10 + Fase 8 completas)
- **1202 tests**, build limpio
- **Patrón establecido:** types → service → tools → barrel → register → tests
- **Token de prueba (sandbox):** `ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3`
- **Base URL sandbox:** `https://queries-test.envia.com`
- **Base URL carriers:** `https://api-test.envia.com`

## Fases completadas

| Fase | Tools | Estado |
|------|-------|--------|
| 0-5 | 57 | ✅ Completa |
| 6 (Config/Webhooks) | +13 = 70 | ✅ Completa |
| 7 (Analytics) | +5 = 75 | ✅ Completa |
| 9 (Notificaciones) | +3 = 78 | ✅ Completa (junto con Fase 7) |
| 10 (Productos+Billing) | +4 = 82 | ✅ Completa |
| **8 (Carriers Avanzados)** | **+8 = 90** | **✅ Completa** |

## Decisiones tomadas sobre Fase 11 (AI Shipping)

**Verificado 2026-04-16 contra código fuente (services/queries/).**

- `POST /ai/shipping/rate` → **DIFERIR** — funciona en sandbox, genuinamente útil (multi-carrier + cheapest). Implementar junto con parse-address cuando esté deployado.
- `POST /ai/shipping/parse-address` → **DIFERIR** — único, no tiene equivalente. Commit Apr 13 2026, aún 404 en sandbox (pending deploy). Implementar cuando esté en sandbox.
- `POST /ai/shipping/generate/track/cancel` → **SKIP PERMANENTE** — dependencia circular (queries → MCP server nuestro). No tiene sentido en el contexto del MCP.
- `GET /ai/shipping/address-requirements/{country}` → **SKIP** — ECONNREFUSED, MCP sidecar no corre en sandbox.
- `POST /ai/shipping/rate-stream` → **SKIP** — SSE incompatible con MCP response pattern.
- `POST /ai/shipping/transcribe-audio` → **SKIP** — multipart complejo, bajo valor en MCP.

**Cuando parse-address esté deployado:** implementar `envia_ai_rate` + `envia_ai_parse_address` como mini-batch de 2 tools.

## Proceso para cada fase

1. **Verificar cada endpoint** con curl usando el token de prueba
2. **Documentar respuestas reales** — fields exactos, tipos, nulls
3. **Identificar diferencias** vs plan original (MCP_EXPANSION_PLAN.md)
4. **Crear `reference_{domain}_api.md`** en memoria con contratos verificados
5. **Crear `MCP_FASE{N}_{DOMAIN}_PROMPT.md`** auto-contenido para Sonnet
6. **Implementar** en sesión separada con Sonnet

## Lecciones aprendidas de fases anteriores

- **Siempre verificar antes de implementar** — Fase 3 y 4 tuvieron múltiples diferencias vs plan
- **Respuestas pueden ser raw arrays** — Branches (Fase 5) no usaba `{ data: [...] }`
- **Algunos endpoints están rotos en sandbox** — Documentar workarounds (Fase 4 list tickets)
- **Campos stringified** — `rules` en tickets es JSON como string, no objeto
- **Rating one-time vs upsert** — Verificar comportamiento real, no asumir del código
- **Incluir verificación checklist** en cada prompt — el agente Sonnet necesita saber qué validar

---

## FASE 6: Configuración + Empresa (~10-12 tools)

### Endpoints a verificar (queries service, Bearer auth)

| # | Endpoint | Method | Propósito para MCP |
|---|----------|--------|--------------------|
| 1 | `/company-info` | GET | Info de empresa (nombre, plan, balance, país, KYC) |
| 2 | `/company/users` | GET | Lista de usuarios del equipo |
| 3 | `/company/shops` | GET | Tiendas ecommerce conectadas |
| 4 | `/carrier-company/config` | GET | Config de carriers de la empresa |
| 5 | `/checkout-rules` | GET | Reglas de checkout |
| 6 | `/checkout-rules` | POST | Crear regla checkout |
| 7 | `/checkout-rules/{id}` | PUT | Actualizar regla |
| 8 | `/checkout-rules/{id}` | DELETE | Eliminar regla |
| 9 | `/config/notification` | GET | Config de notificaciones |
| 10 | `/config/{shop_id}/shipping-rules` | GET | Reglas de envío |
| 11 | `/get-api-tokens` | GET | Tokens API activos |
| 12 | `/webhooks` | GET | Lista webhooks configurados |
| 13 | `/webhooks` | POST | Crear webhook |
| 14 | `/webhooks/{id}` | PUT | Actualizar webhook |
| 15 | `/webhooks/{id}` | DELETE | Eliminar webhook |

### curl de verificación sugeridos

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
BASE="https://queries-test.envia.com"

# Empresa
curl -s "$BASE/company-info" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -50
curl -s "$BASE/company/users" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/company/shops" -H "Authorization: Bearer $TOKEN" | head -500

# Carrier config
curl -s "$BASE/carrier-company/config?limit=5" -H "Authorization: Bearer $TOKEN" | head -500

# Checkout rules
curl -s "$BASE/checkout-rules?limit=5" -H "Authorization: Bearer $TOKEN" | head -500

# Notifications config
curl -s "$BASE/config/notification" -H "Authorization: Bearer $TOKEN" | head -500

# Shipping rules (necesita shop_id - obtener de /company/shops primero)
# curl -s "$BASE/config/{SHOP_ID}/shipping-rules" -H "Authorization: Bearer $TOKEN" | head -500

# API tokens
curl -s "$BASE/get-api-tokens?limit=5" -H "Authorization: Bearer $TOKEN" | head -500

# Webhooks
curl -s "$BASE/webhooks?limit=5" -H "Authorization: Bearer $TOKEN" | head -500
```

### Decisiones de scope para MCP

- **company-info**: Read-only (no update — demasiado sensible)
- **company/users**: Read-only (no invite/delete — operación admin)
- **checkout-rules**: Full CRUD — los agentes deben poder gestionar reglas
- **webhooks**: Full CRUD — gestión de integraciones
- **API tokens**: Read-only (listar, no crear/eliminar — seguridad)
- **shipping-rules**: Read-only (listar, no modificar — complejidad alta)

### Tools recomendados (~10)

1. `envia_get_company_info` — GET /company-info
2. `envia_list_company_users` — GET /company/users
3. `envia_list_company_shops` — GET /company/shops
4. `envia_get_carrier_config` — GET /carrier-company/config
5. `envia_list_checkout_rules` — GET /checkout-rules
6. `envia_create_checkout_rule` — POST /checkout-rules
7. `envia_update_checkout_rule` — PUT /checkout-rules/{id}
8. `envia_delete_checkout_rule` — DELETE /checkout-rules/{id}
9. `envia_list_webhooks` — GET /webhooks
10. `envia_manage_webhook` — POST/PUT/DELETE /webhooks (CRUD combinado o separado)

---

## FASE 7: Analytics (~5 tools)

### Endpoints a verificar

| # | Endpoint | Method | Propósito |
|---|----------|--------|-----------|
| 1 | `/analytics/get-monthly-analytics-data` | GET | Data mensual de carriers |
| 2 | `/analytics/carriers-stats` | GET | Comparación de carriers |
| 3 | `/analytics/packages-module` | GET | Volumen de paquetes |
| 4 | `/analytics/issues-module` | GET | Issues/excepciones |
| 5 | `/analytics/origin-destination-stats` | GET | Rutas más usadas |
| 6 | `/reports/dashboard/main-data/{start}/{end}` | GET | KPIs dashboard |
| 7 | `/reports/dashboard/guides-per-status/{start}/{end}` | GET | Envíos por estado |

### curl de verificación

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
BASE="https://queries-test.envia.com"

curl -s "$BASE/analytics/get-monthly-analytics-data?sDate=2026-01-01&eDate=2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/analytics/carriers-stats?sDate=2026-01-01&eDate=2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/analytics/packages-module?sDate=2026-01-01&eDate=2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/analytics/issues-module?sDate=2026-01-01&eDate=2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/analytics/origin-destination-stats?sDate=2026-01-01&eDate=2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/reports/dashboard/main-data/2026-01-01/2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/reports/dashboard/guides-per-status/2026-01-01/2026-04-15" -H "Authorization: Bearer $TOKEN" | head -500
```

### Tools recomendados (~5)

1. `envia_get_dashboard_kpis` — Dashboard main data
2. `envia_get_monthly_analytics` — Monthly carrier analytics
3. `envia_get_carriers_stats` — Carrier comparison
4. `envia_get_shipment_analytics` — Packages + issues modules combined
5. `envia_get_route_stats` — Origin-destination analysis

---

## FASE 8: Carriers Avanzados (~8 tools)

> **✅ Verificada 2026-04-16** — Endpoints probados contra sandbox real. Prompt listo: `.claude/prompts/MCP_FASE8_CARRIERS_AVANZADOS_PROMPT.md`

### Resumen de verificación

| Tool | Endpoint | Sandbox | Nota crítica |
|------|----------|---------|--------------|
| `envia_generate_manifest` | POST /ship/manifest | ✅ FUNCIONA | Solo `trackingNumbers[]`, NO carrier en body. Status_id=1 requerido. |
| `envia_generate_bill_of_lading` | POST /ship/billoflading | ✅ FUNCIONA | `packages[].declaredValue` requerido (PHP runtime, no en schema) |
| `envia_locate_city` | POST /locate | ✅ FUNCIONA (CO) | Público — sin Authorization. Solo Colombia. |
| `envia_cancel_pickup` | POST /ship/pickupcancel | ✅ Schema pasa | Ruta `/ship/pickupcancel` (wildcard). `confirmation` es STRING. `locale` int requerido. |
| `envia_track_authenticated` | POST /ship/track | ❌ ROTO sandbox | PHP bug Track.php:33. Tests deben mockear. Funciona en prod. |
| `envia_submit_nd_report` | POST /ship/ndreport | ⚠️ Schema pasa | Necesita shipment en estado NDR. Tests deben mockear. |
| `envia_track_pickup` | POST /ship/pickuptrack | ⚠️ Schema pasa | Ruta `/ship/pickuptrack` (wildcard). `confirmation` es ARRAY. `locale` requerido. |
| `envia_generate_complement` | POST /ship/complement | ✅ Schema pasa | Body es **ARRAY** top-level. No todos los carriers lo soportan (MX SAT). |

### Hallazgos clave de la verificación

- **Rutas pickup:** `/ship/pickuptrack` y `/ship/pickupcancel` (wildcard `/ship/{action}`) — **NO** `/ship/pickup`
- **cancelPickup.v1.schema:** `confirmation` es STRING (no array), `locale` integer requerido
- **pickuptrack.v1.schema:** `confirmation` es ARRAY, `locale` integer (PHP runtime, no en schema pero requerido)
- **billoflading:** `packages[].declaredValue` es requerido por `BOLPackage.php:25` aunque no está en JSON schema
- **manifest response:** `{meta:"manifest", data:{company:string, carriers:{[name]:url_pdf}}}`
- **billoflading response:** `{meta:"billoflading", data:{carrier, trackingNumber, billOfLading:url_pdf}}`
- **locate response:** raw `{city:"11001000", name:"BOGOTA", state:"DC"}` — sin meta wrapper
- **complement:** array body confirmado. Retorna "Carrier X doesn't have complement" para carriers sin soporte SAT.

### Respuestas reales verificadas

```json
// manifest (✅ real)
{ "meta": "manifest", "data": { "company": "Fedma CO", "carriers": { "estafeta": "https://...pdf", "dhl": "https://...pdf" } } }

// billoflading (✅ real)
{ "meta": "billoflading", "data": { "carrier": "paquetexpress", "trackingNumber": "141168417447", "billOfLading": "https://...pdf" } }

// locate (✅ real, CO only)
{ "city": "11001000", "name": "BOGOTA", "state": "DC" }

// pickupcancel (✅ schema pasa)
{ "meta": "error", "error": { "code": 1115, "description": "Invalid Option", "message": "Pickup not found" } }
```

---

## FASE 9: Notificaciones (~4 tools)

### Endpoints a verificar

| # | Endpoint | Method | Propósito |
|---|----------|--------|-----------|
| 1 | `/notifications/prices` | GET | Precios de notificaciones por país |
| 2 | `/company/notifications` | GET | Notificaciones de la empresa |
| 3 | `/notifications/webhook/test` | POST | Test de webhook |
| 4 | `/company-notifications` | GET | Notificaciones configuradas |

### curl de verificación

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
BASE="https://queries-test.envia.com"

curl -s "$BASE/notifications/prices" -H "Authorization: Bearer $TOKEN" | head -300
curl -s "$BASE/company/notifications?limit=5" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/company-notifications?limit=5" -H "Authorization: Bearer $TOKEN" | head -500
```

### Notas

- `/notifications/whatsapp` requiere template válido — puede no funcionar en sandbox
- Webhook test requiere shipment real + webhook configurado
- Scope limitado: solo read + test, no envío real de notificaciones

### Tools recomendados (~4)

1. `envia_get_notification_prices` — GET /notifications/prices
2. `envia_list_notifications` — GET /company/notifications
3. `envia_test_webhook` — POST /notifications/webhook/test
4. `envia_list_notification_config` — GET /company-notifications

---

## FASE 10: Productos + DCe + Billing (~6 tools)

### Endpoints a verificar

| # | Endpoint | Method | Propósito |
|---|----------|--------|-----------|
| 1 | `/products?limit=5` | GET | Lista productos |
| 2 | `/products/envia/{id}` | GET | Detalle producto |
| 3 | `/products/count` | GET | Conteo productos |
| 4 | `/billing-information` | GET | Info facturación |
| 5 | `/billing-information/check` | GET | ¿Tiene info de facturación? |
| 6 | `/company/credit-info` | GET | Info de crédito |
| 7 | `/company/recharge-history?limit=5` | GET | Historial recargas |
| 8 | `/dce/status` | GET | Estado DCe Brasil |

### curl de verificación

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
BASE="https://queries-test.envia.com"

curl -s "$BASE/products?limit=3" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/products/count" -H "Authorization: Bearer $TOKEN" | head -100
curl -s "$BASE/billing-information" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/billing-information/check" -H "Authorization: Bearer $TOKEN" | head -200
curl -s "$BASE/company/credit-info" -H "Authorization: Bearer $TOKEN" | head -200
curl -s "$BASE/company/recharge-history?limit=3" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/dce/status" -H "Authorization: Bearer $TOKEN" | head -200
```

### Tools recomendados (~6)

1. `envia_list_products` — GET /products
2. `envia_get_product_detail` — GET /products/envia/{id}
3. `envia_get_billing_info` — GET /billing-information
4. `envia_get_credit_info` — GET /company/credit-info
5. `envia_get_recharge_history` — GET /company/recharge-history
6. `envia_get_dce_status` — GET /dce/status

---

## FASE 11: AI Shipping (~4 tools)

### Endpoints a verificar

| # | Endpoint | Method | Propósito |
|---|----------|--------|-----------|
| 1 | `/ai/shipping/rate` | POST | Rate con NLP |
| 2 | `/ai/shipping/parse-address` | POST | Parsear dirección libre (texto/imagen) |
| 3 | `/ai/shipping/transcribe-audio` | POST | Audio → texto → dirección |
| 4 | `/ai/shipping/address-requirements/{country}` | GET | Campos requeridos por país |

### curl de verificación

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
BASE="https://queries-test.envia.com"

# Address requirements
curl -s "$BASE/ai/shipping/address-requirements/MX" -H "Authorization: Bearer $TOKEN" | head -500
curl -s "$BASE/ai/shipping/address-requirements/BR" -H "Authorization: Bearer $TOKEN" | head -500

# Parse address (text)
curl -s -X POST "$BASE/ai/shipping/parse-address" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Juan Pérez, Av Insurgentes Sur 1458, Col Del Valle, Benito Juárez, CDMX, 03100, México","country":"MX"}' | head -500

# Rate with NLP
curl -s -X POST "$BASE/ai/shipping/rate" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"origin_zip":"64000","destination_zip":"03100","weight":2,"origin_country":"MX","destination_country":"MX","carriers":["dhl","fedex"]}' | head -1000
```

### Notas

- AI shipping puede requerir OpenAI API key configurada en el backend
- Parse address soporta texto E imagen (multipart)
- Transcribe audio requiere archivo webm
- Estos son los tools más diferenciadores vs competencia

### Tools recomendados (~4)

1. `envia_ai_rate` — POST /ai/shipping/rate (rate con NLP simplificado)
2. `envia_ai_parse_address` — POST /ai/shipping/parse-address
3. `envia_ai_address_requirements` — GET /ai/shipping/address-requirements/{country}
4. `envia_ai_transcribe_audio` — POST /ai/shipping/transcribe-audio (si es factible)

---

## FASE 12: Drafts / Carga Masiva (~5 tools)

### Endpoints a verificar

| # | Endpoint | Method | Propósito |
|---|----------|--------|-----------|
| 1 | `/drafts/files` | GET | Lista de archivos draft subidos |
| 2 | `/drafts/{id}` | GET | Contenido de un draft |
| 3 | `/drafts/upload/shipments` | POST | Subir Excel con envíos |
| 4 | `/drafts/actions/{id}` | POST | Ejecutar quote/generate en batch |
| 5 | `/drafts/download/{id}` | POST | Descargar Excel |

### curl de verificación

```bash
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
BASE="https://queries-test.envia.com"

curl -s "$BASE/drafts/files?limit=5" -H "Authorization: Bearer $TOKEN" | head -500
```

### Notas

- Upload requiere multipart/form-data con archivo .xlsx
- Actions es asincrónico (encola en Bull queue)
- Download retorna binary Excel
- Puede no funcionar en sandbox si no hay drafts previos

### Tools recomendados (~5)

1. `envia_list_drafts` — GET /drafts/files
2. `envia_get_draft_detail` — GET /drafts/{id}
3. `envia_upload_draft` — POST /drafts/upload/shipments (si multipart es factible)
4. `envia_execute_draft` — POST /drafts/actions/{id}
5. `envia_download_draft` — POST /drafts/download/{id}

---

## Resumen de esfuerzo por fase

| Fase | Tools | Complejidad | Endpoints a verificar | Estimación |
|------|-------|-------------|----------------------|------------|
| 6 | 10 | Alta (CRUD) | 15 | 1 sesión verificación + 1 implementación |
| 7 | 5 | Media (GET) | 7 | 1 sesión combinada |
| 8 | 8 | Alta (POST carriers) | 8 | 1 sesión verificación + 1 implementación |
| 9 | 4 | Baja (GET) | 4 | 1 sesión combinada |
| 10 | 6 | Media (GET) | 8 | 1 sesión combinada |
| 11 | 4 | Alta (AI/NLP) | 4 | 1 sesión combinada |
| 12 | 5 | Alta (multipart) | 5 | 1 sesión combinada |
| **Total** | **42** | | **51** | **~5-7 sesiones** |

## Orden recomendado de implementación

1. **Fase 7 (Analytics) + Fase 9 (Notificaciones)** — 9 tools, todos GET, rápido
2. **Fase 6 (Config)** — 10 tools, incluye CRUD, más complejo
3. **Fase 10 (Productos + Billing)** — 6 tools, todos GET, rápido
4. **Fase 11 (AI Shipping)** — 4 tools, diferenciador, puede requerir config especial
5. **Fase 8 (Carriers Avanzados)** — 8 tools, requiere shipments en estados específicos
6. **Fase 12 (Drafts)** — 5 tools, multipart/async, más complejo

Este orden maximiza velocidad (fases simples primero) y valor (analytics + config son los más pedidos por usuarios).
