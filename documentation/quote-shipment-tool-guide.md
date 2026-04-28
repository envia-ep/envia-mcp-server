# envia_quote_shipment Tool — Technical Guide

## 1. Purpose

The `envia_quote_shipment` tool compares shipping rates across carriers for a given route with minimal user input. It requires only **3 parameters** (origin postal code, destination postal code, and package weight) to return accurate rate comparisons — city and state are resolved automatically via the address resolver.

This tool is the entry point for the quoting workflow. Users typically call it before `envia_create_shipment` to choose the best carrier and service.

---

## 2. Parameter Reference

### Required Parameters (3)

| Parameter | Type | Description |
|---|---|---|
| `origin_postal_code` | `string` | Origin postal / ZIP code |
| `destination_postal_code` | `string` | Destination postal / ZIP code |
| `weight` | `number` | Package weight in KG (must be positive) |

### Optional Parameters with Defaults

| Parameter | Type | Default | Description |
|---|---|---|---|
| `origin_country` | `string` | `"MX"` | Origin country (ISO 3166-1 alpha-2) |
| `destination_country` | `string` | `"MX"` | Destination country (ISO 3166-1 alpha-2) |
| `origin_city` | `string` | — | Origin city (only for countries without postal codes) |
| `origin_state` | `string` | — | Origin state code (only for countries without postal codes) |
| `destination_city` | `string` | — | Destination city (only for countries without postal codes) |
| `destination_state` | `string` | — | Destination state code (only for countries without postal codes) |
| `length` | `number` | `10` | Package length in CM |
| `width` | `number` | `10` | Package width in CM |
| `height` | `number` | `10` | Package height in CM |
| `content` | `string` | `"General merchandise"` | Description of package contents |
| `declared_value` | `number` | `0` | Declared value for insurance |
| `carriers` | `string` | `"all"` | Carrier code(s) — `"all"` or comma-separated list |
| `currency` | `string` | — | ISO 4217 currency code (e.g. `"MXN"`, `"USD"`) |

### Removed Parameters (vs. previous version)

These fields are **not needed for quoting** and were removed from the input schema:
- `origin_name`, `origin_phone`, `origin_street`
- `destination_name`, `destination_phone`, `destination_street`
- `shipment_type` (hardcoded to `1` for parcel)

> **Note:** The Envia rate API still requires a `street` field in the address payload. `buildQuoteAddress()` fills this automatically with a hardcoded placeholder (`"Calle 1 #100"`). Real street data is only needed when creating a shipment label via `envia_create_shipment`.

---

## 3. Usage Examples

### Minimal domestic quote (Mexico)

```
User: How much does it cost to ship a 2kg package from 64000 to 03100?

Tool call:
  origin_postal_code: "64000"
  destination_postal_code: "03100"
  weight: 2

Response:
  Found 8 rate(s) — sorted cheapest first:
  • estafeta / ground (Estafeta Terrestre): $89.00 MXN | 3-5 business days
  • dhl / economy (DHL Economy): $105.00 MXN | 2-3 business days
  ...
```

### Specific carriers with dimensions

```
User: Compare DHL and FedEx for a 30x20x15cm box weighing 5kg from Monterrey to CDMX.

Tool call:
  origin_postal_code: "64000"
  destination_postal_code: "03100"
  weight: 5
  length: 30
  width: 20
  height: 15
  carriers: "dhl,fedex"
```

### Colombian shipment (city names auto-translated to DANE codes)

```
User: Quote shipping from Bogota to Medellin, 1kg package.

Tool call:
  origin_postal_code: "110111"
  destination_postal_code: "050001"
  weight: 1
  origin_country: "CO"
  destination_country: "CO"
  origin_city: "Bogota"
  origin_state: "DC"
  destination_city: "Medellin"
  destination_state: "AN"
```

The tool automatically translates "Bogota" to DANE code `11001000` and "Medellin" to `05001000` via the `/locate` endpoint.

### International shipment with currency

```
User: How much to ship from Mexico to the US? 3kg, show prices in USD.

Tool call:
  origin_postal_code: "64000"
  origin_country: "MX"
  destination_postal_code: "90210"
  destination_country: "US"
  weight: 3
  currency: "USD"
```

---

## 4. Country-Specific Notes

### Most countries (MX, US, BR, CA, AR, AU, ES, IT, etc.)

Only postal codes are needed. City and state are resolved automatically from the Geocodes API.

### Category D countries (CO, CL, GT, PA, HN, PE, BO)

These countries have no postal code cascade — you must provide `city` and `state` explicitly.

### Colombia (CO) — special handling

- The Envia API requires the `city` field to be an 8-digit DANE municipality code (e.g. `11001000`), not a city name.
- The tool handles this transparently: users can provide city names like "Bogota" or "Medellin", and the tool translates them via the `/locate` endpoint.
- If the user already provides a DANE code (8 digits), the translation is skipped.

---

## 5. How It Differs from `envia_create_shipment`

| Aspect | `envia_quote_shipment` | `envia_create_shipment` |
|---|---|---|
| Purpose | Compare rates, choose carrier | Purchase a shipping label |
| Required address fields | Postal code + country | Full address (name, phone, street, city, state, country, postal code) |
| Output | Rate list sorted by price | Label URL, tracking number, price |
| Typical position in workflow | Step 1 (exploration) | Step 2 (after choosing carrier/service from quote) |

---

## 6. Carrier Modes

### `"all"` (default)

Fetches the list of available carriers for the origin country via `GET /available-carrier/{country}/{intl}`, then fans out up to 10 parallel `POST /ship/rate` requests (one per carrier). This gives comprehensive results but costs one extra lookup.

### Specific carriers (comma-separated)

Skips the carrier discovery step and sends parallel requests directly, one per carrier. Useful when you already know which carriers to compare. Capped at 10 carriers to prevent abuse.

```
carriers: "dhl,fedex,estafeta"  → 3 parallel requests (no discovery)
carriers: "all"                 → 1 discovery + up to 10 parallel requests
```

---

## 7. Error Scenarios

| Scenario | Behavior |
|---|---|
| Empty carriers string | Returns error: "Provide at least one carrier code" |
| All carrier requests fail | Returns "No rates found" with error details |
| Some carriers fail, others succeed | Returns partial results + error section |
| Geocode API unavailable | Falls back to whatever address fields were provided |
| Colombian `/locate` fails | Passes city name as-is to the rate API |
| Invalid postal code | Rate API returns validation error |

---

## 8. Architecture

The tool is a thin orchestrator that delegates to reusable utilities:

```
User input
  → resolveAddress() (utils/address-resolver.ts)
    → resolvePostalCode() — Geocodes API
    → resolveColombianCity() — POST /locate (CO only)
    → resolveCityByGeocode() — GET /locate/{country}/{city} (CL, GT, PA, HN, PE, BO)
  → buildRateAddress() (builders/address.ts)
  → buildManualPackage() (builders/package.ts)
  → fetchAvailableCarriers() (services/carrier.ts) — when carriers="all"
  → POST /ship/rate (parallel per carrier)
  → Sort by price, format output
```

**Key files:**
- Tool: `src/tools/get-shipping-rates.ts`
- Address builders: `src/builders/address.ts` (`buildRateAddress`)
- Package builders: `src/builders/package.ts` (`buildManualPackage`)
- Carrier service: `src/services/carrier.ts` (`fetchAvailableCarriers`)
- Address resolver: `src/utils/address-resolver.ts`
- MCP response: `src/utils/mcp-response.ts`
- API types: `src/types/carriers-api.ts`

See [Address Resolver Guide](./address-resolver-guide.md) for details on the resolution layer.
