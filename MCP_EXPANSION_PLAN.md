# Plan Maestro de Expansión: envia-mcp-server

## Objetivo
Expandir el MCP server de 12 tools actuales a ~80+ tools cubriendo todos los endpoints útiles de carriers y queries, para que el proyecto agentic-ai y cualquier agente de IA pueda operar la plataforma Envia completa.

## Estado Actual (12 tools)
| Tool | Backend | Servicio |
|------|---------|----------|
| envia_validate_address | geocodes /zipcode | geocodes |
| envia_list_carriers | /available-carrier | queries |
| quote_shipment | /ship/rate | carriers |
| create_shipment | /ship/generate | carriers |
| envia_get_ecommerce_order | /v4/orders (individual) | queries |
| list_additional_services | /available-service | queries |
| envia_track_package | /ship/generaltrack | carriers |
| envia_cancel_shipment | /ship/cancel | carriers |
| envia_schedule_pickup | /ship/pickup | carriers |
| envia_get_shipment_history | /guide/{month}/{year} | queries |
| classify_hscode | /utils/classify-hscode | carriers |
| envia_create_commercial_invoice | /ship/commercial-invoice | carriers |

---

## FASE 1: Gestión de Envíos (Shipments)
**Prioridad:** CRÍTICA — Los agentes necesitan consultar y gestionar envíos existentes
**Estimación:** 15 tools nuevos
**Dependencias:** api-client.ts existente, auth via api_key

### Tool 1.1: `envia_list_shipments`
**Endpoint:** GET /shipments (queries)
**Descripción:** Listar envíos de la empresa con filtros avanzados
**Autenticación:** Bearer token (api_key)

**Parámetros de entrada (Zod schema):**
```
- status_id (number, optional): ID del estado del envío
    Valores: 1=Creado, 2=En tránsito, 3=Entregado, 4=Error/Cancelado, 5=Incidencia, 6=Devuelto, 10=Intento de entrega, 11=En proceso de devolución, 14=Extraviado, 15=Dañado
- carrier_name (string[], optional): Nombres de transportistas (ej: ["dhl", "fedex"])
- service_name (string[], optional): Nombres de servicios
- tracking_number (string, optional): Número de rastreo (búsqueda parcial con LIKE)
- folio (string, optional): Folio del envío
- shipment_type_id (number[], optional): 1=Paquete, 2=LTL, 3=FTL
- international (number[], optional): 0=Nacional, 1=Internacional, 2=Cross-border
- date_from (string, optional): Fecha inicio YYYY-MM-DD
- date_to (string, optional): Fecha fin YYYY-MM-DD
- address_destination_name (string, optional): Nombre del destinatario
- address_origin_name (string, optional): Nombre del remitente
- zip_code_origin (string, optional): CP origen
- consignee_country (string, optional): País destino ISO 2
- include_archived (boolean, optional, default false): Incluir archivados
- count_only (boolean, optional, default false): Solo retornar conteo
- limit (number, optional, default 20): Resultados por página
- page (number, optional, default 1): Página
- api_key (string, optional)
```

**Campos de respuesta a formatear:**
```
id, tracking_number, folio, status (id + name + class),
carrier (id + name + logo),
service (id + name + description),
origin: { name, email, phone, street, number, district, city, state, country, postal_code },
destination: { name, email, phone, street, number, district, city, state, country, postal_code },
costs: { total, insurance_cost, extended_zone, additional_services_cost, import_fee, import_tax, grand_total },
packages: [{ tracking_number, content, weight, dimensions, type }],
additional_services: [{ name, cost, amount }],
dates: { created_at, shipped_at, delivered_at },
last_event: { location, datetime, description },
ticket: { id, type, status } (si existe),
created_by: { name, email }
```

**Lógica de negocio:**
- Si role === 6 (operador de sucursal): filtrar por user_id creador, no por company_id
- Si role !== 6: filtrar por company_id
- GROUP_CONCAT para paquetes y servicios adicionales (separador '|', parsear en JS)
- Paginación: LIMIT offset, count
- Ordenar por id DESC (más reciente primero)
- Calcular estadísticas de incidentes si include_incidents=true

**Tablas JOIN:**
shipments → services → carriers → catalog_shipment_statuses → catalog_shipment_types → users → shipment_addresses (origin: type 1, dest: type 2) → shipment_packages → shipment_additional_services → company_tickets → shipment_events (last) → shipments_archive

---

### Tool 1.2: `envia_get_shipment_detail`
**Endpoint:** GET /guide/{tracking_number} (queries)
**Descripción:** Obtener detalle completo de un envío por tracking number
**Autenticación:** Bearer token

**Parámetros:**
```
- tracking_number (string, required): Número de rastreo (max 50 chars)
- api_key (string, optional)
```

**Respuesta:** Mismo formato que list_shipments pero para un solo envío, incluyendo:
- Todos los paquetes con dimensiones y peso
- Historial de eventos completo
- Archivos (etiqueta URL, BOL URL, POD URL)
- Comentarios del usuario
- Info de archivado si aplica
- Datos de COD si aplica

**Lógica:** Construir S3 URLs: `uploads/{carrier_name}/{file}` para etiquetas, `uploads/{carrier_name}_bill_of_lading/{file_bol}` para BOL

---

### Tool 1.3: `envia_get_shipments_status`
**Endpoint:** GET /shipments-status (queries)
**Descripción:** Obtener estadísticas de envíos por estado
**Autenticación:** Bearer token

**Parámetros:**
```
- date_from (string, required): YYYY-MM-DD
- date_to (string, required): YYYY-MM-DD
- carrier_name (string[], optional)
- tracking_number (string, optional)
- address_destination_name (string, optional)
- api_key (string, optional)
```

**Respuesta:**
```
packagesPendingShip, packagesPickup, percentagePickup,
packagesShipped, percentageShipped, packagesOutForDelivery,
packagesDeliveryFilter, packagesIssue, percentageIssue,
packagesReturned, percentageReturned
```

---

### Tool 1.4: `envia_get_shipments_cod`
**Endpoint:** GET /shipments/cod (queries)
**Descripción:** Listar envíos contra entrega (Cash on Delivery)
**Autenticación:** Bearer token

**Parámetros:**
```
- startDate (string, optional): YYYY-MM-DD
- endDate (string, optional): YYYY-MM-DD
- shipmentStatus (string, optional): '0'=Pendiente, '1'=Entregado
- paymentStatus (string, optional): 'paid' | 'pending'
- tracking_number (string, optional)
- carrier_name (string, optional)
- service_name (string, optional)
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Campos adicionales en respuesta:** cash_on_delivery_amount, cash_on_delivery_cost, payed_amount, payed_at, payment_reference, cod_confirmation_status

**Lógica:** WHERE s.cash_on_delivery_amount > 0 AND s.company_id = ?

---

### Tool 1.5: `envia_get_cod_counters`
**Endpoint:** GET /shipments/cod/count (queries)
**Descripción:** Contadores y estadísticas de COD

**Parámetros:** Mismos filtros que get_shipments_cod + `type` ('counters' | 'tabs')

**Respuesta:**
```
delivered, payed_amount, not_payed, total, paid, pending, reported
```

---

### Tool 1.6: `envia_get_shipments_surcharges`
**Endpoint:** GET /shipments/surcharges (queries)
**Descripción:** Listar envíos con sobrecargos (overweight)
**Autenticación:** Bearer token

**Parámetros:**
```
- tracking_number (string, optional)
- service_name (string, optional)
- difference_weight (boolean, optional): Mostrar diferencia peso declarado vs real
- invoiced (boolean, optional): Filtrar solo facturados
- date_from (string, optional): YYYY-MM-DD
- date_to (string, optional): YYYY-MM-DD
- ticket_status_id (number, optional)
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Campos:** shipment_id, tracking_number, declared_weight, revised_weight, overweight, overcharge_cost, cost_after_overcharge, ticket info

**Lógica:** WHERE s.overcharge_applied = 1 AND s.overcharge_cost != 0. Default: últimos 60 días si no hay date_from.

---

### Tool 1.7: `envia_get_labels_bulk`
**Endpoint:** POST /shipments/labels-bulk (queries)
**Descripción:** Generar PDF/ZIP con múltiples etiquetas
**Autenticación:** Bearer token

**Parámetros:**
```
- shipment_ids (number[], required): IDs de envíos (max ~100)
- additional_files (boolean, optional, default false): Incluir archivos adicionales
- with_report (boolean, optional, default false): Incluir reporte
- with_packing (boolean, optional, default false): Incluir lista de empaque
- api_key (string, required)
```

**Respuesta:** URL del PDF/ZIP generado o stream binario

**Lógica:** Genera via PdfService.generateBulkLabelsPdfOrZip(). Si with_packing=true, busca órdenes asociadas.

---

### Tool 1.8: `envia_cancel_shipments_bulk`
**Endpoint:** POST /shipments/bulk/cancel (queries)
**Descripción:** Cancelar múltiples envíos en batch
**Autenticación:** Bearer token

**Parámetros:**
```
- shipment_ids (number[], required): IDs de envíos a cancelar
- api_key (string, required)
```

**Respuesta:** { message: 'Processing...' } — es asincrónico via Bull queue

**Lógica:** Encola jobs en shipmentsCancelQueue con 3 intentos, 5s backoff. No es sincrónico.

---

### Tool 1.9: `envia_comment_shipment`
**Endpoint:** POST /shipments/comment-shipment (queries)
**Descripción:** Agregar comentario a un envío
**Autenticación:** Bearer token

**Parámetros:**
```
- shipment_id (number, required)
- comment (string, required, 1-255 chars)
- api_key (string, required)
```

**Validaciones:** No puede haber duplicados (mismo envío + usuario). Se trimean espacios extras.

---

### Tool 1.10: `envia_archive_shipment`
**Endpoint:** POST /shipments/{id}/archive (queries)
**Descripción:** Archivar un envío
**Autenticación:** Bearer token

**Parámetros:**
```
- shipment_id (number, required)
- archived_reason (string, optional, default 'manual'): 'manual' | 'bulk' | 'auto'
- api_key (string, required)
```

---

### Tool 1.11: `envia_unarchive_shipment`
**Endpoint:** DELETE /shipments/{id}/archive (queries)
**Descripción:** Desarchivar un envío
**Autenticación:** Bearer token

**Parámetros:**
```
- shipment_id (number, required)
- api_key (string, required)
```

---

### Tool 1.12: `envia_get_shipments_ndr`
**Endpoint:** GET /get-shipments-ndr (queries)
**Descripción:** Listar envíos con reportes de no entrega (NDR)
**Autenticación:** Bearer token

**Parámetros:**
```
- type (string, optional): 'attention' | 'requested' | 'rto' — tipo de NDR
- status_id (number, optional): Valores válidos: 5,6,10,11,13,14,15,17,18,19
- tracking_number (string, optional)
- carrier_name (string, optional)
- date_from (string, optional): YYYY-MM-DD
- date_to (string, optional): YYYY-MM-DD
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Campos adicionales:** ndr_action, request_code, options (acciones disponibles), ndr_history

**Estadísticas retornadas:** total, total_required_attention, total_requested, total_rto_delivered

---

### Tool 1.13: `envia_get_shipment_invoices`
**Endpoint:** GET /shipments/invoices (queries)
**Descripción:** Listar facturas de envíos por mes/año
**Autenticación:** Bearer token

**Parámetros:**
```
- month (string[], optional): Meses (ej: ["01", "02"])
- year (string[], optional): Años (ej: ["2026"])
- invoiced (number, optional): 0=No facturado, 1=Facturado
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Respuesta:** id, month, year, total, invoice_id, invoice_url, total_shipments, invoiced_by, status

---

### Tool 1.14: `envia_get_invoice_details`
**Endpoint:** GET /shipments/invoices/details/{invoice_id} (queries)
**Descripción:** Detalle de conceptos de una factura
**Autenticación:** Bearer token

**Parámetros:**
```
- invoice_id (number, required)
- tracking_number (string, optional): Filtrar por tracking
- carrier_name (string, optional): Filtrar por carrier
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Respuesta:** Array de shipments con concepts (concept_name, operation_type CHARGE/REFUND, total_amount, details[])

---

### Tool 1.15: `envia_get_shipment_pickups`
**Endpoint:** GET /shipments/pickups (queries)
**Descripción:** Obtener pickups asociados a envíos
**Autenticación:** Bearer token

**Parámetros:**
```
- shipment_id (number, optional)
- tracking_number (string, optional)
- shipment_type_id (number, optional)
- api_key (string, required)
```

---

## FASE 2: Órdenes de Ecommerce (Orders)
**Prioridad:** ALTA — Operaciones de ecommerce son core del negocio
**Estimación:** 12 tools nuevos

### Tool 2.1: `envia_list_orders`
**Endpoint:** GET /v4/orders (queries) — versión más reciente
**Descripción:** Listar órdenes de ecommerce con filtros avanzados
**Autenticación:** Bearer token

**Parámetros:**
```
- order_identifier (string, optional): Identificador de orden
- search (string, optional): Búsqueda libre (nombre, tracking, identifier)
- filter (string, optional): 'payment-pending' | 'label-pending' | 'pickup-pending' | 'shipped' | 'canceled' | 'completed' | 'other'
- analytics (string, optional): 'unfulfillment' | 'fulfillment' | 'ready-to-ship' | 'out-for-delivery' | 'in-transit' | 'delivered' | 'with-incidents' | 'returned'
- status_payment (string[], optional): ['pending', 'paid', 'cod']
- shop_id (number[], optional): IDs de tiendas
- carrier (string, optional): Nombre del carrier
- tracking_number (string, optional)
- product_name (string, optional)
- sku (string, optional)
- date_from (string, optional): YYYY-MM-DD
- date_to (string, optional): YYYY-MM-DD
- tags (string[], optional): Etiquetas (max 50)
- sort_by (string, optional): Campo para ordenar
- sort_direction (string, optional): 'asc' | 'desc'
- limit (number, optional, default 20)
- page (number, optional, default 1)
- api_key (string, required)
```

**Lógica de filtros (mapeo filter → SQL):**
- 'payment-pending': catalog_order_general_status.id = 1
- 'label-pending': fulfillment_status != 1 AND (no shipment OR shipment status = 4)
- 'pickup-pending': shipment status_id = 1
- 'shipped': shipment status_id = 2
- 'canceled': catalog_order_general_status.id = 5
- 'completed': fulfillment_status = 1 AND (shipment status = 3 OR no shipment)

**Respuesta:** orders_info[], countries[] (países presentes en resultados)

---

### Tool 2.2: `envia_get_orders_count`
**Endpoint:** GET /v2/orders-count (queries)
**Descripción:** Obtener contadores de órdenes por estado
**Autenticación:** Bearer token

**Parámetros:** Mismos filtros que list_orders (filter, shop_id, date_from, date_to, etc.)

**Respuesta:** { total: number }

---

### Tool 2.3: `envia_update_order_address`
**Endpoint:** PUT /orders/{shop_id}/{order_id}/address (queries)
**Descripción:** Actualizar dirección de una orden
**Autenticación:** Bearer token

**Parámetros:**
```
- shop_id (number, required)
- order_id (number, required)
- address_type_id (number, required): 1=BILLING, 2=SHIPPING, 3=ORIGIN
- package_id (number, optional): Si type=ORIGIN, asigna a paquete específico
- first_name (string, required)
- last_name (string, required)
- address1 (string, required)
- address2 (string, optional)
- country_code (string, required, 2 chars)
- state_code (string, required, max 4 chars)
- city (string, required)
- postal_code (string, required)
- phone (string, required)
- identification_number (string, optional)
- references (string, optional)
- api_key (string, required)
```

**Lógica:** Si address_type_id=3 (ORIGIN) y hay package_id, actualiza order_packages.order_address_id. También resetea quote_price y quoted_service_id del paquete.

---

### Tool 2.4: `envia_update_order_packages`
**Endpoint:** PUT /orders/{shop_id}/{order_id}/packages (queries)
**Descripción:** Actualizar paquetes de una orden
**Autenticación:** Bearer token

**Parámetros:**
```
- shop_id (number, required)
- order_id (number, required)
- packages (array, required):
  - package_id (number, required)
  - content (string, required)
  - amount (number, required, 1-10)
  - package_type_id (number, required)
  - weight (number, required, 0.01-9999.99)
  - weight_unit (string, required): 'KG' | 'LB' | 'G' | 'OZ'
  - length_unit (string, conditional): 'CM' | 'IN' (requerido si package_type_id es 1 o 2)
  - dimensions (object, conditional):
    - length (number, required if applicable)
    - width (number, required if applicable)
    - height (number, required if applicable)
  - insurance (number, optional, default 0)
  - declared_value (number, optional, default 0)
  - additional_services (array, optional)
- api_key (string, required)
```

---

### Tool 2.5: `envia_rate_order`
**Endpoint:** GET /orders/{shop_id}/{order_id}/rate (queries)
**Descripción:** Cotizar servicios de envío para una orden
**Autenticación:** Bearer token (jwt)

**Parámetros:**
```
- shop_id (number, required)
- order_id (number, required)
- api_key (string, required)
```

**Respuesta:** Servicios de envío disponibles con precios y estimados de entrega

---

### Tool 2.6: `envia_select_order_service`
**Endpoint:** PUT /orders/{shop_id}/{order_id}/rate (queries)
**Descripción:** Seleccionar servicio de envío para un paquete de una orden
**Autenticación:** Bearer token

**Parámetros:**
```
- shop_id (number, required)
- order_id (number, required)
- package_id (number, required)
- service_id (number | null, required): null para deseleccionar
- price (number | null, required): null para deseleccionar
- api_key (string, required)
```

**Lógica:** Actualiza order_packages.quoted_service_id y quote_price

---

### Tool 2.7: `envia_fulfill_order`
**Endpoint:** POST /orders/{shop_id}/{order_id}/fulfillment/order-shipments (queries)
**Descripción:** Crear registro de fulfillment para un paquete
**Autenticación:** Bearer token

**Parámetros:**
```
- shop_id (number, required)
- order_id (number, required)
- package_id (number, required)
- shipment_id (number, optional)
- tracking_number (string, optional)
- fulfillment_status_id (number, optional, default 4)
- fulfillment_method (string, optional): 'normal' | 'manual' | 'automatic'
- api_key (string, required)
```

**Lógica:** 
- Crea registro en order_shipments
- Si TODOS los paquetes de la orden tienen fulfillment_status_id = 1, marca orden como completada
- Retorna: success, id, packages_fulfillment, isFulfillmentOrder, completed

---

### Tool 2.8: `envia_get_order_filter_options`
**Endpoint:** GET /orders/filter-options (queries)
**Descripción:** Opciones disponibles para filtros de órdenes
**Autenticación:** Bearer token

**Parámetros:** api_key (string, required)

**Respuesta:** Países destino, carriers, métodos de envío disponibles

---

### Tool 2.9: `envia_manage_order_tags`
**Endpoint:** POST/DELETE /orders/tags (queries)
**Descripción:** Agregar o eliminar etiquetas de órdenes
**Autenticación:** Bearer token

**Parámetros (agregar):**
```
- action (string, required): 'add' | 'remove'
- order_ids (number[], required, 1-300)
- tags (string[], required for 'add', 1-30, max 100 chars each)
- tag_ids (number[], required for 'remove', 1-300)
- api_key (string, required)
```

---

### Tool 2.10: `envia_generate_packing_slip`
**Endpoint:** POST /orders/packing-slip (queries)
**Descripción:** Generar PDF de lista de empaque
**Autenticación:** Bearer token

**Parámetros:**
```
- order_ids (number[], required, 1-300)
- with_return_policy (boolean, optional, default false)
- api_key (string, required)
```

**Respuesta:** PDF binario (URL o stream)

---

### Tool 2.11: `envia_generate_picking_list`
**Endpoint:** POST /orders/picking-list (queries)
**Descripción:** Generar PDF de lista de picking
**Autenticación:** Bearer token

**Parámetros:**
```
- order_ids (number[], required, 1-300)
- api_key (string, required)
```

---

### Tool 2.12: `envia_get_orders_analytics`
**Endpoint:** GET /orders/orders-information-by-status (queries)
**Descripción:** Analítica de órdenes por estado de envío
**Autenticación:** Bearer token

**Parámetros:**
```
- date_from (string, optional)
- date_to (string, optional)
- shop_id (number[], optional)
- destination_country_code (string[], optional)
- status_payment (string[], optional)
- shipping_method (string[], optional)
- api_key (string, required)
```

---

## FASE 3: Direcciones y Paquetes
**Prioridad:** ALTA — Base para cotizar y generar envíos
**Estimación:** 12 tools nuevos

### Tool 3.1: `envia_list_addresses`
**Endpoint:** GET /all-addresses (queries)
**Descripción:** Listar todas las direcciones guardadas del usuario
**Autenticación:** Bearer token (jwt o token_user)

**Parámetros:**
```
- type (string, optional): 'origin' | 'destination' — filtrar por tipo
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Respuesta por dirección:**
```
address_id, type (1=origin, 2=destination), category (description),
name, company, email, phone, phone_code, street, number, district,
interior_number, city, state, country, postal_code,
identification_number, reference
```

**Tabla:** config_addresses JOIN catalog_address_categories WHERE company_id = ?

---

### Tool 3.2: `envia_create_address`
**Endpoint:** POST /user-address (queries)
**Descripción:** Crear nueva dirección guardada
**Autenticación:** Bearer token

**Parámetros:**
```
- name (string, required)
- company (string, optional)
- email (string, optional)
- phone (string, required)
- phone_code (string, optional)
- street (string, required)
- number (string, optional)
- district (string, optional)
- interior_number (string, optional)
- city (string, required)
- state (string, required)
- country (string, required, 2 chars ISO)
- postal_code (string, required)
- identification_number (string, optional): CPF/CNPJ para BR
- reference (string, optional)
- type (number, required): 1=origin, 2=destination
- category_id (number, optional): 1=Office, 2=Residential, 3=Other
- api_key (string, required)
```

**Tabla:** INSERT INTO config_addresses

---

### Tool 3.3: `envia_update_address`
**Endpoint:** PUT /user-address/{address_id} (queries)
**Descripción:** Actualizar dirección existente
**Autenticación:** Bearer token

**Parámetros:** address_id + mismos campos que create (todos opcionales excepto address_id)

---

### Tool 3.4: `envia_delete_address`
**Endpoint:** DELETE /user-address/{address_id} (queries)
**Descripción:** Eliminar dirección guardada
**Autenticación:** Bearer token

**Parámetros:**
```
- address_id (number, required)
- api_key (string, required)
```

**Validaciones:** 
- Verifica que no sea dirección favorita de una tienda (via validateAddressDeletionFavoriteShop)
- Verifica que no esté en uso por config de default

---

### Tool 3.5: `envia_set_default_address`
**Endpoint:** POST /default-user-address (queries)
**Descripción:** Establecer dirección por defecto (origin/destination)
**Autenticación:** Bearer token

**Parámetros:**
```
- address_id (number, required): ID de dirección existente
- address_type (number, required): 1=origin, 2=destination
- is_replace (boolean, optional, default false)
- api_key (string, required)
```

---

### Tool 3.6: `envia_get_default_address`
**Endpoint:** GET /default-user-address/{type_id} (queries)
**Descripción:** Obtener dirección por defecto
**Autenticación:** Bearer token

**Parámetros:**
```
- type_id (number, required): 1=origin, 2=destination
- api_key (string, required)
```

---

### Tool 3.7: `envia_list_packages`
**Endpoint:** GET /all-packages (queries)
**Descripción:** Listar paquetes guardados del usuario
**Autenticación:** Bearer token

**Parámetros:**
```
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Respuesta:** package_id, name, content, package_type_id, weight, weight_unit, dimensions (l/w/h), length_unit, insurance, declared_value, is_favorite

---

### Tool 3.8: `envia_create_package`
**Endpoint:** POST /default-user-packages (queries)
**Descripción:** Crear paquete guardado
**Autenticación:** Bearer token

**Parámetros:**
```
- name (string, required)
- content (string, required)
- package_type (number, required): 1=box, 2=envelope, etc.
- weight (number, required)
- weight_unit (string, required): 'KG' | 'LB'
- length_unit (string, required): 'CM' | 'IN'
- height (number, required)
- length (number, required)
- width (number, required)
- insurance (number, optional, default 0)
- api_key (string, required)
```

---

### Tool 3.9: `envia_get_standard_packages`
**Endpoint:** GET /carriers-standard-packages/{country_code} (queries)
**Descripción:** Obtener paquetes estándar por carrier y país
**Autenticación:** Sin auth

**Parámetros:**
```
- country_code (string, required): ISO 2 chars
```

**Respuesta:** Paquetes estándar por carrier (dimensiones, peso máximo, nombre)

---

### Tool 3.10: `envia_list_customers`
**Endpoint:** GET /customers (queries)
**Descripción:** Listar clientes de la empresa
**Autenticación:** Bearer token

**Parámetros:**
```
- search (string, optional): Búsqueda por nombre/email/teléfono
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

---

### Tool 3.11: `envia_get_customer`
**Endpoint:** GET /customers/{customer_id} (queries)
**Descripción:** Detalle de un cliente con sus direcciones
**Autenticación:** Bearer token

**Parámetros:**
```
- customer_id (number, required)
- api_key (string, required)
```

**Respuesta:** Customer info + addresses[] + contacts[]

---

### Tool 3.12: `envia_manage_customer_address`
**Endpoint:** POST/PUT/DELETE /customers/{customer_id}/addresses (queries)
**Descripción:** CRUD de direcciones de clientes
**Autenticación:** Bearer token

**Parámetros:**
```
- action (string, required): 'create' | 'update' | 'delete'
- customer_id (number, required)
- address_id (number, required for update/delete)
- (campos de dirección para create/update — mismo formato que envia_create_address)
- api_key (string, required)
```

---

## FASE 4: Tickets de Soporte
**Prioridad:** MEDIA-ALTA — Los agentes necesitan gestionar incidencias
**Estimación:** 6 tools nuevos

### Tool 4.1: `envia_list_tickets`
**Endpoint:** GET /company/tickets (queries)
**Descripción:** Listar tickets de soporte de la empresa
**Autenticación:** Bearer token

**Parámetros:**
```
- carrier_id (number, optional)
- ticket_status_id (number, optional): 1=Abierto, 2=Cerrado, 3=Pendiente
- ticket_type_id (number, optional)
- tracking_number (string, optional)
- date_from (string, optional): YYYY-MM-DD
- date_to (string, optional): YYYY-MM-DD
- getComments (boolean, optional, default false)
- limit (number, optional)
- page (number, optional)
- api_key (string, required)
```

**Respuesta:** id, company_id, ticket_type (id + name), ticket_status (id + name), tracking_number, carrier, service, files[], comments[], consignee{}, rating{evaluated, rating, comment}, additional_services[]

---

### Tool 4.2: `envia_get_ticket_detail`
**Endpoint:** GET /company/tickets/{ticket_id} (queries)
**Descripción:** Detalle completo de un ticket
**Autenticación:** Bearer token

**Parámetros:**
```
- ticket_id (number, required)
- getComments (boolean, optional, default true)
- api_key (string, required)
```

---

### Tool 4.3: `envia_create_ticket`
**Endpoint:** POST /company/tickets (queries)
**Descripción:** Crear ticket de soporte
**Autenticación:** Bearer token

**Parámetros:**
```
- type_id (number, required): ID del tipo de ticket
- shipment_id (number, optional)
- carrier_id (number, optional)
- comments (string, optional)
- data (string, optional): JSON con variables adicionales del ticket
- api_key (string, required)
```

**Validaciones:**
- No puede existir ticket activo con mismo shipment_id y type_id
- Auto-asigna ticket via autoAssignTicket()
- Tipos especiales: 18 (verificación), 19 (crédito) actualizan tabla companies

---

### Tool 4.4: `envia_add_ticket_comment`
**Endpoint:** POST /company/tickets/{ticket_id}/comments (queries)
**Descripción:** Agregar comentario a un ticket
**Autenticación:** Bearer token

**Parámetros:**
```
- ticket_id (number, required)
- comment (string, required)
- status_id (number, required): Nuevo estado del ticket
- api_key (string, required)
```

**Lógica:** Inserta comentario + actualiza ticket_status_id del ticket

---

### Tool 4.5: `envia_rate_ticket`
**Endpoint:** POST /tickets/ratings/{ticket_id} (queries)
**Descripción:** Enviar rating CSAT de un ticket
**Autenticación:** Bearer token

**Parámetros:**
```
- ticket_id (number, required)
- rating (number, required): 1-5 estrellas
- comment (string, optional)
- api_key (string, required)
```

**Validaciones:** Solo 1 rating por ticket. Si existe, actualiza; si no, inserta.

---

### Tool 4.6: `envia_get_ticket_types`
**Endpoint:** GET /tickets/types (queries)
**Descripción:** Obtener tipos de tickets disponibles
**Autenticación:** Bearer token

**Parámetros:** api_key (string, required)

---

## FASE 5: Sucursales (Branches)
**Prioridad:** MEDIA — Necesario para pickup points y drop-off
**Estimación:** 3 tools nuevos

### Tool 5.1: `envia_search_branches`
**Endpoint:** GET /branches/{carrier}/{country_code} (queries)
**Descripción:** Buscar sucursales de un carrier por ubicación
**Autenticación:** Sin auth (público)

**Parámetros:**
```
- carrier (string, required): Código del carrier
- country_code (string, required): ISO 2 chars
- zipcode (string, optional)
- locality (string, optional): Ciudad/localidad
- state (string, optional): Estado/provincia
- latitude (number, optional)
- longitude (number, optional)
- type (number, optional, default 1): 1=pickup, 2=dropoff, 3=ambos
- shipment_type (number, optional): 0-9
- limit (number, optional)
```

**Lógica de búsqueda (cascada):**
1. Si hay coordenadas → búsqueda por proximidad (50km max)
2. Si hay zipcode → filtrar por código postal
3. Fallback → todas las sucursales del carrier

**Respuesta:** branches[{ branch_id, branch_code, branch_type, reference, address{street, number, postalCode, locality, city, state, country, latitude, longitude, admission, delivery}, distance }]

**Cache:** 24 horas

---

### Tool 5.2: `envia_get_branches_catalog`
**Endpoint:** GET /branches/{carrier}/{country_code}/catalog (queries)
**Descripción:** Obtener catálogo jerárquico de sucursales (estados → localidades)
**Autenticación:** Sin auth

**Parámetros:**
```
- carrier (string, required)
- country_code (string, required)
```

**Respuesta:** { states: string[], localities: { [state]: string[] } }

---

### Tool 5.3: `envia_search_branches_carrier`
**Endpoint:** POST /ship/branches (carriers)
**Descripción:** Búsqueda avanzada de sucursales via carriers service
**Autenticación:** Bearer token

**Parámetros:**
```
- carrier (string, required)
- country_code (string, optional)
- zipcode (string, optional)
- city (string, optional)
- state (string, optional)
- street (string, optional)
- service_name (string, optional)
- capacity (number, optional): 1=recepción, 2=entrega, 3=ambas
- shipment_type (number, optional): 1=paquetes, 2=pallet, 3=FTL
- packages (array, optional): [{ weight, length, width, height, amount }]
- api_key (string, required)
```

---

## FASE 6: Configuración y Empresa
**Prioridad:** MEDIA — Operaciones de administración
**Estimación:** 10 tools nuevos

### Tool 6.1: `envia_get_company_info`
**Endpoint:** GET /company-info (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key (required)
**Respuesta:** Datos de empresa, plan, balance, verificación KYC

### Tool 6.2: `envia_get_company_users`
**Endpoint:** GET /company/users (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key (required)
**Respuesta:** Lista de usuarios con roles

### Tool 6.3: `envia_get_company_shops`
**Endpoint:** GET /company/shops (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key (required)
**Respuesta:** Lista de tiendas ecommerce conectadas

### Tool 6.4: `envia_get_carrier_config`
**Endpoint:** GET /carrier-company/config (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key, limit, page
**Respuesta:** Configuración de carriers de la empresa (custom keys, prioridades)

### Tool 6.5: `envia_get_checkout_rules`
**Endpoint:** GET /checkout-rules (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key, limit, page
**Respuesta:** Reglas de checkout (tipo Money/Weight, descuentos, carriers)

### Tool 6.6: `envia_manage_checkout_rules`
**Endpoint:** POST/PUT/DELETE /checkout-rules (queries)
**Autenticación:** Bearer token
**Parámetros:** action ('create'|'update'|'delete'), rule data, api_key

### Tool 6.7: `envia_get_notification_config`
**Endpoint:** GET /config/notification (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key
**Respuesta:** Configuración de notificaciones (email, WhatsApp, templates)

### Tool 6.8: `envia_get_shipping_rules`
**Endpoint:** GET /config/{shop_id}/shipping-rules (queries)
**Autenticación:** Bearer token
**Parámetros:** shop_id, api_key
**Respuesta:** Reglas de envío configuradas

### Tool 6.9: `envia_get_api_tokens`
**Endpoint:** GET /get-api-tokens (queries)
**Autenticación:** Bearer token
**Parámetros:** api_key
**Respuesta:** Tokens API activos

### Tool 6.10: `envia_manage_webhooks`
**Endpoint:** GET/POST/PUT/DELETE /webhooks (queries)
**Autenticación:** Bearer token

**Parámetros:**
```
- action (string, required): 'list' | 'create' | 'update' | 'delete'
- webhook_id (number, required for update/delete)
- type_id (number, required for create)
- url (string, required for create)
- active (number, optional): 0 | 1
- api_key (string, required)
```

**Lógica create:** Auto-genera secret via crypto.generateSecret()

---

## FASE 7: Analytics
**Prioridad:** MEDIA — Inteligencia de negocio para agentes
**Estimación:** 5 tools nuevos

### Tool 7.1: `envia_get_monthly_analytics`
**Endpoint:** GET /analytics/get-monthly-analytics-data (queries)
**Autenticación:** Bearer token

**Parámetros:**
```
- sDate (string, required): YYYY-MM-DD start
- eDate (string, required): YYYY-MM-DD end
- carriers (string[], optional)
- services (string[], optional)
- shipmentTypes (string[], optional)
- api_key (string, required)
```

### Tool 7.2: `envia_get_carriers_stats`
**Endpoint:** GET /analytics/carriers-stats (queries)
**Parámetros adicionales:** categoryWeight ('KG'|'LB'), countryO[], stateO[], countryD[], stateD[], rangeWeightS[], rangeWeightE[]

### Tool 7.3: `envia_get_packages_module`
**Endpoint:** GET /analytics/packages-module (queries)
**Parámetros:** sDate, eDate, carriers[], services[], shipmentTypes[]

### Tool 7.4: `envia_get_issues_module`
**Endpoint:** GET /analytics/issues-module (queries)
**Parámetros:** sDate, eDate, carriers[], services[]

### Tool 7.5: `envia_get_shipments_map`
**Endpoint:** GET /analytics/map (queries)
**Parámetros:** sDate, eDate, carriers[], services[]

---

## FASE 8: Carriers Service — Endpoints Adicionales
**Prioridad:** MEDIA — Operaciones avanzadas
**Estimación:** 8 tools nuevos

### Tool 8.1: `envia_track_authenticated`
**Endpoint:** POST /ship/track (carriers)
**Descripción:** Tracking autenticado con datos más ricos
**Autenticación:** Bearer token

**Parámetros:**
```
- carrier (string, required)
- tracking_numbers (string[], required): Max = track_limit del carrier (default 10)
- service (string, optional)
- api_key (string, required)
```

**Diferencia vs generaltrack:** Retorna statusEnvia + statusCarrier, datos más detallados, requiere auth

---

### Tool 8.2: `envia_generate_bill_of_lading`
**Endpoint:** POST /ship/billoflading (carriers)
**Descripción:** Generar carta porte / bill of lading
**Autenticación:** Bearer token

**Parámetros:**
```
- tracking_number (string, required): Envío existente
- origin (object, required): name, street, city, state, country, postalCode, taxId
- destination (object, required): misma estructura
- packages (array, required):
  - amount (number)
  - cost (number)
  - currency (string)
  - totalWeight (number)
  - items (array): [{ description, quantity, price }]
- api_key (string, required)
```

**Validaciones:** Shipment debe existir y no estar cancelado (status_id != 4). Calcula taxes automáticamente.

---

### Tool 8.3: `envia_generate_manifest`
**Endpoint:** POST /ship/manifest (carriers)
**Descripción:** Generar manifiesto de envíos
**Autenticación:** Bearer token

**Parámetros:**
```
- tracking_numbers (string[], required): Números de rastreo para manifiesto
- api_key (string, required)
```

**Validaciones:** Status_id debe estar en [1, 16] (activos). Agrupa por carrier automáticamente.
**Respuesta:** Documento manifiesto (PDF/XML) por carrier

---

### Tool 8.4: `envia_submit_nd_report`
**Endpoint:** POST /ship/ndreport (carriers)
**Descripción:** Reportar no entrega (NDR action)
**Autenticación:** Bearer token

**Parámetros:**
```
- carrier (string, required)
- tracking_number (string, required)
- action_code (string, required): Código de acción NDR (ej: 'return', 'return-to-sender')
- api_key (string, required)
```

**Validaciones:** 
- Status_id debe estar en [5,6,10,14,15,17,18,19,20,21,22,24]
- action_code debe existir en carrier_ndr_actions para ese carrier

---

### Tool 8.5: `envia_cancel_pickup`
**Endpoint:** POST /ship/pickup (carriers, acción cancelar)
**Descripción:** Cancelar un pickup programado
**Autenticación:** Bearer token

**Parámetros:**
```
- carrier (string, required)
- confirmation (string, required): Número de confirmación del pickup
- api_key (string, required)
```

**Validaciones:** Pickup no debe estar ya cancelado (status_id != 5)

---

### Tool 8.6: `envia_track_pickup`
**Endpoint:** POST /ship/pickup (carriers, acción track)
**Descripción:** Rastrear estado de pickups
**Autenticación:** Bearer token

**Parámetros:**
```
- carrier (string, required)
- confirmation (string[], required): Números de confirmación
- api_key (string, required)
```

---

### Tool 8.7: `envia_locate_city`
**Endpoint:** POST /locate (carriers)
**Descripción:** Validar/buscar ciudades (Colombia DANE, geocodes)
**Autenticación:** Sin auth

**Parámetros:**
```
- city (string, required)
- state (string, required)
- country (string, required, 2 chars ISO)
```

**Respuesta:** { city (código), name (nombre completo), state (código 2 dígitos) }
**Uso:** Traducir ciudades DANE en Colombia, validar combinación city/state/country

---

### Tool 8.8: `envia_checkout_quote`
**Endpoint:** POST /v2/checkout/{ecommerce}/{shopId} (carriers)
**Descripción:** Cotizar envío para checkout de ecommerce
**Autenticación:** User-Agent WooCommerce

**Parámetros:**
```
- ecommerce (string, required): 'woocommerce' | 'shopify' | etc.
- shop_id (string, required)
- origin (object, required): country, state, city, postalCode
- destination (object, required): country, state, city, postalCode
- packages (array, required): [{ weight, length, width, height, amount }]
- api_key (string, required)
```

**Respuesta:** Array de carriers con servicios, precios, tiempos de entrega
**Lógica:** Genera JWT temporal (30s), consulta carriers activos del shop, aplica backup rules si todos fallan

---

## FASE 9: Notificaciones y Comunicación
**Prioridad:** BAJA-MEDIA — Útil para automatización
**Estimación:** 4 tools nuevos

### Tool 9.1: `envia_send_whatsapp`
**Endpoint:** POST /notifications/whatsapp (queries)
**Autenticación:** JWT

**Parámetros:**
```
- customer_name (string, required)
- customer_phone (string, required)
- template (string, required): Nombre del template WhatsApp
- params (object, required): Parámetros del template
- language (string, optional): Código de idioma (es-MX, pt-BR, en-US)
- api_key (string, required)
```

**Validaciones:** Template debe existir en catalog_whatsapp_templates. Params validados contra schema dinámico del template.

### Tool 9.2: `envia_get_notification_prices`
**Endpoint:** GET /notifications/prices (queries)
**Parámetros:** api_key
**Respuesta:** [{ type, price, currency }]

### Tool 9.3: `envia_list_company_notifications`
**Endpoint:** GET /company/notifications (queries)
**Parámetros:** api_key, limit, page
**Respuesta:** { all[], payments[], returns[], unreadCounter }

### Tool 9.4: `envia_test_webhook`
**Endpoint:** POST /notifications/webhook/test (queries)
**Parámetros:** tracking_number, carrier, shipment_status, api_key

---

## FASE 10: Productos y DCe Brasil
**Prioridad:** BAJA — Funcionalidades especializadas
**Estimación:** 5 tools nuevos

### Tool 10.1: `envia_list_products`
**Endpoint:** GET /products (queries)
**Parámetros:** search, shop_id, limit, page, api_key

### Tool 10.2: `envia_get_product`
**Endpoint:** GET /products/envia/{product_id} (queries)
**Parámetros:** product_id, api_key

### Tool 10.3: `envia_get_dce_status`
**Endpoint:** GET /dce/status (queries)
**Parámetros:** api_key
**Respuesta:** Estado de DCe, configuración

### Tool 10.4: `envia_authorize_dce`
**Endpoint:** POST /dce/autorizar (carriers)
**Parámetros:** Items con productCode (NCM), identificationNumber (CPF/CNPJ), direcciones

### Tool 10.5: `envia_get_billing_info`
**Endpoint:** GET /billing-info (queries)
**Parámetros:** api_key
**Respuesta:** Info de facturación, métodos de pago, crédito

---

## Resumen de Fases

| Fase | Dominio | Tools Nuevos | Prioridad | Dependencias |
|------|---------|-------------|-----------|-------------|
| 1 | Envíos (Shipments) | 15 | CRÍTICA | api-client existente |
| 2 | Órdenes (Orders) | 12 | ALTA | Fase 1 (referencias a shipments) |
| 3 | Direcciones + Paquetes + Clientes | 12 | ALTA | Ninguna |
| 4 | Tickets (Soporte) | 6 | MEDIA-ALTA | Fase 1 (shipment_id) |
| 5 | Sucursales (Branches) | 3 | MEDIA | Ninguna |
| 6 | Configuración + Empresa | 10 | MEDIA | Ninguna |
| 7 | Analytics | 5 | MEDIA | Ninguna |
| 8 | Carriers Avanzados | 8 | MEDIA | Fase 1 |
| 9 | Notificaciones | 4 | BAJA-MEDIA | Ninguna |
| 10 | Productos + DCe | 5 | BAJA | Ninguna |
| **TOTAL** | | **80 tools** | | |

## Arquitectura de Implementación

### Patrón por tool (consistente con codebase actual):

```
src/tools/{domain}/{tool-name}.ts    — Tool registration + Zod schema + handler
src/services/{domain}.ts              — Business logic + API calls
src/builders/{domain}.ts              — Payload builders (si necesario)
src/types/{domain}.ts                 — TypeScript interfaces
tests/tools/{domain}/{tool-name}.test.ts — Tests
```

### Nuevos dominios a crear:
```
src/tools/shipments/          — Fase 1
src/tools/orders/             — Fase 2
src/tools/addresses/          — Fase 3
src/tools/packages/           — Fase 3
src/tools/customers/          — Fase 3
src/tools/tickets/            — Fase 4
src/tools/branches/           — Fase 5
src/tools/config/             — Fase 6
src/tools/analytics/          — Fase 7
src/tools/notifications/      — Fase 9
src/tools/products/           — Fase 10
```

### API Client — Cambios necesarios:
1. Agregar queries base URL como segundo endpoint (actualmente solo usa carriers API)
2. Soporte para GET requests con query parameters (actualmente POST-heavy)
3. Soporte para binary responses (PDF streams para labels-bulk, packing-slip)
4. Soporte para rate limiting headers (queries tiene 300 req/1000ms)

### Autenticación — Cambios necesarios:
- El token actual (ENVIA_API_KEY) funciona como Bearer token para queries también
- Para endpoints JWT-only (notifications/sockets), necesitar generar JWT temporal
- Para endpoints sin auth (branches, locate), no enviar Authorization header

### Configuración — Nuevas env vars:
```
ENVIA_QUERIES_URL     — Base URL de queries (https://queries.envia.com o test)
```
La URL de queries ya se puede derivar del environment (sandbox vs production).
