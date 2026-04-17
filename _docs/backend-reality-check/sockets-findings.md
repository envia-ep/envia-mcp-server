# Sockets Service — Backend Reality Check Findings

## Service Overview

Node.js/Express application built on Socket.IO 4.x that manages real-time WebSocket connections
for Envia users. Uses Redis as adapter for horizontal scaling and Bull queue for async notification
processing. Write-only broadcaster — emits events only, no HTTP API for querying state.

## User-Relevant Events

| Event | Direction | Auth | Purpose |
|-------|-----------|------|---------|
| `notification` | Server→Client | JWT (room claim) | Generic portal notifications |
| `balance` | Server→Client | JWT | Balance change alerts |
| `billing` | Server→Client | JWT | Billing notifications |
| `ticketUpdate` | Server→Client | JWT | Support ticket status changes |
| `ticketReply` | Server→Client | JWT | New reply on a support ticket |
| `order` | Server→Client | JWT | Ecommerce order updates |
| `fulfillment` | Server→Client | JWT | Fulfillment status changes |
| `bulkShipmentCancel` | Server→Client | JWT | Bulk cancellation completion |
| `returnNotification` | Server→Client | JWT | Return shipment updates |
| `rechargeNotification` | Server→Client | JWT | Balance recharge confirmation |

**Room model:** Per-company/user isolation via `room` claim in JWT — users only receive their company's events.

**No HTTP API exists.** All interactions are push-only WebSocket events.

## Tool Opportunities

**None.** The sockets service is a write-only event broadcaster with no queryable state:
- Cannot retrieve real-time status (no HTTP endpoints)
- Cannot check notification history
- Cannot poll for job completion
- MCP request/response model is incompatible with persistent WebSocket subscriptions

## Limitations / Gaps

- No HTTP companion API to query notification state
- No historical event storage accessible via API
- No job delivery confirmation endpoint
- Notification history unavailable to agents

## Verdict

**DEFER — no MCP tools possible from this service.**

The sockets service pushes events to connected browser clients. An MCP agent cannot maintain a
persistent WebSocket connection nor query past events. For the agent to report notification state
("¿se envió la notificación de mi cliente?"), a companion HTTP API would need to be added to query
Redis or a notification log table — which does not exist today.

**Recommendation:** Defer. If a `GET /notifications?company_id=...` HTTP endpoint is added to
queries service, reconsider adding `envia_get_notification_history`.
