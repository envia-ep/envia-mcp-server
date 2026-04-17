# Sprint 3 — Error-map enrichment + first staging deploy + textResponse migration

> **Self-contained prompt.** Executable by Sonnet 4.6. Covers everything needed
> without prior session context.
>
> **Model:** Sonnet 4.6 recommended (execution against a detailed prompt).

## Step 0 — Read LESSONS.md before anything else (MANDATORY)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

This file encodes every user correction from prior sessions with patterns
and preventive rules. Read it end-to-end before touching anything. Pay
special attention to:

- **L-S1** V1 production is the source of truth, not V2 in construction.
- **L-S2** Portal-embedded MCP — no multi-tenant infra work.
- **L-C2** Graceful degradation over preventive validation.
- **L-C3** `textResponse()` always; no raw `{ content: [...] }`.
- **L-B1 / L-B2** Verify against real API responses; auth-verification gates before code.
- **L-G1** Clean tree before starting.
- **L-G3** Never push without explicit instruction.

If you skip Step 0 you will almost certainly repeat a mistake Jose has
already paid for.

## Context

`envia-mcp-server` is a scoped MCP server embedded in the Envia portal. It
exposes tools a portal user asks conversationally: quote, create label,
track, cancel, pickups, tickets, orders, account info, etc.

**Scope criterion:** include a tool only if a typical portal user would
ask for it in chat. Admin/dev tasks stay out.

**State after Sprint 2 (commit `0b7da49` on `main`, local only):**
- 72 user-facing tools + 5 internal helpers
- 1369 tests passing, 103 test files, TypeScript build clean
- Working tree clean

Sprint 2 delivered `envia_check_balance` (reuses user-information), a
deploy checklist, and documented the ecart-payment JWT blocker. The
planning session (2026-04-17) captured decisions A–E in
`_docs/DECISIONS_2026_04_17.md`:

- **A:** ecart-payment integration → **deferred** to v2 of the agent.
- **B:** Sprint 3 = this prompt.
- **C:** First deploy targets **staging only** inside this sprint.
- **D:** Observability → deferred to Sprint 4.
- **E:** v1 scope locked at 72 tools — **no new user-facing tools in Sprint 3**.

## Sprint 3 goals (in priority order)

### Goal 1 — Secondary-carrier error-map enrichment (small, user-visible)

Add actionable error translations for secondary carriers based on
`_docs/backend-reality-check/secondary-carriers-findings.md`. Goal:
when these backend error patterns appear, the user sees a clear,
accionable message instead of a raw carrier string.

**File:** `src/utils/error-mapper.ts`

**Entries to add (all are message-pattern matches, not new numeric codes):**

| Carrier | Trigger pattern | Mapped user-facing message |
|---------|-----------------|----------------------------|
| AmPm | error code `260` or `102154` (no-coverage codes per findings) | "AmPm no tiene cobertura para esta ruta. Prueba otra paquetería o valida origen/destino." |
| Entrega | backend returns track-limit exceeded | "Entrega alcanzó el límite de rastreos contratados para tu cuenta. Contacta soporte para ampliarlo." |
| JTExpress | BR missing ICMS / state pair invalid | "JTExpress Brasil requiere cálculo de ICMS para este par de estados. Verifica origen, destino y valor declarado." |
| TresGuerras | response contains `ESTADO_TALON=CANCELADO` | "El envío ya fue cancelado en TresGuerras. No es necesario cancelarlo de nuevo." |
| Afimex | insurance request > 10,000 | "Afimex tiene un tope de seguro de $10,000. Reduce el valor asegurado o elige otra paquetería." |

**Implementation notes:**
- Each entry is a new case inside `mapCarrierError(...)` or its supporting
  pattern-match helper. Follow the existing pattern for DHL/FedEx/UPS/etc.
- DO NOT change existing entries; only add.
- Pattern matching must be narrow enough to avoid false positives (use
  carrier hint + message substring, never just substring alone).
- Prefer `includes(...)` on canonical substrings over regex unless regex
  is necessary for robustness.

**Tests:**
- One test per new entry in `tests/utils/error-mapper.test.ts` (or the
  closest existing location).
- AAA pattern, one logical assertion per test, descriptive naming.
- Assert both: (a) the mapped message string and (b) that unrelated
  errors with similar substrings are NOT matched (false-positive guard).

**Exit criteria:** 5 new entries, 10 new tests (5 happy + 5 negative
false-positive guards), all green.

### Goal 2 — Smoke-test playbook + first staging deploy

The MCP has never been deployed. Decisions captured in
`_docs/DECISIONS_2026_04_17.md` authorize a staging-only first deploy.

#### Sub-goal 2a — Smoke-test playbook

Create `_docs/SMOKE_TEST_PLAYBOOK.md` with a repeatable end-to-end sequence
that can be run manually from a terminal using `curl` against the deployed
MCP (or via the MCP inspector). Include:

1. **Pre-flight**: env-var verification commands
   (`heroku config -a <app>` or equivalent).
2. **Happy-path sequence** against sandbox:
   - `envia_quote_shipment` → MX-MX, parcel, real origin+destination zip.
   - `envia_create_label` → pick the first rate, create the label.
   - `envia_track_package` → use the tracking number from create_label.
   - `envia_cancel_shipment` → cancel the freshly-created label.
   - `envia_check_balance` → verify balance query works.
3. **Error-path sequence** (at least one): invalid zip → expect a mapped
   error message, not a raw carrier string.
4. **Expected response fingerprints**: key fields that MUST be present in
   each response (tracking_number, total, status, etc.) so a diff vs this
   doc catches regressions.
5. **Rollback steps** if any step fails (heroku rollback, revert commit,
   etc.).

Keep it boringly explicit — copy-pasteable commands with placeholders.

#### Sub-goal 2b — Deploy-checklist cross-check

Before attempting deploy, validate against `_docs/DEPLOY_CHECKLIST.md`:

- `ENVIA_API_KEY` set and correct for sandbox environment.
- `ENVIA_ENVIRONMENT=sandbox`.
- `ENVIA_ECART_HOSTNAME=https://ecart-api-test.ecartapi.com` (per checklist).
- Build clean, full suite green.
- `Procfile` present: `web: node dist/index.js`.

If `Procfile` is missing, create it. If any env var is absent, surface to
Jose — do NOT invent values.

#### Sub-goal 2c — First staging deploy (execute)

**IMPORTANT:** Only execute if Jose has confirmed the target Heroku app
name (or equivalent). If he has NOT, STOP at the end of 2b and ask.

Steps (once target is confirmed):
1. `git push` the local `main` branch to the app remote (Jose will
   authorize this push — do NOT push without explicit approval per
   LESSONS L-G3).
2. Tail the deploy logs; surface any failure and halt.
3. Once boot succeeds, execute the smoke playbook from 2a.
4. Document the outcome in a new `_docs/DEPLOY_LOG_2026_04_17.md` with:
   - Timestamp, target URL, deploy commit SHA.
   - Playbook step-by-step results (PASS/FAIL + notes).
   - Any unexpected error strings.

**Exit criteria:** either a green smoke run on staging (go-criteria from
Decision C all satisfied), or a clean documented rollback with root cause.

### Goal 3 — textResponse() migration + ESLint guard (small, internal)

LESSON L-C3: all tool handlers must return via `textResponse(...)`. ~6
tools still use the raw `{ content: [{ type: 'text', ... }] }` shape.

#### Sub-goal 3a — find and migrate

Find offenders:
```bash
grep -rn "content: \[\s*{\s*type: 'text'" src/tools/ --include="*.ts"
```

For each:
- Replace the raw return with `textResponse(...)` (import from
  `src/utils/mcp-response.ts`).
- Update the corresponding test files if they assert on the raw shape.
  Prefer asserting on the string content, not the envelope shape.

#### Sub-goal 3b — ESLint rule to prevent regression

Add to the project's ESLint config (locate via `ls eslint.config.* .eslintrc.*`):

```js
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "ObjectExpression:has(Property[key.name='content'] > ArrayExpression > ObjectExpression:has(Property[key.name='type'][value.value='text']))",
        message: "Use textResponse() from src/utils/mcp-response.ts instead of returning raw { content: [{ type: 'text', ... }] }.",
      },
    ],
  },
}
```

If the exact selector above doesn't match due to parser limitations,
fall back to a regex-based rule via `eslint-plugin-custom` or a simpler
pattern rule — any mechanism that fails the lint if the raw shape
reappears is acceptable.

Run `npx eslint src/` and fix any remaining violations. Run `npm run build`
and `npx vitest run` after the migration — must stay green.

**Exit criteria:** zero `grep` hits for the raw pattern in `src/tools/`.
ESLint rule active and blocks the pattern on a contrived test file (add
and delete a temp file to confirm). Tests green.

## What NOT to do in Sprint 3

Carry-overs from Sprint 0/1/2 + new exclusions from Decisions A–E:

- **Do NOT add new user-facing tools.** v1 scope is locked at 72 (Decision E).
- **Do NOT implement ecart-payment tools** — Decision A = defer.
- **Do NOT work on observability** (pino, correlation IDs, metrics) — Decision D defers to Sprint 4.
- **Do NOT deploy to production.** Staging only this sprint (Decision C).
- **Do NOT refactor typed payloads** (111 `Record<string, unknown>`) — deferred, no evidence of user impact.
- **Do NOT introduce a tool-registry refactor** — deferred.
- **Do NOT implement LTL tools or extend `validateAddress` with carrier constraints** — V5 says defer.
- **Do NOT re-enable tools dropped in Sprint 0** (webhook CRUD, checkout-rules CRUD, `track_authenticated`, `whatsapp_cod` toggle).
- **Do NOT introduce new `any` types** (LESSONS L-C1).
- **Do NOT push to remote** until Jose explicitly approves (LESSONS L-G3).
- **Do NOT write tests with control flow** (LESSONS L-T2).

## Required reading (after Step 0, in order)

1. Step 0's `LESSONS.md` — already mandatory.
2. This file.
3. `ai-agent/envia-mcp-server/_docs/DECISIONS_2026_04_17.md` — decisions that define this sprint.
4. `ai-agent/envia-mcp-server/_docs/VERIFICATIONS_2026_04_17.md` — evidence behind the decisions.
5. `ai-agent/envia-mcp-server/_docs/DEPLOY_CHECKLIST.md` — env vars + URLs.
6. `ai-agent/envia-mcp-server/_docs/backend-reality-check/secondary-carriers-findings.md` — source for Goal 1 entries.
7. `ai-agent/envia-mcp-server/CLAUDE.md` — coding conventions.
8. `ai-agent/envia-mcp-server/src/utils/error-mapper.ts` — reference for existing pattern entries.
9. `ai-agent/envia-mcp-server/src/utils/mcp-response.ts` — reference for `textResponse`.
10. Existing test file that covers error-mapper (find with `grep -l "error-mapper\|mapCarrierError" tests/`).

## Conventions (from `ai-agent/envia-mcp-server/CLAUDE.md`)

- Single quotes, 4 spaces, semicolons, 130 char width, trailing commas (ES5).
- kebab-case files, camelCase functions/variables, PascalCase types.
- JSDoc on every function and interface. English everywhere.
- Vitest 3.x, AAA pattern, one logical assertion per test.
- No control flow in tests (no `if`/`for`/`try`). Use
  `await expect(...).rejects.toThrow(...)` for error paths.
- Graceful degradation for backend failures (return `ok: false`, don't throw).
- `textResponse(...)` from `src/utils/mcp-response.ts` for all tool responses.
- `mapCarrierError(code, message)` for all backend errors.
- `resolveClient(client, args.api_key, config)` for per-request auth.
- No new `any` types. Use narrow `unknown` + type guards if needed.

## Sandbox credentials

```
TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
QUERIES="https://queries-test.envia.com"
CARRIERS="https://api-test.envia.com"
GEOCODES="https://geocodes.envia.com"          # production only — no sandbox
ECART_API_SANDBOX="https://ecart-api-test.ecartapi.com"
```

## How to work

1. **Clean tree** (LESSON L-G1): `cd ai-agent/envia-mcp-server && git status --short` — should be empty. If not, surface before starting.
2. Baseline: `npm run build && npx vitest run` — confirm 1369/1369.
3. Goal 1 first (smallest, foundation for error-message hygiene tested during deploy).
4. Goal 2 second (playbook + staging deploy).
5. Goal 3 last (internal cleanup).
6. After each sub-goal: `npm run build && npx vitest run` — must stay green.
7. When all goals complete:
   - Update `memory/project_mcp_expansion_plan.md` with Sprint 3 status.
   - Update `MCP_REMAINING_PHASES_GUIDE.md` with Sprint 3 status + Sprint 4 preview (observability).
   - `git status --short`, propose commit message following the format in
     LESSONS L-G2 (Summary line `feat: Sprint 3 — ...`, body sections
     `## Implemented`, `## Deferred`, `## Quality`).
   - **Wait for Jose's explicit approval before committing.**

## Exit criteria for Sprint 3

- Goal 1: 5 new error-map entries + 10 new tests (5 happy + 5 negative). Build + full suite green.
- Goal 2: `SMOKE_TEST_PLAYBOOK.md` exists; staging deploy executed AND playbook passes (or a clean rollback is documented in `DEPLOY_LOG_2026_04_17.md`).
- Goal 3: 6 tools migrated to `textResponse()`; ESLint rule active; zero `grep` hits for raw pattern in `src/tools/`; tests green.
- Target test count after Sprint 3: ≥ 1379 (1369 + 10 error-map tests).
- Tool count unchanged: still 72 user-facing + 5 internal helpers (Decision E scope fence).
- Deploy outcome documented either way.

## Sprint 4 preview (for context only, do NOT implement)

Once Sprint 3's staging deploy stabilizes (≥ 1 week observed):

1. Observability layer (Decision D): pino + correlation IDs, structured logs per tool, basic call/error metrics.
2. Production deploy: promote from staging once metrics show no surprise.
3. Typed payloads refactor (prioritize hot-path tools only, based on actual traffic).
4. Tool-registry pattern rollout.
5. Ecart-payment revisit only if real user demand shows in logs.

Good luck. Jose (jose.vidrio@envia.com) is the decision-maker on deploy
targets, auth conflicts, and push approvals. Surface blockers fast;
document and defer over guessing.
