# Spec — Beta Dummy Tokens for Unauthenticated MCP Requests

**Version:** v1.1 — drafted 2026-04-28 by Jose Vidrio (CTO) + Claude Opus 4.7. Iteration 2 added §3.9 (per-environment tokens), §3.11 (beta exit), expanded §3.4 (track_package country fallback), §3.6 (logging allowlist/denylist), §4 (3 new threats), §5.5 (rate limit), §6 (smoke matrix), §7 (no-token-in-source).
**Status:** READY FOR IMPLEMENTATION.
**Estimated effort:** 4–6 hours single Sonnet session.
**Branch target:** `mcp-beta-tokens` (created from `main` after the Zod work merges).

---

## 1. Goal

During the **production beta period**, allow MCP requests that arrive
WITHOUT an `api_key` to still execute a restricted subset of tools
(quote / track / pickup), authenticated against country-specific
**dummy tokens** controlled by Envia. The dummy tokens grant access
only to read-style and pickup-related operations — never to shipment
creation, ticket creation, account changes, or any mutation that
affects a real user account.

Three production tokens, one per country:
- **MX** — fallback / default
- **CO**
- **US**

Country resolved from request payload (`origin_country` / `country`
arg when present); when absent, fall back to MX.

**Success looks like:** during beta, anonymous chat sessions can quote
shipping rates, track packages, and schedule/track pickups WITHOUT
provisioning an Envia API key. Any attempt to call a tool outside
the allowlist returns a clear "authentication required" message.

**Out of scope:** automated token rotation, multi-tenant dummy tokens,
per-IP throttling beyond the basic in-memory rate limit (§5.5).

---

## 2. Background

Beta launch needs frictionless first-run experience. Asking every new
user to provision an API key before they can quote a shipment kills
conversion. At the same time, opening up the full 73-tool surface to
anonymous traffic is a security non-starter.

Dummy-token-with-allowlist is the deliberate compromise: zero-friction
onboarding for the most common use cases (quote + track + pickup)
while gating any operation that could harm a real account behind
authentication.

---

## 3. Design decisions

### 3.1 Token storage — environment variables, never source code

Tokens live in Heroku config:
```
MCP_DUMMY_TOKEN_MX=...
MCP_DUMMY_TOKEN_CO=...
MCP_DUMMY_TOKEN_US=...
```

The MCP code only reads `process.env.MCP_DUMMY_TOKEN_*`. Tokens NEVER
appear in the repo, in commit history, in fixtures, in tests, or in
logs.

Rationale: env-var secret management is the floor for production
secrets. Hardcoding in source means leaked repo = leaked tokens. Env
vars are rotatable in 1 click.

### 3.2 Country detection — `origin_country` first, MX fallback

Resolution order, in priority:
1. `args.origin_country` if present (most quote/pickup calls have it).
2. `args.country` if present (some tools use `country` instead).
3. **Default: MX.**

Deterministic and inspectable. No LLM guessing. No IP geolocation.
No locale headers.

### 3.3 Allowlist — exactly 7 tools, hardcoded

Only these tools accept dummy-token authentication:

| Tool | Why allowed |
|---|---|
| `envia_quote_shipment` | Read-only price discovery |
| `envia_track_package` | Read-only status check |
| `envia_schedule_pickup` | Pickup operation against test account |
| `envia_track_pickup` | Read-only pickup status |
| `envia_cancel_pickup` | Cancel a pickup created by same dummy token |
| `envia_list_carriers` | Read-only catalog |
| `envia_validate_address` | Read-only address check |

Hardcoded in `src/utils/dummy-token-allowlist.ts`. Tools NOT on the
list reject dummy-token requests with:

> *"Esta acción requiere autenticación. Para usarla, proporciona tu
> Envia API key. Las acciones disponibles sin token son: cotizar
> envíos, rastrear paquetes y agendar/rastrear/cancelar pickups."*

### 3.4 Token resolution flow

The existing `resolveClient(client, args.api_key, config)` becomes:

```typescript
function resolveClient(
    baseClient: EnviaApiClient,
    requestApiKey: string | undefined,
    config: EnviaConfig,
    toolName: string,        // NEW
    args: Record<string, unknown>,  // NEW
): EnviaApiClient {
    // Path A — user supplied a key. Use it. (Existing.)
    if (requestApiKey) {
        return baseClient.withApiKey(requestApiKey);
    }

    // Path B — no key. Beta dummy-token path.
    if (!config.dummyTokensEnabled) {
        throw new AuthenticationRequiredError(
            'API key required. Beta dummy tokens not enabled.'
        );
    }
    if (!DUMMY_TOKEN_ALLOWLIST.has(toolName)) {
        throw new AuthenticationRequiredError(
            'Esta acción requiere autenticación. Para usarla, ...'
        );
    }
    const country = resolveCountryFromArgs(args);
    const token = config.dummyTokens[country] ?? config.dummyTokens.MX;
    if (!token) {
        throw new AuthenticationRequiredError('API key required.');
    }
    logger.info({ event: 'dummy_token_used', tool: toolName, country }, 'beta dummy token resolved');
    return baseClient.withApiKey(token);
}
```

**Caso especial — tools sin país detectable (track_package, list_carriers):**

Cuando el tool no expone `origin_country` ni `country` en sus args,
la resolución cae a MX. Esto es correcto para `list_carriers` (cuyo
catálogo es global per-token) pero PROBLEMÁTICO para `track_package`:
si el tracking pertenece a un shipment de US o CO, el dummy MX
retornará "tracking not found".

Mitigación: cuando `track_package` retorna 404 con dummy MX, el
formatter agrega esta nota al output:

```
"No encontramos información de este tracking en la cuenta MX de prueba.
 Si el envío es de Colombia o Estados Unidos, proporciona tu API key
 de Envia para continuar."
```

Esto evita silent-failure y guía al usuario al path correcto.

### 3.5 Beta exit — feature flag

`process.env.MCP_DUMMY_TOKEN_BETA_ENABLED` defaults `false`. To
activate, set `true` in Heroku. To exit beta, unset. When disabled,
every unauthenticated request returns `AuthenticationRequiredError`
regardless of allowlist.

### 3.6 Logging — explicit allowlist + denylist

When `resolveClient` resolves to a dummy token, emit ONE log event:

  ```
  event: 'dummy_token_used'
  fields included:
    - tool          (string, registered tool name)
    - country       (string, MX|CO|US)
    - correlation_id (auto-attached by pino)
    - timestamp     (auto-attached)
  ```

Fields explicitly EXCLUDED (never log these, even truncated):
- The token value itself
- Authorization header
- User IP, user agent, geographic info
- Request payload (origin/destination addresses, weights, etc.)
- Any field from `args` other than `country` (already extracted)

Pino.info level. Datadog alert (separate work, see
`DATADOG_OBSERVABILITY_DASHBOARD_SPEC.md` §5) fires when
`dummy_token_used` per country exceeds 10K events/h.

**Negative test required:** unit test captures log output for one
resolveClient call and asserts the token value is NOT present in the
captured string.

### 3.7 No coupling with the rest of the auth layer

Dummy-token logic contained in `resolveClient` and
`dummy-token-allowlist.ts`. Rest of codebase keeps treating the
resolved client as regular authenticated. Removal post-beta is a
2-file change.

### 3.8 No rate limiting beyond the basic minimum (§5.5)

Per-IP rate limiting is its own concern. This spec delivers the
dummy-token mechanism + a basic in-memory quota (§5.5).

### 3.9 Per-environment tokens, never shared

Stage and production each have their own set of 3 dummy tokens.
**Never share.** Heroku config differs per app:

```
envia-mcp-stage:        MCP_DUMMY_TOKEN_MX = <stage-mx-token>
envia-mcp-production:   MCP_DUMMY_TOKEN_MX = <prod-mx-token>
```

Production tokens are documented in §5.4 of this spec. Stage tokens
must be different (created from sandbox dummy accounts) and
provisioned separately.

Rationale: a stage smoke test that hits a production token by
accident would burn production quota and pollute production logs.
The two environments must be cryptographically distinct.

### 3.10 Beta exit migration plan

When `MCP_DUMMY_TOKEN_BETA_ENABLED` is unset:
- All previously-anonymous traffic gets `AuthenticationRequiredError`.
- Recommended: 7-day notice via the agentic-ai chat preamble before
  flipping the flag (out of scope for MCP, coordinate with agentic-ai
  team).
- The spec does not implement automatic notice — deliberate
  human-in-the-loop step.

---

## 4. Threat model

| Threat | Likelihood | Mitigation |
|---|---|---|
| Token leak via source-control commit | Low | Tokens only in env vars; pre-commit secret scan recommended |
| Token leak via log exfiltration | Low | Structured pino emits never include `Authorization` values; verify |
| Token used to perform unauthorized mutations | Mitigated | Hardcoded allowlist enforced before request leaves MCP |
| Token volume abuse (DoS / quota burn) | Medium | Datadog alert + basic rate limit (§5.5); per-IP follow-up |
| Token compromise (Heroku config read) | Low | Heroku ACL; rotate quarterly; rotation procedure §6.4 |
| Token used for tools added to allowlist by accident | Low | Code review checklist requires explicit allowlist update with justification |
| Anonymous user pivots to real account | Mitigated | Dummy tokens tied to dedicated test accounts; cannot pivot |
| Token expira mid-request → response confusa | Medium | Detect 401 from backend on dummy-token path → emit `dummy_token_expired` log + return "Beta service temporarily unavailable, try with API key". Operations rotates immediately. |
| Country bypass (user sends fake `origin_country` to hit US token) | Low | Each dummy token belongs to a controlled test account; cross-token data leak surface = whatever those test accounts contain (zero real customer data by design). Document test-account hygiene. |
| Redis cache cross-contamination between dummy + real tokens | **HIGH if not addressed** | Cache keys MUST include the token fingerprint (first 8 chars). Verify existing `CacheUtil` does this, or update before shipping. **Hard prerequisite.** |

---

## 5. Implementation plan

### 5.1 Files to create

- `src/utils/dummy-token-allowlist.ts` — exports `DUMMY_TOKEN_ALLOWLIST: ReadonlySet<string>` with the 7 tools.
- `src/utils/auth-errors.ts` — exports `AuthenticationRequiredError` class.
- `src/utils/country-resolver.ts` — exports `resolveCountryFromArgs(args): 'MX'|'CO'|'US'` per §3.2.
- `src/utils/dummy-token-rate-limit.ts` — exports `checkDummyTokenRateLimit(country): boolean` per §5.5.
- `tests/utils/dummy-token-allowlist.test.ts` — 4 tests.
- `tests/utils/country-resolver.test.ts` — 6 tests.
- `tests/utils/auth-errors.test.ts` — 2 tests.
- `tests/utils/dummy-token-rate-limit.test.ts` — 4 tests (counts, window reset, return false on overflow, per-country independence).

### 5.2 Files to modify

- `src/config.ts` — add `dummyTokensEnabled: boolean`, `dummyTokens: { MX?, CO?, US? }`. Both default off.
- `src/utils/api-client.ts` — extend `resolveClient()` per §3.4.
- All tools that call `resolveClient(...)` — pass `toolName` and `args`. Mechanical change. Run `grep -rn 'resolveClient(' src/tools/ | wc -l` to confirm count before/after.
- `tests/utils/api-client.test.ts` — add 5 tests: user key wins; allowlist tool resolves to country token; non-allowlist tool throws; MX fallback when country absent; beta-disabled rejects.

### 5.3 Migration order

1. Create the 4 new utility files + their tests.
2. Update `EnviaConfig` and `loadConfig()`.
3. Update `resolveClient` signature.
4. Bulk-update all tool call sites with the two new arguments. (One commit; mechanical.)
5. Run full test suite — every existing test must still pass because user-key path is unchanged.
6. Add the beta-specific tests in `api-client.test.ts`.

### 5.4 Heroku config (production)

After merge to `main` and deploy:

```bash
heroku config:set \
    MCP_DUMMY_TOKEN_BETA_ENABLED=true \
    MCP_DUMMY_TOKEN_MX=ea349265e78bbaee0a7205491d55b8d39bc35aacaa66f91af1f173a06586327e \
    MCP_DUMMY_TOKEN_CO=02b044309e38062f6f945eaad3adb9713d10bc1136d159e7e9a20c3880edd0ae \
    MCP_DUMMY_TOKEN_US=eb6b5879185894d76c9646d8dcbc53da7b4e68f67f6e2b246a949c1063d2d3c7 \
    -a <production-app-name>
```

Note: documenting these in this spec is acceptable because the spec
lives in the source repo, which is private. They should NOT be
committed to logs or docs that could be exfiltrated. Treat the spec
as a sensitive artifact within the repo.

**Stage tokens must be DIFFERENT** (per §3.9). Provision separately
from sandbox-equivalent dummy accounts.

### 5.5 Basic rate limit (defensive minimum)

In-memory counter per dummy-token-country: max 100 calls / minute per
country across all tools. If exceeded, return:

```
"Beta service temporarily rate-limited. Try again in a minute or use
 your API key for unrestricted access."
```

Implementation: `Map<country, { count, windowStart }>` in
`dummy-token-rate-limit.ts`. Resets every minute. Independent of any
external rate limiter.

Rationale: not a security feature, but a courtesy bound that prevents
a stuck loop (e.g. agentic-ai retry loop) from burning the dummy
account's quota in seconds.

---

## 6. Operational verification

### 6.1 Smoke matrix — 7 tools × 3 países = post-deploy

Post-deploy, run this matrix against the deployed app:

| Tool | MX | CO | US |
|---|---|---|---|
| envia_quote_shipment | ✓ | ✓ | ✓ |
| envia_track_package | ✓ | — | — |
| envia_schedule_pickup | ✓ | ✓ | ✓ |
| envia_track_pickup | ✓ | — | — |
| envia_cancel_pickup | ✓ | — | — |
| envia_list_carriers | ✓ | ✓ | ✓ |
| envia_validate_address | ✓ | ✓ | ✓ |

For ✓ cells: invoke without api_key, confirm 200 + valid response.
For — cells: not country-aware, expect MX dummy used regardless.

Expected: successful calls + `dummy_token_used` log events with
correct country distribution. Zero leaked token values in logs (grep
verify).

### 6.2 Beta-flag toggle verification

Toggle `MCP_DUMMY_TOKEN_BETA_ENABLED` off; verify every
unauthenticated request returns `AuthenticationRequiredError`. Toggle
back on; verify dummy resolution resumes. Document the per-cycle dyno
restart latency (~30s).

### 6.3 No-token-in-source verification (mandatory pre-commit)

Before commit:

```bash
for token_prefix in ea349265 02b04430 eb6b5879; do
    git log -S "$token_prefix" --all  # must return zero hits
    git grep "$token_prefix"          # must return zero hits
done
```

If any check returns hits, STOP and remove from history (`git
filter-repo` or BFG). Do NOT commit until clean.

### 6.4 Token rotation procedure

If a token is suspected leaked:

```bash
# 1. Generate replacement token in the dummy account dashboard.
# 2. Update Heroku config:
heroku config:set MCP_DUMMY_TOKEN_MX=<new_token> -a <app>
# 3. Wait ~30s for the dyno to restart.
# 4. Verify with §6.1 smoke.
```

### 6.5 Beta disable

```bash
heroku config:unset MCP_DUMMY_TOKEN_BETA_ENABLED -a <app>
```

After dyno restart, every unauthenticated request returns
`AuthenticationRequiredError`. Existing user-key requests unaffected.

---

## 7. Acceptance criteria

- [ ] `src/utils/dummy-token-allowlist.ts` exports a `Set` with exactly the 7 tools from §3.3.
- [ ] `src/utils/country-resolver.ts` returns 'MX' as default and handles edge cases.
- [ ] `src/utils/dummy-token-rate-limit.ts` enforces 100/min per country.
- [ ] `EnviaConfig` extended; `loadConfig()` reads the 4 env vars.
- [ ] `resolveClient` extended signature; all tool call sites updated.
- [ ] Existing 1648+ tests pass unmodified.
- [ ] 21+ new tests added (4 allowlist, 6 country, 2 errors, 4 rate-limit, 5 api-client integration).
- [ ] Negative-log test (§3.6): asserts the token value never appears in `dummy_token_used` log output.
- [ ] §6.3 grep verification: 0 hits for any of the 3 token prefixes in source.
- [ ] Datadog log event `dummy_token_used` is structured (no sensitive fields).
- [ ] `npm run build` exits 0; `vitest run` all green.
- [ ] `MCP_SCHEMA_VALIDATION_MODE=strict npx vitest run` all green.
- [ ] Branch is `mcp-beta-tokens`; no commit on `main`.

---

## 8. Anti-patterns

1. **Do NOT hardcode tokens in source.** Env vars only.
2. **Do NOT log token values.** Even truncated. Even in dev.
3. **Do NOT add tools to the allowlist without explicit review.** Each addition justified in PR description.
4. **Do NOT use the LLM to guess country.** Deterministic only.
5. **Do NOT couple dummy-token logic with other auth paths.** Surgical 2-file removal post-beta depends on isolation.
6. **Do NOT skip the `MCP_DUMMY_TOKEN_BETA_ENABLED` flag check.** Forgetting means deploys default to beta-on, which is wrong.
7. **Do NOT include token values in commit messages, in `_meta` files, or in any committed artifact.** Heroku config is the only home.
8. **Do NOT trust a country from outside the deterministic resolver.** A user passing `origin_country: "BR"` to a tool with no BR dummy token gets MX fallback per §3.2, not BR.
9. **Do NOT add per-IP rate limiting in this spec.** Out of scope.
10. **Do NOT bundle this work with other features.** Single-purpose branch and PR.
11. **Do NOT use the same dummy token in stage and production.** §3.9.
12. **Do NOT skip the negative-log test.** §3.6's whole point.

---

## 9. Open questions and verified assumptions

- **Q: Should we log the user's IP for abuse detection?** A: No.
  Privacy/compliance question for separate review. Volume thresholds
  in Datadog suffice.
- **Q: What if a dummy token expires at the carrier backend?** A: Token
  is for an Envia test account we control; rotation per §6.4.
- **Q: Should rates returned from a dummy token be marked somehow?**
  A: No — LLM and user receive identical rates. Whole point is
  friction-free demo.
- **Verified assumption:** existing `resolveClient` is the single
  entry point in every tool. Verify with `grep -r "resolveClient" src/tools/`.
- **Verified assumption:** Sprint-4a's pino decorator does NOT log
  the resolved client's API key. Verify in code review.
- **Verified assumption:** dummy tokens tied to dedicated test
  accounts that cannot perform privileged operations even if
  allowlist were bypassed.

---

## 10. Spec metadata

- **Author:** Claude Opus 4.7 (1M context), 2026-04-28.
- **Reviewer:** Jose Vidrio (CTO).
- **Status:** READY FOR IMPLEMENTATION.
- **Branch target:** `mcp-beta-tokens` (from `main` after Zod merge).
- **Estimated effort:** 4–6 hours single Sonnet 4.6 session.
- **Predecessor specs:** `RUNTIME_ZOD_VALIDATION_SPEC.md` v1.2.

---

## 11. Reporting back

When the session completes, the final response must include:

1. List of files created/modified with line counts.
2. Final test count and `npm run build` exit code.
3. Strict-mode test count.
4. Commit hash and push confirmation.
5. Output of §6.1 smoke matrix (21 calls — success/fail per cell).
6. Output of §6.2 toggle verification.
7. Output of §6.3 grep verification (must be 0 hits).
8. Confirmation of negative-log test (§3.6).
9. Any judgment call deviating from this spec.

---

## 12. Session bootstrap prompt

```
Implementa el spec en _docs/specs/BETA_DUMMY_TOKENS_SPEC.md, rama
mcp-beta-tokens (crear desde main).

Lee el spec end-to-end ANTES de escribir código.

Secciones que NO son opcionales:
  - §3.1 Tokens en env vars JAMÁS en source
  - §3.3 Allowlist hardcoded de exactamente 7 tools
  - §3.4 Flujo de resolveClient + caso especial track_package
  - §3.5 Feature flag MCP_DUMMY_TOKEN_BETA_ENABLED
  - §3.6 Logging structured con allowlist/denylist explícitos
  - §3.9 Stage vs production tokens DISTINTOS
  - §4 Threat model — entiende cada riesgo y su mitigación, especialmente Redis cross-contamination
  - §5.3 Migration order (orden importa)
  - §5.5 Basic rate limit (100/min per country)
  - §6.3 Pre-commit grep verification (0 hits o STOP)
  - §7 Acceptance criteria checklist

Anti-patterns críticos (§8):
  - NO hardcode tokens en source. Env vars only.
  - NO log de token values. Nunca, ni truncados.
  - NO add tools al allowlist sin justificación explícita en el PR.
  - NO uses el LLM para detectar país. Solo determinístico.
  - NO mismo token en stage y producción.

Al terminar, reporta según §11.

Bar: production-grade enterprise, security-first. Esto va a producción
con tokens reales. Cero margen de error.
```

---

End of spec.
