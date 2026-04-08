# Ecommerce Order Workflow — Reference

## 1. Overview

This document describes how ecommerce orders are retrieved, transformed, and used to create shipment payloads in the Envia ecosystem. It serves as the canonical reference for the data model, field mappings, and business rules that govern the order-to-shipment pipeline.

The workflow applies to orders from any connected ecommerce platform (Shopify, Tiendanube, WooCommerce, Magento, Amazon, Mercado Libre, Temu, etc.) that are stored in the Envia Queries database.

---

## 2. Data Flow

```
Ecommerce Platform
  → Sync to Envia (via integration / webhooks)
  → Queries Database (orders, order_packages, order_addresses, order_products)
  → GET /v4/orders API (structured JSON response)
  → MCP Tool (envia_get_ecommerce_order) or Frontend (envia-clients)
  → Transform into Envia Shipping API payloads
  → POST /ship/rate (quoting) or POST /ship/generate (label creation)
```

### Key Systems

| System | Role |
|---|---|
| **Queries API** (`queries.envia.com`) | Stores and serves order data via REST endpoints |
| **Shipping API** (`api.envia.com`) | Handles rate quoting, label generation, tracking |
| **envia-clients** (frontend) | Web UI for ecommerce management, Scan & Go workflow |
| **MCP Server** | AI assistant interface — `envia_get_ecommerce_order` tool |

---

## 3. V4 Orders API Response Structure

The `GET /v4/orders` endpoint returns orders in the following nested structure:

```
{
  orders_info: [
    {
      id: number                          // Internal DB order ID
      status_id: number                   // General status catalog ID
      order: {
        identifier: string                // Ecommerce platform order ID
        name: string                      // Display name (e.g. "#1234")
        number: string                    // Order number
        status_payment: string            // "paid" | "pending" | "cod"
        currency: string                  // ISO 4217 (e.g. "MXN", "USD")
        total: number                     // Order total
        shipping_method: string           // Ecommerce shipping method
        shipping_option_reference: string // Carrier reference (not authoritative)
        cod: number                       // Cash on delivery flag
        logistic_mode: string             // Marketplace logistics mode
        created_at_ecommerce: string      // ISO timestamp
      }
      customer: { name, email }
      shop: { id, name }
      ecommerce: { id, name }            // Platform (Shopify=1, Tiendanube=6, etc.)
      shipment_data: {
        shipping_address: { ... }         // Destination (customer)
        locations: [ ... ]                // Origins (warehouses/stores)
      }
      tags: [{ id, tag, source }]
    }
  ],
  countries: [ ... ],
  totals: { ... }
}
```

### Shipping Address (Destination)

The customer's shipping address. One per order.

| Field | Type | Description |
|---|---|---|
| `company` | `string \| null` | Company name |
| `first_name` | `string` | Customer first name |
| `last_name` | `string` | Customer last name |
| `phone` | `string` | Phone number |
| `address_1` | `string` | Street address line 1 |
| `address_2` | `string \| null` | Street address line 2 |
| `city` | `string` | City name |
| `state_code` | `string` | State/province code (e.g. "NL", "CDMX") |
| `country_code` | `string` | ISO 3166-1 alpha-2 (e.g. "MX") |
| `postal_code` | `string` | Postal / ZIP code |
| `email` | `string` | Customer email |
| `reference` | `string \| null` | Address reference / landmark |
| `identification_number` | `string \| null` | Tax ID / identification |
| `branch_code` | `string \| null` | Carrier branch code |

### Location (Origin)

One or more origin locations per order. Each represents a warehouse or store that fulfills part of the order.

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Address ID in the database |
| `first_name` | `string` | Location contact name |
| `last_name` | `string \| null` | Location contact last name |
| `company` | `string \| null` | Company name |
| `phone` | `string \| null` | Phone number |
| `address_1` | `string` | Street address |
| `city` | `string` | City |
| `state_code` | `string` | State code |
| `country_code` | `string` | Country code |
| `postal_code` | `string` | Postal code |
| `packages` | `array` | Packages to ship from this location |

### Package

Each package within a location contains physical dimensions, carrier quote, shipment status, and product line items.

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Package ID |
| `content` | `string` | Description of contents |
| `amount` | `number` | Number of boxes (usually 1) |
| `package_type_name` | `string` | "Box", "Envelope", "Pallet", etc. |
| `declared_value` | `number` | Declared value for insurance |
| `dimensions` | `object` | `{ height, length, width }` in CM |
| `weight` | `number` | Weight value |
| `weight_unit` | `string` | "KG" or "LB" |
| `length_unit` | `string` | "CM" or "IN" |
| `quote` | `object` | Pre-selected carrier (see below) |
| `shipment` | `object \| null` | Existing shipment data (if label created) |
| `fulfillment` | `object` | `{ status, status_id }` |
| `products` | `array` | Line items in this package |
| `is_return` | `boolean` | Whether this is a return package |

### Package Quote (Carrier Pre-Selection)

The `quote` object on each package is the **authoritative** source for carrier selection. Order-level `shipping_options` or `shipping_option_reference` are generic defaults and must **not** be used as carrier selection.

| Field | Type | Description |
|---|---|---|
| `price` | `number \| null` | Quoted rate |
| `service_id` | `number \| null` | Service ID in carrier catalog |
| `carrier_id` | `number \| null` | Carrier ID in carrier catalog |
| `carrier_name` | `string \| null` | Carrier slug (e.g. "fedex") |
| `service_name` | `string \| null` | Service slug (e.g. "ground") |

A quote is considered valid only when **all four** of `carrier_id`, `service_id`, `carrier_name`, and `service_name` are present and non-null.

### Package Shipment (Existing Label)

When a label has already been generated, `shipment` is non-null:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Carrier name |
| `tracking_number` | `string` | Tracking number |
| `shipment_id` | `number` | Envia shipment ID |
| `status` | `string` | Shipment status |

Packages with a `tracking_number` are considered **fulfilled** and are excluded from new payload generation.

---

## 4. Field Mapping: V4 Response to Envia Shipping API

### Destination Address Mapping

| V4 Field | Shipping API Field | Notes |
|---|---|---|
| `first_name` + `last_name` | `name` | Joined with space |
| `phone` | `phone` | |
| `address_1` | `street` | |
| `city` | `city` | |
| `state_code` | `state` | |
| `country_code` | `country` | Uppercased |
| `postal_code` | `postalCode` | |
| `email` | `email` | Optional — omitted if empty |
| `company` | `company` | Optional — omitted if null |
| `reference` | `reference` | Optional — omitted if null |

### Origin Address Mapping

Same pattern as destination, using the location fields:

| V4 Field | Shipping API Field |
|---|---|
| `first_name` + `last_name` | `name` |
| `phone` | `phone` |
| `address_1` | `street` |
| `city` | `city` |
| `state_code` | `state` |
| `country_code` | `country` (uppercased) |
| `postal_code` | `postalCode` |
| `company` | `company` (optional) |

### Quote Address (Minimal — for rate shopping)

For rate quoting, only geographic fields are needed. A placeholder street is used.

| Shipping API Field | Value |
|---|---|
| `street` | `"Calle 1 #100"` (hardcoded placeholder) |
| `city` | From V4 `city` |
| `state` | From V4 `state_code` |
| `country` | From V4 `country_code` (uppercased) |
| `postalCode` | From V4 `postal_code` |

### Package Mapping

| V4 Field | Shipping API Field | Notes |
|---|---|---|
| `package_type_name` | `type` | Lowercased (e.g. "Box" → "box") |
| `content` | `content` | Defaults to "General merchandise" |
| `amount` | `amount` | Defaults to 1 |
| `declared_value` | `declaredValue` | |
| `weight` | `weight` | |
| `weight_unit` | `weightUnit` | Defaults to "KG" |
| `length_unit` | `lengthUnit` | Defaults to "CM" |
| `dimensions.length` | `dimensions.length` | |
| `dimensions.width` | `dimensions.width` | |
| `dimensions.height` | `dimensions.height` | |
| `products[]` | `items[]` | Only for international shipments |

### Product/Item Mapping (International Only)

| V4 Field | Shipping API Field |
|---|---|
| `name` | `name` |
| `sku` | `sku` (defaults to "") |
| `quantity` | `quantity` |
| `price` | `price` |
| `weight` | `weight` (defaults to 0) |

### Shipment Section (Generation Only)

| Shipping API Field | Source |
|---|---|
| `carrier` | `quote.carrier_name` |
| `service` | `quote.service_name` |
| `type` | `1` (parcel — fixed) |
| `orderReference` | `order.number` |

### Ecommerce Metadata (Generation Only)

| Shipping API Field | Source |
|---|---|
| `shop_id` | `shop.id` |
| `order_id` | `id` (order DB ID) |
| `order_identifier` | `order.identifier` |
| `order_name` | `order.name` |
| `order_number` | `order.number` |
| `type_generate` | `"multi_generate"` (fixed) |

### Settings (Generation Only)

| Shipping API Field | Source |
|---|---|
| `currency` | `order.currency` (defaults to "MXN") |

---

## 5. Carrier Selection Rules

### Package-Level Quote is Authoritative

The carrier for each location is derived **exclusively** from the `quote` object on its packages. The first package in a location with a valid `quote.carrier_id` determines the carrier for all packages in that location.

**Ignored sources** (per the Scan & Go specification):
- Order-level `shipping_options`
- `shipping_option_reference` on the order
- `shipping_method` on the order

These are generic defaults from the ecommerce platform checkout and do not represent a specific carrier selection for individual packages.

### When No Carrier is Available

If no package in a location has a valid quote, the generate payload is **not produced**. The user must:
1. Use `quote_shipment` to compare rates for the origin/destination
2. Choose a carrier and service from the results
3. Use `envia_create_label` with the chosen carrier and the address data from the order

---

## 6. Multi-Location Handling

An order may have packages shipped from multiple origin locations (warehouses). Each location is processed independently:

```
Order #1234
├── Location 1: Monterrey warehouse
│   ├── Package A (fedex / ground)
│   └── Package B (fedex / ground)
└── Location 2: Guadalajara warehouse
    └── Package C (dhl / express)
```

Each location produces its own:
- Quote payload (independent origin address)
- Generate payload (independent carrier selection)
- Warnings (independent fulfillment status)

This matches the behavior of the `envia-clients` frontend, where multi-location orders produce multiple shipment creation calls — one per location.

---

## 7. Fulfillment Status and Guards

### Determining Fulfillment State

A package is considered **fulfilled** when it has a non-null `shipment.tracking_number`.

| State | Condition | Behavior |
|---|---|---|
| **Unfulfilled** | No packages have tracking numbers | Normal processing |
| **Partially fulfilled** | Some packages have tracking numbers | Only unfulfilled packages included in payloads |
| **Fully fulfilled** | All packages have tracking numbers | Warning displayed; payloads have 0 packages |

### Return Packages

Packages with `is_return: true` are excluded from payload generation. They represent return shipping and are handled separately.

---

## 8. The Label Generation Pipeline

For reference, here is the complete pipeline that the `envia-clients` frontend (Scan & Go) executes when creating a label from an ecommerce order:

| Step | Function | What Happens |
|---|---|---|
| 1. Prepare | `buildGenerationPayloads` | Assembles API payloads from order data |
| 2. Generate | `executeGenerationBatch` | Calls carrier API to create shipments |
| 3. Save | `executeFulfillmentSequential` | Saves shipment data via `orderShipments` |
| 4. Fulfill | `processGenerationResponse` | Sends fulfillment to ecommerce store via `tmpFulfillment` |
| 5. Download | `downloadLabels` | Downloads or prints label PDF |

The MCP `envia_get_ecommerce_order` tool covers **Step 1** (payload preparation). Steps 2-3 correspond to `envia_create_label`. Steps 4-5 (store fulfillment and label download) will be implemented in a future iteration.

---

## 9. Frontend Reference (envia-clients)

The MCP service replicates the transformation logic from these frontend modules:

| Module | Role |
|---|---|
| `getConstructorOrder` (context/ecommerce/actions.js) | Splits order into per-location rows using `Order` class |
| `transformOrderForGeneration` (hooks/ecommerce/useScanAndGo.js) | Maps package-level `quote` to `carrierSelected` |
| `buildGenerationPayloads` (services/ecommerce/label-generation.service.js) | Builds final API payloads |
| `generatePayload` (components/page-ecommerce/MultiorderOptions/generate.js) | Maps order data to `{ origin, destination, packages, shipment, ecommerce }` |
| `Address.getAddressAsQuotePayload()` (utils/classes/Address.class.js) | Address field mapping |
| `Pack.getPackageAsQuotePayload()` (utils/classes/Package.class.js) | Package field mapping |

---

## 10. Future: Fulfillment Integration

The current implementation covers payload preparation (quoting and label generation). Future iterations will add:

- **Order fulfillment**: After label creation, notify the ecommerce store that the order has been shipped (`tmpFulfillment` / batch fulfillments endpoint)
- **Fulfillment strategies**: Platform-specific logic for Temu (`logisticMode: "seller-Ecommerce"`), Tiny, and others
- **Label download**: Retrieve and deliver label PDFs after generation
- **Partial fulfillment**: Generate labels for unfulfilled locations while preserving existing shipments

These features will reuse the `EcommerceOrderService` class, extending it with fulfillment-specific methods.
