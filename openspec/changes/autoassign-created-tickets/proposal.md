## Why

Tickets created through `envia_create_ticket` can remain without an assigned executive because the MCP flow does not invoke the Queries API autoassignment operation used by Admon. The tool must trigger assignment after a valid ticket is created while preserving the successful creation result if assignment fails.

## What Changes

- Autoassign each successfully created and validated ticket through the existing authenticated Queries API client.
- Keep autoassignment internal to `envia_create_ticket`; no new MCP tool or caller integration is introduced.
- Treat autoassignment failures as observable warnings while returning the existing successful creation response.
- Prevent autoassignment when creation fails, returns a duplicate conflict, or produces an invalid response.
- Add unit coverage for call ordering, authentication reuse, endpoint safety, fail-open behavior, and backward-compatible responses.

## Capabilities

### New Capabilities
- `ticket-autoassignment`: Defines post-creation ticket autoassignment and its fail-open behavior.

### Modified Capabilities

None.

## Impact

- Affected tool: `src/tools/tickets/create-ticket.ts`.
- Reused service helper: `mutateTicketApi` from `src/services/tickets.ts`.
- Affected tests: `tests/tools/tickets/create-ticket.test.ts`.
- External API: one additional `POST /company/tickets/autoassign/{ticketId}` request after successful ticket creation.
- No changes to `agentic-ai`, authentication configuration, public MCP tool surface, or creation response structure.
