# ecart-payment — Backend Reality Check Findings

## Service Overview

Node.js/Express + MongoDB payment processing backend at `repos_extra/ecart-payment/`. Handles
payment links (EcartPay), COD remittances, withdrawals/payouts, refunds, transactions, and
invoice payments. Uses Bull queues + Redis for async jobs and RabbitMQ for events.

## User-Relevant Endpoints

| Method | Path | Auth | Purpose | Key Fields |
|--------|------|------|---------|------------|
| GET | `/api/orders` | JWT | List payment orders | filters, pagination |
| POST | `/api/orders` | JWT | Create payment link | `customer_id, items[], currency, amount` |
| GET | `/api/orders/:id` | JWT | Order details | `order_id` |
| GET | `/api/orders/public/:id` | None | Public payment link details | `order_id` |
| GET | `/api/transactions` | JWT | Transaction history | date range, status, filters |
| GET | `/api/transactions/summary` | JWT | Balance summary | read-only |
| GET | `/api/transactions/balance-details` | JWT | Detailed balance breakdown | read-only |
| GET | `/api/transactions/:id` | JWT | Single transaction details | `transaction_id` |
| GET | `/api/refunds` | JWT | List refunds | `order_id`, `transaction_id`, filters |
| POST | `/api/refunds` | JWT | Request refund | `transaction_id`, `amount`, `reason` |
| GET | `/api/withdrawals` | JWT | List withdrawals/payouts | date range, status |
| POST | `/api/withdrawals` | BASIC/Admin | Request withdrawal | `amount`, `payment_method_id`, `currency` |
| GET | `/api/withdrawals/:id` | JWT | Withdrawal status | `withdrawal_id` |
| GET | `/api/invoices` | JWT | List invoices (platform fees) | filters |
| GET | `/api/business-payments/outstanding` | JWT | Outstanding fee invoices | read-only |
| POST | `/api/business-payments` | JWT | Pay invoice (returns pay_link) | `invoice_id` |
| GET | `/api/payment-methods` | JWT | Saved payment methods | read-only |
| POST | `/api/payment-methods` | JWT | Add payment method | bank account or card |
| GET | `/api/accounts/me` | JWT | Current account info | read-only |

**Auth scopes enforced:** `read_orders`, `write_orders`, `read_transactions`, `read_refunds`,
`write_refunds`, `read_withdrawals`, `write_withdrawals`, `read_invoices`, etc.

**Payment link URL pattern:** `https://pay.ecart.com/checkout?id={order_id}`

## Tool Opportunities

### READ_SAFE (immediate — GET only, no state change)

| Tool name | Endpoint | User question answered |
|-----------|----------|----------------------|
| `envia_get_refund_status` | `GET /api/refunds?transaction_id=...` | "¿cuándo me llega el reembolso?" |
| `envia_get_withdrawal_status` | `GET /api/withdrawals/:id` | "¿cuándo llega mi remesa COD?" |
| `envia_get_transaction_history` | `GET /api/transactions` | "¿qué pasó con ese cobro?" |
| `envia_get_ecartpay_balance` | `GET /api/transactions/summary` | "¿cuál es mi saldo EcartPay?" |
| `envia_list_invoices` | `GET /api/invoices` | "¿tengo facturas pendientes?" |

### MUTATION (Phase 2 — requires user confirmation before executing)

| Tool name | Endpoint | User action | Risk |
|-----------|----------|-------------|------|
| `envia_create_payment_link` | `POST /api/orders` | "dame un link de pago por $500" | Medium — creates order |
| `envia_request_refund` | `POST /api/refunds` | "solicita reembolso del cobro #X" | High — financial |
| `envia_request_withdrawal` | `POST /api/withdrawals` | "retira mi saldo a mi cuenta" | High — fund transfer |

## Limitations / Gaps

- COD-specific remittance flow not found as explicit endpoint — withdrawals appear to cover this generically
- Chargebacks/disputes: controller exists but no user-facing read endpoints
- Payment link branding/customization options unclear from code alone
- No export/reporting endpoints
- `POST /api/withdrawals` requires BASIC or admin auth — may not be user-callable directly
- Auth token format differences between Envia JWT and ecart-payment JWT need verification

## Verdict

**YES — expose READ_SAFE tools immediately; plan MUTATION tools for Phase 2.**

The 5 GET-only tools cover the most common user questions about payments, refunds, and payouts
with zero financial risk. These should be prioritized for Sprint 2.

The mutation tools (payment links, refunds, withdrawals) require:
1. Confirming auth token compatibility between Envia portal JWT and ecart-payment JWT
2. Implementing confirmation prompts in the agent before executing financial operations
3. Testing against staging environment (ecart-payment is not in the sandbox credentials)
