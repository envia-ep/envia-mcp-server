# Accounts Service — Deep Reference Audit Prompt

> **Self-contained prompt.** Executable by Opus 4.7 (1M context).
> Goal: produce `_docs/ACCOUNTS_DEEP_REFERENCE.md` with mandatory
> sensitivity analysis. Inclusion in the MCP is undecided — this audit
> must produce evidence to support a decision.

## Step 0 — Read LESSONS.md (MANDATORY)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

End-to-end. Particularly relevant for accounts:
- **L-S2** Portal-embedded scope criterion.
- **L-S6** Don't expose admin/dev tools — accounts has many.
- **L-S7** Organizational ownership — verify accounts is under same vertical (assumed yes).
- **L-B1, L-B2** Auth verification — accounts is the auth source.
- **L-T4** Cross-check.
- **L-G1, L-G3** Clean tree, no push.
- **L-P1** Surface decisions; sensitivity analysis recommendations are not unilateral.

## Context — what accounts is

`services/accounts` (or `repos_extra/accounts`) is the **user/account management service** of the Envia ecosystem. It owns:

- User authentication (login, password, sessions).
- Token issuance (JWT, the V1/V2/V3 tokens validated by carriers' Guard.php).
- KYC / KYB intake (the customer side, not approval — approval is admon-monorepo).
- API key generation and rotation.
- 2FA / MFA.
- Multi-company switching.
- Permissions / roles (per company).
- Profile management (email, phone, locale).
- Account creation / signup.
- Password reset / email verification.
- Possibly: audit log of own actions.

**Critical sensitivity:** every endpoint in accounts handles either credentials, sessions, or PII. Even read-only endpoints need careful authorization audit. Per planning session 2026-04-17 (Decision E): Jose was **undecided** about including accounts in the MCP. This audit produces the evidence to decide.

## Mandatory reading order

1. `_docs/LESSONS.md` (Step 0).
2. **`_docs/CARRIERS_DEEP_REFERENCE.md` entirely** — depth bar, also §3 (Auth + Guard.php) for cross-reference of how carriers consumes accounts tokens.
3. `_docs/DECISIONS_2026_04_17.md` — Decision E noted accounts as undecided.
4. `_docs/ENDPOINT_AUDIT_BRIEF.md` §4.7 — accounts requires "Sensitivity Analysis" section.
5. `_docs/BACKEND_ROUTING_REFERENCE.md`.
6. `services/accounts/README.md` and `CLAUDE.md` if exist (or `repos_extra/accounts/`).
7. **No specific memory reference** — primary discovery from source.
8. `_docs/backend-reality-check/accounts-findings.md` in monorepo root if exists (Session A may have covered).
9. `_meta/analysis-accounts.md` if exists.
10. The MCP-side current consumers: `src/services/user-info.ts` in MCP repo (the JWT-payload-based balance/info read).

## Goal

Produce `_docs/ACCOUNTS_DEEP_REFERENCE.md`. Target: ~92-95% structural coverage. **1,500-2,200 lines**. 30-40 sections including the **mandatory Sensitivity Analysis section** with explicit Jose-ready recommendation: **include fully / include only Low-sensitivity subset / defer entirely**.

## Mandatory sections

### Part 1 — Architecture
1. Service identity (path, framework, file count).
2. Routes & endpoints inventory.
3. Authentication for incoming requests (the chicken-and-egg: how does accounts authenticate when it IS the auth source).
4. Token issuance vs. validation responsibilities.
5. Encryption / hashing patterns (passwords, tokens, API keys).

### Part 2 — Authentication endpoints
6. Signup / account creation.
7. Login (password-based).
8. Token issuance (JWT structure, claims, expiration).
9. Token refresh (if exists).
10. Logout / session termination.
11. Password reset flow.
12. Email verification.
13. 2FA / MFA (TOTP, SMS, recovery codes).
14. SSO if any.

### Part 3 — User and company management
15. Profile read/edit (email, phone, locale, name).
16. Company creation.
17. Multi-company support per user (the user→company mapping).
18. Company switching.
19. User invitation to company.
20. Role assignment within company.
21. User suspension / deactivation (customer-initiated vs admin-initiated).

### Part 4 — API keys and developer access
22. API key generation.
23. API key rotation.
24. API key listing (for the user's own keys only).
25. API key revocation.
26. OAuth scopes (if accounts is also an OAuth provider).

### Part 5 — KYC / KYB intake
27. Document upload.
28. Status tracking (pending, in-review, approved, rejected — but APPROVAL itself lives in admon-monorepo).
29. Required documents per country.

### Part 6 — Cross-service integration
30. carriers ← accounts (token validation flow — already documented in carriers §3.3).
31. queries ← accounts (similar).
32. admon-monorepo ↔ accounts (admin user provisioning, KYC approval workflows).
33. Federation / SSO between Envia services.

### Part 7 — Database
34. Tables (users, companies, access_tokens, api_keys, mfa_secrets, etc.).
35. Sensitive column identification (password hashes, MFA secrets, KYC docs).
36. Encryption-at-rest patterns.

### Part 8 — Sensitivity Analysis (MANDATORY — gate to decision)

For EVERY endpoint, classify:

| Sensitivity | Criterion |
|-------------|-----------|
| **High** | Returns or accepts credentials, session tokens, KYC docs, government IDs, full personal data, MFA secrets, password hashes |
| **Medium** | Returns personal data (email, phone, address) but NOT credentials |
| **Low** | Returns account metadata only (plan name, status, feature flags) |

For each endpoint:
- Endpoint method + path.
- Sensitivity classification.
- Justification.
- Whether it could be safely exposed via MCP under L-S2 + L-S6.
- Whether the endpoint requires the operating user to be the same as the affected user (self-only) or allows admin-on-behalf (cross-tenant risk).

**This is the section Jose will read first.**

### Part 9 — MCP integration analysis
37. Current MCP consumption (via `user-info.ts` getting balance from JWT payload).
38. Endpoints that pass L-S2 + L-S6 + Low-sensitivity test (likely small set).
39. Endpoints that pass L-S2 but are Medium-sensitivity (subject to decision).
40. Endpoints that should NEVER be exposed.

### Part 10 — Recommendation

A **single, clear recommendation** to Jose:

```
Recommendation for accounts inclusion in MCP v1:
  [ ] Include fully — N user-facing endpoints, all Low-sensitivity, pass L-S2+L-S6
  [ ] Include subset — only the M Low-sensitivity self-only read endpoints
  [ ] Defer entirely — sensitivity surface too high; revisit in v2 with auth hardening

Rationale: <data-driven justification>
Counts: # High / # Medium / # Low; # passing L-S2+L-S6
Counts: # cross-tenant-risk; # self-only-safe
```

### Part 11 — Honesty
41. Open questions for backend / security team.
42. Self-assessment.

## Methodology — non-negotiable

### Phase 1: Pre-existing knowledge

- Carriers' Guard.php logic (already documented) tells you HOW tokens are validated. Accounts tells you HOW they're issued.
- Cross-reference accounts' token issuance with carriers' validation to detect drift (e.g. carriers expects claim X, accounts doesn't issue it).

### Phase 2: Code map

```bash
find services/accounts -type f -name "*.js" -o -name "*.ts" 2>/dev/null | wc -l
# or if it's at repos_extra/accounts:
find repos_extra/accounts -type f -name "*.js" -o -name "*.ts" 2>/dev/null | wc -l
```

### Phase 3: Parallel deep-reads (with extra security focus)

Dispatch agents (`thoroughness: very thorough`):

| Agent | Domain |
|-------|--------|
| 1 | Auth endpoints (signup, login, token, refresh, logout) + JWT structure |
| 2 | Profile, company, multi-company switching, roles |
| 3 | API keys, 2FA, SSO |
| 4 | KYC / KYB intake (NOT approval) |
| 5 | DB schema with sensitive column identification |
| 6 | **Authorization audit** — sample 10 endpoints, verify they enforce self-only or admin-role properly |

Each agent's output must include the **per-endpoint sensitivity classification** required by Part 8.

### Phase 4: First synthesis (iter 1)

### Phase 5: Cross-check pass (iter 2 — MANDATORY, security-critical)

Per LESSON L-T4 + sensitivity:
- Spot-check 10 random endpoints' authorization (don't trust agent claims for security).
- Verify password hashing algorithm (must be bcrypt/argon2 — flag if MD5/SHA1).
- Verify MFA secret storage (must be encrypted at rest).
- Verify KYC document storage location and access controls.
- Cross-check token issuance → carriers' validation expectations.

### Phase 6: Iteration 2 expansion

### Phase 7: Iteration 3 finalization

- Aggregate sensitivity counts.
- Write final recommendation.
- Self-assessment.

### Phase 8: 3 incremental commits.

## Quality gates

- [ ] Every endpoint has sensitivity classification.
- [ ] Authorization audit performed on at least 10 endpoints; findings documented.
- [ ] Password hashing algorithm verified.
- [ ] MFA storage verified (encryption-at-rest).
- [ ] Token claims documented and cross-checked against carriers' Guard.php expectations.
- [ ] Recommendation in Part 10 is single, clear, evidence-backed.
- [ ] Cross-tenant risk endpoints identified explicitly.
- [ ] Final length 1,500-2,200 lines.

## What NOT to do

- **Do NOT recommend "include fully"** unless evidence shows ALL exposed endpoints pass L-S2 + L-S6 + Low-sensitivity. Default is "subset" or "defer".
- **Do NOT skip authorization audit.** Security-critical.
- **Do NOT trust agent claims about cross-tenant safety.** Verify in source.
- **Do NOT speculate on encryption.** Cite the actual library / algorithm in the code.
- **Do NOT suggest exposing KYC document endpoints.** Default ⚫ ADMIN-ONLY.
- **Do NOT suggest password change endpoint as MCP tool.** Even if "user can change own password" passes L-S2 superficially, the side effects (session invalidation, security alerts) make it inappropriate for chat.
- **Do NOT push to remote.**

## Specific honesty traps

1. **"This endpoint is self-only because it returns the authenticated user's data"** — verify the controller actually constrains to `req.user.id` and doesn't accept a `user_id` query param that could be tampered with.
2. **"API key generation is customer-facing"** — it is, BUT exposing it via MCP creates risk: the agent could mistakenly generate keys when the user didn't intend, or the conversation log could leak the new key. Default: defer or require explicit confirmation flow.
3. **"Multi-company switching is customer-facing"** — yes, but the agent's session is bound to a specific company. Switching mid-conversation has confusing UX. Recommend: not exposing this; let the user switch in the portal first.
4. **"Login endpoint is customer-facing"** — the user is ALREADY logged in if they're using the agent. Don't propose login as a tool. ⚫.
5. **"Get my profile is Low-sensitivity"** — verify what the response includes. If it includes phone, full address, KYC status, it's Medium at minimum.

## Deliverable

`_docs/ACCOUNTS_DEEP_REFERENCE.md` — 1,500-2,200 lines, 30-40 sections, 3 iterations, mandatory Sensitivity Analysis section, single clear recommendation in Part 10.

## Handoff at end

1. Final line count and section count.
2. Total endpoint count.
3. Sensitivity breakdown: # High / # Medium / # Low.
4. Authorization audit findings (any concerns).
5. **The recommendation** — single sentence + rationale.
6. Cross-tenant risk endpoints.
7. Token claim drift findings (accounts vs carriers expectations).
8. Open questions for security/backend team.
9. Recommendation for next session.

## Out of scope for this session

- Carriers / queries / geocodes / ecommerce / admin-monorepo (separate prompts).
- ecart-payment (LESSON L-S7).
- Implementing new MCP tools.
- Auth hardening of the MCP itself (Sprint 4).
- Code changes.
- Push to remote.

Good luck. Sensitivity audit is the highest-stakes work in this batch — be conservative. When in doubt, mark High and defer.
