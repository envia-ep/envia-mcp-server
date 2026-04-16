# MCP Fase 8 — Carriers Avanzados (8 tools)

> **Auto-contenido.** Este prompt tiene todo lo necesario para implementar sin consultar documentación externa.  
> **Stack:** TypeScript, Vitest 3.x, Zod, `@modelcontextprotocol/sdk`  
> **Repo:** `ai-agent/envia-mcp-server/`

---

## Contexto del proyecto

El MCP server actualmente tiene **82 tools** y **1122 tests**, build limpio. El patrón establecido es:

```
src/types/{domain}.ts          → interfaces TypeScript
src/services/{domain}.ts       → funciones de servicio (HTTP calls)
src/tools/{domain}/            → un archivo por tool
src/tools/{domain}/index.ts    → barrel export
src/index.ts                   → imports + registerXxx()
tests/tools/{domain}/          → un test file por tool
```

**Reglas de código (CLAUDE.md):**
- Single quotes para strings
- 4 espacios de indentación
- Trailing commas (ES5)
- Semicolons requeridos
- JSDoc en todas las funciones
- `textResponse()` de `'../utils/mcp-response.js'` para todas las respuestas
- `mapCarrierError()` de `'../utils/error-mapper.js'` para errores HTTP
- `resolveClient()` de `'../utils/api-client.js'` para resolver el API key
- `requiredApiKeySchema` de `'../utils/schemas.js'` para el parámetro `api_key`

---

## Config (src/config.ts)

```typescript
interface EnviaConfig {
    apiKey: string;
    environment: 'sandbox' | 'production';
    shippingBase: string;   // https://api-test.envia.com (sandbox) — carriers service
    queriesBase: string;    // https://queries-test.envia.com (sandbox) — queries service
    geocodesBase: string;
}
```

**Todos los endpoints de Fase 8 usan `config.shippingBase` (carriers, api-test.envia.com), NO queriesBase.**

---

## APIs verificadas (2026-04-16)

### Resumen de endpoints

| Tool | Endpoint | Method | Estado sandbox | Body |
|------|----------|--------|---------------|------|
| `envia_generate_manifest` | `/ship/manifest` | POST | ✅ FUNCIONA | `{trackingNumbers: string[]}` |
| `envia_generate_bill_of_lading` | `/ship/billoflading` | POST | ✅ FUNCIONA | objeto complejo |
| `envia_locate_city` | `/locate` | POST | ✅ FUNCIONA (CO) | `{city, state, country}` |
| `envia_cancel_pickup` | `/ship/pickupcancel` | POST | ✅ Schema pasa | `{carrier, confirmation: string, locale: number}` |
| `envia_track_authenticated` | `/ship/track` | POST | ❌ ROTO sandbox | `{carrier, trackingNumber: string[]}` |
| `envia_submit_nd_report` | `/ship/ndreport` | POST | ⚠️ Schema pasa | `{carrier, trackingNumber, actionCode}` |
| `envia_track_pickup` | `/ship/pickuptrack` | POST | ⚠️ Schema pasa | `{carrier, confirmation: string[], locale: number}` |
| `envia_generate_complement` | `/ship/complement` | POST | ✅ Schema pasa | **ARRAY** `[{shipmentId, bolComplement[]}]` |

---

## Detalle de cada tool

### 1. `envia_generate_manifest`

**Endpoint:** `POST /ship/manifest`  
**Autenticación:** Bearer token (Authorization header)

**Body verificado:**
```json
{ "trackingNumbers": ["3200000000112T00021436"] }
```

**⚠️ CRÍTICO: NO incluir `carrier` en el body.** El carrier se infiere automáticamente de la DB por el tracking number.

**Respuesta real (sandbox):**
```json
{
  "meta": "manifest",
  "data": {
    "company": "Fedma CO",
    "carriers": {
      "estafeta": "https://s3.us-east-2.amazonaws.com/.../manifests/estafeta/xxx.pdf",
      "dhl": "https://s3.us-east-2.amazonaws.com/.../manifests/dhl/xxx.pdf"
    }
  }
}
```

**Requiere:** Shipments en status_id=1 (Created). Retorna URLs de PDF agrupadas por carrier.

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    tracking_numbers: z.array(z.string().min(1)).min(1)
        .describe("List of tracking numbers to include in the manifest. Must be in 'Created' status (not yet shipped)."),
})
```

---

### 2. `envia_generate_bill_of_lading`

**Endpoint:** `POST /ship/billoflading`  
**Autenticación:** Bearer token

**Body completo verificado:**
```json
{
  "origin": {
    "name": "ARBOT",
    "street": "Vasco Nunez 11",
    "number": "11",
    "city": "Monterrey",
    "state": "NL",
    "country": "MX",
    "postalCode": "64000"
  },
  "destination": {
    "name": "Erick Ameida",
    "street": "Av Centenario",
    "number": "1",
    "city": "Azcapotzalco",
    "state": "CX",
    "country": "MX",
    "postalCode": "02070"
  },
  "shipment": {
    "carrier": "paquetexpress",
    "trackingNumber": "141168417447"
  },
  "packages": [
    {
      "amount": 1,
      "cost": 200,
      "declaredValue": 200,
      "currency": "MXN",
      "cubicMeters": 0.001,
      "totalWeight": 2,
      "items": [
        { "description": "Producto", "quantity": 1, "price": 200 }
      ]
    }
  ]
}
```

**⚠️ CRÍTICO: `packages[].declaredValue` es REQUERIDO por el PHP runtime** (BOLPackage.php:25) aunque NO aparece en el JSON schema. Omitirlo da error "Missing value 'declaredValue'".

**Respuesta real (sandbox):**
```json
{
  "meta": "billoflading",
  "data": {
    "carrier": "paquetexpress",
    "trackingNumber": "141168417447",
    "billOfLading": "https://s3.us-east-2.amazonaws.com/.../paquetexpress_bill_of_lading/141168417447.pdf"
  }
}
```

**TypeScript interfaces:**
```typescript
interface BolAddress {
    name: string;
    street: string;
    number: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    district?: string;
    taxId?: string;
}

interface BolItem {
    description: string;
    quantity: number;
    price: number;
}

interface BolPackage {
    amount: number;
    cost: number;
    declaredValue: number;  // required — NOT in schema but required by PHP
    currency: string;
    cubicMeters: number;
    totalWeight: number;
    items: BolItem[];
    observations?: string;
    insurance?: number;
}

interface BillOfLadingResponse {
    meta: string;
    data: {
        carrier: string;
        trackingNumber: string;
        billOfLading: string;  // PDF URL
    };
}
```

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    carrier: z.string().describe("Carrier code (e.g. 'dhl', 'fedex', 'paquetexpress')"),
    tracking_number: z.string().describe("Tracking number of the shipment"),
    // Origin
    origin_name: z.string(),
    origin_street: z.string(),
    origin_number: z.string().default(''),
    origin_city: z.string(),
    origin_state: z.string(),
    origin_country: z.string().length(2),
    origin_postal_code: z.string(),
    // Destination
    destination_name: z.string(),
    destination_street: z.string(),
    destination_number: z.string().default(''),
    destination_city: z.string(),
    destination_state: z.string(),
    destination_country: z.string().length(2),
    destination_postal_code: z.string(),
    // Package
    package_amount: z.number().int().min(1).default(1),
    package_cost: z.number().positive(),
    package_declared_value: z.number().positive()
        .describe("Declared value for customs/insurance — required"),
    package_currency: z.string().length(3).default('MXN'),
    package_weight: z.number().positive().describe("Total weight in kg"),
    package_cubic_meters: z.number().positive().describe("Volume in cubic meters"),
    // Items
    items: z.array(z.object({
        description: z.string(),
        quantity: z.number().int().min(1),
        price: z.number().positive(),
    })).min(1).describe("Contents of the shipment"),
})
```

---

### 3. `envia_locate_city`

**Endpoint:** `POST /locate`  
**⚠️ PÚBLICO — NO requiere Authorization header.** Usar `fetch` directo o un cliente sin auth.

**Uso:** Lookup de códigos DANE para Colombia. Retorna el código oficial de ciudad para dirección.

**Body:**
```json
{ "city": "Bogota", "state": "DC", "country": "CO" }
```

**Respuesta real:**
```json
{ "city": "11001000", "name": "BOGOTA", "state": "DC" }
```

**Nota sandbox:** Solo funciona para Colombia (country="CO"). Para MX retorna `{"meta":"error","error":{"code":1149,"description":"Invalid Option","message":"Address cannot be validated."}}`. El endpoint es CO-specific para códigos DANE.

**Implementación:** Como es público, crear un cliente sin auth o usar `fetch` directamente con solo `Content-Type: application/json`:

```typescript
// En el tool, no usar resolveClient — hacer fetch directo:
const url = `${config.shippingBase}/locate`;
const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: args.city.trim(), state: args.state.trim(), country: args.country.toUpperCase() }),
});
const data = await res.json();
```

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,  // Aún requerido para el MCP, solo no se envía a la API
    city: z.string().describe("City name in Spanish (e.g. 'Bogota', 'Medellin')"),
    state: z.string().describe("State/department code (e.g. 'DC', 'ANT')"),
    country: z.string().length(2).default('CO')
        .describe("Country code — currently only 'CO' (Colombia) is supported"),
})
```

**TypeScript interface:**
```typescript
interface LocateCityResponse {
    city: string;   // DANE code (e.g. "11001000")
    name: string;   // Canonical name (e.g. "BOGOTA")
    state: string;  // State code (e.g. "DC")
}
// Error: { meta: 'error', error: { code: number, description: string, message: string } }
```

---

### 4. `envia_cancel_pickup`

**Endpoint:** `POST /ship/pickupcancel` (wildcard route, NOT `/ship/pickup`)  
**Autenticación:** Bearer token

**Body verificado:**
```json
{ "carrier": "fedex", "confirmation": "CONF12345", "locale": 1 }
```

**⚠️ IMPORTANTE:**
- `confirmation` es **STRING** (no array) — diferente de `pickuptrack`
- `locale` es **integer requerido** (1=MX, 2=US, etc.)
- La ruta es `/ship/pickupcancel`, no `/ship/pickup`

**Sandbox:** Con confirmation falsa retorna `{"meta":"error","error":{"code":1115,"description":"Invalid Option","message":"Pickup not found"}}` — schema validation PASA.

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    carrier: z.string().describe("Carrier code (e.g. 'fedex', 'dhl')"),
    confirmation: z.string().describe("Pickup confirmation number to cancel"),
    locale: z.number().int().default(1).describe("Locale/region ID (1=MX, 2=US)"),
})
```

---

### 5. `envia_track_authenticated`

**Endpoint:** `POST /ship/track`  
**Autenticación:** Bearer token

**Body:**
```json
{ "carrier": "dhl", "trackingNumber": ["TRACKING123"] }
```

**⚠️ SANDBOX ROTO** — Todos los carriers retornan:
```json
{ "code": 400, "message": "Unmanaged exception: ErrorException", "description": "Undefined property: stdClass::$service", "location": "/app/app/ep/actions/Track.php 33" }
```
Esto es un bug del sandbox. El endpoint existe y funciona en producción. Los tests deben **mockear completamente** el fetch.

**Diferencia vs `envia_track_package` (existente):**  
- `/ship/generaltrack` (público, existente) — no requiere auth, datos limitados
- `/ship/track` (autenticado) — más datos, incluye `customKey`, info de empresa

**Respuesta esperada (basada en código fuente, Track.php):**
```typescript
interface TrackResponse {
    meta: string;  // "track"
    data: Array<{
        trackingNumber: string;
        carrier: string;
        status: string;
        events?: Array<{
            description: string;
            location?: string;
            date?: string;
        }>;
    }>;
}
```

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    carrier: z.string().describe("Carrier code (e.g. 'dhl', 'fedex', 'estafeta')"),
    tracking_numbers: z.array(z.string().min(1)).min(1)
        .describe("One or more tracking numbers to query (authenticated — returns more data than public tracking)"),
})
```

---

### 6. `envia_submit_nd_report`

**Endpoint:** `POST /ship/ndreport`  
**Autenticación:** Bearer token

**Body:**
```json
{ "carrier": "dhl", "trackingNumber": "TRACKING123", "actionCode": "RD" }
```

**`actionCode` values (carrier-specific, common ones):**
- `"RD"` — Rescheduled Delivery
- `"DM"` — Damaged
- `"RE"` — Return to Sender
- `"AC"` — Address Correction
- `"CP"` — Customer Pickup at branch

**Sandbox:** Schema pasa, retorna code 1115 "Shipment doesn't exist or status doesn't allow" porque el shipment no está en estado NDR. Tests deben mockear.

**TypeScript interface:**
```typescript
interface NdReportResponse {
    meta?: string;  // "ndreport" on success
    data?: {
        carrier: string;
        trackingNumber: string;
        actionCode?: string;
    };
    error?: {
        code: number;
        description: string;
        message: string;
    };
}
```

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    carrier: z.string().describe("Carrier code"),
    tracking_number: z.string().describe("Tracking number of the shipment with a delivery exception"),
    action_code: z.string().describe(
        "NDR action code: 'RD' (reschedule), 'DM' (damaged), 'RE' (return to sender), 'AC' (address correction), 'CP' (pickup at branch)"
    ),
})
```

---

### 7. `envia_track_pickup`

**Endpoint:** `POST /ship/pickuptrack` (wildcard route)  
**Autenticación:** Bearer token

**Body:**
```json
{ "carrier": "dhl", "confirmation": ["CONF12345"], "locale": 1 }
```

**⚠️ IMPORTANTE:**
- `confirmation` es **ARRAY** de strings (diferente de `pickupcancel` que es string)
- `locale` es integer — el schema dice opcional pero el PHP runtime lo requiere (PickupTrack.php:31)
- Ruta es `/ship/pickuptrack`, no `/ship/pickup`

**Sandbox:** Deep error (PHP null reference) porque no hay confirmaciones reales. Tests deben mockear.

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    carrier: z.string().describe("Carrier code"),
    confirmations: z.array(z.string()).min(1).describe("One or more pickup confirmation numbers to track"),
    locale: z.number().int().default(1).describe("Locale/region ID (1=MX, 2=US)"),
})
```

---

### 8. `envia_generate_complement`

**Endpoint:** `POST /ship/complement`  
**Autenticación:** Bearer token

**⚠️ CRÍTICO: El body es un ARRAY en el top level**, no un objeto.

**Body:**
```json
[
  {
    "shipmentId": 166810,
    "bolComplement": [
      {
        "productDescription": "Camisa de algodón",
        "productCode": "10191510",
        "weightUnit": "XBX",
        "packagingType": "1A",
        "quantity": 1,
        "unitPrice": 200
      }
    ]
  }
]
```

**Contexto:** SAT Carta Porte complement for Mexico. Only carriers with SAT carta porte support (DHL MX, FedEx MX, some others). Sandbox returns "Carrier X doesn't have the action complement" for carriers without support — schema validation PASSES.

**Schema fields:**
- `productCode` — SAT catalog product code (e.g. "10191510" = electronics)
- `weightUnit` — SAT unit code (e.g. "XBX" = box, "KGM" = kg)
- `packagingType` — SAT packaging code (e.g. "1A" = steel drum, "4G" = fibreboard box)

**TypeScript interfaces:**
```typescript
interface BolComplementItem {
    productDescription: string | null;
    productCode: string | null;
    weightUnit: string | null;
    packagingType: string | null;
    quantity: number | null;
    unitPrice: number | null;
}

interface ComplementEntry {
    shipmentId: number;
    bolComplement: BolComplementItem[];
}
// Body sent to API: ComplementEntry[]  (ARRAY, not object)
```

**Zod input schema:**
```typescript
z.object({
    api_key: requiredApiKeySchema,
    shipments: z.array(z.object({
        shipment_id: z.number().int().positive().describe("Numeric shipment ID"),
        items: z.array(z.object({
            product_description: z.string().nullable().optional(),
            product_code: z.string().nullable().optional().describe("SAT catalog code"),
            weight_unit: z.string().nullable().optional().describe("SAT unit code (e.g. 'XBX', 'KGM')"),
            packaging_type: z.string().nullable().optional().describe("SAT packaging code (e.g. '1A', '4G')"),
            quantity: z.number().int().min(0).nullable().optional(),
            unit_price: z.number().min(0).nullable().optional(),
        })).min(1),
    })).min(1).describe("One or more shipments to add SAT complement data to"),
})
```

---

## Estructura de archivos a crear

```
src/types/carriers-advanced.ts
src/services/carriers-advanced.ts
src/tools/carriers-advanced/
  generate-manifest.ts
  generate-bill-of-lading.ts
  locate-city.ts
  cancel-pickup.ts
  track-authenticated.ts
  submit-nd-report.ts
  track-pickup.ts
  generate-complement.ts
  index.ts
tests/tools/carriers-advanced/
  generate-manifest.test.ts
  generate-bill-of-lading.test.ts
  locate-city.test.ts
  cancel-pickup.test.ts
  track-authenticated.test.ts
  submit-nd-report.test.ts
  track-pickup.test.ts
  generate-complement.test.ts
```

---

## Implementación en src/index.ts

Agregar al final de la sección de imports:

```typescript
// Carriers advanced tools
import {
    registerGenerateManifest,
    registerGenerateBillOfLading,
    registerLocateCity,
    registerCancelPickup,
    registerTrackAuthenticated,
    registerSubmitNdReport,
    registerTrackPickup,
    registerGenerateComplement,
} from './tools/carriers-advanced/index.js';
```

Y en la función `registerTools`:

```typescript
// Carriers advanced
registerGenerateManifest(server, client, config);
registerGenerateBillOfLading(server, client, config);
registerLocateCity(server, client, config);
registerCancelPickup(server, client, config);
registerTrackAuthenticated(server, client, config);
registerSubmitNdReport(server, client, config);
registerTrackPickup(server, client, config);
registerGenerateComplement(server, client, config);
```

---

## Patrón de implementación (de tools existentes)

### Tool file template:

```typescript
/**
 * Tool: envia_generate_manifest
 * ...JSDoc...
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';

export function registerGenerateManifest(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_generate_manifest',
        {
            description: '...',
            inputSchema: z.object({ ... }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const url = `${config.shippingBase}/ship/manifest`;
            const res = await activeClient.post<{ meta: string; data: ManifestData }>(url, {
                trackingNumbers: args.tracking_numbers,
            });

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Manifest generation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            const data = res.data?.data;
            const lines: string[] = ['Manifest generated successfully.', ''];
            // ... format output
            return textResponse(lines.join('\n'));
        },
    );
}
```

### Para `envia_locate_city` (endpoint público — sin auth):

```typescript
async (args) => {
    // /locate es público — no enviar Authorization header
    const url = `${config.shippingBase}/locate`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            city: args.city.trim(),
            state: args.state.trim(),
            country: args.country.trim().toUpperCase(),
        }),
    });

    if (!res.ok) {
        return textResponse(`City lookup failed: HTTP ${res.status}`);
    }

    const data = await res.json() as LocateCityResponse | LocateErrorResponse;

    if ('meta' in data && data.meta === 'error') {
        const errData = data as LocateErrorResponse;
        return textResponse(`City not found: ${errData.error.message}`);
    }

    const city = data as LocateCityResponse;
    const lines = [
        'City code lookup result:',
        '',
        `  DANE code: ${city.city}`,
        `  Name:      ${city.name}`,
        `  State:     ${city.state}`,
    ];
    return textResponse(lines.join('\n'));
},
```

### Para `envia_generate_complement` (array body):

```typescript
const body: ComplementEntry[] = args.shipments.map((s) => ({
    shipmentId: s.shipment_id,
    bolComplement: s.items.map((item) => ({
        productDescription: item.product_description ?? null,
        productCode: item.product_code ?? null,
        weightUnit: item.weight_unit ?? null,
        packagingType: item.packaging_type ?? null,
        quantity: item.quantity ?? null,
        unitPrice: item.unit_price ?? null,
    })),
}));

// Enviar el array directamente (no envolver en objeto)
const res = await activeClient.post<unknown>(url, body);
```

---

## Tests — patrón requerido (Vitest 3.x)

Cada test file sigue el patrón AAA. Importaciones estándar:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerXxx } from '../../../src/tools/carriers-advanced/xxx.js';
```

**Para tools con sandbox roto** (track, ndreport, pickuptrack): Los tests DEBEN mockear `fetch` completamente. No hay forma de probar con sandbox real.

**Cada test file debe incluir al menos:**
1. Calls the correct URL with correct method
2. Sends correct body structure
3. Returns formatted success text
4. Returns error text when API fails
5. Handles edge cases (empty arrays, missing optional fields)
6. Lowercases/trims carrier (where applicable)

**Ejemplo para complement (array body):**
```typescript
it('sends complement as top-level array in request body', async () => {
    await handler(BASE_ARGS);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);

    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty('shipmentId');
    expect(body[0]).toHaveProperty('bolComplement');
});
```

---

## Verificación de implementación

Después de implementar, ejecutar:

```bash
cd ai-agent/envia-mcp-server
npm run build        # debe compilar sin errores TypeScript
npm test             # debe pasar todos los tests (target: >1200 tests)
```

### Checklist por tool:

- [ ] `envia_generate_manifest` — body solo tiene `trackingNumbers[]`, NO carrier
- [ ] `envia_generate_bill_of_lading` — `packages[].declaredValue` incluido en body
- [ ] `envia_locate_city` — NO envía Authorization header a la API
- [ ] `envia_cancel_pickup` — ruta `/ship/pickupcancel`, `confirmation` es STRING
- [ ] `envia_track_authenticated` — tests mockeados (sandbox roto)
- [ ] `envia_submit_nd_report` — incluye `actionCode` en body
- [ ] `envia_track_pickup` — ruta `/ship/pickuptrack`, `confirmation` es ARRAY, `locale` requerido
- [ ] `envia_generate_complement` — body es ARRAY top-level, no objeto

---

## Trampa de rutas

El router de carriers tiene:
- `/ship/pickup` → acción "pickup" (generar pickup nuevo) — NO usar para track/cancel
- `/ship/pickuptrack` → wildcard `/ship/{action}` → acción "pickuptrack"
- `/ship/pickupcancel` → wildcard `/ship/{action}` → acción "pickupcancel"

Usar las rutas exactas como se indica arriba.

---

## Estado del MCP server al iniciar

- **82 tools**, **1122 tests**, build limpio
- Fase 8 agrega: **8 tools** → total: **90 tools**
- Todos en `src/tools/carriers-advanced/`
- Registrar en `src/index.ts` después de la línea `registerGetDceStatus`
