# Spec Delta

## Purpose

Defines mixed-auth HTTP for the Envia MCP server so public tools stay anonymous while protected tools require a user credential and the advertised catalog is safe for ChatGPT App listing.

## ADDED Requirements

### Requirement: Protected tools challenge unauthenticated HTTP calls
The server MUST refuse `tools/call` for a non-public tool when the request has no user credential. The refusal MUST carry a Bearer challenge that includes `resource_metadata` and MUST NOT mention API keys.

A refused `tools/call` MUST be answered with HTTP 200, a result carrying `isError` and `_meta["mcp/www_authenticate"]`, and the `WWW-Authenticate` header on the same response. A bare transport 401 does not open ChatGPT's sign-in prompt, so the tool-level envelope is what makes the app usable; the header keeps the signal for clients that read it. Any other refused method MUST return HTTP 401 with the same header.

`initialize`, `tools/list`, JSON-RPC notifications, and public catalog tools MUST still succeed without a credential. A JSON-RPC batch MUST be allowed only when every entry is allowed.

#### Scenario: Protected call without credential
- **WHEN** a client POSTs `tools/call` for `envia_list_shipments` with no Authorization, no `x-api-key`, and no `api_key` argument
- **THEN** the response status is 200 and the result has `isError` with `_meta["mcp/www_authenticate"]` containing `resource_metadata`

#### Scenario: Batch carrying a protected call
- **WHEN** a client POSTs a JSON-RPC array containing a protected `tools/call` with no credential
- **THEN** the response status is 401 and `WWW-Authenticate` contains `resource_metadata`

#### Scenario: Public quote without credential
- **WHEN** a client POSTs `tools/call` for `envia_quote_shipment` with no user credential
- **THEN** the request is accepted at the transport layer (not refused)

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
A user credential on HTTP MUST be taken in this order: a verified OAuth access token, then the `x-api-key` header, then a non-empty `api_key` string in the JSON-RPC `tools/call` arguments. Whitespace-only values MUST NOT count as credentials.

An Authorization header whose Bearer token has JWT shape MUST be verified as an MCP OAuth access token; an invalid or expired one MUST return 401 even if `x-api-key` is also set. An Authorization header the verifier cannot possibly accept — an opaque token, a non-Bearer scheme — MUST be ignored and the request MUST continue as anonymous, so one stale header cannot fail `initialize` and `tools/list` for the whole connection.

#### Scenario: Portal body key
- **WHEN** a client sends `tools/call` for a protected tool with `params.arguments.api_key` set to a non-empty string and no Authorization header
- **THEN** the transport MUST NOT refuse the call for missing auth

#### Scenario: Header key
- **WHEN** a client sends `x-api-key` with a non-empty value and no Authorization header
- **THEN** the transport MUST NOT refuse the call for missing auth

#### Scenario: Invalid Bearer
- **WHEN** a client sends `Authorization: Bearer` with a JWT-shaped token that is not a valid MCP access token
- **THEN** the response status is 401

#### Scenario: Opaque Bearer
- **WHEN** a client sends `Authorization: Bearer` with a token that has no JWT shape and POSTs `tools/list`
- **THEN** the request is served anonymously and the response status is 200

### Requirement: Listing metadata on every tool
Every advertised tool MUST include a human `title` of at most 64 characters, accurate `readOnlyHint`, `openWorldHint` and `destructiveHint` annotations, and `securitySchemes` as a top-level field of the tool entry. Public catalog tools MUST advertise `noauth` plus optional `oauth2`. All other tools MUST advertise `oauth2` without `noauth`.

The SDK builds each `tools/list` entry from a fixed field list, so `securitySchemes` passed to `registerTool` survives only inside `_meta`; the server MUST copy it to the top level, which is where ChatGPT reads it.

#### Scenario: Protected tool schemes
- **WHEN** a client lists tools
- **THEN** `envia_list_shipments` includes `title` and a top-level `securitySchemes` of type `oauth2` only

#### Scenario: Public tool schemes
- **WHEN** a client lists tools
- **THEN** `envia_quote_shipment` includes `noauth` in its top-level `securitySchemes`

#### Scenario: Write annotations
- **WHEN** a client lists tools
- **THEN** every tool that overwrites state, charges the account, files a carrier document, or sends a message a person receives has `destructiveHint` true

### Requirement: Protected resource audience
The server MUST publish OAuth protected-resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`, and both routes MUST serve the same document. The `resource` value MUST be the origin plus `/mcp` with no trailing slash. `authorization_servers` MUST carry the issuer exactly as the authorization-server metadata publishes it, trailing slash included. Access-token audience checks MUST accept both the `/mcp` resource and the origin.

Both routes MUST be registered before the SDK auth router, which otherwise serves the root path itself and advertises the origin as `resource`.

#### Scenario: Both metadata routes agree
- **WHEN** a client GETs `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`
- **THEN** both documents have the same `resource`, ending in `/mcp`

#### Scenario: Issuer matches
- **WHEN** a client compares `authorization_servers[0]` with the `issuer` in `/.well-known/oauth-authorization-server`
- **THEN** the two strings are identical

#### Scenario: Origin audience
- **WHEN** an access token `aud` is the MCP origin and `OAUTH_SERVER_URL` is that origin
- **THEN** audience validation succeeds

### Requirement: Domain verification token
The server MUST serve `OPENAI_APPS_CHALLENGE_TOKEN` as plain text at `/.well-known/openai-apps-challenge`, and MUST return 404 when the variable is unset, so an unconfigured deployment cannot look like a verified domain serving the wrong token.

#### Scenario: Token unset
- **WHEN** `OPENAI_APPS_CHALLENGE_TOKEN` is not configured and a client GETs the challenge path
- **THEN** the response status is 404
