# Sprint 2 Blockers

## BLOCKER 1 — ecart-payment: Envia portal JWT not accepted

**Date verified:** 2026-04-16  
**Severity:** Blocks 5 tools (`envia_get_refund_status`, `envia_get_withdrawal_status`, `envia_get_transaction_history`, `envia_get_ecartpay_balance`, `envia_list_invoices`)

### What was tested

```
curl http://ecart-payment-dev.herokuapp.com/api/accounts/me \
  -H "Authorization: Bearer <envia-portal-jwt>"
```

**Response:** `HTTP 401` — `{ "statusCode": 401, "error": "Unauthorized", "message": "El token no es válido.", "code": 114 }`

### Root cause

ecart-payment has its own JWT issuance system that is **distinct** from the Envia portal JWT. The queries service authenticates to ecart-payment using:

1. `POST /api/authorizations/token` with `Authorization: Basic base64(publicKey:privateKey)`
2. The returned token is then used for subsequent calls.

The `publicKey`/`privateKey` come from `ECART_PAY_PAYMENTS_PRIVATE_KEY` and `ECART_PAY_COLLECT_PRIVATE_KEY` env vars in the queries service. These are **not available** in the MCP server context.

### Correct hostname

The `.env` of the queries service confirms:
- **Sandbox:** `http://ecart-payment-dev.herokuapp.com`
- **Production:** unknown (likely `https://ecart-payment.envia.com` or similar — needs confirmation)

Note: `ecart-pay-api.envia.com` (used in the findings doc) does **not** resolve via DNS — it is not the actual hostname.

### Resolution options for Sprint 3

**Option A (recommended):** Proxy through queries service.
- Add new endpoints to queries: `GET /mcp/payments/transactions`, `GET /mcp/payments/balance`, etc.
- queries already has the ecart-payment auth keys and the call patterns.
- MCP calls queries with the portal JWT (already accepted); queries calls ecart-payment with its own token.
- This matches the existing architecture: all inter-service auth goes through queries.

**Option B:** Add MCP server env vars `ECART_PAY_PUBLIC_KEY` + `ECART_PAY_PRIVATE_KEY`.
- MCP would call `/api/authorizations/token` to get a session token, cache it, then use it.
- Adds complexity: token refresh, per-company scoping TBD.
- Requires coordination with ecart-payment team for key provisioning.

**Option C:** Add a service account token endpoint in ecart-payment that accepts Envia portal JWTs.
- Cleanest UX but requires backend work from ecart-payment team.

### Deferred tools (Sprint 3)

| Tool | Endpoint |
|------|----------|
| `envia_get_refund_status` | `GET /api/refunds?transaction_id=...` |
| `envia_get_withdrawal_status` | `GET /api/withdrawals/:id` |
| `envia_get_transaction_history` | `GET /api/transactions` |
| `envia_get_ecartpay_balance` | `GET /api/transactions/summary` |
| `envia_list_invoices` | `GET /api/invoices` |

## BLOCKER 2 — queue service: Portal JWT not accepted + /check is not read-only

**Date verified:** 2026-04-17  
**Severity:** Blocks direct TMS integration; `envia_check_balance` implemented via user-info instead

### What was tested

```
# Step 1 — /token endpoint (no auth required)
curl -X POST https://queue-private.envia.com/token \
  -H "Content-Type: application/json" \
  -d '{"companyId": 254}'
# → HTTP 200: { "data": { "token": "<tms_jwt>" } }

# Step 2 — /check with TMS token (raw Authorization, no "Bearer" prefix)
curl -X POST https://queue-private.envia.com/check \
  -H "Authorization: <tms_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 10, "transaction": "mcp-smoke-001"}'
# → HTTP 200: { "data": { "pendingChargeId": 21726401 } }

# Direct portal JWT → REJECTED
curl -X POST https://queue-private.envia.com/check \
  -H "Authorization: Bearer <envia-portal-jwt>" \
  -d '{"amount": 10}'
# → HTTP 401: { "message": "Missing authentication" }
```

### Root cause

1. **Auth mismatch:** The TMS queue uses its own JWT issued by `POST /token` (company-scoped, no auth). The Envia portal JWT is not accepted.

2. **Not read-only:** `POST /check` creates a **pending charge** (balance hold). It returns `pendingChargeId` which is used by carriers to call `POST /apply` to finalize the deduction. This means `/check` mutates state (holds funds) and is NOT safe to call from a conversational agent without immediately following up with `/apply`.

3. **Hostname:** The real TMS hostname is `https://queue-private.envia.com` (from carriers `.env`). The hostname `envia-tms-api.envia.com` proposed in findings does not resolve.

### Resolution for `envia_check_balance`

Implemented using `fetchUserInfo` (user-information JWT) instead of TMS:
- `company_balance` field in the user-info JWT provides real-time balance
- The tool compares the requested amount against the balance and returns a sufficiency answer
- This is truly READ_SAFE with zero financial side effects
- The user question "¿tengo saldo suficiente para enviar?" is fully answered this way

### Deferred (TMS direct integration, Sprint 3 if needed)

Direct TMS integration requires:
1. Calling `POST /token` with the user's company_id to get a TMS session token
2. Caching it (it's company-scoped, likely short-lived)
3. Using `Authorization: <tmstkn>` (no "Bearer" prefix) for subsequent calls
4. NOT using `/check` for conversational flows — only appropriate when immediately followed by `/apply`
