## ADDED Requirements

### Requirement: Autoassign a validated created ticket
The tool SHALL request autoassignment exactly once after ticket creation succeeds and `CreateTicketResponseSchema` validates a ticket ID. It SHALL call `POST /company/tickets/autoassign/{ticketId}` with an empty JSON object through the same authenticated Queries API client used for creation.

#### Scenario: Successful creation triggers autoassignment
- **WHEN** ticket creation succeeds with a schema-valid ticket ID
- **THEN** the tool calls the autoassignment endpoint exactly once with `{}` after the creation request

#### Scenario: Authenticated client is reused
- **WHEN** the tool creates and autoassigns a ticket
- **THEN** both requests use the same resolved authenticated API client

#### Scenario: Validated ID determines the endpoint
- **WHEN** a creation response contains a schema-valid ticket ID
- **THEN** the autoassignment path is constructed from that validated ID and not from user-controlled free text

### Requirement: Skip autoassignment without a created valid ticket
The tool SHALL NOT request autoassignment when creation fails, returns a duplicate conflict, or does not produce an ID accepted by `CreateTicketResponseSchema`.

#### Scenario: Creation request fails
- **WHEN** ticket creation returns a non-success response other than a duplicate conflict
- **THEN** the tool returns the existing creation failure response without calling autoassignment

#### Scenario: Ticket is duplicated
- **WHEN** ticket creation returns HTTP 409
- **THEN** the tool returns the existing duplicate-ticket response without calling autoassignment

#### Scenario: Creation response is invalid
- **WHEN** ticket creation succeeds but its response does not contain a schema-valid ticket ID
- **THEN** validation fails before autoassignment is called

### Requirement: Autoassignment is fail-open and observable
The tool SHALL preserve the existing successful creation response when autoassignment fails. It SHALL emit a structured warning without exposing raw internal errors, authentication data, stack traces, response bodies, or internal URLs to the MCP client.

#### Scenario: Autoassignment returns an API failure
- **WHEN** the ticket is created and validated but autoassignment returns a non-success response
- **THEN** the tool logs one structured warning and returns the normal successful creation response

#### Scenario: Autoassignment request rejects
- **WHEN** the ticket is created and validated but the autoassignment request throws
- **THEN** the tool logs one structured warning and returns the normal successful creation response

#### Scenario: Creation is not repeated
- **WHEN** autoassignment fails
- **THEN** the tool does not repeat ticket creation and does not add orchestration-level retries

### Requirement: Preserve the MCP response contract
The tool SHALL continue to report that the ticket was created and include its validated ticket ID without requiring caller-side autoassignment behavior.

#### Scenario: Autoassignment succeeds
- **WHEN** creation and autoassignment succeed
- **THEN** the tool returns the existing successful ticket creation response

#### Scenario: Autoassignment fails
- **WHEN** creation succeeds and autoassignment fails
- **THEN** the client-visible response does not contain the internal autoassignment error
