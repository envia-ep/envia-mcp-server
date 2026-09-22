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

## 6. Listing follow-ups

- [x] 6.1 Return handler validation failures as `errorResponse` in `envia_fulfill_order` and `envia_manage_order_tags`
- [x] 6.2 Ignore a Bearer token without JWT shape instead of failing every method on the connection
- [x] 6.3 Answer a refused `tools/call` with `isError` + `_meta["mcp/www_authenticate"]`, keep 401 for every other method, and allow a batch when all entries are allowed
- [x] 6.4 Copy `securitySchemes` to the top level of each `tools/list` entry and verify 72/72 against a running server
- [x] 6.5 Register both PRM routes before `mcpAuthRouter`, publish the issuer verbatim, and 404 the challenge path when its token is unset
- [x] 6.6 Correct `destructiveHint` / `openWorldHint` on write tools and record the criteria in `documentation/tool-annotations.md`
- [x] 6.7 Stop naming `ENVIA_API_KEY` in 401/403 messages and extend pino redact paths to `params.arguments.api_key` and `auth.extra.enviaApiKey`

## 7. Open, owner decision

- [ ] 7.1 Rate limit `POST /mcp` for anonymous callers — needs `express-rate-limit` as a direct dependency (today it is only transitive through the SDK)
- [ ] 7.2 Run the OAuth cycle end to end on staging and confirm in ChatGPT developer mode that the tool-level challenge opens the sign-in prompt
- [ ] 7.3 Decide whether the listing dyno serves a reduced tool surface; a global reduction would remove tools from the agentic-ai portal, which builds its wrappers from `tools/list`
