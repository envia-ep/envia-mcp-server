## Context

`envia_create_ticket` currently resolves an optional shipment, creates a ticket through the Queries API, validates the creation response, and returns a text response containing the ticket ID. Admon performs a second Queries API mutation to autoassign a newly created ticket. The MCP tool must add the same orchestration without changing its public contract or turning assignment failure into creation failure.

## Goals / Non-Goals

**Goals:**

- Invoke autoassignment only after a successful creation response yields a schema-validated ticket ID.
- Reuse `mutateTicketApi`, `activeClient`, and `config` for both mutations.
- Preserve the current successful output if autoassignment fails and emit a structured warning without sensitive details.
- Do not add orchestration-level retries for ticket creation or autoassignment.
- Cover success, failure, ordering, authentication reuse, and endpoint construction with isolated unit tests.

**Non-Goals:**

- Expose autoassignment as a separate MCP tool.
- Modify `agentic-ai`, unrelated ticket tools, authentication, or configuration.
- Retry ticket creation or autoassignment.
- Change the creation response format.

## Decisions

1. The tool handler will await `mutateTicketApi(activeClient, config, \`/company/tickets/autoassign/${ticketId}\`, {})` immediately after `CreateTicketResponseSchema` validation. Using the validated numeric ID prevents user-controlled free text from entering the endpoint, and reusing the same client preserves request authentication.

2. The autoassignment call will be isolated behind `try/catch` and response-status handling. Both rejected requests and non-success API responses will produce a structured warning and then continue to the existing response formatter. The log will contain a stable event name and ticket ID, but not tokens, internal URLs, response bodies, stack traces, or raw errors.

3. No autoassignment response schema is required because the endpoint result does not alter the tool response. Only the helper's `ok` result determines whether observability is emitted. The orchestration will not add retries; requests continue to use the existing API client's shared transient-failure policy.

4. Unit tests will mock transport responses in sequence and inspect request order, URL, body, and authorization headers. Tests will spy on the existing logger to verify failure observability without coupling to logger internals.

## Risks / Trade-offs

- [Risk] Autoassignment can fail after irreversible ticket creation. → The flow deliberately remains fail-open and logs one structured warning for operational follow-up.
- [Risk] An additional synchronous request increases tool latency. → The call is required for assignment consistency and is performed only after validated creation.
- [Risk] Tests based on sequential fetch mocks can become brittle. → Each test will assert behavior at the public handler boundary and inspect only externally observable requests and responses.
- [Risk] The endpoint may return an empty or undocumented success body. → The implementation will not parse it because assignment response data is not needed.

## Migration Plan

Deploy the MCP server normally after tests, lint, type checking, and build pass. No data or configuration migration is required. Rollback consists of reverting the tool orchestration; tickets created during either version remain valid.

## Open Questions

None. The implementation assumes any `2xx` response represented by `ApiResponse.ok` means autoassignment succeeded, regardless of response body.
