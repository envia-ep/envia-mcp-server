# Proposal

## Why

ChatGPT App review rejects this MCP because protected tools advertise `api_key` in their input schema and return HTTP 200 with error text when no credential is present. Public listing needs an explicit auth challenge plus OAuth metadata, without taking down the Envia portal, which still sends the user key as a tool argument.

## What Changes

- HTTP `tools/list` stops advertising `api_key`. stdio keeps the field.
- Protected `tools/call` without a user credential is refused with the challenge ChatGPT acts on: HTTP 200 carrying `isError` and `_meta["mcp/www_authenticate"]`, with `WWW-Authenticate` on the same response. Every other refused method returns HTTP 401.
- `initialize`, `tools/list`, and public catalog tools still run without a token.
- User identity on HTTP is, in order: verified OAuth JWT, `x-api-key`, then body `api_key` (portal transition).
- Every tool gets a `title`. Protected tools advertise `oauth2` `securitySchemes`.
- Protected resource metadata is served at the root well-known path and at `/mcp`. JWT `aud` accepts origin and `https://<host>/mcp`.
- `jose` is a direct dependency. Logs redact credentials.

## Capabilities

### New Capabilities

- `http-auth`: Mixed-auth HTTP for MCP — public tools stay anonymous, protected tools require a user credential, catalog metadata is listing-safe.

### Modified Capabilities

- None. This repo had no main OpenSpec specs.

## Impact

- `src/index.ts` POST `/mcp` middleware and PRM routes.
- New modules under `src/auth/` (`mcp-auth-gate`, `http-credentials`, `tool-catalog`, `mcp-resource`, `www-authenticate`).
- `package.json`: `jose` `^6.1.3`.
- Portal (`agentic-ai`) is unchanged: body `api_key` still authenticates.
- `queries` OAuth path aliases (`/all-addresses`, `/packages`, …) live in that repo and are not part of this change.
