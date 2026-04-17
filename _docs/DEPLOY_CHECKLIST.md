# Deploy Checklist — envia-mcp-server

Pre-deployment verification for every environment (staging + production).

## Required environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ENVIA_API_KEY` | **YES** | — | JWT bearer token for all Envia API calls. Missing → server fails to start. |
| `ENVIA_ENVIRONMENT` | No | `sandbox` | `"sandbox"` or `"production"`. Controls which base URLs are used. |
| `ENVIA_ECART_HOSTNAME` | No | — | Base URL for ecartAPI (e.g. `https://ecart-api.ecartapi.com`). Required for ecommerce fulfillment sync after label creation (`envia_create_label` with `order_identifier`). If absent, sync is silently skipped and a `[warning]` is appended to the tool response. |
| `ENVIA_ECART_PAY_HOSTNAME` | No | `https://ecart-pay-api.envia.com` | *(Sprint 3 — not yet used)* Base URL for ecart-payment service. Will be required when payment tools (`envia_get_refund_status`, `envia_get_withdrawal_status`, etc.) are implemented. Deferred due to JWT auth incompatibility — see `SPRINT_2_BLOCKERS.md`. |
| `ENVIA_QUEUE_HOSTNAME` | No | `https://envia-tms-api.envia.com` | *(Sprint 3 — not yet used)* Base URL for TMS queue direct integration. Current `envia_check_balance` uses the Queries API (user-information balance) — no TMS call is made. This var is reserved for future TMS direct integration. |

## Sandbox vs production URLs

| Service | Sandbox | Production |
|---------|---------|------------|
| Shipping API (`shippingBase`) | `https://api-test.envia.com` | `https://api.envia.com` |
| Queries API (`queriesBase`) | `https://queries-test.envia.com` | `https://queries.envia.com` |
| Geocodes API (`geocodesBase`) | `https://geocodes.envia.com` | `https://geocodes.envia.com` (prod only) |
| ecartAPI (`ecartApiBase`) | `https://ecart-api-test.ecartapi.com` | `https://ecart-api.ecartapi.com` |
| ecart-payment | No sandbox known — use prod read-only endpoints only | `https://ecart-pay-api.envia.com` |
| TMS queue | No sandbox known — use prod read-only endpoints only | `https://envia-tms-api.envia.com` |

## Pre-deploy checklist

- [ ] `ENVIA_API_KEY` is set and belongs to the target environment (sandbox token ≠ prod token)
- [ ] `ENVIA_ENVIRONMENT` is set to `production` (not `sandbox`) for production deploys
- [ ] If ecommerce fulfillment sync is needed: `ENVIA_ECART_HOSTNAME` is set to the correct ecartAPI base
- [ ] *(Sprint 3)* If ecart-payment tools will be used: confirm `ENVIA_ECART_PAY_HOSTNAME` is reachable and auth is resolved
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `npx vitest run` passes (all tests green)
- [ ] Heroku Procfile is present: `web: node dist/index.js`

## Sprint history

| Sprint | Tools added | Total tools |
|--------|-------------|-------------|
| Sprint 0 | Portal-agent consolidation (71 tools) | 71 |
| Sprint 1 | `fulfillmentSync` helper, Session B backend analysis, test gaps | 71 |
| Sprint 2 | `envia_check_balance` (1 tool); ecart-payment 5 tools deferred (auth blocker) | 72 |
