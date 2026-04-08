# Address Resolver — Technical Guide

## 1. Purpose

The address resolver (`src/utils/address-resolver.ts`) provides reusable address resolution for any MCP tool that needs to convert minimal user input into a fully resolved address. It handles two key operations:

1. **Postal code geocoding** — translates a postal code + country into city and state via the Geocodes API.
2. **Colombian city translation** — converts human-readable city names into the 8-digit DANE municipality codes that the Envia API requires for Colombia.

The module is **tool-agnostic**: it accepts `EnviaApiClient` and `EnviaConfig` as injected dependencies and has no awareness of MCP, tools, or server state. Any tool that works with addresses can import and use it.

---

## 2. API Reference

### `resolvePostalCode(postalCode, country, client, config)`

Resolves a postal code into city and state via the Geocodes API.

| Parameter | Type | Description |
|---|---|---|
| `postalCode` | `string \| undefined` | Postal / ZIP code to look up |
| `country` | `string` | ISO 3166-1 alpha-2 country code |
| `client` | `EnviaApiClient` | API client instance |
| `config` | `EnviaConfig` | Server configuration |

**Returns:** `Promise<ResolvedAddress>` — `{ city?, state?, postalCode?, country }`

**Behavior:**
- Calls `GET {geocodesBase}/zipcode/{country}/{postalCode}`
- Extracts `locality` (or `city`) and `state.code.2digit` (or `state.name`) from the first result
- Returns only `{ country }` when postal code is empty or the API fails
- URL-encodes special characters in the postal code (e.g. Canadian `M5V 3A8`)

### `resolveColombianCity(city, state, country, client, config)`

Translates a human-readable Colombian city name into its 8-digit DANE municipality code.

| Parameter | Type | Description |
|---|---|---|
| `city` | `string` | City name or DANE code |
| `state` | `string` | State / department code |
| `country` | `string` | Must be `"CO"` |
| `client` | `EnviaApiClient` | API client instance |
| `config` | `EnviaConfig` | Server configuration |

**Returns:** `Promise<{ city: string; state: string }>`

**Behavior:**
- Calls `POST {shippingBase}/locate` with `{ city, state, country }`
- The endpoint performs a full-text search against the Province table
- Returns `{ city: "<DANE code>", state: "<resolved state>" }`
- **Skips the call** when the city already matches the DANE pattern (`/^\d{8}$/`)
- Falls back to the original values on API failure

### `resolveCityByGeocode(city, country, client, config)`

Resolves a city name via the Geocodes `/locate` endpoint for countries that use city-based addressing (CL, GT, PA, HN, PE, BO).

| Parameter | Type | Description |
|---|---|---|
| `city` | `string` | City name to look up |
| `country` | `string` | ISO 3166-1 alpha-2 country code |
| `client` | `EnviaApiClient` | API client instance |
| `config` | `EnviaConfig` | Server configuration |

**Returns:** `Promise<ResolvedAddress>` — `{ city?, state?, postalCode?, country }`

**Behavior:**
- Calls `GET {geocodesBase}/locate/{country}/{city}`
- Extracts 2-digit state code, canonical city name (locality), and postal code from the response
- Falls back to the original city on API failure or empty results

### `resolveAddress(params, client, config)`

Orchestrator that combines postal code geocoding, Colombian DANE translation, and geocodes city lookup.

| Parameter | Type | Description |
|---|---|---|
| `params` | `AddressResolveInput` | `{ postalCode?, country, city?, state? }` |
| `client` | `EnviaApiClient` | API client instance |
| `config` | `EnviaConfig` | Server configuration |

**Returns:** `Promise<ResolvedAddress>` — `{ city?, state?, postalCode?, country }`

**Behavior:**
1. If `postalCode` is provided, calls `resolvePostalCode` to geocode it.
2. Merges any explicit `city`/`state` overrides from the caller (overrides win).
3. For CO: if `city` is present and not already a DANE code, calls `resolveColombianCity`.
4. For CL, GT, PA, HN, PE, BO: if `city` is present, calls `resolveCityByGeocode` to resolve state and postal code.
4. Returns the fully resolved address.

---

## 3. Country Behavior Matrix

| Category | Countries | Postal Code Resolves City/State? | Notes |
|---|---|---|---|
| **A** — Action pipeline | MX, BR | Yes | Postal code cascades into state/city/district |
| **B** — Path-based | AU, ES, IT, EC, CN | Yes | Postal code maps to state via path expressions |
| **C** — Legacy geocode | US, CA, AR, IN, UY, NZ, ... | Yes | Postal code geocodes to city/state |
| **D** — State-driven | CO, CL, GT, PA, HN, PE, BO | No | Postal code hidden/absent; provide city + state explicitly |

**Colombia special case:** CO is Category D AND requires the `city` field to be an 8-digit DANE municipality code (e.g. `11001000` for Bogota). The resolver handles this transparently — callers pass a human-readable name and get the DANE code back.

---

## 4. Integration Guide

### Current consumers

- `src/tools/get-shipping-rates.ts` — uses `resolveAddress` to resolve both origin and destination from minimal input.

### Adopting in other tools

Any tool that handles addresses can opt-in to the resolver. The pattern is:

```typescript
import { resolveAddress } from '../utils/address-resolver.js';

// Inside the tool handler:
const resolved = await resolveAddress(
    { postalCode: args.postal_code, country: args.country, city: args.city, state: args.state },
    client,
    config,
);

// Use resolved.city, resolved.state, resolved.postalCode, resolved.country
```

Tools that need full addresses (name, phone, street) should resolve the geographic fields first, then combine with the personal fields before calling `buildAddress`.

### Relationship with address.ts

- `address-resolver.ts` resolves **what** the city/state are (external API calls)
- `address.ts` builds **the shape** the Envia API expects (data transformation)
- `buildQuoteAddress()` includes a hardcoded placeholder street (`"Calle 1 #100"`) because the Envia rate API requires it even for price comparison — users never provide it for quoting

```
User input → resolveAddress() → buildQuoteAddress() or buildAddress() → API payload
```

---

## 5. Error Handling and Fallback

All three functions follow the same graceful degradation pattern:

- **API unavailable / network error:** Returns only the fields the caller already provided. The rate API may still succeed with partial address data.
- **Empty response:** Returns the base fields without city/state.
- **Colombian locate failure:** Returns the original city name as-is. The rate API will attempt its own resolution or return a validation error.

No function throws exceptions — they always return a result. Errors are logged by the API client's retry mechanism.

---

## 6. Examples

### Mexico (Category A — postal code resolves everything)

```typescript
const result = await resolveAddress(
    { postalCode: '64000', country: 'MX' },
    client, config,
);
// → { postalCode: '64000', country: 'MX', city: 'Monterrey', state: 'NL' }
```

### United States (Category C — postal code geocodes)

```typescript
const result = await resolveAddress(
    { postalCode: '90210', country: 'US' },
    client, config,
);
// → { postalCode: '90210', country: 'US', city: 'Beverly Hills', state: 'CA' }
```

### Colombia (Category D — city name translated to DANE code)

```typescript
const result = await resolveAddress(
    { country: 'CO', city: 'Bogota', state: 'DC' },
    client, config,
);
// → { country: 'CO', city: '11001000', state: 'DC' }
```

### Colombia with DANE code already provided (skips /locate call)

```typescript
const result = await resolveAddress(
    { country: 'CO', city: '11001000', state: 'DC' },
    client, config,
);
// → { country: 'CO', city: '11001000', state: 'DC' }
// No API call made — DANE code pattern detected
```

### Chile (Category D — city resolved via Geocodes `/locate`)

```typescript
const result = await resolveAddress(
    { country: 'CL', city: 'Concepcion' },
    client, config,
);
// → { country: 'CL', city: 'Concepción', state: 'BI', postalCode: '4030000' }
// Resolved via GET {geocodesBase}/locate/CL/Concepcion
```
