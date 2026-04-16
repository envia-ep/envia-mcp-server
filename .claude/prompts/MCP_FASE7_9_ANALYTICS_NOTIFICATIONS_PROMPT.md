# MCP Expansion — Fase 7 (Analytics) + Fase 9 (Notifications)

## Objetivo
Implementar 8 tools MCP para analytics y notificaciones en `ai-agent/envia-mcp-server/`. Seguir EXACTAMENTE el patrón establecido en Fases anteriores.

## Contexto previo
- **57 tools live** (Fases 0-5 completas). 875 tests, build+lint clean.
- Fase 4 (Tickets) es el template más reciente — usa ese patrón.
- Todos los endpoints son del **queries service** (`queries-test.envia.com`), Bearer auth.
- **Todos los endpoints han sido verificados** contra el API real (2026-04-16).
- Proyecto: `ai-agent/envia-mcp-server/`

## Archivos a leer ANTES de implementar

### 1. Templates (copiar este patrón exacto)
```
src/services/tickets.ts          → Template de service layer (query helper reutilizando buildQueryUrl)
src/tools/tickets/list-tickets.ts → Template de GET tool con filtros, error handling, text formatting
src/tools/tickets/index.ts       → Template de barrel export
src/index.ts                     → Dónde registrar tools (ver sección "Ticket tools" como ejemplo)
src/types/tickets.ts             → Template de types
```

### 2. Helpers existentes (REUTILIZAR, no duplicar)
```
src/services/shipments.ts        → buildQueryUrl() — REUTILIZAR para construir URLs
src/utils/api-client.ts          → EnviaApiClient con get/post/put/delete
src/utils/error-mapper.ts        → mapCarrierError()
src/utils/mcp-response.ts        → textResponse()
src/utils/schemas.ts             → requiredApiKeySchema, dateSchema, etc.
tests/helpers/mock-server.ts     → createMockServer() para tests
tests/helpers/fixtures.ts        → MOCK_CONFIG
```

## Los 8 tools a implementar

### Fase 7: Analytics (5 tools)

| # | Tool Name | Method | Endpoint | Descripción |
|---|-----------|--------|----------|-------------|
| 1 | `envia_get_monthly_analytics` | GET | /analytics/get-monthly-analytics-data | Volumen y revenue mensual por carrier |
| 2 | `envia_get_carriers_stats` | GET | /analytics/carriers-stats | Comparación de carriers, servicios, rutas, peso |
| 3 | `envia_get_packages_module` | GET | /analytics/packages-module | Performance por carrier: shipped, delivered, issues, costs |
| 4 | `envia_get_issues_analytics` | GET | /analytics/issues-module | Issues por tipo, tendencia mensual, issue rate |
| 5 | `envia_get_shipments_by_status` | GET | /reports/dashboard/guides-per-status/{start}/{end} | Conteo de envíos por estado (32 estados) |

### Fase 9: Notifications (3 tools)

| # | Tool Name | Method | Endpoint | Descripción |
|---|-----------|--------|----------|-------------|
| 6 | `envia_get_notification_prices` | GET | /notifications/prices | Precios de notificaciones por tipo (SMS, WhatsApp) |
| 7 | `envia_list_notifications` | GET | /company/notifications | Feed de notificaciones con categorías |
| 8 | `envia_get_notification_config` | GET | /company-notifications | Config de notificaciones con body JSON stringificado |

### Dropped: `/reports/dashboard/main-data/{start}/{end}`
**BROKEN in sandbox** — returns 400 for all date formats tested (YYYY-MM-DD, MM-DD-YYYY, ISO, query params). The `/analytics/*` endpoints already cover the same data with more detail. Skip this endpoint.

## Contratos API verificados (SOURCE OF TRUTH)

### 1. GET /analytics/get-monthly-analytics-data
**Query params:** `sDate` (YYYY-MM-DD), `eDate` (YYYY-MM-DD) — REQUIRED

```json
{
  "barData": [
    {
      "name": "dhl",
      "color": "#FFCC00",
      "dataShipments": [0, 5, 0, 1],
      "dataTotal": [0, 3401.28, 0, 2929.56],
      "shipmentCountCarrier": 6,
      "shipmentSumCarrier": 6330.84
    }
  ],
  "shipmentCount": 14,
  "shipmentSum": 8395.64,
  "monthsList": [{"year": 26, "month": 1}, {"year": 26, "month": 2}]
}
```

**Types:**
```typescript
interface MonthlyAnalyticsCarrier {
    name: string;
    color: string;
    dataShipments: number[];
    dataTotal: number[];
    shipmentCountCarrier: number;
    shipmentSumCarrier: number;
}

interface MonthEntry {
    year: number;
    month: number;
}

interface MonthlyAnalyticsResponse {
    barData: MonthlyAnalyticsCarrier[];
    shipmentCount: number;
    shipmentSum: number;
    monthsList: MonthEntry[];
}
```

**Formatting:** Show each carrier with total shipments, total revenue, and % of total. Include grand totals.

### 2. GET /analytics/carriers-stats
**Query params:** `sDate`, `eDate` — REQUIRED

```json
{
  "sortDataCarrierStats": [
    {"primaryName": "DHL", "image": "https://...dhl.svg", "value": 6, "percentage": 42.86}
  ],
  "sortDataServiceStats": [
    {"primaryName": "Paquetexpress ", "image": "...", "value": 5, "percentage": 35.71}
  ],
  "sortAvgDeliveryTimeByServiceStats": [
    {"primaryName": "Paquetexpress ", "image": "...", "deliveredCount": 1, "deliveryDaysSum2": 0.25, "deliveryDaysSum": 21600, "value": 0.25, "percentage": 100}
  ],
  "sortOriginPackagesStats": [
    {"primaryName": "México", "value": 14, "primaryCode": "MX", "postalCode": "66056", "percentage": 100, "isCountry": true},
    {"primaryCode": "MX", "secondaryCode": "NL", "postalCode": "64102", "value": 9, "primaryName": "México", "secondaryName": "Nuevo León", "isCountry": false, "percentage": 64.29}
  ],
  "sortDestinationPackagesStats": [/* same shape as origin */],
  "sortWeightPackagesStats": [
    {"primaryName": "0.5 - 1 Kg", "rangeWeight": "0.5-1", "value": 7, "categoryWeight": "0.5 - 1 Kg", "orderCategory": 2, "percentage": 50}
  ]
}
```

**Types:**
```typescript
interface CarrierStatEntry {
    primaryName: string;
    image: string;
    value: number;
    percentage: number;
}

interface DeliveryTimeEntry {
    primaryName: string;
    image: string;
    deliveredCount: number;
    deliveryDaysSum2: number;
    deliveryDaysSum: number;
    value: number;
    percentage: number;
}

interface LocationStatEntry {
    primaryName: string;
    value: number;
    primaryCode: string;
    postalCode: string;
    percentage: number;
    isCountry: boolean;
    secondaryCode?: string;
    secondaryName?: string;
}

interface WeightStatEntry {
    primaryName: string;
    rangeWeight: string;
    value: number;
    categoryWeight: string;
    orderCategory: number;
    percentage: number;
}

interface CarriersStatsResponse {
    sortDataCarrierStats: CarrierStatEntry[];
    sortDataServiceStats: CarrierStatEntry[];
    sortAvgDeliveryTimeByServiceStats: DeliveryTimeEntry[];
    sortOriginPackagesStats: LocationStatEntry[];
    sortDestinationPackagesStats: LocationStatEntry[];
    sortWeightPackagesStats: WeightStatEntry[];
}
```

**Formatting:** Show sections: Top Carriers, Top Services, Delivery Time Avg, Top Origins, Top Destinations, Weight Distribution. Each with name + value + percentage.

### 3. GET /analytics/packages-module
**Query params:** `sDate`, `eDate` — REQUIRED

```json
{
  "data": [
    {
      "name": "Paquetexpress",
      "image": "https://...paquetexpress.svg",
      "shippedCount": 6,
      "inTransitCount": 1,
      "outForDeliveryCount": 0,
      "deliveryCount": 1,
      "deliverySecondSum": 21600,
      "returnOriginCount": 0,
      "issuesCount": 3,
      "pendingCount": 29,
      "total": 1740,
      "services": [
        {
          "name": "Express",
          "shippedCount": 5,
          "deliveryCount": 1,
          "issuesCount": 3,
          "total": 1740,
          "deliveredVsShippedPercentage": 20,
          "deliveredTimeAvg": 0.25,
          "totalAvg": 348,
          "returnOriginPercentage": 0,
          "issuePercentage": 60,
          "pendingCount": 17,
          "inTransitCount": 0,
          "outForDeliveryCount": 0,
          "deliverySecondSum": 21600,
          "returnOriginCount": 0
        }
      ],
      "deliveredVsShippedPercentage": 16.67,
      "deliveredTimeAvg": 0.25,
      "totalAvg": 290,
      "returnOriginPercentage": 0,
      "issuePercentage": 50
    }
  ],
  "pendingTotal": 195,
  "shippedTotal": 14,
  "inTransitTotal": 1,
  "outForDeliveryTotal": 0,
  "deliveryTotal": 1,
  "deliveredVsShippedAvgTotal": 7.14,
  "deliveredTimeAvgTotal": 0.25,
  "priceTotal": 8395.64,
  "priceAvgTotal": 599.69,
  "returnedTotal": 0,
  "returnedPercentageTotal": 0,
  "issuesTotal": 6,
  "issuesPercentageTotal": 42.86
}
```

**Types:**
```typescript
interface CarrierServicePerformance {
    name: string;
    shippedCount: number;
    inTransitCount: number;
    outForDeliveryCount: number;
    deliveryCount: number;
    deliverySecondSum: number;
    returnOriginCount: number;
    issuesCount: number;
    total: number;
    pendingCount: number;
    deliveredVsShippedPercentage: number;
    deliveredTimeAvg: number;
    totalAvg: number;
    returnOriginPercentage: number;
    issuePercentage: number;
}

interface CarrierPerformance extends CarrierServicePerformance {
    image: string;
    services: CarrierServicePerformance[];
}

interface PackagesModuleResponse {
    data: CarrierPerformance[];
    pendingTotal: number;
    shippedTotal: number;
    inTransitTotal: number;
    outForDeliveryTotal: number;
    deliveryTotal: number;
    deliveredVsShippedAvgTotal: number;
    deliveredTimeAvgTotal: number;
    priceTotal: number;
    priceAvgTotal: number;
    returnedTotal: number;
    returnedPercentageTotal: number;
    issuesTotal: number;
    issuesPercentageTotal: number;
}
```

**Formatting:** Show each carrier with: shipped/delivered/issues counts, delivery %, avg delivery time (in days), avg cost, issue %. Include global totals.

### 4. GET /analytics/issues-module
**Query params:** `sDate`, `eDate` — REQUIRED

```json
{
  "monthsList": [{"year": 26, "month": 1}],
  "sortDataByIssues": [
    {"primaryName": "Damaged Package", "translation_tag": "ticket.type.damaged", "value": 3, "percentage": 50},
    {"primaryName": "Lost Package", "translation_tag": "ticket.type.lost", "value": 1, "percentage": 16.67}
  ],
  "sortDataReturnedCarrierStats": [],
  "barDataCarrierMonthlyIssues": [
    {"name": "DHL", "color": "#FFCC00", "dataShipments": [0, 1, 0, 1]}
  ],
  "barDataIssueVsShipped": [
    {"issueRatePercentage": 0}, {"issueRatePercentage": 25}
  ],
  "barDataCarrierMonthlyReturnedToOrigin": [],
  "barDataReturnedToOriginVsShipped": []
}
```

**Types:**
```typescript
interface IssueTypeEntry {
    primaryName: string;
    translation_tag: string;
    value: number;
    percentage: number;
}

interface CarrierMonthlyIssue {
    name: string;
    color: string;
    dataShipments: number[];
}

interface IssueRateEntry {
    issueRatePercentage: number;
}

interface IssuesModuleResponse {
    monthsList: MonthEntry[];
    sortDataByIssues: IssueTypeEntry[];
    sortDataReturnedCarrierStats: CarrierStatEntry[];
    barDataCarrierMonthlyIssues: CarrierMonthlyIssue[];
    barDataIssueVsShipped: IssueRateEntry[];
    barDataCarrierMonthlyReturnedToOrigin: CarrierMonthlyIssue[];
    barDataReturnedToOriginVsShipped: IssueRateEntry[];
}
```

**Formatting:** Show issue types ranked by frequency, carrier issue breakdown, monthly issue rate trend.

### 5. GET /reports/dashboard/guides-per-status/{start}/{end}
**Path params:** `start` and `end` in **YYYY-MM-DD** format (NOT query params)

```json
{
  "data": [
    {"id": 1, "status": "Created", "total": 192, "color": "#28a745"},
    {"id": 2, "status": "Shipped", "total": 1, "color": "#077ccd"},
    {"id": 3, "status": "Delivered", "total": 5, "color": "#1ea5e0"},
    {"id": 4, "status": "Canceled", "total": 336, "color": "#dc3545"},
    {"id": 10, "status": "Lost", "total": 2, "color": "#f44336"},
    {"id": 14, "status": "Damaged", "total": 4, "color": "#f44336"}
  ]
}
```

**IMPORTANT:** This endpoint uses PATH params, not query params. Build URL as:
`${queriesBase}/reports/dashboard/guides-per-status/${startDate}/${endDate}`

Do NOT use `buildQueryUrl` for this — build the URL directly.

**Types:**
```typescript
interface StatusCount {
    id: number;
    status: string;
    total: number;
    color: string;
}

interface GuidesPerStatusResponse {
    data: StatusCount[];
}
```

**Formatting:** Show only statuses with `total > 0`. Sort by total descending. Include grand total.

### 6. GET /notifications/prices
**No query params needed.** Response is a **RAW ARRAY** (no wrapper object).

```json
[
  {"type": "sms", "price": 1.5, "currency": "MXN"},
  {"type": "whatsapp", "price": 1, "currency": "MXN"}
]
```

**CRITICAL:** Response is NOT `{ data: [...] }`. It's a plain array. Handle accordingly in the service layer.

**Types:**
```typescript
interface NotificationPrice {
    type: string;
    price: number;
    currency: string;
}

// API returns: NotificationPrice[] (raw array)
```

### 7. GET /company/notifications
**Query params:** `limit` (optional, default seems 5)

```json
{
  "data": {
    "all": {
      "notifications": [
        {
          "id": 1414826,
          "title": "Reembolso de fondos",
          "content": "La etiqueta ... fue cancelada...",
          "redirect_url": "https://...",
          "status": {},
          "category": "returns",
          "active": 1,
          "is_valid_html": true,
          "created_at": "2026-04-14 21:26:44",
          "rating": null,
          "type": "balance_return",
          "ticketInformation": null,
          "comment": null,
          "created_by": null,
          "utc_created_at": null
        }
      ],
      "unreadCounter": 5
    },
    "payments": {"notifications": [], "unreadCounter": 0},
    "returns": {"notifications": [/* ... */], "unreadCounter": 5}
  },
  "unreadCounter": 5
}
```

**Types:**
```typescript
interface CompanyNotification {
    id: number;
    title: string;
    content: string;
    redirect_url: string;
    status: Record<string, unknown>;
    category: string;
    active: number;
    is_valid_html: boolean;
    created_at: string;
    rating: unknown | null;
    type: string;
    ticketInformation: unknown | null;
    comment: string | null;
    created_by: string | null;
    utc_created_at: string | null;
}

interface NotificationCategory {
    notifications: CompanyNotification[];
    unreadCounter: number;
}

interface CompanyNotificationsResponse {
    data: Record<string, NotificationCategory>;
    unreadCounter: number;
}
```

**Formatting:** Show notifications grouped by category. For each: title, type, date. Include unread counters.

### 8. GET /company-notifications
**Query params:** `limit` (optional)

```json
{
  "data": {
    "returns": [
      {
        "id": 1414826,
        "type": "balance_return",
        "body": "{\"trackingNumber\":\"32192528\",\"carrier\":\"buslog\",\"price\":108.6,\"amount\":108.6,\"currency\":\"MXN\",\"type\":\"cancel_balance_return\"}",
        "html": null,
        "redirect_url": "https://...",
        "active": 1,
        "created_at": "2026-04-14 15:26:44"
      }
    ]
  },
  "notificationCount": 5
}
```

**CRITICAL:** The `body` field is a **JSON string** (not a parsed object). Parse it with `JSON.parse()` for display.

**Types:**
```typescript
interface NotificationConfigEntry {
    id: number;
    type: string;
    body: string;    // JSON stringified — needs JSON.parse()
    html: string | null;
    redirect_url: string;
    active: number;
    created_at: string;
}

interface NotificationConfigResponse {
    data: Record<string, NotificationConfigEntry[]>;
    notificationCount: number;
}
```

**Formatting:** Parse `body` JSON. Show tracking number, carrier, amount, currency for balance_return type. Group by category.

## Implementation order

1. **Types:** Create `src/types/analytics.ts` and `src/types/notifications.ts`
2. **Services:** Create `src/services/analytics.ts` and `src/services/notifications.ts`
   - Analytics service: reuse `buildQueryUrl` from `shipments.ts` for query-param endpoints
   - For `guides-per-status`: build URL directly with path params (do NOT use buildQueryUrl)
   - Notifications service: reuse `buildQueryUrl`
   - For `notifications/prices`: handle raw array response
3. **Tools:** Create directories `src/tools/analytics/` and `src/tools/notifications/`
   - Each tool in its own file following the `list-tickets.ts` pattern
4. **Barrel:** Create `src/tools/analytics/index.ts` and `src/tools/notifications/index.ts`
5. **Register:** Add imports and register calls in `src/index.ts`
6. **Tests:** Create `tests/tools/analytics/` and `tests/tools/notifications/` directories

## File structure to create

```
src/types/analytics.ts
src/types/notifications.ts
src/services/analytics.ts
src/services/notifications.ts
src/tools/analytics/get-monthly-analytics.ts
src/tools/analytics/get-carriers-stats.ts
src/tools/analytics/get-packages-module.ts
src/tools/analytics/get-issues-analytics.ts
src/tools/analytics/get-shipments-by-status.ts
src/tools/analytics/index.ts
src/tools/notifications/get-notification-prices.ts
src/tools/notifications/list-notifications.ts
src/tools/notifications/get-notification-config.ts
src/tools/notifications/index.ts
tests/tools/analytics/get-monthly-analytics.test.ts
tests/tools/analytics/get-carriers-stats.test.ts
tests/tools/analytics/get-packages-module.test.ts
tests/tools/analytics/get-issues-analytics.test.ts
tests/tools/analytics/get-shipments-by-status.test.ts
tests/tools/notifications/get-notification-prices.test.ts
tests/tools/notifications/list-notifications.test.ts
tests/tools/notifications/get-notification-config.test.ts
```

## Common input schema for analytics tools (1-4)

All analytics tools share these params:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    start_date: z.string().describe('Start date (YYYY-MM-DD)'),
    end_date: z.string().describe('End date (YYYY-MM-DD)'),
})
```

Map `start_date` → `sDate` and `end_date` → `eDate` in the query params.

## Tool 5 (guides-per-status) special handling

This tool uses **path params** instead of query params:
```typescript
inputSchema: z.object({
    api_key: requiredApiKeySchema,
    start_date: z.string().describe('Start date (YYYY-MM-DD)'),
    end_date: z.string().describe('End date (YYYY-MM-DD)'),
})
```

Build URL as: `${config.queriesBase}/reports/dashboard/guides-per-status/${args.start_date}/${args.end_date}`

## Tool 6 (notification prices) special handling

Response is a raw array. In the service layer:
```typescript
const res = await client.get<NotificationPrice[]>(url);
// res.data is already NotificationPrice[] — no need to unwrap .data
```

## Tool 8 (notification config) special handling

Parse `body` field from each notification:
```typescript
const parsed = JSON.parse(entry.body);
// Then format: `${parsed.carrier} — ${parsed.trackingNumber} — ${formatCurrency(parsed.amount, parsed.currency)}`
```

Use try/catch for `JSON.parse` — body format may vary by notification type.

## Verification checklist

After implementation, run:
```bash
npm run build          # Must pass clean
npm run lint           # Must pass clean
npm run test           # All tests must pass
npm run test -- --run tests/tools/analytics/   # New analytics tests
npm run test -- --run tests/tools/notifications/  # New notification tests
```

Expected result: **65 tools** (57 existing + 8 new), ~920+ tests.

## Formatting guidelines

- Use `textResponse()` for all responses
- Format numbers: `value.toLocaleString()` for counts, `value.toFixed(2)` for percentages
- Format currency: reuse `formatCurrency` from `shipments.ts` if available, otherwise `$${amount.toFixed(2)} ${currency}`
- For carrier names: strip trailing spaces (some carrier names have them)
- Empty data: return helpful message like "No analytics data found for the specified date range"
- Truncate long lists: show top 10 entries with "... and X more" for oversized responses
