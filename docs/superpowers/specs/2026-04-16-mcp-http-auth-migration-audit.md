# MCP HTTP Server Audit, Lessons Learned, and 3-Phase Migration Plan

Date: 2026-04-16
Project: `@envia/envia-mcp`
Repository: `envia-mcp-server`
Status: Working document for follow-up cross-repo analysis

## Purpose

This document consolidates the initial audit performed on the MCP server, the clarifications provided after discussing the product direction, the lessons learned from the current implementation, and the recommended 3-phase migration plan.

Its purpose is to serve as the starting brief for a new project where an agent will have access to multiple repositories and will validate, cross-reference, and refine the target architecture across:

- `envia-mcp-server`
- the frontend/web platform hosting the customer chat agent
- the backend/orchestration layer used by the platform
- the `carriers` backend
- the `queries` backend
- any auth/session or identity service involved in platform login

This document is intentionally detailed. It is not only a summary of findings; it is also a decision framework and a research plan.

---

## 1. Initial User Goal

The original request was to perform a critical audit of the MCP server with a high engineering bar:

- ensure best practices
- ensure code cleanliness
- ensure every tool has the right context and rules
- ensure maintainability and scalability
- deeply understand what the MCP project is actually doing
- validate, if needed, how it aligns with `carriers` and `queries`

The intended quality target was explicitly stated as:

- an MCP server at the level of the best companies in the world

This matters because the evaluation criteria were not limited to "does it work." The bar included:

- product correctness
- architectural coherence
- context quality for agents
- maintainability under growth
- security posture
- future-proofing for HTTP server usage

---

## 2. What Was Reviewed

The initial audit focused on the MCP server repository itself.

### 2.1 Areas inspected

- project structure
- tool registration model
- shared validation schemas
- HTTP client behavior
- error mapping
- resource publication
- chat UI behavior
- configuration and startup model
- representative tools
- supporting services
- tests and verification setup

### 2.2 Key files reviewed

- [src/index.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/index.ts:216)
- [src/config.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/config.ts:49)
- [src/utils/api-client.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/utils/api-client.ts:1)
- [src/utils/error-mapper.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/utils/error-mapper.ts:1)
- [src/utils/schemas.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/utils/schemas.ts:1)
- [src/services/generic-form.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/services/generic-form.ts:1)
- [src/resources/api-docs.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/resources/api-docs.ts:12)
- [src/chat/chat-client.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/chat-client.ts:100)
- [src/tools/create-label.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/tools/create-label.ts:893)
- [src/tools/get-shipping-rates.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/tools/get-shipping-rates.ts:1)
- [src/tools/shipments/list-shipments.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/tools/shipments/list-shipments.ts:1)
- [README.md](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/README.md:1)
- [package.json](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/package.json:35)

### 2.3 Verification performed

- `npm test` was executed successfully
- result: `90` test files passed, `1202` tests passed
- `npm run lint` failed because ESLint 9 is configured as a dependency but no `eslint.config.*` file exists

This distinction is important:

- behavioral test coverage is strong
- static quality enforcement is currently weak or absent

---

## 3. Initial Findings Before Clarification

Before the user clarified the strategic direction of the project, the following issues were identified.

### 3.1 Finding A: authentication contract inconsistency

Observation:

- the server startup requires `ENVIA_API_KEY`
- tool schemas and documentation present `api_key` as a per-request override and in several places as functionally optional
- the overall messaging suggested a multi-tenant model where callers may provide their own key

Evidence:

- [src/config.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/config.ts:49)
- [src/utils/schemas.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/utils/schemas.ts:38)
- [README.md](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/README.md:17)

Initial interpretation:

- this looked like a product contract bug because the process could not start without a server-side credential even though the public contract implied bring-your-own-key behavior

### 3.2 Finding B: stale MCP resources

Observation:

- the MCP resource `envia://docs/overview` exposed documentation that reflected the earlier, smaller MCP
- it enumerated only 11 tools
- it used outdated or inconsistent naming in at least one place
- it omitted the majority of current tools exposed by the server

Evidence:

- [src/resources/api-docs.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/resources/api-docs.ts:34)
- [src/index.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/index.ts:232)

Initial interpretation:

- this was treated as a serious agent-context issue because MCP resources are part of the active context surface

### 3.3 Finding C: generic-form validation is only partial

Observation:

- `generic-form` rules include more than `required`
- current logic primarily extracts required fields and checks missing values
- unsupported required fields are skipped with warnings
- min/max/format-like constraints are not enforced at the MCP layer

Evidence:

- [src/services/generic-form.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/services/generic-form.ts:21)
- [src/services/generic-form.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/services/generic-form.ts:174)
- [src/tools/create-label.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/tools/create-label.ts:893)

Initial interpretation:

- the server claims intelligent pre-validation but still relies on downstream API rejection for several rule classes

### 3.4 Finding D: no functioning lint gate

Observation:

- `package.json` includes ESLint 9
- `npm run lint` points to `eslint src/`
- no flat config file exists

Evidence:

- [package.json](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/package.json:35)

Initial interpretation:

- the repo has good tests but lacks a reliable static discipline gate

### 3.5 Finding E: production posture of built-in chat UI is weak

Observation:

- HTTP mode serves a browser chat UI from the same server
- browser code directly calls Anthropic/OpenAI APIs
- browser code explicitly includes `anthropic-dangerous-direct-browser-access`

Evidence:

- [src/index.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/index.ts:397)
- [src/chat/chat-client.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/chat-client.ts:351)
- [src/chat/index.html](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/index.html:673)

Initial interpretation:

- acceptable for demo/dev
- not aligned with strong production security expectations

---

## 4. Clarifications Provided After Discussion

After the initial review, the user clarified important product context.

### 4.1 Clarification on project evolution

The repository did not start with the same architectural assumptions it has now.

Original model:

- MCP focused on IDE usage
- user or host-side flows
- stronger tolerance for passing `api_key` inside tool arguments

Current target model:

- evolve into an HTTP MCP server
- support a chat agent embedded in Envia's platform web experience
- use that chat agent to help Envia customers use Envia services

This clarification materially changed the interpretation of some findings.

### 4.2 Clarification on startup auth requirement

The reason behind requiring `ENVIA_API_KEY` at startup was not accidental; it was introduced to avoid exposing MCP HTTP functionality without an API key.

Implication:

- requiring a server-level key at startup is not inherently a defect
- however, the public contract still needs to be aligned with this decision

### 4.3 Clarification on legacy documentation

The user clarified that the resource identified in the audit likely reflects the original MCP documentation rather than the new HTTP server reality.

Implication:

- the existence of legacy content is understandable
- but exposing that legacy content as active MCP resource remains risky if current clients can consume it as authoritative context

---

## 5. Revised Interpretation After Clarification

After incorporating the product direction provided by the user, the initial findings were reframed.

### 5.1 Revised view of Finding A

Old interpretation:

- startup auth requirement looked like a product bug

Revised interpretation:

- the real issue is not that `ENVIA_API_KEY` is required
- the real issue is that the system currently mixes two authentication models

Those two models are:

1. legacy/IDE-style model
   - `api_key` lives inside tool arguments
   - caller injects it per invocation
   - auth is intertwined with tool inputs

2. HTTP server model
   - the server should have a controlled trust boundary
   - callers should authenticate at the HTTP layer
   - tools should not treat secrets as normal business parameters

Therefore, the issue is:

- contract inconsistency
- mixed architecture
- migration not yet completed

### 5.2 Revised view of Finding B

Old interpretation:

- resource documentation is stale

Revised interpretation:

- stale legacy docs are acceptable as historical artifacts
- but not as active MCP resources exposed by the live server

Therefore, the issue is:

- active context pollution
- lack of separation between current vs legacy documentation

### 5.3 Revised view of the server's current maturity

The project is not poorly engineered. It has several strong signals:

- meaningful tool coverage
- strong test suite
- shared services and builders
- explicit SSRF protection in the HTTP client
- deliberate effort to improve tool ergonomics

The real maturity issue is not "low code quality" in a narrow sense. It is:

- incomplete strategic convergence

The repository still contains traces of two eras:

- local/IDE MCP
- HTTP MCP platform service

---

## 6. Current Strengths

This section is important because follow-up work should preserve what is already good.

### 6.1 Strong automated test coverage

The project has unusually broad test coverage for an MCP server of this size.

Coverage areas present in the repo include:

- tools
- services
- builders
- utility logic
- security tests
- integration-like sequential workflow tests

Examples:

- [tests/integration/full-workflow.test.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/tests/integration/full-workflow.test.ts:1)
- [tests/security/auth-security.test.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/tests/security/auth-security.test.ts:1)
- [tests/security/ssrf.test.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/tests/security/ssrf.test.ts:1)

### 6.2 Shared service and builder layers exist

The codebase is not only handler-level glue. It already has internal layering:

- `services/`
- `builders/`
- `utils/`
- `types/`

That is a strong base for further refactoring.

### 6.3 Sensible HTTP client protections

The API client contains several good practices:

- domain allowlist
- retries for transient failures
- timeout handling
- safer error mapping

Reference:

- [src/utils/api-client.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/utils/api-client.ts:1)

### 6.4 Good intent around agent usability

The repository clearly tries to help agents use tools successfully:

- descriptive schemas
- formatted outputs
- helper resources
- generic-form guidance
- ecommerce-specific helpers

This is important and should be preserved during migration.

---

## 7. Core Lessons Learned

These are the main lessons extracted from the audit and follow-up discussion.

### 7.1 Lesson: MCP products need one trust model

The biggest architectural risk is not a single bug; it is supporting multiple trust models in an ambiguous way.

If the server is an HTTP platform service, then:

- authentication belongs at the transport boundary
- authorization belongs in a request context or policy layer
- tools should focus on business semantics

If the server is a local IDE helper, then:

- passing keys per tool is tolerable
- the host is closer to the user
- there is less need for centralized trust resolution

Trying to keep both models equally "first class" usually creates:

- inconsistent docs
- duplicate auth paths
- hidden exceptions
- harder observability
- more complicated security review

### 7.2 Lesson: tool schemas are product surface, not just implementation detail

When `api_key` is present in tool schemas, the following implications exist:

- the model can reason about it
- clients can see it
- docs can inherit it
- future consumers may treat it as intended public API

Therefore, schema fields should be treated as stable product contract.

### 7.3 Lesson: MCP resources are live context

An MCP resource is not merely a file in the repo. It is part of the context graph presented to the agent.

So if a resource is:

- legacy
- partial
- stale
- intentionally simplified

then it must not be exposed as if it were current system truth.

### 7.4 Lesson: strong tests are not enough without architecture convergence

It is possible for:

- tests to pass
- handlers to work
- tools to return correct results

while the product still has structural issues such as:

- mixed auth models
- duplicated source-of-truth
- stale context surfaces
- weak production security boundaries

This project is a good example of that.

### 7.5 Lesson: embedded chat agents change the auth problem

Because the MCP server is intended to power a chat agent embedded in the platform web experience, the auth model should be driven by that reality.

If the user is already authenticated inside Envia's platform, the cleanest long-term design is:

- the platform authenticates to the MCP server
- the MCP server resolves tenant identity
- the MCP server chooses the Envia API credential
- the tools do not carry secrets as business arguments

This lesson matters because it makes the migration target clearer than a generic MCP design discussion.

---

## 8. Recommended Target Architecture

This is the target architecture recommended after the audit and clarification discussion.

### 8.1 Short description

The MCP HTTP server should evolve into a platform service with:

- HTTP-layer authentication
- server-side tenant resolution
- request-scoped Envia API client creation
- tool contracts focused on business inputs only

### 8.2 Desired trust boundary

Target flow:

1. customer logs into Envia platform
2. customer opens embedded chat assistant
3. platform frontend/backend uses platform auth/session
4. platform calls MCP HTTP endpoint
5. MCP authenticates the caller at HTTP level
6. MCP resolves user/company/permissions/Envia credential
7. tools execute using request-scoped context

### 8.3 Desired internal abstractions

Suggested concepts:

```ts
interface RequestContext {
  companyId: string;
  userId: string;
  permissions: string[];
  enviaApiKey: string;
}
```

```ts
function createRequestScopedClient(
  ctx: RequestContext,
  config: EnviaConfig,
): EnviaApiClient
```

Then tools consume:

- context-derived client
- validated business arguments

instead of:

- contextless server client
- optional secret injection per tool

### 8.4 Why not jump directly to OAuth

OAuth was discussed as a possible next step.

Conclusion from the conversation:

- OAuth is a reasonable direction
- but it should not be the first mandatory move
- the first move is architecture cleanup of identity resolution and secret injection

Reason:

- OAuth on top of a system still centered around `api_key` in tool arguments mostly relocates complexity
- it does not solve the core problem if the transport boundary and tool contracts remain mixed

---

## 9. Why an Incremental Migration Is Better Than a Big Rewrite

A big rewrite would be risky because this repository already has:

- a broad tool surface
- production-relevant logic
- large test coverage
- meaningful business rules

An incremental migration allows:

- preserving existing customer functionality
- reducing risk of regressions
- changing trust boundaries in controlled steps
- coordinating across frontend/platform/backend repos

This is especially important because the eventual solution depends on cross-repo realities, not just MCP code.

---

## 10. 3-Phase Migration Plan

This section reflects the migration plan proposed in the conversation, now expanded for cross-repo execution.

## Phase 1: Controlled Secret Injection Without Changing Core MCP Auth

### 10.1 Objective

Keep the current system working while making `api_key` platform-controlled instead of model-controlled or user-controlled.

### 10.2 What Phase 1 is trying to solve

Current problem:

- `api_key` exists in tool contracts
- that is tolerable short term
- but the model should not invent or manage credentials
- the user should not type them in a normal platform experience

Phase 1 solves:

- operational risk
- UI confusion
- accidental secret exposure

without requiring:

- new HTTP auth middleware
- a full tenant resolution layer
- an OAuth rollout

### 10.3 Target behavior in Phase 1

Desired behavior:

- the user chats normally
- the platform already knows who the user is
- the platform injects the right `api_key`
- the model does not decide the credential
- the MCP still receives `api_key`, but only as an internal transport detail

### 10.4 Where most Phase 1 changes belong

Primarily outside this repo:

- frontend of the platform
- backend/orchestrator of the platform

Reason:

- the purpose of Phase 1 is to control how the secret is injected into MCP calls
- that control should live in the app already authenticated with the customer

### 10.5 Recommended changes in the platform frontend

- remove any UX that asks end users for Envia API keys
- do not expose `api_key` in user-facing chat forms
- do not let prompt text influence the credential source
- if the frontend calls MCP directly, it should not derive the credential from the model or user prompt

### 10.6 Recommended changes in the platform backend/orchestrator

Preferred approach:

- the backend/orchestrator injects the Envia credential
- the frontend does not handle raw Envia secrets whenever possible

This backend should:

- identify the logged-in customer
- resolve which Envia API key belongs to that tenant/session
- inject the credential into MCP calls
- centralize secret handling

### 10.7 Recommended changes in this MCP repo during Phase 1

These are minor but important consistency changes.

#### 10.7.1 Update documentation

Adjust docs to reflect reality:

- in HTTP/platform mode, `api_key` is injected by the platform
- it is not a user-facing parameter
- current support for per-tool key passing is transitional

Files to update:

- [README.md](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/README.md:1)
- [src/resources/api-docs.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/resources/api-docs.ts:12)

#### 10.7.2 Mark dev-only flows clearly

The built-in chat UI should explicitly state:

- manual token entry is for local testing or demo
- it is not the intended production integration path

Files:

- [src/chat/chat-client.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/chat-client.ts:245)
- [src/chat/index.html](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/index.html:673)

#### 10.7.3 Improve redaction and debug handling

Ensure no debug path leaks:

- raw API keys
- full auth headers
- sensitive request payload fragments

#### 10.7.4 Reframe `api_key` in schemas and descriptions

Even if it stays in the schema for compatibility, the descriptions should clarify:

- internal use in platform-controlled integrations
- not intended for end-user prompting

### 10.8 Deliverables for Phase 1

- platform injects `api_key` automatically
- user no longer sees or manages raw credential
- model no longer determines the credential
- MCP docs updated to reflect transitional status
- dev/demo token paths clearly labeled

### 10.9 Risks if Phase 1 is skipped

- model remains too close to secret handling
- public contract remains misleading
- future migration becomes harder because clients normalize the wrong interface

---

## Phase 2: Introduce HTTP Authentication and Request Context

### 10.10 Objective

Make HTTP authentication the primary trust boundary while preserving temporary compatibility.

### 10.11 What Phase 2 is trying to solve

Current limitation:

- tools still implicitly own auth via `api_key`
- the MCP server does not yet resolve identity centrally per HTTP request

Phase 2 solves:

- central auth boundary
- tenant-aware request processing
- separation of auth from business arguments

### 10.12 Target behavior in Phase 2

Desired behavior:

- caller hits `/mcp` with platform-authenticated token
- MCP validates token
- MCP resolves request context
- tools use a request-scoped Envia client
- `api_key` path remains only as fallback/deprecated compatibility

### 10.13 Recommended auth shape in Phase 2

Suggested request model:

- `Authorization: Bearer <platform-session-or-service-token>`

The MCP server should validate that token using your platform's auth rules.

Resulting context should include:

- `companyId`
- `userId`
- permissions/scopes
- resolved Envia credential

### 10.14 Changes needed in this MCP repo during Phase 2

#### 10.14.1 Add HTTP auth middleware before MCP handling

Current HTTP flow:

- Express app
- `/mcp` directly creates server and transport

Needed change:

- add middleware or request pre-processing that authenticates caller before tool execution path begins

Relevant file:

- [src/index.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/index.ts:397)

#### 10.14.2 Introduce request-scoped context

Need a clear abstraction such as:

```ts
interface RequestContext {
  companyId: string;
  userId: string;
  permissions: string[];
  enviaApiKey: string;
}
```

#### 10.14.3 Centralize client creation

Replace the current pattern:

- `resolveClient(client, args.api_key, config)`

with a context-driven mechanism:

- `createRequestScopedClient(ctx, config)`

#### 10.14.4 Preserve compatibility temporarily

During Phase 2 only:

- if HTTP auth context exists, use it as source of truth
- if no HTTP auth exists, allow fallback to `api_key`
- mark fallback as deprecated

### 10.15 Changes needed in other repos during Phase 2

Platform/backend side:

- issue token or signed session material to the MCP caller
- define identity claims and tenant resolution contract
- define where Envia credentials are stored/resolved

Potentially needed in auth/session service:

- add a token format acceptable to MCP
- define expiration and claim semantics

### 10.16 Deliverables for Phase 2

- authenticated HTTP boundary
- request context abstraction
- context-derived Envia client
- deprecated fallback for legacy `api_key`
- tests for HTTP auth path

### 10.17 Risks if Phase 2 is skipped

- the system remains permanently split-brained
- tools continue to own auth responsibilities
- later OAuth adoption becomes harder, not easier

---

## Phase 3: Remove `api_key` From Public Tool Contract and Add Capability-Based Authorization

### 10.18 Objective

Complete the migration so tools receive business arguments only and the server owns identity and permissions fully.

### 10.19 What Phase 3 is trying to solve

Remaining problem after Phase 2:

- even with HTTP auth in place, keeping `api_key` in schemas still normalizes the wrong contract

Phase 3 solves:

- final contract cleanliness
- public API coherence
- long-term maintainability
- stronger authorization model

### 10.20 Target behavior in Phase 3

Desired behavior:

- tools no longer accept `api_key`
- all auth comes from HTTP request context
- all authorization is enforced server-side
- docs/resources are generated from a single source of truth

### 10.21 Recommended authorization model in Phase 3

Introduce permissions/capabilities such as:

- `shipments.read`
- `shipments.write`
- `orders.read`
- `orders.write`
- `tickets.read`
- `tickets.write`
- `config.admin`

This lets the server differentiate between:

- safe reads
- destructive mutations
- account-sensitive admin actions

### 10.22 Recommended tooling model in Phase 3

Create a central tool registry definition.

Suggested conceptual structure:

```ts
type ToolDefinition = {
  name: string;
  domain: 'shipments' | 'orders' | 'tickets' | 'config';
  description: string;
  requiredPermission: string;
  register: (server: McpServer, deps: ToolDeps) => void;
}
```

Benefits:

- registration source of truth
- docs generation source of truth
- policy mapping source of truth
- easier audits

### 10.23 MCP resources strategy in Phase 3

Separate docs into:

- current resources
- internal docs
- legacy archived docs

Legacy documentation should either:

- not be registered as MCP resources
- or be explicitly marked as legacy and hidden from normal product use

### 10.24 Deliverables for Phase 3

- `api_key` removed from public tool schemas
- request-context-only auth model
- capability-based authorization
- centralized tool registry
- docs/resources generated from live registry
- legacy docs separated from active MCP resources

### 10.25 Risks if Phase 3 is skipped

- long-term contract ambiguity persists
- tools retain transport concerns
- doc drift continues
- permissioning remains too coarse

---

## 11. Why OAuth Was Considered, and Why It Is Not the Immediate First Move

OAuth was discussed during the conversation as a possible short-term evolution.

### 11.1 Why OAuth makes sense conceptually

OAuth becomes valuable when you need:

- delegated authorization
- scopes
- formal third-party integration model
- safer replacement for raw static keys
- better alignment with external consumers

### 11.2 Why OAuth is not the first move recommended here

Because the immediate architectural problem is not protocol choice alone.

The immediate problem is:

- where identity is resolved
- where trust enters the system
- where Envia credential selection happens

If those concerns remain tool-level, OAuth will not sufficiently simplify the system.

### 11.3 Recommended order of operations

1. Phase 1: platform-controlled key injection
2. Phase 2: HTTP auth + request context
3. Phase 3: remove `api_key` from tool contracts
4. After that, evaluate whether OAuth should replace or formalize the HTTP auth layer

### 11.4 Practical conclusion about OAuth

OAuth is a valid future direction.

But for this migration, it should be treated as:

- a likely later transport/auth standardization option

not as:

- the first and only architectural fix

---

## 12. Cross-Repo Research Plan for the Next Agent

The next project should analyze multiple repositories together. The following questions need verification outside this MCP repo.

### 12.1 Questions for the platform frontend repo

- Where does the embedded chat run?
- Does the frontend call the MCP directly or through a platform backend?
- Is the Envia credential ever visible in browser memory?
- Is there already a session token that can be reused for MCP auth?
- Can frontend be changed so the user never handles `api_key` directly?

### 12.2 Questions for the platform backend/orchestrator repo

- Does a backend already orchestrate tool calls for the chat agent?
- Can this layer inject Envia credentials centrally?
- Can this layer issue a token for the MCP HTTP service?
- Is tenant resolution already available there?
- Is there a permissions model that can map to MCP capabilities?

### 12.3 Questions for auth/session infrastructure

- What token format is already available?
- Are tokens user-level, company-level, or both?
- Which claims can the MCP rely on?
- How are expiration and revocation handled?

### 12.4 Questions for the `queries` backend

These are important to validate assumptions made by the MCP layer.

- Does `/generic-form` depend only on country, or also on tenant/account context?
- Are some config or catalog endpoints tenant-specific in subtle ways?
- Which endpoints are read-only vs account-mutating?
- Are there permission concepts already enforced that MCP should mirror?

### 12.5 Questions for the `carriers` backend

- Which endpoints are truly customer-account sensitive?
- Which operations are destructive or balance-impacting?
- Which endpoints require stronger permission segmentation?
- Are there hidden constraints that the MCP should validate earlier?

### 12.6 Questions for product/integration design

- Will the MCP HTTP server be internal-only, or eventually accessible by third parties?
- Will there be one global MCP server or tenant-aware deployment modes?
- Is the built-in chat UI a permanent feature or a dev/demo aid only?

---

## 13. Validation Checklist for the Next Agent

The next agent should validate the following with repo access across projects.

### 13.1 Authentication model checklist

- confirm whether platform backend already exists in the request path
- confirm whether frontend can be prevented from handling raw Envia credentials
- confirm where tenant identity is resolved today
- confirm whether `ENVIA_API_KEY` startup requirement is intended for production deployment model
- confirm whether there is already a candidate token/session for MCP HTTP auth

### 13.2 Tool contract checklist

- identify all tools currently exposing `api_key`
- group tools by read/write/admin sensitivity
- confirm which tools should lose `api_key` first
- confirm whether any external consumers depend on the current contract

### 13.3 Resource/documentation checklist

- inventory active MCP resources
- identify which ones are current vs legacy
- identify docs duplicated between README, resources, and code comments
- propose a generated-doc source of truth

### 13.4 Backend alignment checklist

- verify actual endpoint semantics in `queries`
- verify actual endpoint semantics in `carriers`
- confirm if MCP-side assumptions about required fields, statuses, and formats are fully accurate
- confirm if generic-form behavior is tenant-agnostic or tenant-aware

### 13.5 Security checklist

- verify whether any secret reaches browser runtime unnecessarily
- verify logging paths in platform repos
- verify whether direct third-party LLM browser calls are used in production
- verify whether auth failures leak sensitive context anywhere outside this repo

---

## 14. Recommended Deliverables for the Follow-Up Project

The new cross-repo project should aim to produce at least these outputs.

### 14.1 Architecture decision record

Decide and document:

- whether short-term target is single-tenant or tenant-aware HTTP service
- where auth lives
- where tenant resolution lives
- whether direct browser-to-LLM calls remain allowed in production

### 14.2 Request flow diagram

Document the exact trust path:

- customer
- frontend
- backend/orchestrator
- MCP server
- Envia backends

### 14.3 Secret handling policy

Document:

- where Envia credentials may exist
- where they must not exist
- how they are redacted
- how they rotate

### 14.4 Tool capability matrix

For each tool:

- domain
- read/write/admin classification
- current auth mode
- target auth mode
- required permission

### 14.5 Migration implementation plan

Produce a file-by-file plan across repos, including:

- frontend changes
- backend/orchestrator changes
- MCP changes
- backend dependency assumptions

---

## 15. Immediate Action Recommendations

These are the recommended immediate next actions before major refactoring begins.

### 15.1 In this MCP repo

- update/retire stale MCP resources
- revise docs to clarify current vs transitional auth expectations
- clearly mark built-in chat token paths as dev-only
- add a real ESLint flat config

### 15.2 In the new cross-repo project

- inspect platform frontend and backend request flow
- identify current credential injection point
- validate whether MCP can move to backend-controlled key injection first
- map all trust boundaries before discussing OAuth implementation details

### 15.3 On the strategic side

- decide whether the short-term product is:
  - internal HTTP service for Envia platform only
  - or a broader reusable MCP service intended for multiple external consumers

That decision will strongly affect whether OAuth is urgent or can wait until after Phases 1 and 2.

---

## 16. Final Conclusion

The MCP server is already substantial and useful. It is not a toy project, and it is not suffering from a general lack of engineering effort.

The central issue is that it is in the middle of an architectural migration:

- from IDE-oriented MCP behavior
- toward HTTP platform service behavior

That migration has not yet been fully completed in:

- authentication model
- tool contract surface
- documentation/resource strategy
- production posture

The correct next step is not a rewrite and not an immediate OAuth-first redesign.

The correct next step is:

- to align trust boundaries first
- to move control of credentials out of the model
- to move authentication into HTTP over time
- to remove secrets from public tool semantics once the platform path is ready

The 3-phase plan described in this document is designed to make that migration practical, low-risk, and compatible with a deeper follow-up analysis across repositories.

---

## 17. Appendix: High-Signal References for the Next Agent

### Current MCP server entrypoint and registration

- [src/index.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/index.ts:216)

### Current startup auth requirement

- [src/config.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/config.ts:49)

### Current public schema treatment of `api_key`

- [src/utils/schemas.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/utils/schemas.ts:38)

### Current active MCP resource definitions

- [src/resources/api-docs.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/resources/api-docs.ts:12)

### Current built-in browser chat client

- [src/chat/chat-client.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/chat-client.ts:245)
- [src/chat/index.html](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/chat/index.html:673)

### Current generic-form implementation

- [src/services/generic-form.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/services/generic-form.ts:133)
- [src/tools/create-label.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/src/tools/create-label.ts:893)

### Current verification evidence

- [package.json](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/package.json:35)
- [tests/integration/full-workflow.test.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/tests/integration/full-workflow.test.ts:1)
- [tests/security/auth-security.test.ts](/Users/josealbertovidrio/Documents/git_Proyects/envia-repos/ai-agent/envia-mcp-server/tests/security/auth-security.test.ts:1)
