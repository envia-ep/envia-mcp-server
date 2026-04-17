# tms-admin — Backend Reality Check Findings

## Service Overview

`repos_extra/tms-admin/` is **not a backend service** — it is a React SPA (Create React App)
admin dashboard built with Material-UI. It is a frontend that consumes backend APIs; it defines
no routes or endpoints of its own.

## What Was Found

- **Type:** React frontend, CRA-based
- **State management:** Context API (authContext, userContext, routesContext, etc.)
- **API calls:** Uses axios to call external backend services (URLs not defined in this repo)
- **No route definitions, controllers, or endpoint handlers**

The name "tms-admin" in the ecosystem context refers to the TMS (Transport Management System)
admin UI, not the TMS backend. The actual financial transaction queue is in the `queue` service
(see `queue-findings.md`).

## Tool Opportunities

**None.** There is no backend to expose.

## Verdict

**OUT OF SCOPE — not a backend service.**

If TMS/financial admin functionality needs to be exposed via MCP tools, look at:
1. `services/queue/` — balance, charges, refunds, COD queuing (see `queue-findings.md`)
2. `repos_extra/ecart-payment/` — payment links, withdrawals, transaction history (see `ecart-payment-findings.md`)
