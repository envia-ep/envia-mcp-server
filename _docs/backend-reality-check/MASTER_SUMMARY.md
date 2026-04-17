# Backend Reality Check — Master Summary

Last updated: 2026-04-16

## Session A Findings (completed, Sprint 0)

| Service | File | Key Finding |
|---------|------|-------------|
| geocodes | `geocodes-findings.md` | Coverage, postal codes, DANE resolver, ICMS — all internal helpers already implemented |
| accounts | `accounts-findings.md` | User info / JWT endpoint — used by `envia_get_company_info`, `envia_get_balance_info`, `envia_get_my_salesman` |
| ecommerce + eshops | `ecommerce-eshops-findings.md` | Order ingestion, shop CRUD, ecommerce order V4 — used by `envia_get_ecommerce_order`, `envia_list_ecommerce_orders` |
| carriers (top 5) | `carriers-top5-findings.md` | FedEx REST, DHL, Estafeta, UPS, Correos MX — rate/generate/track patterns documented |
| queries inventory | `queries-inventory-findings.md` | 65+ routes catalogued; tickets, branches, analytics, notifications, orders, shipments |

*Note: Session A findings docs may not exist as files on disk — this summary captures their conclusions.*

## Session B Findings (completed, Sprint 1)

| Service | File | Verdict |
|---------|------|---------|
| tms-admin | `tms-admin-findings.md` | NOT a backend — React admin SPA. Financial queuing is in `queue` service. |
| ecart-payment | `ecart-payment-findings.md` | Rich payment backend. 5 READ_SAFE tools ready; 3 MUTATION tools for Phase 2. |
| sockets | `sockets-findings.md` | Pure event broadcaster. No HTTP API. No MCP tools possible. Defer permanently. |
| queue (envia-tms) | `queue-findings.md` | Balance check + refund queue. 1 READ_SAFE tool now; 1 MUTATION tool Phase 2. |
| secondary carriers | `secondary-carriers-findings.md` | 10 carriers analyzed. Generic tools cover 80%. LTL gap is real but deferred. |

## Proposed Tools from Session B

### Immediate (READ_SAFE — implement in Sprint 2)

| Tool | Source | Endpoint | User question |
|------|--------|----------|---------------|
| `envia_check_balance` | queue service | `POST /check` | "¿Tengo saldo para enviar?" |
| `envia_get_refund_status` | ecart-payment | `GET /api/refunds` | "¿cuándo me llega el reembolso?" |
| `envia_get_withdrawal_status` | ecart-payment | `GET /api/withdrawals/:id` | "¿cuándo llega mi remesa COD?" |
| `envia_get_transaction_history` | ecart-payment | `GET /api/transactions` | "¿qué pasó con ese cobro?" |
| `envia_get_ecartpay_balance` | ecart-payment | `GET /api/transactions/summary` | "¿cuál es mi saldo EcartPay?" |
| `envia_list_ecartpay_invoices` | ecart-payment | `GET /api/invoices` | "¿tengo facturas pendientes?" |

### Phase 2 (MUTATION — requires confirmation prompts + auth verification)

| Tool | Source | Endpoint | Risk | Prerequisite |
|------|--------|----------|------|--------------|
| `envia_create_payment_link` | ecart-payment | `POST /api/orders` | Medium | Confirm ecartpay JWT compat |
| `envia_request_refund` | ecart-payment | `POST /api/refunds` | High | Company ownership check |
| `envia_request_withdrawal` | ecart-payment | `POST /api/withdrawals` | High | BASIC/admin auth clarification |
| `envia_request_refund_queue` | queue service | `POST /apply` | High | Authorization guardrails |

### Deferred (out of scope or not ready)

| Service | Reason |
|---------|--------|
| sockets | No HTTP API; WebSocket incompatible with MCP request/response model |
| queue async ops (cancel, COD, overweight) | Fire-and-forget; no job status endpoint to confirm completion |
| LTL rate/generate for secondary carriers | Power-user flow; validate demand before building |
| tms-admin | Frontend only — no backend to expose |

## V1-Safe Classification Update

Using the framework from `V1_SAFE_TOOL_INVENTORY.md`:

- **READ_SAFE additions** (6 tools): envia_check_balance, envia_get_refund_status, envia_get_withdrawal_status, envia_get_transaction_history, envia_get_ecartpay_balance, envia_list_ecartpay_invoices
- **MUTATION additions** (4 tools): envia_create_payment_link, envia_request_refund, envia_request_withdrawal, envia_request_refund_queue

**Current tool count (post Sprint 1):** 71 user-facing tools + 4 internal helpers
**Proposed Sprint 2 additions:** +6 READ_SAFE tools = 77 user-facing tools
