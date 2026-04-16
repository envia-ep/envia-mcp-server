# MCP Expansion — Fase 10: Productos + Billing

## Objetivo
Implementar 4 tools MCP para catálogo de productos y facturación en `ai-agent/envia-mcp-server/`. Seguir EXACTAMENTE el patrón establecido en Fases anteriores.

## Contexto previo
- **78 tools live** (Fases 0-9 completas). 1078 tests / 78 files, build+lint clean.
- Template más reciente: Fase 4 (Tickets) o Fase 7 (Analytics) — usa cualquiera.
- Todos los endpoints son del **queries service** (`queries-test.envia.com`), Bearer auth.
- **Todos los endpoints han sido verificados** contra el API real (2026-04-16).
- Proyecto: `ai-agent/envia-mcp-server/`

## Archivos a leer ANTES de implementar

### 1. Templates
```
src/services/analytics.ts         → Template de service layer (queryAnalyticsApi helper)
src/tools/analytics/get-monthly-analytics.ts → Template de GET tool con date params
src/tools/analytics/index.ts      → Template de barrel export
src/types/analytics.ts            → Template de types
src/index.ts                      → Dónde registrar tools (ver sección "Analytics tools")
```

### 2. Helpers existentes (REUTILIZAR, no duplicar)
```
src/services/shipments.ts         → buildQueryUrl() — REUTILIZAR
src/utils/api-client.ts           → EnviaApiClient
src/utils/error-mapper.ts         → mapCarrierError()
src/utils/mcp-response.ts         → textResponse()
src/utils/schemas.ts              → requiredApiKeySchema
tests/helpers/mock-server.ts      → createMockServer()
tests/helpers/fixtures.ts         → MOCK_CONFIG
```

## Los 4 tools a implementar

| # | Tool Name | Method | Endpoint | Descripción |
|---|-----------|--------|----------|-------------|
| 1 | `envia_list_products` | GET | /products | Catálogo de productos con filtros (incluye detalle por product_identifier) |
| 2 | `envia_get_billing_info` | GET | /billing-information | Información de facturación registrada |
| 3 | `envia_check_billing_info` | GET | /billing-information/check | ¿Tiene información de facturación? (check rápido) |
| 4 | `envia_get_dce_status` | GET | /dce/status | Estado del servicio DCe de Brasil (NFe) |

## ⛔ Endpoints DESCARTADOS (no implementar)

| Endpoint | Razón |
|----------|-------|
| `GET /products/envia/{id}` | 422 en sandbox para todos los IDs probados — BROKEN |
| `GET /company/credit-info` | 400 "Invalid request query input" — BROKEN |
| `GET /company/recharge-history` | 404 Not Found — endpoint no existe en queries |

**Workaround para detalle de producto:** `GET /products?product_identifier=X` retorna exactamente 1 producto cuando el filtro coincide. `envia_list_products` debe soportar este parámetro para funcionar como "detalle por identifier".

## Contratos API verificados (SOURCE OF TRUTH)

### 1. GET /products
**Query params soportados:** `limit` (int), `page` (int), `product_identifier` (string), `sku` (string)

```json
{
  "success": true,
  "products": [
    {
      "id": 12478,
      "product_identifier": "8785682890964",
      "status": {
        "active": 1,
        "visibility": null,
        "status": "ACTIVE"
      },
      "name": "AA Demo Test K",
      "sku": "TEST-QA9900...",
      "description": "Test Handle null values...",
      "stock_quantity": 974,
      "price": 555,
      "currency": "MXN",
      "variant_product_id": null,
      "image_url": null,
      "created_at_ecommerce": "2025-03-10 14:42:39",
      "product_id_parent": null,
      "sell_out_stock": null,
      "require_shipping": true,
      "includes_variants": 0,
      "product_type": "product",
      "shop": { "id": 33488, "name": "Ferreteria Norte" },
      "ecommerce": { "id": 1, "name": "shopify" },
      "logistic": {
        "logistic_mode": null,
        "logistic_free": false,
        "logistic_me1Suported": null,
        "logistic_rates": []
      },
      "dimensions": {
        "id": 12388,
        "width": 3.94, "height": 3.94, "length": 3.94,
        "weight": 1.1, "weight_unit": "KG", "length_unit": "CM"
      },
      "packing": {
        "active": true,
        "behavior": "rollable",
        "increment": 1,
        "length_unit": "CM"
      },
      "hs_code": {
        "harmonized_system_code": "600110",
        "country_code_origin": "DZ"
      },
      "details": {
        "fragile_product": false,
        "hazardous_material": false,
        "automatic_insurance": false,
        "refrigerated_shipping": false,
        "bundled_sku": 0
      },
      "variants": [
        {
          "id": 12479,
          "product_identifier": "46131383566548",
          "status": { "active": 1, "visibility": null },
          "name": "Default Title",
          "sku": "TEST-QA...",
          "description": null,
          "stock_quantity": null,
          "price": 555,
          "currency": "MXN",
          "variant_product_id": "8785682890964",
          "image_url": null,
          "image_id": null,
          "created_at_ecommerce": "2026-01-28 17:23:44",
          "product_id_parent": 12478,
          "require_shipping": true,
          "dimensions": { "id": 12389, "width": 3.94, "height": 3.94, "length": 3.94, "weight": 1.1, "weight_unit": "KG", "length_unit": "CM" },
          "packing": { "active": true, "behavior": "rollable", "increment": 1, "length_unit": "CM" },
          "hs_code": { "harmonized_system_code": "600110", "country_code_origin": "DZ" },
          "details": { "fragile_product": false, "hazardous_material": false, "automatic_insurance": false, "refrigerated_shipping": false, "bundled_sku": 0 }
        }
      ],
      "markets": [
        { "id": 122, "destination_country_code": "US", "hs_code": "6001.10.2000", "unit_price": 12, "currency": "USD", "created_at": "2026-03-09 22:23:45" }
      ],
      "fiscal_data": [
        { "id": 19, "locale_id": 1, "fiscal_product_code": "10191510", "fiscal_weight_unit_code": "XBS", "created_at": "2026-02-18 14:15:00" }
      ],
      "packaging": null
    }
  ],
  "totals": 656
}
```

**Types:**
```typescript
interface ProductStatus {
    active: number;
    visibility: number | null;
    status?: string;
}

interface ProductShop {
    id: number;
    name: string;
}

interface ProductEcommerce {
    id: number;
    name: string;
}

interface ProductDimensions {
    id: number;
    width: number;
    height: number;
    length: number;
    weight: number;
    weight_unit: string;
    length_unit: string;
}

interface ProductPacking {
    active: boolean;
    behavior: string;
    increment: number;
    length_unit: string;
}

interface ProductHsCode {
    harmonized_system_code: string;
    country_code_origin: string;
}

interface ProductDetails {
    fragile_product: boolean;
    hazardous_material: boolean;
    automatic_insurance: boolean;
    refrigerated_shipping: boolean;
    bundled_sku: number;
}

interface ProductMarket {
    id: number;
    destination_country_code: string;
    hs_code: string;
    unit_price: number;
    currency: string;
    created_at: string;
}

interface ProductFiscalData {
    id: number;
    locale_id: number;
    fiscal_product_code: string;
    fiscal_weight_unit_code: string;
    created_at: string;
}

interface ProductVariant {
    id: number;
    product_identifier: string;
    status: ProductStatus;
    name: string;
    sku: string | null;
    description: string | null;
    stock_quantity: number | null;
    price: number;
    currency: string;
    variant_product_id: string | null;
    image_url: string | null;
    image_id: string | null;
    created_at_ecommerce: string;
    product_id_parent: number;
    require_shipping: boolean;
    dimensions: ProductDimensions;
    packing: ProductPacking;
    hs_code: ProductHsCode;
    details: ProductDetails;
}

interface Product {
    id: number;
    product_identifier: string;
    status: ProductStatus;
    name: string;
    sku: string | null;
    description: string | null;
    stock_quantity: number;
    price: number;
    currency: string;
    variant_product_id: string | null;
    image_url: string | null;
    created_at_ecommerce: string;
    product_id_parent: number | null;
    sell_out_stock: unknown | null;
    require_shipping: boolean;
    includes_variants: number;
    product_type: string;
    shop: ProductShop;
    ecommerce: ProductEcommerce;
    logistic: {
        logistic_mode: unknown | null;
        logistic_free: boolean;
        logistic_me1Suported: unknown | null;
        logistic_rates: unknown[];
    };
    dimensions: ProductDimensions;
    packing: ProductPacking;
    hs_code: ProductHsCode;
    details: ProductDetails;
    variants: ProductVariant[];
    markets: ProductMarket[];
    fiscal_data: ProductFiscalData[];
    packaging: unknown | null;
}

interface ProductsResponse {
    success: boolean;
    products: Product[];
    totals: number;
}
```

**Input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    product_identifier: z.string().optional().describe(
        'Filter by product identifier (acts as detail lookup — returns 1 result when provided)'
    ),
    sku: z.string().optional().describe('Filter by SKU (partial match)'),
    limit: z.number().int().min(1).max(100).default(20).describe('Results per page (max 100)'),
    page: z.number().int().min(1).default(1).describe('Page number'),
})
```

**Formatting:** For each product show: name, SKU, status, price+currency, stock, shop, ecommerce platform, dimensions (WxHxL cm, weight kg), HS code, variants count, markets count. Total at the end.

---

### 2. GET /billing-information

```json
{
  "data": {
    "company_id": 254,
    "company_name": "Fedma CO",
    "billing_records": [
      {
        "id": 208,
        "company_id": 254,
        "provider_client_id": "690e5550c55cb",
        "provider_id": "6227845d6f5e10a27680b38d",
        "account_id": "5d2d436e3199ae000449065b",
        "active": 1,
        "is_default": 1,
        "billing_data": "{\"id\":\"...\",\"rfc\":\"TIN160303NP4\",\"city\":\"Monterrey\",\"name\":\"PRODUCT DEV\",\"email\":\"support@envia.com\",\"phone\":\"8126967369\",\"postal_code\":\"64060\",\"country_code\":\"MX\",\"fiscal_name\":\"PRODUCT DEV\",\"invoice_use\":\"G03\",\"regimen\":\"601\",\"business_name\":\"PRODUCT DEV\"}",
        "country_code": "MX",
        "email": "support@envia.com",
        "ecartpay_id": "690e5515a3c614cc00cd0077",
        "ecartpay_created_at": "2025-11-07 20:22:46",
        "ecartpay_updated_at": "2026-03-20 03:02:45",
        "address_id": 3819538,
        "address_name": "PRODUCT DEV",
        "address_company": "PRODUCT DEV",
        "address_email": "support@envia.com",
        "address_phone": "8126967369",
        "street": "Belisario Domínguez 2470",
        "city": "Monterrey",
        "state": "NL",
        "country": "MX",
        "postal_code": "64060",
        "identification_number": "TIN160303NP4"
      }
    ],
    "total_records": 3
  }
}
```

**CRÍTICO: `billing_data` es un JSON STRING** — necesita `JSON.parse()`. Los campos principales (name, email, city, country_code, postal_code, fiscal_name, rfc/taxid) están también disponibles en el nivel superior del record (address_name, address_email, street, city, state, country, postal_code, identification_number) — usa estos directamente para no depender del parse.

**Types:**
```typescript
interface BillingRecord {
    id: number;
    company_id: number;
    provider_client_id: string;
    provider_id: string;
    account_id: string;
    active: number;
    is_default: number;
    billing_data: string;   // JSON stringified — parse only if needed
    country_code: string;
    email: string;
    ecartpay_id: string;
    ecartpay_created_at: string;
    ecartpay_updated_at: string;
    address_id: number;
    address_name: string;
    address_company: string;
    address_email: string;
    address_phone: string | null;
    street: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
    identification_number: string;
}

interface BillingInformationResponse {
    data: {
        company_id: number;
        company_name: string;
        billing_records: BillingRecord[];
        total_records: number;
    };
}
```

**Input schema:** Solo `api_key` — no query params soportados.

**Formatting:** Para cada billing record mostrar: nombre fiscal, RFC/tax ID, país, ciudad, email, is_default (⭐ si es default), si está activo. Total de registros al final. NO mostrar `billing_data` raw ni `provider_client_id` ni `ecartpay_id`.

---

### 3. GET /billing-information/check

```json
{
  "data": {
    "company_id": 254,
    "company_name": "Fedma CO",
    "has_billing_information": true
  },
  "message": "Company has billing information available"
}
```

**Types:**
```typescript
interface BillingCheckResponse {
    data: {
        company_id: number;
        company_name: string;
        has_billing_information: boolean;
    };
    message: string;
}
```

**Input schema:** Solo `api_key`.

**Formatting:** Respuesta concisa — "✅ Fedma CO tiene información de facturación configurada" o "❌ No hay información de facturación configurada. Use el portal para agregar datos fiscales."

---

### 4. GET /dce/status

```json
{
  "tpAmb": "2",
  "verAplic": "PR-v0.13.0",
  "cStat": "999",
  "xMotivo": "Erro nao catalogado",
  "cUF": "41",
  "dhRecbto": "2026-04-16T12:27:35-03:00"
}
```

**NOTA:** `cStat: "999"` es el código de error genérico de la SEFAZ Brasil (NFe). En sandbox esto es normal. En producción, `cStat: "107"` = servicio em operação normal.

**Types:**
```typescript
interface DceStatusResponse {
    tpAmb: string;          // "1" = producción, "2" = homologación/sandbox
    verAplic: string;       // versión de la aplicación SEFAZ
    cStat: string;          // código de status: "107" = OK, "999" = error genérico
    xMotivo: string;        // descripción del status
    cUF: string;            // código de UF (estado) Brasil
    dhRecbto: string;       // timestamp de recepción ISO 8601
}
```

**Input schema:** Solo `api_key`.

**Formatting:**
- Map `tpAmb`: "1" → "Producción", "2" → "Homologación (sandbox)"
- Map `cStat`: "107" → "✅ Operacional", "108" → "⚠️ Servicio en interrupción", "109" → "⚠️ Servicio lento", cualquier otro → "⚠️ Estado: {xMotivo}"
- Mostrar: ambiente, versión, status, UF, timestamp

---

## Estructura de archivos a crear

```
src/types/products.ts
src/services/products.ts
src/tools/products/list-products.ts
src/tools/products/get-billing-info.ts
src/tools/products/check-billing-info.ts
src/tools/products/get-dce-status.ts
src/tools/products/index.ts
tests/tools/products/list-products.test.ts
tests/tools/products/get-billing-info.test.ts
tests/tools/products/check-billing-info.test.ts
tests/tools/products/get-dce-status.test.ts
```

**Nota:** Agrupa billing + DCe en el módulo `products` porque todos son "configuración de empresa/catálogo". Alternativa válida: módulo `billing` separado. Decide basado en lo que quede más limpio.

## Registro en src/index.ts

Agregar después de la sección de notifications:

```typescript
// Products & Billing tools
import {
    registerListProducts,
    registerGetBillingInfo,
    registerCheckBillingInfo,
    registerGetDceStatus,
} from './tools/products/index.js';

// ... en createEnviaServer():
registerListProducts(server, client, config);
registerGetBillingInfo(server, client, config);
registerCheckBillingInfo(server, client, config);
registerGetDceStatus(server, client, config);
```

## Diferencias vs plan original

| Item | Plan | Realidad |
|------|------|----------|
| `/products/envia/{id}` | Tool separado de detalle | ❌ BROKEN — workaround con `?product_identifier=X` en list |
| `/company/credit-info` | `envia_get_credit_info` | ❌ BROKEN (400) — dropped |
| `/company/recharge-history` | `envia_get_recharge_history` | ❌ BROKEN (404) — dropped |
| `/billing-information/check` | No estaba en plan | ✅ Funciona — se agrega como tool útil |
| `billing_data` field | Esperado objeto | **JSON string** — usar campos de nivel superior en su lugar |
| DCe cStat=999 en sandbox | No documentado | Normal en sandbox — documentar en tool description |

## Verificación al terminar

```bash
npm run build    # debe pasar limpio
npm run lint     # debe pasar limpio
npm run test     # todos los tests deben pasar
```

Resultado esperado: **82 tools** (78 + 4), ~1120+ tests.
