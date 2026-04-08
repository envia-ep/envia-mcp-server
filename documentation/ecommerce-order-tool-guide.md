# envia_get_ecommerce_order Tool — Technical Guide

## 1. Purpose

The `envia_get_ecommerce_order` tool fetches an ecommerce order by its platform identifier and transforms it into ready-to-use payloads for the existing `quote_shipment` and `envia_create_label` tools. It bridges the gap between ecommerce order data and the Envia Shipping API, allowing an AI assistant to look up any order and immediately proceed to rate shopping or label creation.

This tool is the entry point for the **ecommerce order workflow**. Users provide an order identifier from their ecommerce platform (Shopify, Tiendanube, WooCommerce, etc.), and the tool returns structured address, package, and carrier data.

---

## 2. Parameter Reference

### Required Parameters

| Parameter | Type | Description |
|---|---|---|
| `order_identifier` | `string` | The ecommerce platform's order identifier (e.g. Shopify order number, Tiendanube ID). This is the external identifier visible to merchants — **not** the internal database `order_id`. |

### Optional Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `payload_type` | `string` | `"both"` | Which payload format to return: `"quote"` for rate comparison only, `"generate"` for label creation only, or `"both"` for both formats. |

> **Note:** The tool always queries using `order_identifier`, never `order_id`. The internal database ID is an implementation detail unknown to most users.

---

## 3. Usage Examples

### Look up an order by Shopify number

```
User: I need to ship order #1234 from my Shopify store.

Tool call:
  order_identifier: "1234"

Response:
  Order found successfully!

  === Order Summary ===
    Identifier:  1234
    Name:        #1234
    Shop:        My Shopify Store
    Platform:    Shopify
    Currency:    MXN
    Payment:     paid
    Locations:   1

  === Location 1: Av. Constitucion 123, Monterrey, NL ===
    Carrier:     fedex / ground
    Packages:    1

  --- Quote Payload (for quote_shipment) ---
    Origin:      64000, Monterrey, NL, MX
    Destination: 03100, Mexico City, CDMX, MX
    Package 1:   1.5KG — 20x15x10CM — "T-Shirts"
    Pre-selected: fedex / ground — you can skip quoting and go directly to label creation.

  --- Generate Payload (for envia_create_label) ---
    Origin name:    Warehouse Norte
    Origin address: Av. Constitucion 123, Monterrey, NL 64000, MX
    ...
```

### Get only quoting data

```
User: What would it cost to ship order SHOP-5678?

Tool call:
  order_identifier: "SHOP-5678"
  payload_type: "quote"

→ Returns only the Quote Payload section (no generate payload).
```

### Get only label generation data

```
User: Create a label for order TN-9999.

Tool call:
  order_identifier: "TN-9999"
  payload_type: "generate"

→ Returns only the Generate Payload section (requires pre-selected carrier).
```

---

## 4. Output Format

The tool returns structured text with these sections:

### Order Summary

Always included. Shows identifiers, shop, platform, currency, payment status, and location count.

### Fulfillment Warnings

Shown when packages have existing tracking numbers:
- **Fully fulfilled**: All packages have labels. Suggests using `envia_track_package` instead.
- **Partially fulfilled**: Some packages have labels. Only unfulfilled packages are included in payloads.

### Per-Location Payloads

Each origin location (warehouse) gets its own section with:

- **Quote Payload**: Postal codes, city/state/country for origin and destination, package dimensions and weight. Ready to feed into `quote_shipment`.
- **Generate Payload**: Full names, phones, street addresses, carrier/service, currency, and ecommerce metadata. Ready to feed into `envia_create_label`.

### Next Steps

Contextual guidance based on the order state:
- No carrier → suggests `quote_shipment`
- Carrier present → suggests `envia_create_label`
- All fulfilled → suggests `envia_track_package`

---

## 5. How to Chain with Other Tools

### Flow 1: Order has a pre-selected carrier

```
envia_get_ecommerce_order (order_identifier: "1234")
  → carrier already selected (fedex / ground)
  → envia_create_label (use origin/destination/package data from output)
  → envia_track_package (use tracking number from label)
```

### Flow 2: Order has no carrier — rate shop first

```
envia_get_ecommerce_order (order_identifier: "1234", payload_type: "quote")
  → no carrier pre-selected
  → quote_shipment (use origin/destination postal codes and package weight)
  → pick cheapest carrier
  → envia_create_label (combine address data from order + carrier from quote)
```

### Flow 3: Multi-location order

Each location in the order produces independent payloads. Create labels per-location:

```
envia_get_ecommerce_order (order_identifier: "1234")
  → Location 1: Monterrey warehouse → fedex / ground
  → Location 2: Guadalajara warehouse → dhl / express
  → envia_create_label for Location 1
  → envia_create_label for Location 2
```

---

## 6. How It Differs from Other Tools

| Aspect | `envia_get_ecommerce_order` | `quote_shipment` | `envia_create_label` |
|---|---|---|---|
| Purpose | Fetch order data and build payloads | Compare shipping rates | Purchase a label |
| Input | Order identifier only | Postal codes + weight | Full addresses + carrier |
| Output | Order summary + payload data | Rate list sorted by price | Label URL + tracking number |
| Charges balance | No | No | Yes |
| Position in workflow | Step 1 (data retrieval) | Step 2 (rate shopping) | Step 3 (label purchase) |

---

## 7. Error Scenarios

| Scenario | Behavior |
|---|---|
| Order not found | Returns "No order found" with troubleshooting tips |
| API authentication failure | Returns error with suggestion to verify API key |
| API server error (5xx) | Retries automatically (up to 3 times), then returns error |
| All packages fulfilled | Returns order data with fulfillment warning and suggests tracking |
| No carrier pre-selected | Returns quote payload but not generate payload; suggests `quote_shipment` |
| Missing address fields | Payloads include empty strings for missing fields; carrier API will validate |

---

## 8. Architecture

The tool delegates to a service layer that can be reused by future tools (e.g. fulfillment):

```
User input (order_identifier)
  → EcommerceOrderService.fetchOrder()
    → GET /v4/orders?order_identifier=X (Queries API)
    → Fallback: GET /v4/orders?search=X
  → EcommerceOrderService.transformOrder()
    → Per-location: delegates to shared builders:
      → builders/address.ts (buildRateAddressFromLocation, buildGenerateAddressFromLocation, etc.)
      → builders/package.ts (buildPackagesFromV4)
      → builders/ecommerce.ts (buildEcommerceSection)
    → Produces: LocationQuotePayload + LocationGeneratePayload
  → formatOutput() — renders payloads as text
```

**Key files:**
- Tool: `src/tools/get-ecommerce-order.ts`
- Ecommerce service: `src/services/ecommerce-order.ts`
- Address builders: `src/builders/address.ts`
- Package builders: `src/builders/package.ts`
- Ecommerce builder: `src/builders/ecommerce.ts`
- MCP response: `src/utils/mcp-response.ts`
- API types: `src/types/carriers-api.ts`
- Order types: `src/types/ecommerce-order.ts`

See [Ecommerce Order Workflow](./ecommerce-order-workflow.md) for the complete data model and field mapping reference.
