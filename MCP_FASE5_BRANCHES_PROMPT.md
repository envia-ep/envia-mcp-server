# Fase 5: Sucursales (Branches) — Implementation Prompt

> **For Sonnet agent:** This prompt contains everything you need to implement Fase 5. Read it completely before starting. Follow the established patterns exactly.

## Goal

Add 3 branch/pickup-point tools to the envia-mcp-server. These allow AI agents to help users find carrier pickup and dropoff locations.

## Project Context

**Working directory:** `/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server`

**Current state:** 54 tools, 840 tests, build+lint clean. TypeScript + MCP SDK + Zod 4 + Vitest 3.

**Architecture pattern (read these files as templates):**
- `src/services/tickets.ts` — Latest service pattern
- `src/tools/tickets/list-tickets.ts` — Latest tool pattern
- `src/tools/tickets/index.ts` — Barrel export pattern
- `src/types/tickets.ts` — Type definition pattern

**Conventions (CRITICAL):**
- Single quotes, 4 spaces, semicolons, trailing commas
- JSDoc on every exported function
- ES modules with `.js` extensions in imports
- kebab-case files, camelCase functions, PascalCase types
- All tools use `textResponse()` from `../../utils/mcp-response.js`
- All tools use `resolveClient()` for api_key
- All error handling uses `mapCarrierError()` from `../../utils/error-mapper.js`
- Reuse `buildQueryUrl` from `./shipments.js` in service layer

## CRITICAL: Branch endpoints have DIFFERENT response format

Unlike ALL other endpoints in the MCP server, branch endpoints return **raw JSON arrays**, NOT `{ data: [...] }`. The service layer must handle this.

```typescript
// Other endpoints:
const res = await client.get<{ data: SomeType[] }>(url);
const items = res.data?.data ?? [];

// Branch endpoints:
const res = await client.get<BranchRecord[]>(url);
const items = Array.isArray(res.data) ? res.data : [];
```

Also: These endpoints are **PUBLIC** (no auth required). But the MCP tool should still accept `api_key` as optional for consistency — the API simply ignores it.

## Files to Create

```
src/types/branches.ts                        — Response interfaces
src/services/branches.ts                     — Query helpers + formatters
src/tools/branches/index.ts                  — Barrel export
src/tools/branches/search-branches.ts        — envia_search_branches
src/tools/branches/get-branches-catalog.ts   — envia_get_branches_catalog
src/tools/branches/search-branches-bulk.ts   — envia_search_branches_bulk
tests/services/branches.test.ts              — Service formatter tests (~10)
tests/tools/branches/search-branches.test.ts — Representative tool tests (~8)
```

## File to Modify

```
src/index.ts — Import and register the 3 new tools from barrel
```

---

## API Contracts (VERIFIED via real API calls)

### Tool 1: `envia_search_branches`
**Endpoint:** GET /branches/{carrier}/{country_code}
**Auth:** None (public)

**Path params:** carrier (string, required), country_code (string, 2 chars, required)

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| zipcode | string | No | Postal code to search near |
| locality | string | No | City or locality name |
| state | string | No | State code (2 chars) |
| type | number | No (default 1) | 1=pickup, 2=dropoff, 3=both |
| latitude | number | No | GPS latitude |
| longitude | number | No | GPS longitude |
| limitBranches | number | No | Max results to return |
| shipmentType | number | No | Shipment type filter (1=parcel, 2=LTL) |

**Response:** RAW ARRAY (not wrapped)
```json
[
  {
    "distance": 1.86,
    "branch_id": "YMU",
    "branch_code": "MTY",
    "branch_type": 1,
    "reference": "MTY - ALAMEDA",
    "branch_rules": null,
    "address": {
      "city": "Monterrey",
      "state": "NL",
      "number": "400",
      "street": "Pino Suarez",
      "country": "MX",
      "delivery": true,
      "latitude": "25.674113",
      "locality": "Monterrey",
      "admission": true,
      "longitude": "-100.319496",
      "postalCode": "64400"
    },
    "hours": []
  }
]
```

**Notes:**
- `latitude`/`longitude` are STRINGS, not numbers
- `state` can be null for some branches
- `hours[]` is often empty
- `branch_rules` is often null

---

### Tool 2: `envia_get_branches_catalog`
**Endpoint:** GET /branches/{carrier}/{country_code}/catalog
**Auth:** None (public)

**Path params:** carrier (string), country_code (string, 2 chars)

**Response:**
```json
{
  "states": ["Aguascalientes", "Baja California", ...],
  "localities": {
    "Aguascalientes": ["Aguascalientes"],
    "Nuevo Leon": ["Monterrey"],
    ...
  }
}
```

---

### Tool 3: `envia_search_branches_bulk`
**Endpoint:** GET /branches-bulk/{carrier}/{country_code}
**Auth:** None (public)

**Query params:** Same as search_branches + `limit` (number)

**Response:** Same array format as search_branches, but with lat/lng duplicated at root level.

---

## Type Definitions (`src/types/branches.ts`)

```typescript
/**
 * Envia MCP Server — Branch Types
 *
 * TypeScript interfaces for branch/pickup-point API responses.
 */

/** Address within a branch location. */
export interface BranchAddress {
    city: string | null;
    state: string | null;
    number: string | null;
    street: string | null;
    country: string | null;
    delivery: boolean;
    latitude: string | null;      // NOTE: string, not number
    locality: string | null;
    admission: boolean;
    longitude: string | null;     // NOTE: string, not number
    postalCode: string | null;
}

/** A single branch record from the branches API. */
export interface BranchRecord {
    distance: number | null;
    branch_id: string;
    branch_code: string;
    branch_type: number;          // 1=pickup, 2=dropoff
    reference: string;            // human-readable name
    branch_rules: Record<string, unknown> | null;
    address: BranchAddress;
    hours: Array<{
        day?: number;             // 1-7 (Mon-Sun)
        start?: string;           // "HH:MM"
        end?: string;             // "HH:MM"
    }>;
}

/** Response from the catalog endpoint. */
export interface BranchCatalogResponse {
    states: string[];
    localities: Record<string, string[]>;
}
```

---

## Service Layer (`src/services/branches.ts`)

```typescript
import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { BranchRecord } from '../types/branches.js';

/**
 * Build URL for branch endpoints (path params + query params).
 */
export function buildBranchUrl(
    base: string,
    carrier: string,
    countryCode: string,
    suffix: string,
    params: Record<string, unknown>,
): string {
    // Build: {base}/branches/{carrier}/{countryCode}{suffix}?params
    // Use URL class, skip undefined/null/empty params
}

/**
 * Query the branches API. Returns raw array response.
 * NOTE: Unlike other APIs, branches return a raw array, not { data: [...] }.
 */
export async function queryBranchesApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    carrier: string,
    countryCode: string,
    suffix: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildBranchUrl(config.queriesBase, carrier, countryCode, suffix, params);
    return client.get<T>(url);
}

/**
 * Format a single branch for display.
 */
export function formatBranchSummary(branch: BranchRecord): string {
    const addr = branch.address;
    const location = [addr.street, addr.number, addr.locality ?? addr.city, addr.state, addr.postalCode]
        .filter(Boolean)
        .join(', ');
    const capabilities = [
        addr.admission ? 'pickup' : null,
        addr.delivery ? 'delivery' : null,
    ].filter(Boolean).join(' + ');
    const dist = branch.distance != null ? ` (${branch.distance.toFixed(1)} km)` : '';
    return `${branch.reference}${dist}\n  Code: ${branch.branch_code} | ${capabilities}\n  Address: ${location}`;
}
```

---

## Tool Descriptions

```
envia_search_branches: "Search for carrier pickup and dropoff locations near a postal code or city. Returns branches with addresses, capabilities (pickup/delivery), and distances. Use before scheduling a pickup to find the nearest branch."

envia_get_branches_catalog: "Get a hierarchical catalog of all states and localities where a carrier has branches. Useful to browse available locations before searching by specific postal code."

envia_search_branches_bulk: "Bulk search for carrier branches — optimized for batch lookups. Same as envia_search_branches but with a limit parameter for controlling result size."
```

---

## Tool Schemas

### envia_search_branches
```typescript
z.object({
    api_key: optionalApiKeySchema,  // NOTE: optional, not required (public endpoint)
    carrier: z.string().min(1).describe('Carrier code (e.g. "dhl", "fedex", "estafeta")'),
    country_code: countrySchema.describe('Country code (e.g. "MX", "CO", "BR")'),
    zipcode: z.string().optional().describe('Postal code to search near'),
    locality: z.string().optional().describe('City or locality name'),
    state: z.string().optional().describe('State/province code (2 chars)'),
    type: z.number().int().min(1).max(3).default(1).describe('1=pickup, 2=dropoff, 3=both'),
    latitude: z.number().optional().describe('GPS latitude for proximity search'),
    longitude: z.number().optional().describe('GPS longitude for proximity search'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results to return'),
})
```

### envia_get_branches_catalog
```typescript
z.object({
    api_key: optionalApiKeySchema,
    carrier: z.string().min(1).describe('Carrier code'),
    country_code: countrySchema.describe('Country code'),
})
```

### envia_search_branches_bulk
```typescript
z.object({
    api_key: optionalApiKeySchema,
    carrier: z.string().min(1).describe('Carrier code'),
    country_code: countrySchema.describe('Country code'),
    zipcode: z.string().optional().describe('Postal code'),
    locality: z.string().optional().describe('City or locality'),
    state: z.string().optional().describe('State code'),
    type: z.number().int().min(1).max(3).default(1).describe('1=pickup, 2=dropoff, 3=both'),
    limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
})
```

---

## Implementation Notes

1. **Use `optionalApiKeySchema`** not `requiredApiKeySchema` — endpoints are public
2. **Handle raw array response** — `Array.isArray(res.data) ? res.data : []`
3. **URL construction:** `/branches/${encodeURIComponent(carrier)}/${encodeURIComponent(countryCode)}`
4. **For catalog:** append `/catalog` to the path
5. **For bulk:** use `/branches-bulk/` prefix instead of `/branches/`
6. **Format output:** Show distance, branch code, capabilities (pickup/delivery), address
7. **Next step suggestion:** "Use create_shipment with branch_code to ship to this location"

---

## Verification Checklist

- [ ] `npm run build` — zero errors
- [ ] `npm test` — all tests pass (~860+)
- [ ] `npm run lint` — zero errors
- [ ] All 3 tools registered in index.ts
- [ ] Raw array response handled correctly (not `.data.data`)
- [ ] `api_key` is optional (optionalApiKeySchema)
- [ ] Branch code displayed prominently (needed for create_shipment)
- [ ] Distance shown when available
- [ ] Capabilities (pickup/delivery) shown
