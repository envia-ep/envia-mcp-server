# MCP Expansion — Fase 3: Ecommerce Orders

## Objetivo
Implementar 12 tools MCP para gestión de órdenes de ecommerce en `ai-agent/envia-mcp-server/`. Seguir EXACTAMENTE el patrón establecido en Fases anteriores.

## Contexto previo
- **35 tools live** (Fases 0-2 completas). 772 tests, 49 test files, build limpio.
- Fase 2 (Addresses + Packages + Clients) es el template más reciente — usa ese patrón.
- Toda la info de Órdenes viene del **queries service** (no carriers, no ecommerce).
- **Todos los 12 endpoints han sido verificados** contra el API real (2026-04-15).

## Archivos a leer ANTES de implementar

### 1. Templates (copiar este patrón exacto)
```
src/services/addresses.ts       → Template de service layer con CRUD (query/mutate/update/delete)
src/tools/addresses/list-addresses.ts → Template de GET tool con filtros y paginación
src/tools/clients/create-client.ts    → Template de POST tool con nested objects
src/tools/addresses/index.ts    → Template de barrel export
src/index.ts                    → Dónde registrar tools (ver sección "Address tools" como ejemplo)
```

### 2. Contratos API verificados (source of truth — USAR ESTOS, no el plan)
Lee la memoria `reference_ordenes_api.md` — tiene los contratos REALES verificados via curl para TODOS los endpoints. Secciones 1-17.

**IMPORTANTE:** Los contratos verificados difieren del `MCP_EXPANSION_PLAN.md` en varios campos requeridos. Siempre usa `reference_ordenes_api.md` como fuente de verdad.

### 3. Helpers existentes
```
src/services/shipments.ts       → buildQueryUrl() — REUTILIZAR, no duplicar
src/utils/api-client.ts         → EnviaApiClient con get/post/put/delete
src/utils/error-mapper.ts       → mapCarrierError()
src/utils/mcp-response.ts       → textResponse()
src/utils/schemas.ts            → requiredApiKeySchema, dateSchema, etc.
tests/helpers/mock-server.ts    → createMockServer() para tests
tests/helpers/fixtures.ts       → MOCK_CONFIG
```

### 4. Tipos existentes (NO DUPLICAR)
```
src/types/ecommerce-order.ts    → V4OrdersResponse, V4Order, V4Shop, V4Tag, V4Package,
                                   V4Customer, V4ShippingAddress, V4Location, V4Dimensions,
                                   V4PackageQuote, V4PackageShipment, V4Fulfillment, V4Product,
                                   V4AdditionalService, V4OrderDetails, V4Ecommerce
src/services/ecommerce-order.ts → EcommerceOrderService (fetches single orders for label generation)
```

## ⚠️ CRITICAL: Overlap with existing tool

**`envia_get_ecommerce_order`** already exists and does:
- Fetches a single order from `GET /v4/orders?order_identifier=X`
- Transforms it into carrier payloads (rate + generate)
- Uses `EcommerceOrderService` class

**New `envia_list_orders`** is DIFFERENT:
- Lists multiple orders with filters and pagination (browsing/management)
- Returns formatted text summaries, NOT carrier payloads
- Does NOT transform orders — just displays them

**Rule:** Do NOT modify `envia_get_ecommerce_order` or `EcommerceOrderService`. The new tools operate at the order management level, not the shipping workflow level.

## ⛔ DROPPED: envia_rate_order

`GET /orders/{shop_id}/{order_id}/rate` requires `auth: 'jwt'` — the ONLY order endpoint that uses JWT authentication instead of `token_user`. The MCP server's simple Bearer token **cannot authenticate** against this endpoint.

**Workaround already exists:** Use `envia_get_ecommerce_order` + `quote_shipment` to rate orders through the carriers API. This tool is NOT needed.

## Los 12 tools a implementar

| # | Tool Name | Method | Endpoint | Descripción | Verified |
|---|-----------|--------|----------|-------------|----------|
| 1 | `envia_list_orders` | GET | /v4/orders | Listar órdenes con filtros avanzados | ✅ |
| 2 | `envia_get_orders_count` | GET | /v2/orders-count | Contadores por estado (7 categorías) | ✅ |
| 3 | `envia_list_shops` | GET | /company/shops | Listar tiendas conectadas | ✅ |
| 4 | `envia_update_order_address` | PUT | /orders/{shop_id}/{order_id}/address | Actualizar dirección de orden | ✅ |
| 5 | `envia_update_order_packages` | PUT | /orders/{shop_id}/{order_id}/packages | Actualizar paquetes de orden | ✅ |
| 6 | `envia_select_order_service` | PUT | /orders/{shop_id}/{order_id}/rate | Seleccionar servicio para un paquete | ✅ |
| 7 | `envia_fulfill_order` | POST | /orders/{shop_id}/{order_id}/fulfillment/order-shipments | Crear fulfillment | ✅ |
| 8 | `envia_get_order_filter_options` | GET | /orders/filter-options | Opciones disponibles para filtros | ✅ |
| 9 | `envia_manage_order_tags` | POST/DELETE | /orders/tags | Agregar/eliminar etiquetas | ✅ |
| 10 | `envia_generate_packing_slip` | POST | /orders/packing-slip | Generar PDF lista de empaque | ✅ |
| 11 | `envia_generate_picking_list` | POST | /orders/picking-list | Generar PDF lista de picking | ✅ |
| 12 | `envia_get_orders_analytics` | GET | /orders/orders-information-by-status | Analítica por estado de envío | ✅ |

## Verified API contracts (key differences from plan)

### update-order-address (tool 4) — MANY more required fields than plan
The plan listed address2, address3, identification_number, phone_code as optional. The real API makes them ALL **required** (though they accept empty string `""`). Full required field list from `reference_ordenes_api.md` section 9:
- address_type_id, first_name, last_name (allows ""), address1, **address2** (allows ""), **address3** (allows ""), country_code, state_code, city, postal_code (allows ""), phone, **phone_code** (allows ""), **identification_number** (allows ""), **references** (allows "")
- Optional: package_id, company, interior_number
- Field name is `references` (plural), NOT `reference` (singular) as in the plan

### update-order-packages (tool 5) — insurance/declared_value required
Plan said optional; real API makes `insurance` and `declared_value` **required** (min 0, default 0).

### select-order-service (tool 6) — simple response
Response: `{ success: true, msg: "Package rate saved" }`

### fulfill-order (tool 7) — requires shipment_id OR tracking_number
Plan listed both as optional. Real validation: "At least one of the following fields is required: shipment_id, tracking_number."
Additional field not in plan: `shipment_method` (optional: normal|manual|automatic)

### filter-options (tool 8) — simpler than expected
Only returns `{ destinations_country_code: [{country_code, country_name}] }`. No carriers, no shipping methods.

### orders-analytics (tool 12) — flat structure, typo in field name
Response is FLAT (not nested). Field name `unfullfilledOrders` has a typo (double L) — this is the real API response. Full fields:
```
unfullfilledOrders, readyToFulFill, readyToShip, pickUpInTransit, 
percentagePickUpInTransit, outForDelivery, percentageOutForDelivery,
delivered, percentageDelivered, withIncidents, percentageWithIncidents,
returned, percentageReturned, sumOrdersActive
```

## Special implementation patterns

### Pattern 1: Binary PDF responses (tools 10, 11)
`packing-slip` and `picking-list` return **raw PDF binary** (`%PDF-1.7`), NOT JSON. The `textResponse()` pattern cannot return binary data.

**Strategy:** These tools should make the API call and, since MCP tools can only return text, respond with a confirmation message: "Packing slip generated for N orders. The PDF was generated successfully." The tool cannot deliver the actual PDF to the AI assistant — it's a limitation of the text-only MCP protocol. The tool's value is confirming the generation succeeded (or reporting the error).

**Implementation:** Use `fetch()` directly (or `client.request()` at low level) instead of `client.post()` which expects JSON. Check `response.ok` and `response.headers.get('content-type')` to confirm PDF was returned.

### Pattern 2: Multi-action tool (tool 9 — manage_order_tags)
Uses POST for add, DELETE for remove — controlled by an `action` parameter:
- `action: 'add'` → `POST /orders/tags` with `{ order_ids, tags }`
  - Response: `{ success, inserted, tags: [{order_id, tag_id, tag, source, created_by, created_at}] }`
- `action: 'remove'` → `DELETE /orders/tags` with `{ order_ids, tag_ids }`
  - Response: `{ success, deleted: 1 }`

Zod schema: tags required when action='add', tag_ids required when action='remove'.

### Pattern 3: Irreversible operation (tool 7 — fulfill_order)
**CRITICAL:** When ALL packages in an order receive fulfillment, the order is automatically marked as COMPLETED. This is irreversible. The tool description MUST warn:
> "⚠️ When all packages in the order receive fulfillment, the order is automatically marked as completed. This cannot be undone."

### Pattern 4: Shops raw array response (tool 3 — list_shops)
`/company/shops` returns a **raw array** (not wrapped in `{data: [...]}`) with ALL shops including deleted/inactive (207 total, ~36 active). Filter by `active === 1 && deleted === 0` by default, show total vs active count.

### Pattern 5: Three status systems in orders
Orders have 3 independent status dimensions. Formatters must show all 3:
- `status_id` / `status_name` → General: Payment Pending, Label Pending, Pickup Pending, Shipped, Canceled, Completed
- `ecart_status_id` / `ecart_status_name` → Payment: Paid, Pending, COD
- `fulfillment_status_id` → Preparation: 1=Fulfilled, 2=Partial, 3=Unfulfilled, 4=Other, 5=On Hold

## Patrón de implementación (seguir en este orden)

### Step 1: Types
Create `src/types/orders.ts` — ONLY for types that DON'T already exist:
- **Import and re-export** from `ecommerce-order.ts`: `V4OrdersResponse`, `V4Order`, `V4Shop`, `V4Tag`
- **New types to create:**
  - `OrderCountsResponse` — `{ data: { payment_pending: {total, total_by_store[]}, ... } }`
  - `ShopRecord` — for `/company/shops` response (different shape from `V4Shop` — has url, active, deleted, checkout, ecommerce_id, etc.)
  - `OrderFilterOptionsResponse` — `{ destinations_country_code: [{country_code, country_name}] }`
  - `OrderAnalyticsResponse` — flat object with unfullfilledOrders, readyToFulFill, etc.
  - `FulfillOrderResponse` — `{ success, id, packages_fulfillment, isFulfillmentOrder, completed }`
  - `TagAddResponse` — `{ success, inserted, tags: [{order_id, tag_id, tag, source, created_by, created_at}] }`
  - `TagRemoveResponse` — `{ success, deleted }`

### Step 2: Service
Create `src/services/orders.ts`:
- `queryOrdersApi()` — GET helper (reutilizar `buildQueryUrl` de shipments.ts)
- `mutateOrderApi()` — POST helper
- `updateOrderApi()` — PUT helper
- `deleteOrderApi()` — DELETE helper (for tag removal)
- **Formatters:**
  - `formatOrderSummary(order)` — One-line summary (name, shop, customer, 3 statuses)
  - `formatOrderCounts(data)` — 7 categories with totals
  - `formatShopSummary(shop)` — Shop name, platform, active status
  - `formatAnalytics(data)` — All analytics fields in readable text

### Step 3: Tools
Create `src/tools/orders/` with one file per tool (12 files):
- Each tool follows: `resolveClient → build params → queryApi → mapCarrierError → format → textResponse`
- Descriptions must be rich enough for the AI agent to know WHEN to use each tool
- For tools with path params, URL format is: `${config.queriesBase}/orders/${shop_id}/${order_id}/...`

### Step 4: Barrel + Registration
- `src/tools/orders/index.ts` — barrel export all 12 register functions
- `src/index.ts` — import barrel + register in `createEnviaServer()` below the clients section

### Step 5: Tests
- `tests/services/orders.test.ts` — tests de formatters/helpers puros
- `tests/tools/orders/list-orders.test.ts` — test representativo del GET principal
- `tests/tools/orders/get-orders-count.test.ts` — test de contadores
- `tests/tools/orders/list-shops.test.ts` — test with raw array response + filtering
- Opcional: 1-2 tests más para tools complejos (fulfill, tags)

### Step 6: Verificación
```bash
npx tsc --noEmit          # Must be clean
npx vitest run            # All tests must pass (772+ existing + new)
npm run build             # Must complete without errors
```

## Reglas críticas
1. **No duplicar** `buildQueryUrl` — importar de `src/services/shipments.ts`
2. **No duplicar tipos** de `ecommerce-order.ts` — importar lo que ya existe
3. **No modificar** `envia_get_ecommerce_order` ni `EcommerceOrderService`
4. **api_key** siempre usa `requiredApiKeySchema` de schemas.ts
5. **Responses son texto** — formatear como texto legible, no JSON raw
6. **Errores** — siempre `mapCarrierError()` en el catch path
7. **CLAUDE.md del repo** tiene reglas de code style (single quotes, 4 spaces, semicolons, etc.)
8. **Tests** — AAA pattern, factories inline, mock fetch via `vi.stubGlobal`
9. La response de `/v4/orders` usa `orders_info` (NO `data`) como key
10. La response de `/company/shops` es un **array top-level** (NO wrapped en `data`)
11. **`reference_ordenes_api.md`** es la fuente de verdad para campos requeridos — NO el plan

## Notas sobre el API de órdenes
- `/v4/orders` response: `{ orders_info: [...], countries: [...], totals: number }`
- `/v2/orders-count` response: `{ data: { payment_pending: {total}, label_pending: {total}, ... } }`
- `/company/shops` response: array top-level, 207 total items, ~36 active
- PUT endpoints usan path params `{shop_id}/{order_id}`
- `manage_order_tags`: POST for add, DELETE for remove — dual method pattern
- `packing-slip` y `picking-list`: raw PDF binary — NO JSON
- `fulfill-order`: IRREVERSIBLE when all packages fulfilled
- Three independent status systems: status_id, ecart_status_id, fulfillment_status_id
- `orders-analytics`: flat response, `unfullfilledOrders` (typo is real)
- `update-address`: 14 required fields (many allow empty ""), field name is `references` not `reference`
- `update-packages`: insurance and declared_value are REQUIRED (min 0)
- `fulfill-order`: at least one of shipment_id OR tracking_number required

## Al terminar
- Verificar que `npx vitest run` pasa TODOS los tests (existentes + nuevos)
- Verificar que `npm run build` compila limpio
- Reportar: cuántos tools nuevos, cuántos tests nuevos, total acumulado
