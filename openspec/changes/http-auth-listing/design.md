# Design

## Context

See proposal.md for why. HTTP already used optional Bearer so tracking and quotes work without login. Protected tools still ran, called Envia with an empty key, and returned HTTP 200 plus error text. The portal identifies the user by injecting `api_key` into tool arguments, not with an MCP JWT. `CARRIERS_MCP_TOKEN` is an opaque Heroku token and must never be treated as a JWT.

## Goals / Non-Goals

**Goals:**

- One gate on `POST /mcp` for protected `tools/call`.
- Keep portal and stdio working without a coordinated deploy of `agentic-ai`.
- Advertise a listing-safe catalog on HTTP only.

**Non-Goals:**

- Portal OAuth / token exchange.
- Enforcing JWT scopes inside this server (`requiredScopes`).
- `outputSchema` / `structuredContent`.
- Rate limits on `/mcp`.
- Path aliases in `queries` (separate repo).

## Decisions

1. **Strip `api_key` from HTTP schemas in the catalog decorator, not in each tool file.**  
   Individual tool tests register against a mock server and still pass `api_key`. HTTP listing is the only surface OpenAI scans.

2. **Read portal `api_key` from the raw JSON-RPC body in the gate.**  
   After the field is dropped from the schema, the SDK discards it before the handler. The gate runs first and copies the value into the per-request Envia credential.

3. **Authorization is JWT-only.**  
   Opaque Envia keys use `x-api-key`. Putting both on `Authorization` would send portal session tokens through `jose` and 401 them.

4. **Publish `resource` as `origin/mcp`, accept origin and `/mcp` as `aud`.**  
   ChatGPT has sent origin; Claude wants the path. Changing the published value without accepting both would drop existing tokens.

5. **Promote `jose` to a direct dependency at `^6.1.3`.**  
   Same major already pulled by the MCP SDK. Avoids a phantom import.

## Risks / Trade-offs

- [Portal breaks if the gate ignores body `api_key`] → Keep the body channel until `agentic-ai` sends `x-api-key`.
- [Invalid Bearer plus `x-api-key` is rejected] → Documented. The portal must not attach `CARRIERS_MCP_TOKEN` as Authorization against this host.
- [JSON-RPC batches could mix initialize and tools/call] → Batches are rejected at the gate.
- [Body `api_key` remains a hidden credential channel] → Acceptable for one consumer (portal). Not advertised in `tools/list`.

## Migration Plan

1. Deploy this MCP. Portal unchanged.
2. Deploy `queries` path aliases when OAuth address/package tools must stop 403ing.
3. Optional: `agentic-ai` adds `x-api-key` and later drops body `api_key`.
4. Rollback: revert this release. stdio schema never changed.

## Open Questions

None that block this change. Scope enforcement on the MCP and `outputSchema` stay post-listing.
