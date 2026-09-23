# Decisions

Architectural decisions that are not obvious from the code. Newest first.

## 2026-09-22 — A refused tool call answers 200 with a tool-level challenge, not 401

**Context.** The ChatGPT listing review asked protected tools to challenge for
OAuth, and the transport gate was built to return 401 with `WWW-Authenticate`.
The Apps SDK auth documentation is explicit that ChatGPT opens its sign-in
prompt on a 200 result carrying `isError` and `_meta["mcp/www_authenticate"]`;
a bare transport 401 on `tools/call` does not. Claude works the other way round.

**Decision.** A refused `tools/call` returns HTTP 200 with the tool-level
envelope *and* the `WWW-Authenticate` header on the same response. Every other
refused method keeps returning 401. Discovery is unaffected: clients still find
the authorization server through protected-resource metadata, and an expired
access token still gets a 401 from the bearer middleware.

**Consequence.** Verify in ChatGPT developer mode before each resubmit — this is
the one behaviour where the documentation and the reviewer's own wording pull in
different directions, and it fails after consent, which is the expensive place.

## 2026-09-22 — `securitySchemes` is copied to the top level of each tools/list entry

**Context.** The MCP SDK builds each `tools/list` entry from a fixed field list
and drops unknown keys, so the `securitySchemes` passed to `registerTool` only
survived inside `_meta`. Measured against a running server: 0 of 72 tools
advertised it at the top level, which is where ChatGPT reads it — and "tools
must declare securitySchemes" was one of the three listing rejections.

**Decision.** `publishToolSecuritySchemes` wraps the SDK's `tools/list` handler
after registration and copies `_meta.securitySchemes` up. It throws at startup
if the SDK has no handler to wrap, so an SDK upgrade that changes this fails
loudly instead of silently shipping a catalog without the field.

## 2026-09-22 — A Bearer token without JWT shape is ignored, not rejected

**Context.** Any non-JWT `Authorization` header made every method on the
connection return 401, `initialize` and public tools included. agentic-ai reacts
to a 401 by reconnecting with a legacy shared token and latches that mode at
module scope, so a single such response would have taken the support channel
down with the portal until the next deploy.

**Decision.** Verify only tokens that could plausibly be MCP access tokens.
Anything else is ignored and the request continues anonymously — it never
authenticates, and the protected-tool gate still challenges.
