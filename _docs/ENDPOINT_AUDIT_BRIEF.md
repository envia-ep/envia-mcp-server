# Endpoint Audit Brief — Portal-Agent MCP Expansion

> **Purpose:** Produce a rigorous, per-project inventory of backend
> endpoints across the Envia ecosystem, classified and scored so Jose
> can make per-endpoint inclusion decisions for the next wave of
> conversational tools in the portal-embedded MCP agent.
>
> **This is an audit session, not an execution session.** Output is
> markdown documents + structured matrices + clarification questions —
> no code.
>
> **Recommended model:** Opus 4.7 (1M context). Strategic synthesis
> across 7 backends, ~300-500 endpoints total.

## 1. Why this audit now

### 1.1 Current state (2026-04-17)

- MCP is portal-embedded, deployed to Heroku staging (release v9,
  commit `2c3c885`). See `_docs/DEPLOY_LOG_2026_04_17.md`.
- 72 user-facing tools registered; 1379 tests passing.
- Decisions A-E captured 2026-04-17 locked v1 scope at 72 tools.

### 1.2 CEO-level scope expansion (2026-04-XX, this session)

Jose received a directive from the CEO: the portal agent must be able
to answer **any** question an authenticated customer asks about
envia.com — shipping core, analytics, reporting, account info, carrier
rules, service availability, country-specific rules, support, billing,
ecommerce orders, and more.

**Critical clarification (do not lose):** the **deployment model does
not change**. The MCP remains portal-embedded and is consumed only by
the in-portal agent for authenticated users. LESSON L-S2
("portal-embedded, not multi-tenant public") still applies. What
changes is the **ambition of the scope inside that model** — more
tools, but still filtered by "would a typical authenticated portal
user ask this in chat?"

### 1.3 Why an audit before any new tool

LESSON L-P4 resists scope creep without evidence. LESSON L-S1 demands
V1 production as source of truth. LESSON L-B1 requires verified API
responses. Adding tools blind would:

- Expose admin/dev endpoints by accident (L-S6).
- Duplicate backends (queries and ecart-payment both do some auth, for
  example).
- Miss gaps in already-exposed tools (e.g. `envia_list_orders` loses
  11 V4 fields, documented but unfixed).
- Produce tools that look useful but have no real user demand signal.

The audit is the mechanism to answer "what should we include" with
evidence instead of intuition.

## 2. Scope — 7 projects

Audit covers endpoints exposed by these backends. For each, produce
one audit document.

| # | Project | Location in monorepo | Known coverage |
|---|---------|----------------------|----------------|
| 1 | **carriers** | `services/carriers/` (PHP/Lumen 8.x) | Reference doc: `memory/reference_carriers_architecture.md`. Tools today: ~19. `_meta/analysis-carriers-*.md` in the monorepo. |
| 2 | **queries** | `services/queries/` (Node/Hapi) | Reference doc: `memory/reference_queries_architecture.md`. Tools today: ~50. `_meta/analysis-queries*.md`. |
| 3 | **geocodes** | `services/geocodes/` (Node) | Helpers only (`getAddressRequirements`, `resolveDaneCode`, `getBrazilIcms`) + partial `envia_validate_address`. `_docs/BACKEND_ROUTING_REFERENCE.md` section 2.3. |
| 4 | **ecommerce** + **eshops** + **ecartApiOauth** | `services/ecommerce/`, `services/eshops/`, `services/ecartApiOauth/` | Reference: `memory/discovery_ecommerce_backend.md`. MCP consumes one route only (`POST /tmp-fulfillment/...`) as internal side-effect. |
| 5 | **admin-monorepo** | `admon-monorepo/` | No prior analysis in MCP repo. **Primary discovery needed.** Scope: ops/admin backend that operations team uses. |
| 6 | **ecart-payment** | `repos_extra/ecart-payment/` | Partial analysis: `_docs/backend-reality-check/ecart-payment-findings.md`. 5 tools deferred due to JWT blocker (Decision A). |
| 7 | **accounts** | `repos_extra/accounts/` | **Sensitivity case.** This project handles credentials, sessions, KYC, user management. Jose is undecided about inclusion — the audit must produce enough evidence to decide. Treat with higher scrutiny. |

### 2.1 Explicitly OUT of scope

- **envia (legacy PHP 7)** + **envia-php8**: being deprecated, flows
  migrating to the 7 projects above.
- **fulfillment-api** and **fulfillment-warehouse-api**: independent
  portals, no integration planned short-term.
- **sockets**: WebSocket broadcaster, not HTTP endpoints.
- **Frontends** (envia-clients, envia-partners, envia-fulfillment,
  fulfillment-warehouse, envia-landing): no backend endpoints to expose.
- **tms-admin**: per Session B findings, it's a React admin SPA (no
  backend to expose).
- **AI / MCP repos themselves** (agentic-ai, envia-mcp-server).

### 2.2 What counts as an "endpoint"

Include:

- ✅ Public HTTP routes (authenticated or not).
- ✅ Internal service-to-service HTTP routes that expose a distinct
  capability (e.g. `POST /tmp-fulfillment/:shop/:order`).
- ✅ Routes that appear in the service's router with a handler.

Exclude:

- ❌ Internal functions without an HTTP route.
- ❌ Direct DB queries performed by the MCP.
- ❌ CLI commands, cron jobs, queue workers.
- ❌ WebSocket event types (handled via `sockets`, out of scope).

## 3. Deliverables

Produce a single directory `_docs/ENDPOINT_AUDIT_2026_04_XX/` (replace
`XX` with the actual day of execution) containing:

```
_docs/ENDPOINT_AUDIT_2026_04_XX/
  MASTER_SUMMARY.md        ← Executive view for decision-making
  carriers-audit.md
  queries-audit.md
  geocodes-audit.md
  ecommerce-audit.md       ← covers ecommerce + eshops + ecartApiOauth
  admin-audit.md
  ecart-payment-audit.md
  accounts-audit.md        ← includes sensitivity analysis section
```

## 4. Audit document format (per project)

Each audit doc must contain these sections in order.

### 4.1 Header

- One-paragraph description of the project's purpose and role in the
  Envia ecosystem (cite the reference doc used).
- Deployment status (prod URL, staging URL if exists, language/stack).
- Current MCP exposure (how many tools today point here, list them by
  name if ≤10).

### 4.2 Endpoint inventory table

A table with **one row per endpoint**, 13 columns:

| # | Column | Format | Example |
|---|--------|--------|---------|
| 1 | **Endpoint** | `METHOD /path` | `POST /ship/rate` |
| 2 | **Purpose (1 line)** | Plain English, present tense | "Returns carrier rates for a given route and package dims." |
| 3 | **User question it enables** | Quoted Spanish or English question a customer might ask in chat. One per endpoint; the most natural one. If none plausible → "N/A — admin/internal". | `"¿Cuánto me cuesta mandar X a Y?"` |
| 4 | **Classification** | One of: 🟢 V1-SAFE, 🟡 V1-PARTIAL, 🔵 V1-EXISTS-HIDDEN, 🟠 V2-ONLY-BACKEND-REAL, ⚫ ADMIN-ONLY, 🟣 INTERNAL-HELPER | See definitions below (§5). |
| 5 | **Already exposed?** | Tool name if yes, `❌` if no | `envia_quote_shipment` |
| 6 | **Value** | Alto / Medio / Bajo | See rubric §6. |
| 7 | **Risks** | Comma-separated flags from the risk vocabulary (§7). Leave blank if none. | `destructive, financial-impact, needs-confirmation` |
| 8 | **Implementation notes** | One line: auth special, pagination quirks, sandbox issues, rate limits, etc. | "Hits ecart-pay-api with Basic auth over keys" |
| 9 | **PII/Financial** | `Sí` / `No` | `Sí` |
| 10 | **Sandbox** | `Sí` / `No` / `Solo prod` | `Sí` |
| 11 | **T-shirt** | `XS` / `S` / `M` / `L` | See rubric §6. |
| 12 | **Consumer today** | `UI portal` / `UI admin` / `service-to-service` / `public API` / `unknown` / comma-sep if multiple | `UI portal, service-to-service (queries)` |
| 13 | **Overlap** | `↔ <project>:<endpoint>` if this endpoint duplicates another. Empty otherwise. | `↔ queries:GET /rates` |

Render as a GitHub-flavored markdown table. Wide tables are acceptable
— this is a reference document, not prose.

### 4.3 Destructive / financial endpoints — expanded detail

List endpoints with risks `destructive`, `financial-impact`, or
`needs-confirmation`. For each add these fields:

- Reversible? (Sí / No / Parcial)
- Has UI confirmation today? (Sí / No / N/A)
- Impacts billing? (Sí / No)
- Proposed MCP confirmation flow if exposed (e.g. "require `confirm: true` param + echo back the action before executing")

### 4.4 Overlaps with other projects

List detected duplications. Two endpoints overlap when they answer the
same user question or expose the same data. Format:

```
- This project's `POST /X` overlaps with queries' `GET /Y`
  - Recommendation: prefer queries, retire X
```

### 4.5 Questions for backend team

Explicit list of items the audit could NOT resolve and need
clarification from the team that owns the service.

Format:

```
- **Endpoint:** POST /ship/foo
  **Question:** Is this a mutation? The route file lacks a body schema
  and the handler delegates to a service class we couldn't read.
  **Blocks:** inclusion decision.
```

### 4.6 Summary by classification (bottom of doc)

Tally of endpoints by classification and value so the reader gets a
headline without scrolling. Example:

```
Total: 87
  🟢 V1-SAFE:              34  (39%)
  🟡 V1-PARTIAL:            8  (9%)
  🔵 V1-EXISTS-HIDDEN:      2  (2%)
  🟠 V2-ONLY-BACKEND-REAL: 12 (14%)
  ⚫ ADMIN-ONLY:           25 (29%)
  🟣 INTERNAL-HELPER:       6  (7%)

By value:
  Alto:  21
  Medio: 43
  Bajo:  23
```

### 4.7 Accounts-audit.md additional section — Sensitivity Analysis

Required ONLY for `accounts-audit.md`. For each endpoint, rate
information sensitivity:

| Sensitivity | Criterion |
|-------------|-----------|
| **High** | Endpoint returns or accepts credentials, session tokens, KYC docs, government IDs, full personal data. |
| **Medium** | Returns personal data (email, phone, address) but not credentials. |
| **Low** | Returns account metadata only (plan, status, feature flags). |

Plus a final written recommendation to Jose: "Based on sensitivity
distribution, my recommendation for accounts is: (a) include fully,
(b) include only the Low-sensitivity subset, (c) defer entirely until
we have auth hardening". Back the recommendation with the numbers.

## 5. Classification labels (source: V1_SAFE_TOOL_INVENTORY.md)

- 🟢 **V1-SAFE** — Endpoint exists in V1 production. Response is
  functional. Ready to expose as a user-facing tool.
- 🟡 **V1-PARTIAL** — Endpoint exists in V1 but has known limitations
  (partial response, sandbox bug, needs workaround). Usable with
  caveats.
- 🔵 **V1-EXISTS-HIDDEN** — Endpoint exists in V1 but there is NO
  user-facing UI for it. Case-by-case decision (could be B2B /
  integrator-only, could be a gap).
- 🟠 **V2-ONLY-BACKEND-REAL** — Portal V2 exposes UI for this;
  underlying backend is real and functional. Can include if the V2 UI
  is stable.
- ⚫ **ADMIN-ONLY** — Ops / internal / dev / onboarding. Not a
  conversational user action. Exclude from LLM-visible tools per
  LESSON L-S6.
- 🟣 **INTERNAL-HELPER** — The MCP uses this internally to build
  responses but does not expose it as a tool (e.g. DANE code resolver,
  generic-form fetcher).

## 6. Value rubric + T-shirt rubric

### Value

Apply the "typical portal user asks this in chat?" test:

- **Alto:** Customer-facing question that is frequent AND not answered
  by the current 72 tools. Clear gap.
- **Medio:** Plausible question but either infrequent OR partially
  covered by an existing tool (e.g. adding 3 new fields to an existing
  list).
- **Bajo:** Improbable conversational question, admin-tinted, or
  redundant with something already well-covered.

### T-shirt effort (to implement as a new MCP tool, once decided)

- **XS** — Copy an existing tool template, change URL + Zod schema.
  <1 hour.
- **S** — Simple GET with straightforward response formatting. 1-2h.
- **M** — Requires a new service file, multi-call flow, or
  country-specific handling. 2-4h.
- **L** — Complex mutation with confirmation, multi-step
  orchestration, new auth dance, or large type surface. 4-8h.

## 7. Risk vocabulary (controlled list)

Use only these flags in the Risks column. If you find a new one,
document it in the Questions for backend section and coordinate
before inventing.

- `destructive` — deletes or permanently alters data (delete address,
  remove user, cancel subscription).
- `financial-impact` — charges, refunds, withdrawals, COD settlement.
- `needs-confirmation` — should require explicit user confirmation in
  chat before executing (side effects not obvious from natural
  language).
- `requires-kyc` — only usable if the company has KYC status
  completed.
- `pii-exposure` — returns information that classifies as PII
  beyond what the user is asking about.
- `cross-tenant-risk` — endpoint accepts an ID that could reference
  another tenant; backend filtering must be verified.
- `admin-dependency` — requires admin/ops role to succeed.
- `deprecated-backend` — backend has marked this as deprecated /
  migration path announced.
- `sandbox-broken` — works in prod, broken in sandbox (not uncommon).
- `no-auth-enforcement` — endpoint is publicly reachable without token.

Multiple flags comma-separated.

## 8. Seed list of user questions (apply filter consistently)

The CEO's vision described the full space. Audit should rate "value"
against the likelihood the endpoint helps answer one of these
questions or a close variant:

### Core operational

- "¿Cuánto me cuesta mandar de X a Y?"
- "Crea la etiqueta con la paquetería más barata."
- "Cancela el envío con tracking Z."
- "¿Dónde va mi paquete con tracking Z?"
- "Agenda una recolección para mañana."
- "Dame mi manifesto del día."

### Reporting / analytics

- "¿Cuánto facturé en envíos este mes?"
- "¿Cuál es mi carrier con peor desempeño?"
- "¿Cuántos sobrecargos acumulé?"
- "¿Cuál es mi tasa de entrega exitosa?"
- "¿Cuáles son mis top 10 destinos?"

### Account / billing

- "¿Cuál es mi saldo actual?"
- "¿Cuál es mi plan y cuánto llevo gastado?"
- "¿Quién es mi salesman asignado?"
- "¿Mi empresa tiene KYC completo?"
- "Dame mi última factura."

### Configuration

- "¿Qué paqueterías tengo activas?"
- "Agrega una dirección de origen nueva."
- "Elimina un paquete guardado de mi inventario."
- "Cambia los datos de mi cliente frecuente."

### Additional services / rules

- "¿Qué servicios adicionales ofrece DHL en MX?"
- "¿Qué paqueterías cubren el CP 11001?"
- "¿Qué reglas aplican para enviar a Brasil?"
- "¿Qué es ICMS y cuánto me van a cobrar?"
- "¿Necesito algún documento especial para enviar a USA?"

### Ecommerce operations

- "¿Cuántas órdenes pendientes tengo de Shopify?"
- "Genera etiqueta para la orden #1234."
- "Imprime el packing slip de las órdenes de hoy."
- "¿Qué órdenes tienen fraud-risk alto?"

### Support

- "¿Cómo va mi ticket de soporte #5678?"
- "Abre un ticket por el envío Z que no llegó."
- "Califica mi último ticket cerrado."

### Customer service

- "¿Cuáles son mis clientes frecuentes?"
- "¿Qué productos tengo dados de alta?"
- "Muéstrame mi directorio de direcciones."

If an endpoint does not credibly fit into any of these (or a close
variant), its value is likely Bajo or the endpoint should be
ADMIN-ONLY.

## 9. Methodology

### 9.1 Start from existing analyses (DO NOT rediscover)

For projects that already have documentation, read it FIRST:

| Project | Pre-existing sources to read |
|---------|------------------------------|
| carriers | `memory/reference_carriers_architecture.md`; `_meta/analysis-carriers-*.md` (monorepo root); `_docs/backend-reality-check/carriers-top-5-findings.md` (MCP repo); `_docs/V1_SAFE_TOOL_INVENTORY.md` (tools already exposed). |
| queries | `memory/reference_queries_architecture.md`; `_meta/analysis-queries*.md`; `_docs/backend-reality-check/queries-inventory-findings.md`. |
| geocodes | `_meta/analysis-geocodes.md` (if exists); `memory/reference_country_address_rules.md`; `_docs/backend-reality-check/geocodes-findings.md`; `src/services/geocodes-helpers.ts` (internal consumer). |
| ecommerce (+eshops+ecartApiOauth) | `memory/discovery_ecommerce_backend.md`; `_meta/analysis-ecommerce*.md`; `_docs/backend-reality-check/ecommerce-eshops-findings.md`. |
| admin-monorepo | No prior analysis. **Primary discovery** via `admon-monorepo/` routes. |
| ecart-payment | `_docs/backend-reality-check/ecart-payment-findings.md`; `_docs/SPRINT_2_BLOCKERS.md`. |
| accounts | `_docs/backend-reality-check/accounts-findings.md` (if exists in monorepo root); `repos_extra/accounts/` source. |

### 9.2 Gap-fill with primary discovery

For endpoints not covered in prior docs (or projects with no prior
docs):

- Read the service's route files (`routes/*.js`, `routes/*.ts`, Lumen
  `routes/api.php`, etc.).
- Read the handler / controller to understand response shape and
  mutation semantics.
- Cross-check against Joi / Zod / FormRequest validation for the
  accepted payload shape.
- Never infer a number (limit, factor, timeout). When a specific value
  matters, cite the source file and line (LESSON L-S4).

### 9.3 Verification

For any high-value candidate (🟢 V1-SAFE + Alto), attempt a single
curl against sandbox to confirm the endpoint responds as expected.
Document the response shape shortcode in the Implementation notes.

Skip verification if:

- Endpoint has no sandbox (note it as `Sandbox: No` in the row).
- Endpoint is 🟠 V2-ONLY or ⚫ ADMIN-ONLY (not going to be exposed).

### 9.4 Use Explore sub-agents in parallel

To keep the session within a reasonable time, dispatch one Explore
subagent per project IN PARALLEL (single message with 7 Agent tool
calls). Each subagent:

- Receives this brief's relevant section plus the pre-existing docs
  list.
- Produces the audit markdown for its assigned project directly.
- Reports back with path to the file it wrote.

After the 7 Explore agents complete, Opus synthesizes MASTER_SUMMARY
from the 7 audit docs.

## 10. MASTER_SUMMARY structure

Required sections, in this exact order:

### 10.1 Executive headline

- Total endpoints audited.
- Counts by classification across all projects (aggregated).
- Counts by value (Alto / Medio / Bajo).
- Coverage gap: `(already exposed) / (V1-SAFE candidates)` across
  projects.

### 10.2 Top opportunities (decision-ready list)

Top 30-50 endpoints that are 🟢 V1-SAFE + Alto + NOT already exposed,
sorted by `Value × (1/T-shirt)`. One line each:

```
1. POST /ship/calculate-volume  (carriers)  [XS]  "¿Cuál es el peso volumétrico de mi paquete?"  Answers: volumetric weight calc pre-quote.
```

### 10.3 Overlaps map

Cross-project duplications. Table of overlaps with recommended primary
endpoint to use.

### 10.4 Tools to retire / expand

From the audits:

- Tools currently registered that should be retired (admin-only that
  slipped through, duplicates).
- Tools that should be expanded (e.g. `envia_list_orders` missing V4
  fields).

### 10.5 Accounts-specific recommendation

Dedicated paragraph drawing from accounts-audit.md's sensitivity
analysis with Jose-ready recommendation: include fully / subset /
defer. Back it with numbers.

### 10.6 Pending questions for backend team

Aggregate from all 7 audits. Deduplicated list. Sorted by which team
owns the answer.

### 10.7 Proposed execution priority

Given the findings, propose 3-5 waves of implementation:

- Wave 1: lowest effort × highest value (XS + Alto).
- Wave 2: straightforward M + Alto/Medio.
- Wave 3: L + Alto (big bets).
- Wave 4+: cleanup, overlap retirement, V1-PARTIAL expansion.

Do NOT commit Jose to any wave — just propose with evidence. Final
decision is a separate session.

## 11. Non-negotiables

- **No implementation code.** This session produces docs only.
- **No tool registration.** The current 72 tools remain unchanged.
- **Every quantitative claim cites a source file + line.** No "I think
  this endpoint takes 5 params." Instead: "routes/ship.js:42 validates
  5 params via Joi.object({...})."
- **Don't re-discover** what's already in `_meta/` or memory.
- **Respect L-S2:** the mental filter is "typical authenticated portal
  user asks this in chat". Admin / ops / dev → ⚫ ADMIN-ONLY even if
  interesting.
- **No pushing commits to origin.** Local commit only.

## 12. Success criterion

When the session closes:

- `_docs/ENDPOINT_AUDIT_2026_04_XX/` exists with 8 files
  (MASTER_SUMMARY + 7 audits).
- MASTER_SUMMARY contains all 7 sections with at least one entry in
  each where applicable.
- Accounts-audit.md has the sensitivity analysis section filled in
  with a concrete recommendation.
- Every endpoint cited has a source file reference.
- The working tree contains ONE commit with all audit docs.

If any of these is missing, the session did not succeed. Hold the line.

## 13. Model guidance

Use Opus 4.7 (1M context) for this session — 300-500 endpoints across
7 projects plus synthesis exceeds Sonnet's strong suit.

After this audit closes, the **decision session** (separate, also
Opus) reads MASTER_SUMMARY and makes per-wave include/exclude
decisions. Plan that session after the audit lands in git.
