# Tasks

## 1. Dependencies and logging

- [x] 1.1 Add `jose` `^6.1.3` as a direct dependency and verify `npm run build` succeeds
- [x] 1.2 Redact `authorization`, `x-api-key`, `api_key`, and `enviaApiKey` in pino and verify logger tests pass

## 2. Catalog and discovery

- [x] 2.1 Decorate `registerTool` with titles and `securitySchemes` and verify tool-catalog tests pass
- [x] 2.2 Omit `api_key` from HTTP schemas only and verify stdio tests that pass `api_key` still pass
- [x] 2.3 Serve PRM at `/` and `/mcp`, accept both audiences, and verify provider/mcp-resource tests pass

## 3. Transport gate

- [x] 3.1 Resolve HTTP credentials JWT → `x-api-key` → body `api_key` and verify http-credentials tests pass
- [x] 3.2 Return 401 for protected `tools/call` without a credential and verify mcp-auth-gate tests pass
- [x] 3.3 Wire the gate on `POST /mcp` after optional Bearer and verify public tools still skip the 401

## 4. Chat demo and docs

- [x] 4.1 Send JWTs as Authorization and opaque keys as `x-api-key` from the chat client and verify mcp-client-auth tests pass
- [x] 4.2 Update `documentation/tool-access.md` to match the HTTP credential channels

## 5. Verification

- [x] 5.1 Run `npm run build && npx vitest run && npm run lint` with zero failures
