# Queue Service (envia-tms) — Backend Reality Check Findings

## Service Overview

Hapi/Node.js API that manages financial transaction queuing using Bull + Redis. Handles balance
checks, refunds, surcharges, cancellations, and COD payments. Some endpoints are synchronous
(wait for job completion); others fire-and-forget with async processing.

## User-Relevant Endpoints

| Method | Path | Auth | Purpose | Payload |
|--------|------|------|---------|---------|
| POST | `/check` | JWT (user) | Validate balance before charge | `{ amount: number, transaction?: string }` |
| POST | `/apply` | JWT (user) | Apply balance deduction | `{ amount: number, pendingChargeId?: number }` |
| POST | `/rollback` | JWT (user) | Undo a charge | `{ transactionId: number }` |
| POST | `/cancellation` | Internal JWT | Cancel shipment + queue refund | `{ shipment_id: number, message?: string }` |
| POST | `/payment-cod` | Internal JWT | Process COD payout (5min delay) | `{ shipment_id: number }` |
| POST | `/chargeback-cod` | Internal JWT | Reverse COD charge (4hr delay) | `{ shipment_id: number }` |
| POST | `/overweight` | Internal JWT | Add overweight surcharge | `{ shipment_id, weight, weight_unit, dimensions }` |
| POST | `/return-to-origin` | Internal JWT | Schedule RTO surcharge (10min delay) | `{ shipment_id, amount, ... }` |
| POST | `/smart-refund` | Cron token | Evaluate smart refund eligibility | `{ shipment_id: number }` |
| POST | `/smart-refund/approve` | Admin token | Approve smart refund | `{ shipment_id: number }` |
| POST | `/token` | None | Generate JWT for queue operations | `{ companyId: number }` |

**Auth note:** `Internal JWT` = carrier-service-to-queue auth. User-facing endpoints use standard
Envia JWT. The `/token` endpoint is backend-bootstrap only.

## Queue Jobs Summary

| Queue | User Visible? | Duration | Notes |
|-------|--------------|----------|-------|
| `check` | No (internal) | <1s | Synchronous wait |
| `apply` | No (internal) | <1s | Synchronous wait |
| `cancelShipment` | No (system) | 1-5s | Async; triggers refund |
| `paymentCod` | No (system) | 5min+ | 5min delay + retry backoff |
| `chargebackCod` | No (system) | 4hr+ | 4hr delay |
| `surcharge` (overweight) | No (system) | 1-5s | Async |
| `smartRefundQueue` | No (system) | 1-30s | Async, cron-triggered |

## Tool Opportunities

### Immediate (Phase 1)

**`envia_check_balance`** — READ_SAFE  
- Endpoint: `POST /check`  
- Non-destructive: validates balance without modifying state  
- User query: "¿Tengo saldo suficiente para enviar?"  
- Response: available balance + sufficiency check  

### Conditional (Phase 2 — requires authorization guardrails)

**`envia_request_refund`** — MUTATION  
- Endpoint: `POST /apply` (with `pendingChargeId: 0` for manual credit)  
- Modifies company balance — requires verified company ownership  
- User query: "Necesito que me regresen el cobro del envío #12345"  
- Caution: must not expose to untrusted callers  

### Not Recommended

- `/cancellation` — fire-and-forget async; no job status endpoint to confirm completion
- `/payment-cod`, `/chargeback-cod`, `/overweight`, `/return-to-origin` — internal system ops
- `/smart-refund*` — admin/cron only
- `/token` — backend bootstrap, never agent-facing

## Limitations / Gaps

- No job status endpoint (`GET /jobs/:jobId/status` doesn't exist) — async operations can't be confirmed
- No transaction history API — can't answer "¿cuándo fue mi último cobro?"
- COD payout timing (5min delay, retries) not surfaceable without job polling
- Smart refund eligibility logic is opaque from the API

## Verdict

**EXPOSE 1 tool now; defer the rest.**

**Phase 1:** `envia_check_balance` — safe, non-destructive, useful for conversational flow before
quote/generate. Zero risk.

**Phase 2:** `envia_request_refund` — useful but requires:
1. Company ID verification middleware in MCP
2. Clear user-facing error for insufficient permissions

**Defer:** All async fire-and-forget operations until a job status endpoint is added. Telling a
user "tu reembolso está en proceso" without being able to confirm it later is a UX dead end.
