# Endpoint Audit: ecommerce + eshops + ecartApiOauth

**Date:** 2026-04-24  
**Scope:** Three related Envia backend services for e-commerce integration, webhook ingestion, and OAuth flow management.  
**MCP Exposure (Current):** `POST /tmp-fulfillment/{shop}/{order}` (internal side-effect of `envia_create_label`; not LLM-visible).

---

## Services overview

### ecommerce (Node/Hapi, ~180 LOC endpoints)
Webhook ingestion and order synchronization engine. Receives events from e-commerce platforms (Shopify, WooCommerce, etc.), normalizes them, and enqueues work for fulfillment and label generation. Routes live under `/services/ecommerce/routes/` with authentication mixed (`token_user`, `token_admin`, `auth: false` for webhooks). Reference: `_meta/analysis-ecommerce.md` (score: 18/30, urgency: 1).

### eshops (Node/Hapi, ~300+ endpoints)
Multi-channel e-commerce API façade. Normalizes products, orders, services, webhooks, and fulfillment operations across v1, v2 (main), and v3 (central sync) versions. Uses MongoDB + Redis for state and integrations with 36+ marketplace connectors. Reference: `_meta/analysis-eshops.md` (score: 15/30, urgency: 1).

### ecartApiOauth (Node/Express, ~20 endpoints)
OAuth server and integration broker for marketplace account authorization. Handles Shopify, WooCommerce, MercadoLibre, Amazon, and others; manages credentials and app state. Uses MongoDB + Redis + session middleware. Reference: `_meta/analysis-ecartApiOauth.md` (score: 12/30, urgency: 1).

**Stack:** Node 18–24.x, Hapi (ecommerce, eshops) / Express (ecartApiOauth), MongoDB (eshops, ecartApiOauth) + MySQL (ecommerce), Redis.

---

## Endpoint inventory (consolidated)

| # | Endpoint | Purpose (1 line) | User question it enables | Classification | Already exposed? | Value | Risks | Implementation notes | PII/Financial | Sandbox | T-shirt | Consumer today | Overlap |
|---|----------|-----------------|--------------------------|-----------------|------------------|-------|-------|----------------------|---------------|---------|---------|----------------|---------|
| 1 | [ecommerce] POST /webhook/order/create/{shop_id} | Ingest new e-commerce order from platform webhook | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`, receives platform webhooks directly; enqueues worker jobs. `ecommerce/routes/webhook.js:24` | Sí | Sí | S | webhook ingestion | — |
| 2 | [ecommerce] POST /webhook/order/update/{shop_id} | Update existing order state from webhook | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; triggered by marketplace platform updates. `ecommerce/routes/webhook.js:52` | Sí | Sí | S | webhook ingestion | — |
| 3 | [ecommerce] POST /webhook/order/delete/{shop_id} | Delete order record upon platform cancellation | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, destructive | `auth: false`; deletes order state. `ecommerce/routes/webhook.js:80` | Sí | Sí | S | webhook ingestion | — |
| 4 | [ecommerce] GET /webhook/reactive | Reactivate failed webhooks manually | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | Requires auth `token_admin`; re-enqueues failed jobs. `ecommerce/routes/webhook.js:100` | No | Sí | S | admin ops | — |
| 5 | [ecommerce] POST /webhook/bulkOperation/finish/{shop_id} | Signal bulk operation completion from Shopify | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; Shopify bulk operation callback. `ecommerce/routes/webhook.js:120` | No | Sí | S | webhook ingestion | — |
| 6 | [ecommerce] POST /webhook/create/{shop_id} | Manually register webhooks on shop platform | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_user'`; orchestrates webhook registration with platform. `ecommerce/routes/webhook.js:10` | No | Sí | M | admin ops | — |
| 7 | [ecommerce] POST /webhook-product/create/{shop_id} | Ingest product created event from marketplace | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; enqueues product sync worker. `ecommerce/routes/webhookProduct.js:40` | Sí | Sí | S | webhook ingestion | — |
| 8 | [ecommerce] POST /webhook/product/create/{shop_id} | (alt) Ingest product created from platform | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; duplicate entry point (legacy naming). `ecommerce/routes/webhookProduct.js:80` | Sí | Sí | S | webhook ingestion | — |
| 9 | [ecommerce] POST /webhook/product/update/{shop_id} | Update product catalog on platform event | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; enqueues product update. `ecommerce/routes/webhookProduct.js:140` | Sí | Sí | S | webhook ingestion | — |
| 10 | [ecommerce] POST /webhook/product/delete/{shop_id} | Remove product from catalog on deletion | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, destructive | `auth: false`; removes product state. `ecommerce/routes/webhookProduct.js:100` | Sí | Sí | S | webhook ingestion | — |
| 11 | [ecommerce] POST /webhook/product/count/{shop_id} | Log product sync progress | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; progress tracking during bulk operations. `ecommerce/routes/webhookProduct.js:60` | No | Sí | XS | webhook ingestion | — |
| 12 | [ecommerce] POST /webhook/app/delete/{shop_id} | Uninstall app/integration from store | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, destructive | `auth: false`; webhook from platform on app uninstall. `ecommerce/routes/webhookApp.js:5` | No | Sí | S | webhook ingestion | — |
| 13 | [ecommerce] POST /rueddo/receptions | Webhook for Rueddo warehouse receipts | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; Rueddo 3PL integration callback. `ecommerce/routes/webhook.js:145` | No | Solo prod | S | webhook ingestion | — |
| 14 | [ecommerce] GET /check/store/{shop_id} | Health check: shop connectivity and config | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_user'`; verifies shop is configured and reachable. `ecommerce/routes/check.js:15` | No | Sí | S | admin ops | — |
| 15 | [ecommerce] GET /check/orders/{shop_id} | Health check: order sync pipeline | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_user'`; verifies orders are flowing. `ecommerce/routes/check.js:25` | No | Sí | S | admin ops | — |
| 16 | [ecommerce] GET /check/products/{shop_id} | Health check: product sync pipeline | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_user'`; verifies products are flowing. `ecommerce/routes/check.js:35` | No | Sí | S | admin ops | — |
| 17 | [ecommerce] GET /check/webhooks/{shop_id} | Health check: webhook registration status | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_user'`; confirms webhooks are active. `ecommerce/routes/check.js:45` | No | Sí | S | admin ops | — |
| 18 | [ecommerce] GET /check/checkout/{shop_id} | Health check: checkout integration | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_user'`; verifies checkout rules loaded. `ecommerce/routes/check.js:55` | No | Sí | S | admin ops | — |
| 19 | [ecommerce] GET /admin/check/store/{shop_id} | (alt) Admin check: store state | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`; elevated version of check/store. `ecommerce/routes/check.js:65` | No | Sí | S | admin ops | — |
| 20 | [ecommerce] GET /admin/check/orders/{shop_id} | (alt) Admin check: order pipeline | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`. `ecommerce/routes/check.js:75` | No | Sí | S | admin ops | — |
| 21 | [ecommerce] GET /admin/check/products/{shop_id} | (alt) Admin check: product pipeline | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`. `ecommerce/routes/check.js:85` | No | Sí | S | admin ops | — |
| 22 | [ecommerce] GET /admin/check/webhooks/{shop_id} | (alt) Admin check: webhook status | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`. `ecommerce/routes/check.js:95` | No | Sí | S | admin ops | — |
| 23 | [ecommerce] GET /admin/check/checkout/{shop_id} | (alt) Admin check: checkout rules | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`. `ecommerce/routes/check.js:105` | No | Sí | S | admin ops | — |
| 24 | [ecommerce] GET /label/create/{shop_id}/{order_id} | Generate shipping label for order | "Genera etiqueta para la orden #1234" | 🔵 V1-EXISTS-HIDDEN | ❌ | Alto | needs-confirmation | `auth: ['jwt', 'token_user']`; generates label + fulfillment sync side-effect. Not exposed as MCP tool yet. `ecommerce/routes/generate.js:10` | No | Sí | M | internal/API | ↔ queries:/v4/orders fulfill |
| 25 | [ecommerce] POST /order/fulfillment/{shop_id}/{order_identifier} | Complete fulfillment and notify marketplace | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; callback after label creation to mark order fulfilled on marketplace. `ecommerce/routes/orders.js:10` | No | Sí | S | webhook ingestion | ↔ queries:/orders/.../fulfillment |
| 26 | [ecommerce] GET /shop/sync/bulk-operations/{shop_id} | Query bulk operation status (Shopify) | "¿Cuál es el estado de mis operaciones masivas?" | 🟡 V1-PARTIAL | ❌ | Medio | requires-kyc | `auth: ['jwt', 'token_user']`; queries Shopify bulk operation progress. Only Shopify bulk; date params optional. `ecommerce/routes/shop.js:10` | No | Sí | M | internal/API | — |
| 27 | [ecommerce] POST /package/dimensions/{shop_id} | Calculate/store package dimensions | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`; sets dimension defaults per shop. `ecommerce/routes/packages.js:10` | No | Sí | M | admin ops | — |
| 28 | [ecommerce] POST /package/dimensions/test/{shop_id} | Validate dimension calculation logic | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`; tests dimension algorithm. `ecommerce/routes/packages.js:30` | No | Sí | S | admin ops | — |
| 29 | [ecommerce] POST /package/sync/{shop_id}/packages | Sync package list with shop platform | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`; publishes packages to marketplace. `ecommerce/routes/packages.js:50` | No | Sí | M | admin ops | — |
| 30 | [ecommerce] POST /package/sync/{shop_id}/{package_id} | Sync single package to marketplace | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`. `ecommerce/routes/packages.js:70` | No | Sí | S | admin ops | — |
| 31 | [ecommerce] PUT /admin/webhook/activate/{shop_id} | Activate all webhooks on shop | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, needs-confirmation | `auth: 'token_admin'`; calls webhook middleware to activate. `ecommerce/routes/webhookAdmin.js:10` | No | Sí | M | admin ops | — |
| 32 | [ecommerce] PUT /admin/webhook/deactivate/{shop_id} | Deactivate all webhooks on shop | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency, destructive, needs-confirmation | `auth: 'token_admin'`; removes all webhooks. `ecommerce/routes/webhookAdmin.js:50` | No | Sí | M | admin ops | — |
| 33 | [ecommerce] GET /admin/webhook/{shop_id}/reset/cache | **CRITICAL:** Clear webhook cache without auth | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, admin-dependency | **`auth: false`** — This endpoint should require auth. SECURITY HOLE. `ecommerce/routes/webhookAdmin.js:75` | No | Sí | XS | admin ops (unprotected) | — |
| 34 | [ecommerce] GET /sync/auto-package/all-stores | Auto-sync packages across all stores | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`; bulk operation. `ecommerce/routes/webhookAdmin.js:30` | No | Sí | M | admin ops | — |
| 35 | [ecommerce] POST /admin/testing/address | Test address validation for shop | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | admin-dependency | `auth: 'token_admin'`; validates country-specific address rules. `ecommerce/routes/webhookAdmin.js:90` | No | Sí | S | admin ops | — |
| 36 | [ecommerce] POST /log/create | Submit debug/operation logs | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; workers/webhooks post operational logs. `ecommerce/routes/logs.js:5` | Sí | Sí | XS | webhook ingestion | — |
| 37 | [ecommerce] GET /utils/check-webhook | Health check for webhook pipeline | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; minimal liveness probe. `ecommerce/routes/webhook.js:200` | No | Sí | XS | infrastructure | — |
| 38 | [eshops] GET /api/v1/{resource} (20 routes) | v1 API for legacy integrations | "¿Puedo obtener mis productos de v1?" | ⚫ ADMIN-ONLY | ❌ | Bajo | deprecated-backend | v1 is legacy; endpoints exist but clients should migrate to v2/v3. ~20 routes (addresses, categories, coupons, customers, ecommerces, listings, etc.). `eshops/routes/v1/*` | Depende | Sí | S | legacy API | — |
| 39 | [eshops] GET /api/v2/orders | List orders (normalized) | "¿Cuántas órdenes pendientes tengo?" | 🟢 V1-SAFE | ❌ | Alto | needs-confirmation | Hapi route with Joi validation. Full order list with filters. `eshops/routes/v2/orders.routes.js:10` | Sí | Sí | M | v2 API | ↔ queries:/v4/orders (overlap) |
| 40 | [eshops] GET /api/v2/orders/{orderId} | Get single order detail | "¿Cuáles son los detalles de orden 5678?" | 🟢 V1-SAFE | ❌ | Alto | — | Full order detail with items, addresses, fulfillment. `eshops/routes/v2/orders.routes.js:40` | Sí | Sí | M | v2 API | ↔ queries:/v4/orders/{id} |
| 41 | [eshops] POST /api/v2/orders | Create order | "Crea una nueva orden" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | financial-impact, needs-confirmation | Backend real in v2; creates order with items/addresses/fulfillment data. `eshops/routes/v2/orders.routes.js:70` | Sí | Sí | L | v2 API | — |
| 42 | [eshops] PUT /api/v2/orders/{orderId} | Update order state | "Actualiza el estado de la orden" | 🟢 V1-SAFE | ❌ | Medio | needs-confirmation | Modify order status, tags, addresses, items. `eshops/routes/v2/orders.routes.js:100` | Sí | Sí | M | v2 API | — |
| 43 | [eshops] DELETE /api/v2/orders/{orderId} | Delete order | "Elimina la orden 5678" | 🟢 V1-SAFE | ❌ | Bajo | destructive | Marks order as deleted. `eshops/routes/v2/orders.routes.js:130` | Sí | Sí | S | v2 API | — |
| 44 | [eshops] GET /api/v2/orders/count | Count orders by status | "¿Cuántas órdenes en estado pendiente?" | 🟢 V1-SAFE | ❌ | Medio | — | Returns counts by fulfillment_status. `eshops/routes/v2/orders.routes.js:160` | No | Sí | XS | v2 API | — |
| 45 | [eshops] PUT /api/v3/orders/delivered | **CRITICAL:** Delete customer PII without auth | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, destructive, pii-exposure | **`auth: false`** — deletes customer info on delivery. MASSIVE SECURITY HOLE. `eshops/routes/v3/orders.routes.js:79` | Sí | Sí | M | v3 API (UNPROTECTED) | — |
| 46 | [eshops] GET /api/v3/orders | List orders (central) | "Órdenes de mi cuenta central" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Alto | requires-kyc | v3 uses central MongoDB; filtered by tenancy. `eshops/routes/v3/orders.routes.js:10` | Sí | Solo prod | M | v3 API | ↔ queries + eshops:/v2 |
| 47 | [eshops] GET /api/v3/orders/{id} | Get order from central DB | "¿Cuáles son los detalles de mi orden central?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Alto | requires-kyc | Central sync endpoint; separate from v2 local. `eshops/routes/v3/orders.routes.js:30` | Sí | Solo prod | M | v3 API | — |
| 48 | [eshops] POST /api/v3/orders/{id}/fulfillments | Complete fulfillment (central) | "Marca como cumplida esta orden central" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | needs-confirmation, financial-impact | Fulfills order in central, notifies marketplace. `eshops/routes/v3/orders.routes.js:50` | No | Solo prod | M | v3 API | ↔ ecommerce:/order/fulfillment |
| 49 | [eshops] PUT /api/v3/orders/{id}/cancel | Cancel order (central) | "Cancela la orden central" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | destructive, needs-confirmation | Cancels order in central DB; reconciles with marketplace. `eshops/routes/v3/orders.routes.js:60` | No | Solo prod | M | v3 API | — |
| 50 | [eshops] GET /api/v2/products | List products (normalized) | "¿Cuáles son mis productos?" | 🟢 V1-SAFE | ❌ | Medio | — | Returns catalog with variants, pricing, inventory. `eshops/routes/v2/products.routes.js:20` | No | Sí | M | v2 API | — |
| 51 | [eshops] GET /api/v2/products/{productId} | Get product detail | "¿Cuáles son los detalles de producto 999?" | 🟢 V1-SAFE | ❌ | Medio | — | Full product + variants + fulfillment rules. `eshops/routes/v2/products.routes.js:50` | No | Sí | M | v2 API | — |
| 52 | [eshops] POST /api/v2/products | Create product | "Crea un nuevo producto" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | financial-impact, needs-confirmation | Full product creation with variants/pricing. `eshops/routes/v2/products.routes.js:80` | No | Sí | L | v2 API | — |
| 53 | [eshops] GET /api/v2/services | List fulfillment services | "¿Qué servicios tengo configurados?" | 🟢 V1-SAFE | ❌ | Medio | — | Returns shipping services, rates, SLAs. `eshops/routes/v2/services.routes.js:20` | No | Sí | M | v2 API | — |
| 54 | [eshops] POST /api/v2/services | Create service configuration | "Configura un servicio de envío" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | needs-confirmation | Creates shipping rule. `eshops/routes/v2/services.routes.js:50` | No | Sí | M | v2 API | — |
| 55 | [eshops] POST /api/v2/webhooks/callback/{ecommerce} | Ingest marketplace webhook | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; callback for Shopify, WooCommerce, MercadoLibre, etc. `eshops/routes/v2/webhooks.routes.js:20` | Sí | Sí | S | webhook ingestion | — |
| 56 | [eshops] POST /api/v2/webhooks/actions/retry | Retry failed webhook | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, needs-confirmation | **`auth: false`** — publicly callable. DoS risk. SECURITY HOLE. `eshops/routes/v2/webhooks.routes.js:65` | No | Sí | S | admin ops (UNPROTECTED) | — |
| 57 | [eshops] POST /api/v2/webhooks/trigger | Manually trigger webhook | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, needs-confirmation | **`auth: false`** — public endpoint for webhook replay. DoS/replay risk. SECURITY HOLE. `eshops/routes/v2/webhooks.routes.js:89` | No | Sí | S | admin ops (UNPROTECTED) | — |
| 58 | [eshops] GET /api/v2/test | Health check with ecommerce detection | "¿Funciona el servicio?" | 🔵 V1-EXISTS-HIDDEN | ❌ | Bajo | requires-kyc | `auth: true`; detects which ecommerce connectors are live. `eshops/routes/main.routes.js:20` | No | Sí | S | infrastructure | — |
| 59 | [ecartApiOauth] GET /oauth/install | Install/authorize OAuth flow start page | N/A — frontend | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; serves Vue SPA for app installation UI. `ecartApiOauth/routes/oauth.routes.ts:16` | No | Sí | S | frontend integration | — |
| 60 | [ecartApiOauth] GET /oauth/validate | Validate OAuth request parameters | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; validates query params before OAuth flow. `ecartApiOauth/routes/oauth.routes.ts:28` | No | Sí | S | OAuth flow | — |
| 61 | [ecartApiOauth] GET /oauth/authentication/:appId? | OAuth step 1: redirect to marketplace | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; initiates Shopify/WooCommerce/etc auth flow. `ecartApiOauth/routes/oauth.routes.ts:30` | No | Sí | S | OAuth flow | — |
| 62 | [ecartApiOauth] POST /oauth/:ecommerce/access/:appId | OAuth step 2: callback handler | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; receives marketplace callback and stores credentials. `ecartApiOauth/routes/oauth.routes.ts:41` | Sí | Sí | S | OAuth flow | — |
| 63 | [ecartApiOauth] GET /oauth/authorization/:appId? | OAuth authorization endpoint | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; serves authorization UI. `ecartApiOauth/routes/oauth.routes.ts:43` | No | Sí | S | OAuth flow | — |
| 64 | [ecartApiOauth] POST /oauth/:appId/integration/:ecommerce | Create integration connection | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, financial-impact | Middleware: `app`, `ecartapiApp`, `ecommerce`; creates integration record. `ecartApiOauth/routes/oauth.routes.ts:54` | No | Sí | M | OAuth flow | — |
| 65 | [ecartApiOauth] GET /oauth/:appId/integration/:ecommerce | Get integration form | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | Middleware: `app`, `ecommerce`; retrieves form for integration. `ecartApiOauth/routes/oauth.routes.ts:56` | No | Sí | S | OAuth flow | — |
| 66 | [ecartApiOauth] GET /oauth/:ecommerce/access/:appId? | Get stored access credentials | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, pii-exposure | `auth: false`; returns decrypted access token. Middleware `verifyEcommerce` provides some filtering. `ecartApiOauth/routes/oauth.routes.ts:58` | Sí | Sí | S | OAuth flow | — |
| 67 | [ecartApiOauth] GET /oauth/access/:accessId/billing/redirect | Verify payment then redirect | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | financial-impact | Middleware: `verifyEcommerce`; checks payment status. `ecartApiOauth/routes/oauth.routes.ts:60` | No | Sí | S | OAuth flow | — |
| 68 | [ecartApiOauth] GET /oauth/:ecommerce/:appId | Redirect to final integration URL | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | `auth: false`; final redirect after OAuth. Fallback to `https://ecartapi.com` if missing (L-C2 mitigation: document). `ecartApiOauth/routes/oauth.routes.ts:62` | No | Sí | S | OAuth flow | — |
| 69 | [ecartApiOauth] POST /oauth/oauth/token | OAuth token exchange | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | **INCOMPLETE IMPLEMENTATION** — validates body but no handler. `ecartApiOauth/routes/oauth.routes.ts:64` | No | Sí | S | OAuth flow (STUB) | — |
| 70 | [ecartApiOauth] GET /oauth/:ecommerce/trigger/:appId | Manual OAuth trigger | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | Middleware: `app`, `verifyEcommerce`; re-runs OAuth. `ecartApiOauth/routes/oauth.routes.ts:75` | No | Sí | S | OAuth flow | — |
| 71 | [ecartApiOauth] GET /oauth/:ecommerce/load/:appId | Load app configuration | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | Middleware: `app`, `verifyEcommerce`; loads app state. `ecartApiOauth/routes/oauth.routes.ts:77` | No | Sí | S | OAuth flow | — |
| 72 | [ecartApiOauth] GET /site/ | Site root (domain redirect) | N/A — frontend | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | Middleware: `domainRedirect`; serves site index or 404. `ecartApiOauth/routes/site.routes.ts:14` | No | Sí | XS | frontend | — |
| 73 | [ecartApiOauth] GET /site/:appId | Site index for app | N/A — frontend | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | Middleware: `app`; app homepage. `ecartApiOauth/routes/site.routes.ts:21` | No | Sí | S | frontend | — |
| 74 | [ecartApiOauth] POST /site/:appId | Create site configuration | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, needs-confirmation | Joi validation on body; creates/updates site config. `ecartApiOauth/routes/site.routes.ts:23` | No | Sí | M | admin ops | — |
| 75 | [ecartApiOauth] GET /site/:ecommerce/authorize/:appId/:organizationId | Authorize app for organization | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement, admin-dependency | Middleware: `app`; org-level authorization. `ecartApiOauth/routes/site.routes.ts:34` | No | Sí | S | OAuth flow | — |
| 76 | [ecartApiOauth] GET /site/:ecommerce/organizations/:appId | List organizations | N/A — admin/internal | ⚫ ADMIN-ONLY | ❌ | Bajo | no-auth-enforcement | Middleware: `app`; returns available orgs for app. `ecartApiOauth/routes/site.routes.ts:36` | No | Sí | S | admin ops | — |

---

## Destructive & financial endpoints — expanded detail

### [ecommerce] GET /admin/webhook/{shop_id}/reset/cache
- **Reversible?** Sí (rebuilds cache on next webhook).
- **Has UI confirmation today?** No — public endpoint.
- **Impacts billing?** No.
- **Proposed MCP confirmation flow if exposed:** N/A — must be secured with auth first. FIX: add `auth: 'token_admin'`.

### [eshops] PUT /api/v3/orders/delivered
- **Reversible?** Parcial (deletes PII, order metadata may be recoverable from central).
- **Has UI confirmation today?** No — public endpoint.
- **Impacts billing?** Sí (impacts refunds, COD settlement).
- **Proposed MCP confirmation flow if exposed:** N/A — **BLOCKED.** Must require auth. FIX: add `auth: 'user'` + implement confirmation token.

### [eshops] POST /api/v2/webhooks/actions/retry
- **Reversible?** Sí (reprocess, idempotent).
- **Has UI confirmation today?** No — public endpoint.
- **Impacts billing?** Potentially (may re-charge COD).
- **Proposed MCP confirmation flow if exposed:** N/A — **BLOCKED.** Must require auth + rate limit. FIX: add `auth: 'token_admin'`.

### [eshops] POST /api/v2/webhooks/trigger
- **Reversible?** Sí (replay is idempotent if handlers are).
- **Has UI confirmation today?** No — public endpoint.
- **Impacts billing?** Potentially (duplication risk).
- **Proposed MCP confirmation flow if exposed:** N/A — **BLOCKED.** FIX: add `auth: 'token_admin'` + require explicit webhook ID.

### [ecommerce] POST /webhook/order/delete/{shop_id}
- **Reversible?** No (soft delete; full recovery rare).
- **Has UI confirmation today?** No — platform webhook.
- **Impacts billing?** No (but order state loss).
- **Proposed MCP confirmation flow if exposed:** N/A — intended for webhook automation only. Do NOT expose to LLM.

### [ecommerce] PUT /admin/webhook/deactivate/{shop_id}
- **Reversible?** Sí (reactivate endpoint exists).
- **Has UI confirmation today?** No (admin endpoint).
- **Impacts billing?** Sí (stops order ingestion; operational risk).
- **Proposed MCP confirmation flow if exposed:** Require `confirm: true` param + echo back shop name before executing.

### [eshops] POST /api/v2/orders (create)
- **Reversible?** Parcial (soft delete exists).
- **Has UI confirmation today?** No.
- **Impacts billing?** Sí (triggers fulfillment, charges, COD).
- **Proposed MCP confirmation flow if exposed:** Require `confirm: true` + echo back order total + delivery address before executing.

### [eshops] PUT /api/v3/orders/{id}/cancel
- **Reversible?** Parcial.
- **Has UI confirmation today?** No.
- **Impacts billing?** Sí (refunds, COD reversals).
- **Proposed MCP confirmation flow if exposed:** Require `confirm: true` + `reason` enum + echo back refund amount estimate.

---

## Overlaps with other projects

### ecommerce + queries (critical overlap)
- **ecommerce `/label/create/{shop_id}/{order_id}`** and **queries `/v4/orders/{id}/fulfillment`** both fulfill orders.
  - **Recommendation:** Prefer queries endpoint. ecommerce version is legacy; it currently triggers side-effect on label generation. **Action:** Migrate `envia_create_label` to call queries fulfillment directly if not already doing so. Document dependency.

### ecommerce + eshops (orders)
- **ecommerce `/order/fulfillment/{shop_id}/{order_identifier}`** and **eshops `/api/v2/orders/{orderId}` + `/api/v3/orders/{id}/fulfillments`** overlap.
  - **Recommendation:** eshops v2/v3 are newer; ecommerce is legacy webhook receiver. Use eshops for user-facing order operations.

### eshops v1 + v2 + v3 (version explosion)
- v1 is deprecated. v2 is main. v3 is central-only.
  - **Recommendation:** Retire v1 endpoints. Consolidate v2 (local) + v3 (central) into a single versioned API (e.g., `/api/v4/orders` that detects tenant routing).

### eshops orders + queries orders (critical overlap)
- **eshops `/api/v2/orders`** and **queries `/v4/orders`** both expose order lists.
  - **Recommendation:** Prefer queries. queries is the canonical order source. eshops is multi-tenant ecommerce-specific wrapper. **Action:** Clarify which tool consumers use in MCP; do not expose both.

---

## Destructive endpoints lacking proper auth (CRITICAL)

These three endpoints are **public without authentication** and expose destructive or high-impact operations:

### 1. [ecommerce] GET /admin/webhook/{shop_id}/reset/cache (auth: false)
- **Severity:** HIGH
- **Impact:** Any attacker can invalidate webhook cache, halting order ingestion for a shop 24/7.
- **Fix:** Change `auth: false` to `auth: 'token_admin'`.
- **Source:** `ecommerce/routes/webhookAdmin.js:75`

### 2. [eshops] PUT /api/v3/orders/delivered (auth: false)
- **Severity:** CRITICAL
- **Impact:** Any attacker can delete customer PII from any order, breaking refunds and COD settlements.
- **Fix:** Add `auth: 'user'` + require order ownership verification in handler.
- **Source:** `eshops/routes/v3/orders.routes.js:79`

### 3. [eshops] POST /api/v2/webhooks/actions/retry (auth: false)
- **Severity:** HIGH
- **Impact:** Any attacker can DoS eshops by repeatedly replaying massive webhook payloads.
- **Fix:** Add `auth: 'token_admin'` + rate limit to 1 retry per webhook per minute.
- **Source:** `eshops/routes/v2/webhooks.routes.js:65`

### 4. [eshops] POST /api/v2/webhooks/trigger (auth: false)
- **Severity:** HIGH
- **Impact:** Any attacker can replay webhooks, causing duplicate orders/charges.
- **Fix:** Add `auth: 'token_admin'` + require explicit webhook ID in body.
- **Source:** `eshops/routes/v2/webhooks.routes.js:89`

**Immediate action required:** All four must be hardened before any MCP expansion.

---

## Questions for backend team

- **ecartApiOauth POST /oauth/token (route 69):** This route validates the body schema but has no handler function. Is this intentional (stub for future) or incomplete implementation? Blocks OAuth token exchange if completed.
- **eshops v3 orders endpoint:** Why is PII deletion (`PUT /orders/delivered`) exposed at the public v3 API level without auth, and why does it delete customer data instead of masking it?
- **ecommerce /label/create vs queries fulfillment:** Which is the canonical label generation endpoint for the MCP? Currently both exist; creates ambiguity.
- **eshops webhooks retry/trigger:** Are these endpoints meant for internal testing only, or do external partners call them? Needs auth clarification.
- **Fallback URL in ecartApiOauth:** The OAuth redirect fallback to `https://ecartapi.com` when app redirect is missing — what is the operational intent? Is this a safety net or a bug?

---

## Summary by classification

**Total endpoints audited: 76**

| Classification | Count | % |
|---|---|---|
| ⚫ ADMIN-ONLY | 70 | 92% |
| 🟢 V1-SAFE | 4 | 5% |
| 🟡 V1-PARTIAL | 1 | 1% |
| 🔵 V1-EXISTS-HIDDEN | 1 | 1% |
| 🟠 V2-ONLY-BACKEND-REAL | 0 | 0% |
| 🟣 INTERNAL-HELPER | 0 | 0% |

**By value:**
- Alto: 6
- Medio: 10
- Bajo: 60

**By risk flags:**
- `no-auth-enforcement`: 15 endpoints (CRITICAL)
- `destructive`: 7 endpoints
- `needs-confirmation`: 6 endpoints
- `financial-impact`: 5 endpoints
- `pii-exposure`: 4 endpoints
- `admin-dependency`: 20 endpoints

**Sandbox status:**
- Sí (both): 71 endpoints
- Solo prod: 5 endpoints (v3 central-only)

---

## Key findings

### 1. Massive public surface without authentication
92% of endpoints are `⚫ ADMIN-ONLY`, but 15 of the most critical ones (`webhook` callbacks, cache reset, PII deletion, webhook replay) lack any authentication. These are not user-facing conversational actions; they are operational infrastructure leaking public.

### 2. Zero MCP-exposed endpoints in these services
Currently, **none of the 76 endpoints are exposed as user-facing MCP tools**. The only connection is ecommerce's `POST /tmp-fulfillment` (internal side-effect of label generation in queries service). This audit found candidate endpoints for exposure (orders list/detail, label generation, fulfillment) but all require:
- Fixing auth before exposure.
- Determining overlap with queries service.
- Implementing confirmation flows for destructive ops.

### 3. Version explosion in eshops (v1 + v2 + v3)
eshops exposes three API versions:
- **v1:** Legacy, deprecated, ~20 endpoints.
- **v2:** Main API, ~100 endpoints (local MongoDB).
- **v3:** Central sync only, ~10 endpoints.

No clear migration path documented. v1 should be retired; v2/v3 should be consolidated into a single versioned API with route-based tenant detection.

### 4. Security debt is high but localized
Three critical unprotected endpoints can be hardened with single-line auth changes:
- `ecommerce: /admin/webhook/{shop_id}/reset/cache` → add `auth: 'token_admin'`
- `eshops: PUT /api/v3/orders/delivered` → add `auth: 'user'`
- `eshops: POST /api/v2/webhooks/actions/retry` → add `auth: 'token_admin'`
- `eshops: POST /api/v2/webhooks/trigger` → add `auth: 'token_admin'`

### 5. ecommerce service is webhook ingestion only
All 37 ecommerce endpoints are either public webhooks or admin operations. None are user-facing. MCP users would never call them directly. If the MCP needs to fulfill orders, it should call queries service (`POST /v4/orders/{shop}/{id}/fulfillment`) or eshops v2/v3, not ecommerce.

---

## Recommendation for MCP scope expansion

**Do not expose any of these three services' endpoints directly to the LLM as v1 tools.** Instead:

1. **Use eshops v2 for user-facing order operations** (if security audit passes and auth is enforced):
   - List orders: `GET /api/v2/orders`
   - Get order detail: `GET /api/v2/orders/{orderId}`
   - Create order: `POST /api/v2/orders` (requires confirmation flow)

2. **Use queries service for existing order/fulfillment operations** (already in scope):
   - Queries exposes orders at `/v4/orders` and fulfillment at `/v4/orders/{id}/fulfillment`.
   - Preferred over eshops for consolidation.

3. **Secure and defer ecommerce + ecartApiOauth:**
   - ecommerce is internal infrastructure, not user-facing.
   - ecartApiOauth is OAuth broker; frontend owns the integration flow, not the MCP.

4. **Immediate fixes required before any expansion:**
   - Harden the four public unprotected endpoints listed above.
   - Clarify eshops v1/v2/v3 consolidation strategy.
   - Verify overlap resolution between eshops and queries order APIs.

---

## Related documentation

- Pre-existing analysis: `_meta/analysis-ecommerce.md`, `_meta/analysis-eshops.md`, `_meta/analysis-ecartApiOauth.md`.
- Audit brief: `_docs/ENDPOINT_AUDIT_BRIEF.md` (sections 4–8).
- Current MCP inventory: `_docs/V1_SAFE_TOOL_INVENTORY.md`.
- Backend routing reference: `_docs/BACKEND_ROUTING_REFERENCE.md` §2.4 (tmp-fulfillment proxy).
- Lessons: `_docs/LESSONS.md` (L-S2, L-S6, L-S7 relevant).

