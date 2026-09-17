# Spec Delta

## Purpose

Defines mixed-auth HTTP for the Envia MCP server so public tools stay anonymous while protected tools require a user credential and the advertised catalog is safe for ChatGPT App listing.

## ADDED Requirements

### Requirement: Protected tools reject unauthenticated HTTP calls
The server MUST respond with HTTP 401 and a Bearer `WWW-Authenticate` header when `tools/call` targets a non-public tool and the request has no user credential. The challenge MUST include `resource_metadata` and MUST NOT mention API keys. `initialize`, `tools/list`, JSON-RPC notifications, and public catalog tools MUST still succeed without a credential.

#### Scenario: Protected call without credential
- **WHEN** a client POSTs `tools/call` for `envia_list_shipments` with no Authorization, no `x-api-key`, and no `api_key` argument
- **THEN** the response status is 401 and `WWW-Authenticate` contains `resource_metadata` and `error="invalid_token"`

#### Scenario: Public quote without credential
- **WHEN** a client POSTs `tools/call` for `envia_quote_shipment` with no user credential
- **THEN** the request is accepted at the transport layer (not 401)

#### Scenario: Tools list without credential
- **WHEN** a client POSTs `tools/list` with no user credential
- **THEN** the request is accepted at the transport layer

### Requirement: HTTP catalog does not advertise api_key
On the HTTP transport, advertised tool input schemas MUST NOT include an `api_key` property. The stdio transport MUST continue to advertise `api_key` for per-request overrides.

#### Scenario: HTTP tools list
- **WHEN** a client lists tools over HTTP
- **THEN** no tool input schema includes `api_key`

#### Scenario: stdio tools list
- **WHEN** a client lists tools over stdio
- **THEN** tools that previously accepted `api_key` still advertise that field

### Requirement: HTTP user credential channels
A user credential on HTTP MUST be taken in this order: a verified OAuth access token, then the `x-api-key` header, then a non-empty `api_key` string in the JSON-RPC `tools/call` arguments. Whitespace-only values MUST NOT count as credentials. When an Authorization header is present, it MUST be verified as an MCP OAuth JWT; an invalid token MUST return 401 even if `x-api-key` is also set.

#### Scenario: Portal body key
- **WHEN** a client sends `tools/call` for a protected tool with `params.arguments.api_key` set to a non-empty string and no Authorization header
- **THEN** the transport MUST NOT return 401 for missing auth

#### Scenario: Header key
- **WHEN** a client sends `x-api-key` with a non-empty value and no Authorization header
- **THEN** the transport MUST NOT return 401 for missing auth

#### Scenario: Invalid Bearer
- **WHEN** a client sends `Authorization: Bearer` with a token that is not a valid MCP access token
- **THEN** the response status is 401

### Requirement: Listing metadata on every tool
Every advertised tool MUST include a human `title` of at most 64 characters. Public catalog tools MUST advertise `noauth` plus optional `oauth2`. All other tools MUST advertise `oauth2` without `noauth`.

#### Scenario: Protected tool schemes
- **WHEN** a client lists tools
- **THEN** `envia_list_shipments` includes `title` and `securitySchemes` of type `oauth2` only

#### Scenario: Public tool schemes
- **WHEN** a client lists tools
- **THEN** `envia_quote_shipment` includes `noauth` in `securitySchemes`

### Requirement: Protected resource audience
The server MUST publish OAuth protected-resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`. The `resource` value MUST be the origin plus `/mcp` with no trailing slash. Access-token audience checks MUST accept both that value and the origin.

#### Scenario: Path-suffixed metadata
- **WHEN** a client GETs `/.well-known/oauth-protected-resource/mcp`
- **THEN** the document includes `resource` ending in `/mcp`

#### Scenario: Origin audience
- **WHEN** an access token `aud` is the MCP origin and `OAUTH_SERVER_URL` is that origin
- **THEN** audience validation succeeds
