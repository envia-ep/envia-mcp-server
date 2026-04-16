# Auditoría V2 — Hallazgos Adicionales

## Segunda iteración: 32 hallazgos nuevos no cubiertos en V1

---

## 1. SCHEMAS JSON EXACTOS — Diferencias Rate vs Generate

### Generate requiere MUCHO más que Rate:

| Campo | Rate | Generate |
|-------|------|----------|
| `settings` | Opcional | **OBLIGATORIO** |
| `settings.printFormat` | No existe | **OBLIGATORIO** — enum: PDF, ZPL, ZPLII, PNG, EPL |
| `settings.printSize` | No existe | **OBLIGATORIO** — enum: 23 valores (PAPER_4X6, STOCK_4X6, etc.) |
| `shipment.service` | Opcional | **OBLIGATORIO** |
| `shipment.type` | Opcional | **OBLIGATORIO** (1=parcel, 2=LTL, 3=FTL) |
| `origin.name` | Opcional | **OBLIGATORIO** |
| `origin.street` | Opcional | **OBLIGATORIO** |
| `origin.number` | Opcional | **OBLIGATORIO** |
| `destination.name` | Opcional | **OBLIGATORIO** |
| `destination.street` | Opcional | **OBLIGATORIO** |
| `destination.number` | Opcional | **OBLIGATORIO** |

### Campos en schema que el plan NO documentaba:

- `shipment.orderReference` (string, opcional en generate) — número de orden para imprimir en etiqueta
- `shipment.trackingNumber` (string, opcional) — tracking existente (para reimprimir)
- `shipment.labelFile` (string, opcional) — contenido de etiqueta existente (MeLi)
- `settings.shopId` (number, opcional) — contexto de tienda ecommerce
- `settings.returnFile` (boolean, opcional) — incluir archivo de devolución
- `customsSettings.dutiesPaymentEntity` — enum: "sender" | "recipient" | "envia_guaranteed"
- `package.bolComplement` — array de datos SAT para carta porte México:
  - `productDescription`, `productCode` (16 dígitos SAT), `weightUnit` (SAT), `packagingType` (SAT), `quantity`, `unitPrice`

### Items internacionales — campos completos:
```
items[]: {
  quantity: integer | string (min 1) — REQUIRED
  price: number | null (min 0) — REQUIRED
  description: string — optional
  weight: number | null (min 0) — optional
  productCode: string | null — HS/NCM code
  countryOfManufacture: string | null (2 chars ISO) — optional
  currency: string | null (3 chars ISO) — optional
  sku: string | null — optional
  cfop: string | null — clasificación tributaria brasileña
}
```

**HALLAZGO:** El campo `cfop` (Código Fiscal de Operações e Prestações) existe en el schema pero NO en el MCP. Es relevante para Brasil.

### Paquete — constraints exactos:
- `weight`: minimum 0.0001 (no 0.01 como asumía el plan)
- `dimensions.length/width/height`: minimum 0.01
- `content`: minLength 1 (no puede ser vacío)
- `amount`: integer, minimum 1 (no permite decimales)
- `weightUnit`: enum ["kg", "KG", "lb", "LB"] (no incluye "G" ni "OZ" a nivel de schema — la conversión ocurre en backend)
- `lengthUnit`: enum ["cm", "CM", "in", "IN"]
- `declaredValue`: acepta number | null | **string** (el schema es flexible)
- `insurance`: acepta number | null, minimum 0

---

## 2. FLUJO CANCEL — Reglas faltantes

### 2.1 Límite diario de reembolsos (NO documentado en plan)
```
Tipo 1 (paquete): máximo 5 reembolsos/día
Tipo 2 (pallet): máximo 2 reembolsos/día  
Tipo 3 (truck): máximo 5 reembolsos/día
```
- Se cuentan envíos con `balance_returned=1` y `custom_key=0` del mismo día
- Empresas exentas: [70279, 456605, 75110, 649207] (Product, Tiendanube, etc.)
- Si excede límite: se cancela pero SIN reembolso

### 2.2 Elegibilidad de cancelación
- NO es por status_id fijo — es por flag `is_cancellable` en tabla `catalog_shipment_statuses`
- Cada status tiene su propio `is_cancellable` (0 o 1)
- Shipment ya cancelado (`canceled=true`) → bloqueado
- Validación de propiedad: shipment.company_id debe coincidir con user.company_id

### 2.3 Acciones post-cancelación (secuencia)
1. UPDATE shipment: status_id=4, canceled=true, canceled_by, canceled_at
2. TMS refund: POST a /cancellation (si no excede límite)
3. Sleep(2 segundos) — espera procesamiento TMS
4. Verificar balance_returned
5. DCe cancellation (si Brasil) — silencioso
6. Ecommerce fulfillment cancel — silencioso
7. Webhook notification — POST a queries/notifications/shipping-update
8. Email notification — POST a queries/email/send/shipment/status/{id}
9. Socket emit: returnNotification con monto devuelto

### 2.4 COD en cancel
- Si shipment tenía COD y estaba "Delivered" → se dispara chargeback via TMS
- Si aún no estaba "Delivered" → solo se cancela sin chargeback

**IMPACTO EN MCP:** El tool `envia_cancel_shipment` actual no informa al usuario sobre:
- Si el reembolso fue exitoso o si excedió el límite diario
- Monto reembolsado
- Si había COD pendiente

---

## 3. FLUJO PICKUP — Reglas faltantes

### 3.1 Cálculo de rango de fechas
- Cada carrier tiene `maximum_days` para pickup
- Se cuentan solo días OPERATIVOS del carrier (tabla `pickup_rules` con day_1_rule_id a day_7_rule_id)
- Si un día no tiene rule_id → carrier no opera ese día → no cuenta
- La fecha solicitada debe estar DENTRO del rango calculado

### 3.2 Import pickup validation
- Si tracking numbers incluyen envíos con `services.international=2` (importación):
  - TODOS los envíos deben ser importaciones (no mezclar)
  - TODOS deben tener mismo `locale_id` (mismo país destino)
  - Flag `isImportPickup=true` afecta locale y exchange rate

### 3.3 Pickup fee
- Se obtiene de `carrier.pickup_fee`
- Se aplica exchange rate si locale del carrier ≠ locale de la empresa
- Se valida balance suficiente ANTES de ejecutar

### 3.4 Email de notificación de pickup
- Destinatarios múltiples:
  - TO: Email del carrier para pickups (env `{CARRIER}_PICKUP_EMAILS`)
  - CC: Email de origen, OPS team, CSR asignado, logística
  - Si LTL: emails adicionales del equipo KAE
- Incluye: Google Maps embed de la dirección, ventana de tiempo, tracking numbers asociados

**IMPACTO EN MCP:** El tool `envia_schedule_pickup` no documenta:
- Que la fecha debe estar en rango del carrier
- Que no se puede mezclar import y export en un pickup
- Que hay fee que se cobra del balance

---

## 4. DIFERENCIAS POR CARRIER (CRÍTICO)

### 4.1 FedEx
- **Volumetría US doméstico:** Factor 225 in³/lb aplicado ANTES de peso
- **Dirección residencial US:** Flag `fedexResidential` obligatorio si destino=US
- **FedEx One Rate:** Servicios especiales con tipos de empaque catalogados (FEDEX_ENVELOPE, FEDEX_PAK, etc.)
- **COD LAC:** Flujo completamente diferente con `isLACCOD()` detection
- **Identificación AR:** `identificationNumber` requerido si destino=Argentina internacional
- **Third Party:** País de cuenta FedEx configurable via env

### 4.2 DHL
- **Longitud máxima dirección:** 45 caracteres (street + number). US: solo street
- **Guatemala:** Si rawType='envelope' → service_code='D'
- **Zonos Landed Cost:** Integrado para internacionales si dutiesPaymentEntity='sender' y hay items
- **Documentos:** Genera/sube factura comercial automáticamente en internacional
- **Colombia:** Genera PDF de responsabilidad adicional

### 4.3 Estafeta (México)
- **No soporta pallets:** shipment.type != 1 → error
- **No soporta internacional:** error 1145
- **Dimensiones redondeadas:** `roundDimensions()` obligatorio antes de enviar
- **Big Ticket:** Servicio B0 con cobertura separada
- **OXXO Branch:** Validación de disponibilidad si destination.branchCode + servicio='express_oxxo'

### 4.4 Coordinadora (Colombia)
- **No soporta pallets ni internacional**
- **Factor volumétrico por servicio:** Cada servicio tiene su propio factor
- **Mínimo peso para seguro:** Si peso > 5kg → insurance obligatorio, paquetes < 5kg → 6kg min
- **Calle con número combinado:** `rawStreet = street + '-' + number` para SOAP
- **Novedades:** Merge manual de eventos y novedades en tracking

### 4.5 Correios (Brasil)
- **No soporta pallets ni internacional**
- **CEP obligatorio:** Validación especial `getValidateCEP()`
- **Items obligatorios:** SIEMPRE para generación (no solo internacionales)
- **Valor declarado mínimo:** 25.63 BRL
- **Cargo manejo adicional:** 20.92 BRL
- **Dimensiones por servicio:** Ajustes automáticos, servicios 03328/03212 requieren min 100cm
- **Rate chunked:** Máx 5 items por request WS

**IMPACTO EN MCP:** El servidor MCP trata TODOS los carriers igual. Debería advertir al usuario sobre restricciones específicas del carrier seleccionado. Esto se puede resolver consultando las reglas del carrier antes de rate/generate.

---

## 5. ECOMMERCE ORDERS — Campos perdidos en transformación MCP

### 5.1 Campos CRÍTICOS que V4 retorna pero MCP NO expone:

| Campo | Impacto | Riesgo |
|-------|---------|--------|
| `fulfillment_status_id` | Decisión de permitir generar label | Podría generar para orden ya completada |
| `cod_active` (por paquete) | Config COD por paquete individual | Podría omitir COD necesario |
| `cod_value` (por paquete) | Monto COD por paquete | Monto incorrecto |
| `partial_available` | Saber si hay cumplimiento parcial | Confusión si algunos paquetes ya enviados |
| `fraud_risk` | Bandera de riesgo | Generar para orden fraudulenta |
| `order_comment` | Notas manuales del equipo | Perder contexto |
| `fulfillment_info` | Vínculo con sistema ecommerce nativo | Fulfillment no se sincroniza |
| `assigned_package` | Template de embalaje | Perder configuración |
| `return_reason` (producto) | Razón del retorno | No saber por qué se devuelve |

### 5.2 Mapeo de fulfillment status incompleto

Backend calcula fulfillment.status así:
```
guide_status_id=null + fulfillment_status_id=1 → status=7 ("Completed")
guide_status_id=3 + fulfillment_status_id=1 → status=7 ("Completed")
guide_status_id=2 → status=4 ("Shipped")
guide_status_id=1 → status=3 ("Pickup Pending")
default → order.status_id
```

**MCP NO tiene este mapeo.** El agente no puede interpretar correctamente el estado de fulfillment.

### 5.3 Productos — campos de aduanas no mapeados

V4 retorna por producto:
- `harmonized_system_code` — HS code del producto
- `country_code_origin` — País de fabricación

**Estos campos existen en la respuesta V4 pero `buildPackageFromV4()` NO los mapea a `PackageItem`.**
Si el agente genera un envío internacional desde una orden, pierde los HS codes que ya están en el producto.

---

## 6. SISTEMA DE DRAFTS (NUEVA FASE RECOMENDADA)

### Hallazgo: Sistema completo de carga masiva no contemplado en el plan

Los endpoints de drafts permiten:
1. **Upload Excel/XML** con múltiples envíos
2. **Validar** y ver preview de cada envío
3. **Editar** direcciones/paquetes/productos individualmente
4. **Ejecutar acciones** (quote/generate) en batch

Esto es una funcionalidad completa que el MCP debería exponer:

| Tool | Endpoint | Propósito |
|------|----------|-----------|
| `envia_upload_draft` | POST /drafts/upload/shipments | Subir Excel con envíos |
| `envia_list_drafts` | GET /drafts/files | Ver archivos subidos |
| `envia_get_draft` | GET /drafts/{id} | Ver contenido de un draft |
| `envia_update_draft` | PUT /drafts | Editar dirección/paquete/producto |
| `envia_execute_draft` | POST /drafts/actions/{id} | Cotizar o generar batch |
| `envia_download_draft` | POST /drafts/download/{id} | Descargar Excel |

---

## 7. OVERWEIGHT — Detalles faltantes

### 7.1 Exchange rate HISTÓRICO
- Usa el exchange rate del DÍA que se creó el envío (no el actual)
- Tabla: `locale_history` con `created_at` = fecha del shipment
- Esto garantiza consistencia de precios en transacciones históricas

### 7.2 Método carrier-specific
- Cada carrier PUEDE implementar `rateOverWeight()` — NO todos lo tienen
- Si el carrier no tiene el método → excepción (no se puede re-cotizar)

### 7.3 Sobrecargo negativo = error
- Si el nuevo precio es MENOR que el original → error
- No se permiten "rebajas" por sobrepeso (solo cargos adicionales)

---

## 8. CATÁLOGO DE ERRORES — Respuesta estándar

### Formato de error del backend:
```json
{
  "meta": "error_message",
  "error": {
    "code": 1125,
    "message": "Service provided not available or incorrect",
    "description": "Descripción del catálogo (catalog_carrier_errors)"
  }
}
```

### Códigos más comunes que el MCP debe manejar:

| Código | Significado | Acción recomendada para agente |
|--------|------------|-------------------------------|
| 1101 | Recurso no encontrado / >60 días | Informar y no reintentar |
| 1105 | Límite excedido (peso/dimensiones/paquetes) | Sugerir ajustar paquete |
| 1115 | Shipment no encontrado o no cancelable | Informar estado actual |
| 1116 | Shipment no pertenece a la empresa | Verificar credenciales |
| 1125 | Servicio no disponible o incorrecto | Sugerir listar servicios disponibles |
| 1127 | Valor demasiado largo / Branch requerido | Truncar o solicitar branch |
| 1129 | Campos requeridos faltantes | Listar campos faltantes específicos |
| 1140 | Plan de precios no encontrado | Contactar soporte |
| 1220 | Formato inválido (CNPJ/CPF/postal) | Sugerir formato correcto |
| 1282 | Branch no soporta COD | Sugerir branch alternativo |

**IMPACTO EN MCP:** El MCP actual retorna errores genéricos. Debería mapear códigos a sugerencias accionables para el agente.

---

## 9. CONFIGURACIÓN — Endpoints detallados para Fase 6

### 9.1 Email Templates (CRUD completo)
- GET/POST/PUT/DELETE /config/shipment/email
- Campos: body_email_html, body_email_json, subject_email, country_codes[], shipment_status_ids[], shop_ids[], active, copy_sender
- Templates base: GET /config/shipment/email/templates

### 9.2 Tracking Page (CRUD completo)
- GET/POST/PUT/DELETE /config/tracking/page
- Campos: html, json, description, country_codes[], shop_ids[], active
- Templates base: GET /config/tracking/templates
- Imágenes: POST/GET/DELETE /config/images/tracking (max 100KB)

### 9.3 Shipping Rules
- GET/POST/PUT /config/{shop_id}/shipping-rules
- Tipos: 'Fixed' | 'Product' | 'Money' | 'Weight' | 'Method'
- Campos: name, country_code, state_code, international, type, priority, min, max, option_1-3, methods{}, products[], active
- Service recommendation: GET /config/general/shipping-rules/service-recommendation

### 9.4 API Tokens
- GET /create-api-token — Genera nuevo token (retorna token completo)
- GET /get-api-tokens — Lista tokens (masked)
- DELETE /delete-api-token — Elimina por token

### 9.5 Insurance Config
- GET/PUT /config/insurance
- Campos: isEnabled, defaultValue

### 9.6 Logos
- POST /config/upload-logo — Multipart upload
- GET /config/get-logo — Obtener logo actual
- PUT /config/v2/set-logos — Múltiples logos por shop
- GET /config/v2/get-logos — Logos por shops

---

## 10. CARRIER CONFIG — Endpoints detallados

### 10.1 Pickup Rules (por carrier)
```json
{
  "carrier_id": 123,
  "carrier_name": "fedex",
  "carrier_pickup_fee": 150.00,
  "pickup_maximum_days": 5,
  "days": [
    { "day": 1, "sameday": false, "hour_limit": 14, "hour_start": 9, "hour_end": 18, "hour_span": 4 },
    { "day": 2, "sameday": true, "hour_limit": 12, "hour_start": 9, "hour_end": 18, "hour_span": 4 }
  ]
}
```

### 10.2 COD Rules (por carrier + service)
```json
{
  "cash_on_delivery": true,
  "commission_cash_on_delivery": 0.05,
  "minimum_amount_cash_on_delivery": 50.00
}
```

### 10.3 Carrier Alerts
- CRUD de alertas por carrier
- Campos: carrier_id, service_id, description, apply_to, translation_tag, form (JSON), color_class

### 10.4 Commercial Invoice Regulations
- GET /commercial-invoice-regulations/{carrier_id}
- Retorna reglas de factura comercial por carrier (element_type, descriptions)

---

## 11. BILLING/COD — Endpoints no contemplados

### 11.1 Billing Info
- GET /billing-information/check — ¿Tiene info de facturación?
- GET /billing-information — Info completa (con direcciones)
- GET /billing-information/ecartpay — Info de EcartPay
- POST/PUT billing info

### 11.2 COD Invoices
- GET /cod/invoices — Facturas COD
- GET /cod/invoices/tabs — Tabs (invoiced/notInvoiced)
- GET /cod/get-shipments-cod-by-status — Envíos COD filtrados
- GET /cod/get-max-date — Fecha máxima COD

### 11.3 Company Credit
- GET /credit/{id} — Info de crédito
- GET /company/credit-info — Resumen de crédito
- GET /company/recharge-history — Historial de recargas

---

## 12. CORRECCIONES AL PLAN — Segunda iteración

### 12.1 Agregar a Fase 0 (Infraestructura):

**Nuevo servicio: `src/services/error-handler.ts`**
- Mapear códigos de error del backend a mensajes accionables para agentes
- Ej: código 1129 → "Campos requeridos faltantes: {list}. Por favor proporcione..."
- Ej: código 1282 → "La sucursal seleccionada no soporta COD. Sucursales disponibles: {list}"

**Nuevo servicio: `src/services/carrier-constraints.ts`**
- Consultar restricciones del carrier ANTES de rate/generate
- Peso máximo, dimensiones máximas, servicios soportados
- Carriers que NO soportan pallets (Estafeta, Coordinadora, Correios)
- Carriers que NO soportan internacional (Estafeta, Coordinadora, Correios)

### 12.2 Agregar a Fase 1 (Shipments):

**Nuevo tool: `envia_get_shipment_statuses`**
- Endpoint: GET /shipments-status (queries, pero el catálogo)
- Retorna todos los estados posibles con: id, name, class, dashboard_color, parent_id, is_cancellable
- Necesario para que el agente interprete estados correctamente

### 12.3 Corregir Fase 2 (Orders):

**Tool 2.1 `envia_list_orders`:**
- Agregar en tipos V4: fulfillment_status_id, partial_available, fraud_risk, cod_confirmation_status, order_comment
- Exponer cod_active y cod_value a nivel de paquete
- Incluir harmonized_system_code y country_code_origin de productos
- Documentar el mapeo de fulfillment status (null→7, 3→7, 2→4, 1→3)

### 12.4 Agregar NUEVA Fase 11: Drafts (Carga Masiva)

| Tool | Endpoint | Prioridad |
|------|----------|-----------|
| `envia_upload_draft` | POST /drafts/upload/shipments | MEDIA |
| `envia_list_drafts` | GET /drafts/files | MEDIA |
| `envia_get_draft` | GET /drafts/{id} | MEDIA |
| `envia_update_draft` | PUT /drafts | MEDIA |
| `envia_execute_draft` | POST /drafts/actions/{id} | MEDIA |
| `envia_download_draft` | POST /drafts/download/{id} | BAJA |

### 12.5 Corregir tools existentes (12 actuales):

**`quote_shipment` (rate):**
- Agregar validación de consistencia de unidades (no mezclar KG+IN)
- Agregar peso mínimo 0.0001 (no 0.1 — eso es un floor interno del backend, no del schema)
- Agregar campo `cfop` para items brasileños
- Documentar que `declaredValue` acepta string además de number
- Advertir si carrier seleccionado no soporta intl/pallets

**`create_shipment` (generate):**
- VALIDAR printFormat contra enum exacta: PDF, ZPL, ZPLII, PNG, EPL
- VALIDAR printSize contra enum de 23 valores
- Agregar campo `orderReference` para imprimir en etiqueta
- Agregar campo `shopId` en settings para contexto ecommerce
- Agregar campo `dutiesPaymentEntity` en customsSettings
- Agregar campo `bolComplement` para carta porte MX (SAT codes)
- Advertir sobre debt check (usuario con deudas no puede generar)

**`envia_cancel_shipment`:**
- Informar en respuesta: monto reembolsado, si se aplicó o excedió límite diario
- Documentar que cancellation status depende de `is_cancellable` flag, no de status_id fijo
- Manejar COD chargeback info

**`envia_schedule_pickup`:**
- Validar fecha contra rango del carrier (consultar pickup-rules primero)
- Advertir sobre pickup fee
- No permitir mezclar import y export

---

## RESUMEN: Total de hallazgos por iteración

| Categoría | V1 (primera auditoría) | V2 (esta iteración) | Total |
|-----------|----------------------|---------------------|-------|
| Reglas de dirección por país | 12 | 3 (cfop BR, carriers específicos, schema constraints) | 15 |
| Reglas de negocio Rate | 14 | 5 (schema exacto, carrier constraints) | 19 |
| Reglas de negocio Generate | 10 | 7 (schema fields, bolComplement, orderReference, shopId) | 17 |
| Reglas de Cancel | 0 | 9 (refund limits, is_cancellable, post-cancel sequence) | 9 |
| Reglas de Pickup | 0 | 5 (date range, import validation, fee, email) | 5 |
| Reglas de Overweight | 0 | 4 (60-day limit, historical exchange, negative check) | 4 |
| Carrier-specific | 0 | 12 (FedEx volumetric, DHL address, Estafeta rounding, etc.) | 12 |
| Ecommerce orders gaps | 0 | 9 (fulfillment_status, cod_active, HS codes) | 9 |
| Frontend logic | 5 | 0 (ya cubierto) | 5 |
| Configuration endpoints | 0 | 15 (email, tracking, rules, tokens, insurance, logos) | 15 |
| Error handling | 0 | 10 (error codes, actionable messages) | 10 |
| Draft system | 0 | 6 (nueva fase completa) | 6 |
| **TOTAL** | **41** | **85** | **126 reglas documentadas** |

## Plan revisado final: 99 tools en 13 fases

| Fase | Dominio | Tools | Cambio vs V1 |
|------|---------|-------|-------------|
| 0 | Infraestructura de Validación | 6 servicios | SIN CAMBIO |
| 0.5 | Corregir 12 tools existentes | 12 fixes | **NUEVO** |
| 1 | Envíos | 16 (+1) | +get_shipment_statuses |
| 2 | Órdenes | 14 (+2) | +get_order_address, +split_packages |
| 3 | Direcciones + Paquetes + Clientes | 15 (+2) | +get_categories, +get_generic_form |
| 4 | Tickets | 6 | SIN CAMBIO |
| 5 | Sucursales | 3 | SIN CAMBIO |
| 6 | Configuración | 12 (+2) | +email_templates, +tracking_page |
| 7 | Analytics | 5 | SIN CAMBIO |
| 8 | Carriers Avanzados | 9 (+1) | +get_carrier_constraints |
| 9 | Notificaciones | 4 | SIN CAMBIO |
| 10 | Productos + DCe + Billing | 7 (+2) | +credit_info, +cod_invoices |
| 11 | AI Shipping | 4 | SIN CAMBIO |
| 12 | Drafts (Carga Masiva) | 6 | **NUEVO** |
| **TOTAL** | | **~99 tools + 12 fixes** | |
