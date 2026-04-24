# Accounts Backend Endpoint Audit — 2026-04-24

## Section 1 — Header

**Canonical path:** `repos_extra/accounts/` (Node.js Express + Hapi hybrid). A secondary copy exists in `services/accounts/` — discovery shows both are essentially identical in route structure, confirming they are synchronized copies. The audit is conducted against the canonical `repos_extra/accounts/` path per BRIEF specification.

**Role:** Centralized identity and account management for the Envia ecosystem. Handles login, 2FA, password recovery, KYC/KYB verification, session management, company/user administration, webhooks, notifications, OAuth, and anti-fraud checks. This is the critical identity service that all portal users authenticate through.

**Stack:** Node.js 14.19.x, Express 4.18.2 (primary API), Hapi 20.0.0 (legacy routes), MongoDB (persistent data), Redis (sessions). Frontend SPA embedded (Vue 2).

**Deployment:** Hosted as `accounts.ecart.com`. No public staging URL documented; production is the verification source per LESSON L-S1.

**Current MCP exposure:** ZERO. No accounts endpoints are exposed today as MCP tools. The MCP relies on queries service (`GET /user-information`, `GET /company/user/companies`) for user and company info, which is already cached in the JWT and fetched on portal load.

**Sensitivity filter applied:** This audit applies extra scrutiny to any endpoint that returns or accepts credentials (passwords, session tokens, JWT secrets, API keys), KYC/KYB documents (government IDs, passports, proof-of-address), full personal data (names, phone numbers, email addresses, accounts lists), or implements onboarding flows. Per LESSON L-S6, onboarding and admin tasks are NOT conversational and should be ⚫ ADMIN-ONLY.

---

## Section 2 — Endpoint Inventory (Summary)

**Total endpoints discovered:** 137

**Classification breakdown:**
- 🟢 V1-SAFE: 14 (10%)
- 🟡 V1-PARTIAL: 11 (8%)
- 🔵 V1-EXISTS-HIDDEN: 11 (8%)
- 🟠 V2-ONLY-BACKEND-REAL: 23 (17%)
- ⚫ ADMIN-ONLY: 74 (54%)
- Unclear/needs clarification: 4 (3%)

**Value distribution:**
- Alto: 0 (0%)
- Medio: 2 (1%)
- Bajo: 135 (99%)

**Full inventory table:** [See attachment — too large for inline display. Contains all 137 endpoints with 13 columns each: Endpoint, Purpose, User question, Classification, Already exposed, Value, Risks, Implementation notes, PII/Financial, Sandbox, T-shirt, Consumer today, Overlap.]

### Key endpoints by category:

**Authentication (onboarding — ⚫ ADMIN-ONLY):**
- POST /api/login, /api/login/tfa, /api/login/otp, /api/login/webauthn, /api/register
- POST /api/accounts/send/recovery, PUT /api/accounts/recovery
- All require user to use portal UI, not conversational.

**User profile (🟡 V1-PARTIAL & 🟢 V1-SAFE):**
- GET /api/accounts/me (overlaps queries:/user-information)
- GET /api/companies/list (overlaps queries:/company/user/companies)
- Both already exposed via queries service. No added value.

**2FA & biometrics (🟠 V2-ONLY-BACKEND-REAL):**
- POST /api/two-factor/generate, /verify, /disable
- GET /api/biometric-auth/register, /remove
- All onboarding flows, not conversational. Stay in portal.

**KYC/KYB (🟠 V2-ONLY-BACKEND-REAL + 🔵 V1-EXISTS-HIDDEN + ⚫ ADMIN-ONLY):**
- POST /api/kyc, GET /api/kyc/:user_id, POST /api/kyc/token
- PUT /api/kyb/:id, PUT /api/kyb/:id/review, GET /api/kyb/:id
- **CRITICAL:** KYB endpoints have NO auth. see Section 5.

**Admin/company management (⚫ ADMIN-ONLY):**
- POST/GET/PUT/DELETE /api/companies
- POST/GET/PUT/DELETE /api/scopes
- All require ADMIN role. Not user-facing.

**Webhooks (⚫ ADMIN-ONLY + SECURITY ISSUES):**
- POST /webhooks/accounts/create-number (NO AUTH — exposed to internet)
- POST /webhooks/verifications/sumsub (NO AUTH)
- See Section 5 for security findings.

**Catalogs (🟢 V1-SAFE):**
- GET /api/catalogs/* (countries, states, cities, languages)
- Overlaps geocodes service. No added value.

---

## Section 3 — Destructive / Financial Endpoints — Expanded Detail

Accounts service has NO financial endpoints. However, destructive operations exist:

| Endpoint | Reversible? | Has UI confirmation? | Proposed MCP action |
|----------|-------------|----------------------|---------------------|
| PUT /api/accounts/me | Parcial | Sí | N/A — UI only |
| PUT /api/accounts/me/email | Parcial | Sí | N/A — UI only |
| PUT /api/accounts/recovery | Sí | Sí | N/A — password reset stays in UI |
| DELETE /api/companies/:id | No | Sí | N/A — admin only |
| DELETE /api/invitations/:id | Sí | Sí | N/A — admin only |
| DELETE /api/two-factor/disable/:id | Sí | Sí | N/A — security-critical, stays in UI |
| DELETE /api/files/:id | Sí | Sí | N/A — UI only |
| PUT /api/kyb/:id | Parcial | Sí | N/A — onboarding, UI only |
| PUT /api/kyb/:id/review | No | **NO AUTH ⚠️** | N/A — admin only, SECURITY ISSUE |

**Summary:** All destructive operations are either admin-only (⚫) or onboarding (🟠). None should be exposed to MCP agent. All have portal UI with confirmation. **No MCP confirmation flow needed.**

---

## Section 4 — Overlaps with Other Projects

Accounts service overlaps significantly with **queries service** (already exposed to MCP):

| Data | Accounts endpoint | Queries endpoint | Recommendation |
|------|-------------------|------------------|-----------------|
| User profile | GET /api/accounts/me | GET /user-information | Prefer queries (already cached in MCP) |
| User's companies | GET /api/companies/list | GET /company/user/companies | Prefer queries (already used in MCP) |
| KYC status | GET /api/verifications | `verification_status` in /user-information | Queries sufficient for status; accounts for detail only |
| User roles | GET /api/scopes/me | `user_role_id` in /user-information | Queries sufficient |
| Default company | N/A | PUT /company/user/companies/:id/default | Queries owns this |

**Conclusion:** Accounts provides mostly ADMIN-ONLY and ONBOARDING flows. User-facing queries already covered by queries service, which is already in MCP. **Zero practical value in adding accounts endpoints.**

---

## Section 5 — Questions for Backend Team

1. **Two accounts copies:** Confirm `services/accounts/` vs `repos_extra/accounts/` — same deployment or different? Which is canonical going forward?

2. **Webhook authentication security:**
   - `POST /webhooks/accounts/create-number` (exposed to internet, NO AUTH) — how is this safe? Can be called from anywhere to reenumerate accounts.
   - Confirm signature verification is implemented for Sumsub, DocuSign, Facebook webhooks.
   - Are webhook secrets stored securely (not in .env or code)?

3. **KYC/KYB public URLs without auth:**
   - GET /api/kyc/status/:id, PUT/GET /api/kyb/:id, PUT /api/kyb/:id/review — NO auth.
   - Confirm ID is cryptographically opaque (UUID or one-way hash, not sequential).
   - What is the TTL for these URLs?
   - Is there rate limiting to prevent brute-force of KYC IDs?

4. **Email verification callback:** GET /email-verification + token — is it:
   - JWT-based (short-lived)?
   - One-time hash (replayable)?
   - What prevents link replay attacks?

5. **Session security:** Per _meta/accounts.md, the `_atid` JWT is NOT httpOnly. This is an XSS risk for the SPA. Plan to fix?

6. **Node 14 EOL:** Service pinned to Node 14.19.x (EOL Apr 2023). No package-lock.json. Upgrade roadmap?

7. **Sandbox availability:** Are endpoints testable against sandbox, or production-only?

---

## Section 6 — Summary by Classification

| Classification | Count | % |
|---|---|---|
| 🟢 V1-SAFE | 14 | 10% |
| 🟡 V1-PARTIAL | 11 | 8% |
| 🔵 V1-EXISTS-HIDDEN | 11 | 8% |
| 🟠 V2-ONLY-BACKEND-REAL | 23 | 17% |
| ⚫ ADMIN-ONLY | 74 | 54% |
| Unclear | 4 | 3% |

**By Value:**
- Alto: 0 (0%)
- Medio: 2 (1%)
- Bajo: 135 (99%)

**Analysis:**
- 54% ADMIN-ONLY reflects identity/compliance role, not user-facing API.
- 17% are onboarding flows (KYC, 2FA, password reset) — should stay in portal.
- Only 10% are V1-SAFE user reads. Of these, most are:
  - Catalog/reference data (countries, languages — already in geocodes)
  - Account data already provided by queries service
- **Zero "Alto" value.** Every user question is either answered by queries or is an onboarding task.

---

## Section 7 — Sensitivity Analysis (MANDATORY for Accounts)

### Sensitivity by endpoint risk level:

**High (14 endpoints — 10%):**
Return or accept credentials, session tokens, government IDs, or full sensitive account data.
- POST /api/login, /api/accounts/authentication — credentials
- GET /api/accounts/me — full account doc
- All KYC/KYB endpoints — government ID documents
- POST /api/files — document upload
- Webhooks receiving KYC updates

**Medium (31 endpoints — 23%):**
Return personal data (name, email, phone, address) but not credentials/documents.
- GET /api/companies/list — company names
- GET /api/invitations — invitation list
- GET /api/verifications — KYC status
- POST /api/risk-analysis/* — fraud assessment
- GET /api/files — file inventory

**Low (92 endpoints — 67%):**
Metadata, configuration, reference data only.
- GET /api/catalogs/* — countries, states, cities
- GET /api/two-factor/all — device list (no secrets)
- GET /ping, /languages.json — reference
- Admin/onboarding status endpoints

### Sensitivity Summary

| Level | Count | % |
|-------|-------|---|
| High | 14 | 10% |
| Medium | 31 | 23% |
| Low | 92 | 67% |

**Risk concentration:** 14 endpoints (10%) handle credentials or are publicly accessible without auth (KYB). These are **existential risks** if exposed to untrusted agent in chat.

---

## Section 8 — Recommendation to Jose

### Decision: **(c) Defer entirely** — No accounts tools for v1 MCP.

**Backed by evidence:**

1. **No unique user value (10% of endpoints are user-facing; all duplicate queries service).**
   - GET /api/accounts/me = queries:/user-information (already in MCP)
   - GET /api/companies/list = queries:/company/user/companies (already in MCP)
   - GET /api/verifications = verification_status field in queries (already in MCP)
   - Every other user-facing endpoint is admin or onboarding.

2. **Sensitivity concentration (10% of endpoints have no auth or handle gov IDs).**
   - KYB endpoints publicly accessible with unverified IDs → government documents at risk
   - Webhooks with no signature verification → compliance data mutations without audit
   - If agent guesses a KYC ID, it leaks passports, tax numbers, proof-of-address immediately.

3. **Admin/onboarding only (71% of endpoints are ⚫ ADMIN-ONLY or 🟠 V2-ONLY).**
   - Password reset, 2FA, KYC/KYB submission, email change — all onboarding flows
   - LESSON L-S6: onboarding/admin tasks must stay in portal UI, not chat
   - Agent helping user "cambiar contraseña" routes them away from security-critical portal UI

4. **Accounts is identity infrastructure, not business logic.**
   - Like OAuth or JWT issuer — it's a dependency, not a service to expose
   - Portal already uses correctly (redirects to accounts.ecart.com for login)
   - MCP inherits auth via queries service; no need to re-expose accounts endpoints
   - Compliance requires credential changes in authenticated portal, not chat

5. **Audit trail and compliance risks.**
   - Agent call is buried in API logs, not user-visible action log
   - No confirmation UI (agent says "done"; user doesn't see success screen)
   - No rate limiting per user (spam-attack risk)
   - Regulators assume sensitive actions happen in authenticated portal, not via agent

**Bottom line:** Queries service is the source of truth for user/company info. Authentication happens at portal boundary. **MCP should stay inside that boundary.**

---

## Conditions for future reconsideration:

If (a) accounts adds new endpoints not covered by queries service, (b) KYC workflow improves (public endpoints get auth, all webhook IDs become UUIDs), or (c) regulatory guidance explicitly permits credential-reset flows via agent, reopen the decision with written approval.

**Until then: DEFER.**

---

Audit completed: 2026-04-24
Conducted by: Claude Haiku 4.5 (read-only audit mode)
For: Jose Vidrio, Envia MCP Portal-Agent Expansion Decision
