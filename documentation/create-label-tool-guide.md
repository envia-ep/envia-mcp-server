# envia_create_label Tool — Technical Guide

## 1. Purpose

The `envia_create_label` tool purchases a shipping label from a carrier via `POST /ship/generate/`. It charges the user's Envia account balance and returns a tracking number, label PDF URL, and tracking URL.

The tool operates in two modes:

- **Ecommerce mode** — provide an `order_identifier` and the tool fetches the order, extracts addresses/packages/carrier, resolves print settings, and generates the label in a single step.
- **Manual mode** — provide addresses, package details, and carrier/service directly. City and state are auto-resolved from postal codes (like `quote_shipment`). Colombia DANE codes are translated automatically.

---

## 2. Parameter Reference

### Ecommerce Shortcut

| Parameter | Type | Default | Description |
|---|---|---|---|
| `order_identifier` | `string` | — | Ecommerce platform order identifier. When set, origin/destination/packages are auto-populated from the order. |
| `location_index` | `number` | `0` | Which origin location to ship from (0-based). For multi-location orders. |

### Address Parameters (required in manual mode, ignored in ecommerce mode)

**Origin:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `origin_name` | `string` | Yes | Sender full name |
| `origin_phone` | `string` | No | Sender phone number |
| `origin_street` | `string` | Yes | Sender street address |
| `origin_number` | `string` | No | Exterior house/building number (important for MX) |
| `origin_district` | `string` | No | Neighborhood / colonia (important for MX) |
| `origin_city` | `string` | Auto | Auto-resolved from postal code. Required for CO, CL, GT, PA, HN, PE, BO. |
| `origin_state` | `string` | Auto | Auto-resolved from postal code. |
| `origin_country` | `string` | Yes | ISO 3166-1 alpha-2 (e.g. MX, US, CO) |
| `origin_postal_code` | `string` | Yes* | Required for most countries. Not needed for CO/CL/GT/etc. |
| `origin_company` | `string` | No | Sender company name |
| `origin_email` | `string` | No | Sender email |
| `origin_reference` | `string` | No | Address reference / landmark |
| `origin_identification_number` | `string` | No | Tax/national ID (RFC for MX, CNPJ for BR, etc.) |

**Destination:** Same pattern with `destination_` prefix.

### Package Parameters (required in manual mode)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `package_weight` | `number` | — | Weight in KG |
| `package_length` | `number` | — | Length in CM |
| `package_width` | `number` | — | Width in CM |
| `package_height` | `number` | — | Height in CM |
| `package_content` | `string` | `"General merchandise"` | Description of contents |
| `package_declared_value` | `number` | `0` | Declared value for insurance |

### Shipment Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `carrier` | `string` | From order quote | Carrier code (e.g. "dhl"). Required in manual mode. |
| `service` | `string` | From order quote | Service code (e.g. "express"). Required in manual mode. |
| `shipment_type` | `number` | `1` | 1 = parcel, 2 = LTL, 3 = FTL |
| `order_reference` | `string` | Order number | Reference to print on label |

### Settings Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `print_format` | `string` | Auto-fetched | Label format: PDF, ZPL, ZPLII, PNG, EPL |
| `print_size` | `string` | Auto-fetched | Label size: STOCK_4X6, PAPER_4X6, etc. |
| `currency` | `string` | Account default | ISO 4217 currency code (e.g. MXN, USD) |

---

## 3. Usage Examples

### Ecommerce mode — one-step label creation

```
User: Create a shipping label for order #1234.

Tool call:
  order_identifier: "1234"

→ Fetches order → extracts addresses, packages, carrier from quote
→ Fetches print settings from carrier
→ Creates label
→ Returns: tracking number, label PDF, tracking URL
```

### Ecommerce mode — override carrier

```
User: Ship order #1234 with DHL Express instead of the default carrier.

Tool call:
  order_identifier: "1234"
  carrier: "dhl"
  service: "express"

→ Uses order addresses/packages but overrides the carrier
```

### Ecommerce mode — multi-location, second warehouse

```
User: Create label for order #1234 from the Guadalajara warehouse (location 2).

Tool call:
  order_identifier: "1234"
  location_index: 1

→ Uses the second location's address, packages, and carrier
```

### Manual mode — domestic MX shipment

```
User: Ship a 2.5kg box from Monterrey to Mexico City via DHL Express.

Tool call:
  origin_name: "Juan Perez"
  origin_street: "Av. Constitucion 123"
  origin_postal_code: "64000"
  origin_country: "MX"
  destination_name: "Maria Lopez"
  destination_street: "Calle Reforma 456"
  destination_postal_code: "03100"
  destination_country: "MX"
  package_weight: 2.5
  package_length: 30
  package_width: 20
  package_height: 15
  carrier: "dhl"
  service: "express"

→ City/state auto-resolved from postal codes
→ Print settings default to PDF / STOCK_4X6
```

### Manual mode — Colombia with city-based addressing

```
Tool call:
  origin_city: "Bogota"
  origin_state: "DC"
  origin_country: "CO"
  destination_city: "Medellin"
  destination_state: "ANT"
  destination_country: "CO"
  ... (other required params)

→ City names auto-translated to DANE codes
```

---

## 4. Print Settings Resolution

Print format and size are required by the generate API. The tool resolves them automatically:

1. **Explicit override** — if `print_format` or `print_size` params are provided, they take priority.
2. **Carrier API** — in ecommerce mode (where `carrier_id` is available from the order quote), the tool calls `GET /pickup-limits/{carrier}/{service}/{country}?carrier_id={id}` to fetch carrier-specific print rules.
3. **Defaults** — if the API call fails or returns no rules, defaults to `PDF` / `STOCK_4X6`.

In manual mode, the carrier API is skipped (no `carrier_id` available) and defaults are used unless overridden.

---

## 5. How It Chains with Other Tools

### Ecommerce — direct label creation

```
envia_create_label (order_identifier: "1234")
  → Label created
  → envia_track_package (tracking_number from response)
```

### Ecommerce — rate comparison first

```
envia_get_ecommerce_order (order_identifier: "1234")
  → See available rates and carrier options
  → quote_shipment (with postal codes from order)
  → Pick cheapest carrier
  → envia_create_label (order_identifier: "1234", carrier: "fedex", service: "ground")
```

### Manual — full domestic workflow

```
envia_validate_address (postal_code, country)
  → quote_shipment (origin/destination postal codes + weight)
  → Pick carrier/service
  → envia_create_label (full addresses + carrier + service)
  → envia_track_package
  → envia_schedule_pickup (if needed)
```

---

## 6. Error Scenarios

| Scenario | Mode | Behavior |
|---|---|---|
| Order not found | Ecommerce | Returns tips to verify identifier and API access |
| All packages fulfilled | Ecommerce | Returns message suggesting `envia_track_package` |
| No carrier pre-selected, none provided | Ecommerce | Error suggesting `quote_shipment` first |
| `location_index` out of bounds | Ecommerce | Error with valid range |
| Missing required address fields | Manual | Validation error listing missing fields |
| Missing carrier/service | Manual | Error suggesting `quote_shipment` |
| Generate API error (400) | Both | Returns API error with troubleshooting tips |
| Insufficient balance (402) | Both | Returns balance error |
| No tracking number in response | Both | Returns unexpected response message |

---

## 7. Architecture

```
User input
  ├─ order_identifier set? → Ecommerce mode
  │   ├─ EcommerceOrderService.fetchOrder()
  │   │   └─ GET /v4/orders (Queries API)
  │   ├─ resolveLocation() — find unfulfilled packages
  │   ├─ resolveCarrier() — from quote or override
  │   ├─ fetchPrintSettings()
  │   │   └─ GET /pickup-limits/{carrier}/{service}/{country} (Queries API)
  │   ├─ Build payload with ecommerce metadata
  │   └─ POST /ship/generate/ (Shipping API)
  │
  └─ No order_identifier → Manual mode
      ├─ Validate required fields
      ├─ resolveAddress() — geocode postal codes, DANE codes
      ├─ buildGenerateAddress() — full address with optional fields
      ├─ resolvePrintSettings() — defaults (no carrier_id)
      └─ POST /ship/generate/ (Shipping API)
```

**Key files:**
- Tool: `src/tools/create-label.ts`
- Address builders: `src/builders/address.ts` (`buildGenerateAddress`, `buildGenerateAddressFromLocation`)
- Package builders: `src/builders/package.ts` (`buildManualPackage`, `buildPackagesFromV4`)
- Ecommerce builder: `src/builders/ecommerce.ts` (`buildEcommerceSection`)
- Address resolver: `src/utils/address-resolver.ts` (`resolveAddress`)
- Print settings: `src/utils/print-settings.ts`
- MCP response: `src/utils/mcp-response.ts` (`textResponse`)
- Ecommerce service: `src/services/ecommerce-order.ts` (`resolveLocation`, `resolveCarrier`)
- API types: `src/types/carriers-api.ts` (address, package, shipment, settings, ecommerce)
- Order types: `src/types/ecommerce-order.ts` (V4 response shapes)

See [Ecommerce Order Workflow](./ecommerce-order-workflow.md) for the complete data model and field mapping reference.
