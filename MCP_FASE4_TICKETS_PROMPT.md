# Fase 4: Tickets de Soporte — Implementation Prompt

> **For Sonnet agent:** This prompt contains everything you need to implement Fase 4. Read it completely before starting. Follow the established patterns exactly.

## Goal

Add 7 ticket support tools to the envia-mcp-server. These allow AI agents to help users create, view, comment on, rate, and manage support tickets.

## Project Context

**Working directory:** `/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server`

**Current state:** 47 tools, 812 tests, build+lint clean. TypeScript + MCP SDK + Zod 4 + Vitest 3.

**Architecture pattern (MUST follow — read these files as templates):**
- `src/services/orders.ts` — Latest service pattern (queryApi, mutateApi, updateApi, formatters)
- `src/tools/orders/list-orders.ts` — Latest tool pattern (registerTool, resolveClient, mapCarrierError)
- `src/tools/orders/index.ts` — Barrel export pattern
- `src/types/orders.ts` — Type definition pattern

**Conventions (CRITICAL):**
- Single quotes, 4 spaces, semicolons, trailing commas
- JSDoc on every exported function
- ES modules with `.js` extensions in imports
- kebab-case files, camelCase functions, PascalCase types
- All tools use `textResponse()` from `../../utils/mcp-response.js`
- All tools use `resolveClient()` for api_key
- All error handling uses `mapCarrierError()` from `../../utils/error-mapper.js`
- Reuse `buildQueryUrl` from `../services/shipments.js` (already shared)

## Files to Create

```
src/types/tickets.ts                         — Response interfaces
src/services/tickets.ts                      — Query/mutate helpers + formatters
src/tools/tickets/index.ts                   — Barrel export
src/tools/tickets/list-tickets.ts            — envia_list_tickets
src/tools/tickets/get-ticket-detail.ts       — envia_get_ticket_detail
src/tools/tickets/get-ticket-comments.ts     — envia_get_ticket_comments
src/tools/tickets/create-ticket.ts           — envia_create_ticket
src/tools/tickets/add-ticket-comment.ts      — envia_add_ticket_comment
src/tools/tickets/rate-ticket.ts             — envia_rate_ticket
src/tools/tickets/get-ticket-types.ts        — envia_get_ticket_types
tests/services/tickets.test.ts               — Service formatter tests (~15)
tests/tools/tickets/list-tickets.test.ts     — Representative tool tests (~10)
```

## File to Modify

```
src/index.ts — Import and register the 7 new tools from barrel
```

---

## API Contracts (VERIFIED — do NOT deviate)

All endpoints use Bearer token auth and target `config.queriesBase`.

### Tool 1: `envia_list_tickets`
**Endpoint:** GET /company/tickets
**NOTE:** This endpoint has a KNOWN BUG in sandbox (returns 422). Implement it anyway — it works in production. The tool should handle the 422 gracefully.

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| limit | number | No (default 20) | Results per page |
| page | number | No (default 1) | Page number |
| carrier_id | number | No | Filter by carrier |
| ticket_status_id | number | No | 1=Pending, 2=Accepted, 3=Declined, 4=Incomplete, 5=Follow-up, 6=In review |
| ticket_type_id | number | No | See type map below |
| date_from | string | No | YYYY-MM-DD |
| date_to | string | No | YYYY-MM-DD |
| tracking_number | string | No | Filter by shipment tracking |
| getComments | boolean | No | Include comment thread |

**Response:** `{ data: TicketRecord[], total_rows: number }`

---

### Tool 2: `envia_get_ticket_detail`
**Endpoint:** GET /company/tickets/{ticket_id}?getComments=true
**Path param:** ticket_id (number, required)

**Response:** `{ data: [TicketRecord], total_rows: number }` — Always an array, even for single ticket. Empty array if not found or not owned.

**TicketRecord shape (VERIFIED):**
```typescript
interface TicketRecord {
    id: number;
    company_id: number;
    carrier_id: number | null;
    shipment_id: number | null;
    credit_id: number | null;
    warehouse_package_id: number | null;
    comments: string | null;           // Initial comment
    created_by: number;
    created_at: string;
    updated_at: string;
    utc_created_at: string;
    ticket_status_id: number;
    ticket_status_name: string;        // "pending", "accepted", etc.
    ticket_status_color: string;       // "#FFB136"
    ticket_class_name: string;         // "warning", "success", "danger"
    ticket_type_id: number;
    ticket_type_name: string;          // "delay", "overweight", etc.
    reference: string | null;          // DOUBLE-STRINGIFIED: "\"guide\"" — parse with care
    ticket_type_active: number;
    tracking_number: string | null;
    service: string | null;            // May have trailing whitespace
    carrier: string | null;
    carrier_description: string | null;
    file_quantity: number;
    files: TicketFile[];
    last_comment: Record<string, unknown>;
    allComments: TicketComment[];      // Only populated if getComments=true
    data: string | null;               // Ticket variables JSON
    // Consignee (flat fields at root level)
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    // Consignee (also nested — USE THIS ONE for formatting)
    consignee: {
        consignee_name: string | null;
        consignee_company_name: string | null;
        consignee_email: string | null;
        consignee_phone: string | null;
        consignee_street: string | null;
        consignee_number: string | null;
        consignee_district: string | null;
        consignee_city: string | null;
        consignee_state: string | null;
        consignee_postal_code: string | null;
        consignee_country: string | null;
    };
    payment_method: Record<string, unknown>;
    rating: {
        evaluated: number;             // 0 or 1 — ONLY 1 when status is ACCEPTED(2) or DECLINED(3)
        rating: number | null;         // 1-5 or null
        comment: string | null;
    };
    additional_services: Array<{
        additional_service_id: number;
        packageId: number | null;
        additionalService: string;
        translationTag: string;
        commission: number;
        taxes: number;
        cost: number;
        value: number;
    }>;
}
```

---

### Tool 3: `envia_get_ticket_comments`
**Endpoint:** GET /company/tickets/comments/{ticket_id}
**Path param:** ticket_id (number, required)

**Response:** `{ data: TicketComment[] }`

```typescript
interface TicketComment {
    type: string;                      // "client" or "admin"
    status_id: number;
    tracking_number: string | null;
    status_name: string;
    status_color: string;
    description: string;               // The comment text
    created_by_name: string;
    created_at: string;
}
```

---

### Tool 4: `envia_create_ticket`
**Endpoint:** POST /company/tickets
**Method:** POST

**Request body:**
```typescript
{
    type_id: number;                   // REQUIRED — ticket type ID (see map)
    shipment_id?: number | null;       // Optional — link to shipment
    carrier_id?: number | null;        // Optional
    credit_id?: number | null;         // Optional
    warehouse_package_id?: string | null; // Optional
    comments?: string;                 // Optional — initial description
    data?: string;                     // Optional — JSON string of variables
}
```

**Response:** `{ id: number }` — the new ticket ID

**Business rules:**
- Duplicate check: Cannot create if active ticket exists for same shipment_id + type_id with status IN (1, 3, 5, 6)
- Returns 409 Conflict on duplicate
- Status starts at 1 (PENDING)
- Auto-assigned to admin after creation

---

### Tool 5: `envia_add_ticket_comment`
**Endpoint:** POST /company/tickets/{ticket_id}/comments
**Path param:** ticket_id (number, required)

**Request body:**
```typescript
{
    comment: string;                   // REQUIRED (allows empty string)
}
```

**Response:** `{ data: true }`

**Business rules:**
- Cannot comment on tickets with status 2 (ACCEPTED) or 3 (DECLINED)
- If status is 6 (IN_REVIEW), changes to 5 (FOLLOW_UP) before adding comment
- Comment type is always "client" for user token

---

### Tool 6: `envia_rate_ticket`
**Endpoint:** POST /tickets/ratings/{ticket_id}
**Path param:** ticket_id (number, required)

**Request body:**
```typescript
{
    rating: number;                    // REQUIRED — 1, 2, 3, 4, or 5
    comment?: string | null;           // Optional
}
```

**Response (success):** `{ data: true, message: "Successful." }`
**Response (already rated):** `422 { statusCode: 422, message: "The ticket has already been evaluated." }`

**CRITICAL:** Rating is ONE-TIME. Cannot change after submission. 422 on second attempt.

---

### Tool 7: `envia_get_ticket_types`
**Endpoint:** GET /tickets/types
**Query params:** `id` (number, optional) — filter by type ID

**Response:** `{ data: TicketType[] }`

```typescript
interface TicketType {
    id: number;
    name: string;                      // "overweight", "delay", etc.
    description: string;               // "Overweight", "Delayed Package", etc.
    rules: string | null;              // Stringified JSON — parse for conditions
    type: null;
    active: number;                    // 0 or 1
}
```

---

## Service Layer Design (`src/services/tickets.ts`)

Reuse `buildQueryUrl` from `./shipments.js`. Create:

```typescript
import { buildQueryUrl } from './shipments.js';

// GET helper
export async function queryTicketsApi<T>(client, config, path, params): Promise<ApiResponse<T>>

// POST helper
export async function mutateTicketApi<T>(client, config, path, body): Promise<ApiResponse<T>>

// PUT helper
export async function updateTicketApi<T>(client, config, path, body): Promise<ApiResponse<T>>

// Formatters
export function formatTicketSummary(ticket: TicketRecord): string
// Format: "#{id} — {type_name} ({status_name}) | Carrier: {carrier} | Tracking: {tracking_number} | Created: {created_at}"

export function formatTicketComment(comment: TicketComment): string
// Format: "[{type}] {created_by_name} ({created_at}): {description}"

export function formatTicketType(type: TicketType): string
// Format: "{description} (ID: {id}) — {active ? 'Active' : 'Inactive'}"

// Status name resolver (for display)
export const TICKET_STATUS_NAMES: ReadonlyMap<number, string> = new Map([
    [1, 'Pending'], [2, 'Accepted'], [3, 'Declined'],
    [4, 'Incomplete'], [5, 'Follow-up'], [6, 'In Review'],
    [7, 'Complete'], [8, 'Rejected'], [9, 'In Analysis'],
    [10, 'Claim In Review'],
]);
```

---

## Tool Descriptions (for AI agent tool selection — MUST be descriptive)

```
envia_list_tickets: "List support tickets for your company. Filter by status (1=Pending, 2=Accepted, 3=Declined, 5=Follow-up, 6=In Review), ticket type, carrier, tracking number, or date range. Returns ticket ID, type, status, carrier, and creation date."

envia_get_ticket_detail: "Get complete details for a support ticket by ID. Includes: ticket type and status, linked shipment and carrier info, consignee address, file attachments, comment thread (if requested), CSAT rating, and additional services."

envia_get_ticket_comments: "Get the comment thread for a support ticket. Each comment shows who wrote it (client or admin), the text, and when it was created."

envia_create_ticket: "Create a new support ticket. Requires type_id (use envia_get_ticket_types to see options). Optionally link to a shipment_id. Common types: 3=Overweight, 5=Damaged, 6=Wrong delivery, 7=Refund, 8=Delay, 13=Theft, 14=Redirection."

envia_add_ticket_comment: "Add a comment to an existing ticket. Only works on tickets with status Pending(1), Incomplete(4), Follow-up(5), or In Review(6). Cannot comment on Accepted or Declined tickets."

envia_rate_ticket: "Rate a support ticket (CSAT). Score 1-5 with optional comment. Rating is ONE-TIME — cannot be changed after submission."

envia_get_ticket_types: "List available ticket types with their conditions and requirements. Each type has rules defining which shipment statuses are eligible, required files, and input fields."
```

---

## Implementation Order

1. Create `src/types/tickets.ts` — interfaces
2. Create `src/services/tickets.ts` — API helpers + formatters
3. Create 7 tool files in `src/tools/tickets/`
4. Create `src/tools/tickets/index.ts` — barrel export
5. Update `src/index.ts` — import + register
6. Create tests
7. Run `npm run build && npm test && npm run lint`

---

## Zod Schema Notes

- `api_key: requiredApiKeySchema` — from `../../utils/schemas.js`
- All number IDs: `z.number().int().min(1)`
- Strings with describe: `z.string().describe('...')`
- Optional with default: `z.number().int().min(1).max(100).default(20).describe('...')`
- Enum for rating: `z.number().int().min(1).max(5).describe('CSAT rating: 1 (worst) to 5 (best)')`

---

## Test Strategy

**Service tests (`tests/services/tickets.test.ts`):**
- Test all formatter functions with factory data
- Test TICKET_STATUS_NAMES map completeness
- ~15 tests

**Tool tests (`tests/tools/tickets/list-tickets.test.ts`):**
- Mock fetch, test happy path, error handling, empty results
- Follow pattern from `tests/tools/shipments/list-shipments.test.ts`
- ~10 tests

---

## Verification Checklist

- [ ] `npm run build` — zero errors
- [ ] `npm test` — all tests pass (~830+)
- [ ] `npm run lint` — zero errors
- [ ] All 7 tools registered in index.ts
- [ ] All tools have descriptive `.describe()` on every Zod parameter
- [ ] All tools use `mapCarrierError` for API errors
- [ ] All tools use `resolveClient` for api_key
- [ ] create_ticket handles 409 Conflict (duplicate) with clear message
- [ ] rate_ticket handles 422 (already rated) with clear message
- [ ] add_ticket_comment explains status 2/3 restriction in error message
- [ ] get_ticket_detail shows rating ONLY when meaningful (status 2 or 3)
