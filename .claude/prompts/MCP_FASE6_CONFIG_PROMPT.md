# MCP Expansion — Fase 6 (Config + Empresa)

## Objetivo
Implementar 13 tools MCP para configuración de empresa, checkout rules y webhooks en `ai-agent/envia-mcp-server/`. Seguir EXACTAMENTE el patrón de Fases anteriores.

## Contexto previo
- **65 tools live** (Fases 0-5 + 7 + 9 completas). 955 tests, build clean.
- Fase 4 (Tickets) es el template de referencia para CRUD.
- Todos los endpoints son del **queries service** (`queries-test.envia.com`), Bearer auth.
- **Todos los endpoints verificados** contra API real (2026-04-16).
- Proyecto: `ai-agent/envia-mcp-server/`

## Archivos a leer ANTES de implementar

```
src/services/tickets.ts          → Template service layer (GET + POST + PUT + DELETE)
src/tools/tickets/list-tickets.ts → Template GET tool con filtros + formatting
src/tools/tickets/create-ticket.ts → Template POST tool
src/tools/tickets/index.ts       → Template barrel export
src/types/tickets.ts             → Template types
src/index.ts                     → Dónde registrar tools (buscar sección "Branch tools" al final)
src/services/shipments.ts        → buildQueryUrl() helper — REUTILIZAR
```

## Los 13 tools a implementar

### Empresa (read-only)
| # | Tool Name | Method | Endpoint |
|---|-----------|--------|----------|
| 1 | `envia_list_company_users` | GET | /company/users |
| 2 | `envia_list_company_shops` | GET | /company/shops |
| 3 | `envia_get_carrier_config` | GET | /carrier-company/config |
| 4 | `envia_get_notification_settings` | GET | /config/notification |
| 5 | `envia_list_api_tokens` | GET | /get-api-tokens |

### Checkout Rules (CRUD)
| # | Tool Name | Method | Endpoint |
|---|-----------|--------|----------|
| 6 | `envia_list_checkout_rules` | GET | /checkout-rules |
| 7 | `envia_create_checkout_rule` | POST | /checkout-rules |
| 8 | `envia_update_checkout_rule` | PUT | /checkout-rules/{id} |
| 9 | `envia_delete_checkout_rule` | DELETE | /checkout-rules/{id} |

### Webhooks (CRUD)
| # | Tool Name | Method | Endpoint |
|---|-----------|--------|----------|
| 10 | `envia_list_webhooks` | GET | /webhooks |
| 11 | `envia_create_webhook` | POST | /webhooks |
| 12 | `envia_update_webhook` | PUT | /webhooks/{id} |
| 13 | `envia_delete_webhook` | DELETE | /webhooks/{id} |

---

## Contratos API verificados (SOURCE OF TRUTH)

### 1. GET /company/users
**No query params.** Response: `{ data: CompanyUser[] }` (sin paginación, devuelve todos).

```json
{
  "data": [
    {
      "id": 2802,
      "email": "alaciel.perez@envia.com",
      "phone": "8125703353",
      "role_id": 1,
      "role_description": "Super Admin",
      "status": 1,
      "name": "Alaciel Arteaga",
      "invitation_status": "accepted",
      "invitation_status_translation_tag": "users.invitation.accepted",
      "expiration_date": null,
      "is_new_user": false
    }
  ]
}
```

**Types:**
```typescript
interface CompanyUser {
    id: number;
    email: string;
    phone: string;
    role_id: number;
    role_description: string;
    /** 0=inactive, 1=active */
    status: number;
    name: string;
    invitation_status: string; // "accepted" | "revoked" | "pending"
    invitation_status_translation_tag: string;
    expiration_date: string | null;
    is_new_user: boolean;
}

interface CompanyUsersResponse {
    data: CompanyUser[];
}
```

**Formatting:** Show each user: name, email, role, status (Active/Inactive), invitation status.

---

### 2. GET /company/shops
**No query params** (limit param causes 400). Response: `{ data: CompanyShop[] }`.

```json
{
  "data": [
    {
      "id": 34022,
      "company_id": 254,
      "ecommerce_id": 3,
      "user_id": 2138,
      "ecart_shop_id": "69b2fc7a7163597d075bf837",
      "ecart_shop_group": null,
      "name": "Test E2E Lock Verification - Prestashop",
      "url": "https://example.ngrok-free.app",
      "store": null,
      "auth": "",
      "checkout": 0,
      "form_options": 0,
      "webhook": 0,
      "order_create": 0,
      "order_update": 0,
      "order_delete": 0
    }
  ]
}
```

**IMPORTANT:** Do NOT pass `limit` or any query params — the endpoint returns 400 with unknown params.

**Types:**
```typescript
interface CompanyShop {
    id: number;
    company_id: number;
    ecommerce_id: number;
    user_id: number;
    ecart_shop_id: string;
    ecart_shop_group: string | null;
    name: string;
    url: string;
    store: string | null;
    auth: string;
    /** 0=disabled, 1=enabled */
    checkout: number;
    form_options: number;
    webhook: number;
    order_create: number;
    order_update: number;
    order_delete: number;
}

interface CompanyShopsResponse {
    data: CompanyShop[];
}
```

**Formatting:** Show shop name, URL, ID, and enabled features (checkout, webhook, order sync).

---

### 3. GET /carrier-company/config
**Query params:** `limit` (optional, number).

Response: `{ data: CarrierConfig[] }`. Each entry has a `services` array with full service details.

```json
{
  "data": [
    {
      "id": 1,
      "name": "fedex",
      "description": "FedEx",
      "has_custom_key": 0,
      "logo": "https://s3.us-east-2.amazonaws.com/.../fedex.svg",
      "country_code": "MX",
      "blocked": 0,
      "blocked_admin": 0,
      "services": [
        {
          "id": 1,
          "carrier_id": 1,
          "service": "Nacional Económico",
          "name": "ground",
          "description": "FedEx Nacional Económico",
          "delivery_estimate": "2-4 días",
          "active": 1,
          "cash_on_delivery": 1,
          "international": 0,
          "blocked": 0,
          "blocked_admin": 0
        }
      ]
    }
  ]
}
```

**Types:**
```typescript
interface CarrierService {
    id: number;
    carrier_id: number;
    service: string;
    name: string;
    description: string;
    delivery_estimate: string;
    active: number;
    cash_on_delivery: number;
    international: number;
    blocked: number;
    blocked_admin: number;
}

interface CarrierConfig {
    id: number;
    name: string;
    description: string;
    has_custom_key: number;
    logo: string;
    country_code: string;
    blocked: number;
    blocked_admin: number;
    services: CarrierService[];
}

interface CarrierConfigResponse {
    data: CarrierConfig[];
}
```

**Formatting:** Show each carrier with name, country, active services count, and COD support. List services inline (name + delivery estimate).

---

### 4. GET /config/notification
**No query params.** Response is a **RAW ARRAY** (not wrapped in `{ data: [] }`).

```json
[
  {
    "id": 203,
    "sms": 0,
    "flash": 0,
    "email": 1,
    "email_generate": 1,
    "fulfillment": 1,
    "whatsapp": 1,
    "ecommerce_cod": 0,
    "shipment_cod": 1,
    "shipment_pod": 1
  }
]
```

**CRITICAL:** Response is `NotificationSettings[]` — NOT `{ data: [...] }`. Handle accordingly.

**Types:**
```typescript
interface NotificationSettings {
    id: number;
    /** 0=disabled, 1=enabled */
    sms: number;
    flash: number;
    email: number;
    email_generate: number;
    fulfillment: number;
    whatsapp: number;
    ecommerce_cod: number;
    shipment_cod: number;
    shipment_pod: number;
}

// API returns: NotificationSettings[] (raw array)
```

**Formatting:** Show each channel as enabled/disabled. Group by category: Email, Messaging (SMS/WhatsApp), COD/POD events.

---

### 5. GET /get-api-tokens
**Query params:** `limit` (optional). Response: `{ data: ApiToken[] }`.

```json
{
  "data": [
    {
      "user_name": "Jose Vidrio",
      "user_email": "jose.vidrio@envia.com",
      "access_token": "ea7aa2285b00...",
      "description": null,
      "ecommerce": 0
    }
  ]
}
```

**Types:**
```typescript
interface ApiToken {
    user_name: string;
    user_email: string;
    access_token: string;
    description: string | null;
    /** 0=standard, 1=ecommerce */
    ecommerce: number;
}

interface ApiTokensResponse {
    data: ApiToken[];
}
```

**IMPORTANT:** Truncate `access_token` in output — show only first 8 chars + "..." for security. Full token is sensitive.

**Formatting:** Show user name, email, token type (standard/ecommerce), description. NEVER show full token.

---

### 6. GET /checkout-rules
**Query params:** `limit` (optional, number), `page` (optional, number).

Response: `{ data: CheckoutRule[] }`.

```json
{
  "data": [
    {
      "id": 5,
      "shop_id": 2027,
      "name": null,
      "description": null,
      "international": 0,
      "type": "Money",
      "measurement": "MXN",
      "selected_country_code": null,
      "selected_state_code": null,
      "selected_city_code": null,
      "min": 2000,
      "max": null,
      "amount": 150,
      "amount_type": "DISCOUNT",
      "active": 1,
      "created_at": "2020-06-26 22:48:41",
      "created_by": "Envia - Tendencys",
      "operation_id": 1,
      "operation_description": "Flat Value",
      "carriers": [
        {
          "carrier_id": 1,
          "name": "fedex",
          "logo": "https://...",
          "country_code": "MX"
        }
      ]
    }
  ]
}
```

Note: `carriers` is only present when the rule applies to specific carriers. Most rules don't have it.

**Types:**
```typescript
interface CheckoutRuleCarrier {
    carrier_id: number;
    name: string;
    logo: string;
    country_code: string;
}

interface CheckoutRule {
    id: number;
    shop_id: number;
    name: string | null;
    description: string | null;
    /** 0=domestic, 1=international */
    international: number;
    type: string; // "Money" | "Weight"
    measurement: string; // "MXN" | "KG"
    selected_country_code: string | null;
    selected_state_code: string | null;
    selected_city_code: string | null;
    min: number | null;
    max: number | null;
    amount: number;
    amount_type: string; // "DISCOUNT"
    active: number;
    created_at: string;
    created_by: string;
    operation_id: number;
    operation_description: string; // "Flat Value"
    carriers?: CheckoutRuleCarrier[];
}

interface CheckoutRulesResponse {
    data: CheckoutRule[];
}
```

---

### 7. POST /checkout-rules
**SANDBOX NOTE:** Returns 422 in sandbox ("Invalid data."). Works in production.

**Request body schema (verified — only these fields accepted):**
```typescript
interface CreateCheckoutRuleBody {
    shop_id: number;          // Required — must be a checkout-enabled shop
    type: string;             // "Money" | "Weight"
    measurement: string;      // "MXN" for Money, "KG" for Weight
    min?: number | null;      // Minimum threshold
    max?: number | null;      // Maximum threshold (null = no max)
    amount: number;           // Discount amount
    amount_type: string;      // "DISCOUNT"
    active: number;           // 0 | 1
    operation_id: number;     // 1 = Flat Value
}
```

**Response (production):** The created CheckoutRule object or `{ id: number }`.

**Tool behavior:** If response is 422, return friendly message:
> "Failed to create checkout rule: The checkout rules endpoint returned a validation error (422). Verify that the shop_id belongs to a checkout-enabled shop. This may also be a sandbox limitation — the endpoint works in production."

---

### 8. PUT /checkout-rules/{id}
**Path param:** `id` (number).

**Request body:** Same fields as POST (without shop_id). All fields optional in PUT.

**Response:** `{ data: true }`

---

### 9. DELETE /checkout-rules/{id}
**Path param:** `id` (number). No body.

**Response:** `{ data: true }`

---

### 10. GET /webhooks
**Query params:** `limit` (optional). Response: `{ data: Webhook[] }`.

```json
{
  "data": [
    {
      "id": 372,
      "type": "onShipmentStatusUpdate",
      "url": "https://fulfillment-api-dev.herokuapp.com/webhook/order/tracking/213",
      "auth_token": "3d8ad90c215bfcfe650a5e374c812f150fa794e34d7627ff81ebc8383909b6a2",
      "active": 1
    }
  ]
}
```

**Types:**
```typescript
interface Webhook {
    id: number;
    type: string; // "onShipmentStatusUpdate"
    url: string;
    auth_token: string;
    /** 0=inactive, 1=active */
    active: number;
}

interface WebhooksResponse {
    data: Webhook[];
}
```

**IMPORTANT:** Truncate `auth_token` in output — show only first 8 chars + "...". Sensitive data.

---

### 11. POST /webhooks
**SANDBOX NOTE:** Returns 422 in sandbox. Works in production.

**CRITICAL:** The request body schema ONLY accepts `{ url: string }`.
- Do NOT include `type` — it causes 400 "Invalid request payload input"
- Do NOT include `auth_token` — server generates it
- Do NOT include `active` — defaults to 1

**Request body:**
```typescript
interface CreateWebhookBody {
    url: string; // HTTPS URL for the webhook endpoint
}
```

**Response (production):** The created Webhook object.

**Tool behavior:** If response is 422, return friendly message:
> "Failed to create webhook: The webhook endpoint returned a validation error (422). Ensure the URL is a valid HTTPS endpoint. This may also be a sandbox limitation — the endpoint works in production."

---

### 12. PUT /webhooks/{id}
**Path param:** `id` (number).

**CRITICAL:** PUT /webhooks only accepts `{ url?, active? }`.
- Do NOT include `type` or `auth_token` — causes 400

**Request body:**
```typescript
interface UpdateWebhookBody {
    url?: string;
    active?: number; // 0 | 1
}
```

**Response:** `{ data: true }`

---

### 13. DELETE /webhooks/{id}
**Path param:** `id` (number). No body.

**Response:** `{ data: true }`

---

## Implementation order

1. **Types:** `src/types/config.ts` (all types in one file)
2. **Service:** `src/services/config.ts` (all helpers in one file)
3. **Tools:** Create directories `src/tools/config/`
   - `list-company-users.ts`
   - `list-company-shops.ts`
   - `get-carrier-config.ts`
   - `get-notification-settings.ts`
   - `list-api-tokens.ts`
   - `list-checkout-rules.ts`
   - `create-checkout-rule.ts`
   - `update-checkout-rule.ts`
   - `delete-checkout-rule.ts`
   - `list-webhooks.ts`
   - `create-webhook.ts`
   - `update-webhook.ts`
   - `delete-webhook.ts`
4. **Barrel:** `src/tools/config/index.ts`
5. **Register:** Add imports + register calls in `src/index.ts` after "Branch tools"
6. **Tests:** `tests/tools/config/` — 13 test files

## File structure to create

```
src/types/config.ts
src/services/config.ts
src/tools/config/list-company-users.ts
src/tools/config/list-company-shops.ts
src/tools/config/get-carrier-config.ts
src/tools/config/get-notification-settings.ts
src/tools/config/list-api-tokens.ts
src/tools/config/list-checkout-rules.ts
src/tools/config/create-checkout-rule.ts
src/tools/config/update-checkout-rule.ts
src/tools/config/delete-checkout-rule.ts
src/tools/config/list-webhooks.ts
src/tools/config/create-webhook.ts
src/tools/config/update-webhook.ts
src/tools/config/delete-webhook.ts
src/tools/config/index.ts
tests/tools/config/list-company-users.test.ts
tests/tools/config/list-company-shops.test.ts
tests/tools/config/get-carrier-config.test.ts
tests/tools/config/get-notification-settings.test.ts
tests/tools/config/list-api-tokens.test.ts
tests/tools/config/list-checkout-rules.test.ts
tests/tools/config/create-checkout-rule.test.ts
tests/tools/config/update-checkout-rule.test.ts
tests/tools/config/delete-checkout-rule.test.ts
tests/tools/config/list-webhooks.test.ts
tests/tools/config/create-webhook.test.ts
tests/tools/config/update-webhook.test.ts
tests/tools/config/delete-webhook.test.ts
```

## Service layer pattern for this fase

```typescript
// src/services/config.ts

// Use queryConfigApi for GETs with query params
export async function queryConfigApi<T>(client, config, path, params = {}) {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

// Use mutateConfigApi for POST/PUT/DELETE
export async function mutateConfigApi<T>(client, config, path, body = {}) {
    const url = buildQueryUrl(config.queriesBase, path, {});
    return client.post<T>(url, body);
}

// For path-param endpoints (PUT /checkout-rules/{id}, DELETE /webhooks/{id})
// Build URL directly: `${config.queriesBase}/checkout-rules/${id}`
// Then call client.put() or client.delete()
```

## Critical traps

| Trap | Detail |
|------|--------|
| `/config/notification` is RAW ARRAY | `res.data` IS the array — no `.data` property to unwrap |
| POST /webhooks body is `{url}` only | Adding `type` causes 400 — Joi schema rejects it |
| PUT /webhooks body is `{url?, active?}` only | Adding `type`/`auth_token` causes 400 |
| POST /checkout-rules is 422 in sandbox | Known sandbox limitation — implement with friendly error |
| `/company/shops` no params | `limit` param causes 400 — don't pass any query params |
| Truncate tokens in output | `access_token` and `auth_token` — show first 8 chars only |
| `GET /company-info` → 404 | Does NOT exist — dropped from scope |
| PUT/DELETE use path params | Build URL as: `` `${config.queriesBase}/checkout-rules/${id}` `` |
| 5xx retries | api-client retries 5xx 3x — use status 400 (not 500) in error tests |

## Tool input schemas

### Read-only tools (company users, shops, notification settings)
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
})
```

### Read-only with limit (carrier config, api tokens, checkout rules, webhooks)
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    limit: z.number().int().min(1).max(100).optional().describe('Max results to return'),
})
```

### Checkout rules with page:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    limit: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
})
```

### Create checkout rule:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    shop_id: z.number().int().describe('ID of the checkout-enabled shop (get from envia_list_company_shops)'),
    type: z.enum(['Money', 'Weight']).describe('Rule type: Money (order value) or Weight'),
    measurement: z.string().describe('Unit: MXN for Money, KG for Weight'),
    min: z.number().optional().describe('Minimum threshold to apply the rule'),
    max: z.number().optional().describe('Maximum threshold (omit for no max)'),
    amount: z.number().describe('Discount amount'),
    amount_type: z.string().default('DISCOUNT').describe('Type of discount: DISCOUNT'),
    active: z.number().int().min(0).max(1).default(1).describe('1=active, 0=inactive'),
    operation_id: z.number().int().default(1).describe('Operation type: 1=Flat Value'),
})
```

### Update checkout rule:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    id: z.number().int().describe('Checkout rule ID to update'),
    type: z.enum(['Money', 'Weight']).optional(),
    measurement: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    amount: z.number().optional(),
    amount_type: z.string().optional(),
    active: z.number().int().min(0).max(1).optional(),
    operation_id: z.number().int().optional(),
})
```

### Delete checkout rule / delete webhook:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    id: z.number().int().describe('ID to delete'),
})
```

### Create webhook:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    url: z.string().url().describe('HTTPS URL for the webhook endpoint'),
})
```

### Update webhook:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    id: z.number().int().describe('Webhook ID to update'),
    url: z.string().url().optional().describe('New webhook URL'),
    active: z.number().int().min(0).max(1).optional().describe('1=active, 0=inactive'),
})
```

## Verification checklist

```bash
npm run build          # Must pass clean
npm run lint           # Pre-existing issue — skip if no eslint config
npm run test           # All tests must pass
npm run test -- --run tests/tools/config/   # New config tests
```

Expected result: **78 tools** (65 existing + 13 new), ~1085+ tests.

## Formatting guidelines

- `formatUserLine(user)` → `${name} (${email}) — ${role} — ${Active/Inactive}`
- `formatShopLine(shop)` → `${name} (id: ${id}) — ${url} — Checkout: ${Yes/No}`
- `formatCarrierLine(carrier)` → `${description} (${name}) — ${N} services — COD: ${Yes/No}`
- `formatCheckoutRule(rule)` → `#${id} — ${type} ${min}+ ${measurement} → ${amount_type}: ${amount} | ${Active/Inactive}`
- `formatWebhookLine(webhook)` → `#${id} — ${type} → ${url} — Token: ${first8}... | ${Active/Inactive}`
- `formatApiToken(token)` → `${user_name} (${user_email}) — Token: ${first8}... | ${standard/ecommerce}`
- Truncate tokens: `token.slice(0, 8) + '...'`
- Empty results: return `'No {resource} found.'`
