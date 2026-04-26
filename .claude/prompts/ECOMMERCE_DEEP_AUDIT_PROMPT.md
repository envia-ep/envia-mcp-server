# Ecommerce Bundle (ecommerce + eshops + ecartApiOauth) — Deep Reference Audit Prompt

> **Self-contained prompt.** Executable by Opus 4.7 (1M context).
> Goal: produce `_docs/ECOMMERCE_DEEP_REFERENCE.md` covering all THREE
> services as a coherent bundle.

## Step 0 — Read LESSONS.md (MANDATORY)

```
ai-agent/envia-mcp-server/_docs/LESSONS.md
```

End-to-end. Particularly relevant for ecommerce:
- **L-S2** Portal-embedded scope criterion — ecommerce ops the agent can do for an authenticated client.
- **L-S6** Don't expose admin/dev tools — much of ecommerce is integrator-facing.
- **L-S7** Organizational ownership boundaries — verify these 3 services are under Jose's vertical (assumed yes, but mention if not).
- **L-B1, L-B3** Verify against real responses; routes with literal-prefix names (`tmp-fulfillment`) are real.
- **L-T4** cross-check.
- **L-G1, L-G3** Clean tree, no push.

## Context — what the bundle is

Three services treated as one audit unit because they're tightly coupled:

1. **`services/ecommerce`** — webhooks, order ingestion from e-commerce platforms.
2. **`services/eshops`** — multi-channel e-commerce normalization (Shopify, WooCommerce, Tiendanube, etc. unified to Envia's order schema).
3. **`services/ecartApiOauth`** — OAuth flows for connecting client e-commerce platforms (the auth handshake before orders flow).

Per memory `discovery_ecommerce_backend.md` (which you must read), this bundle:
- Owns the OAuth dance with Shopify, WooCommerce, Tiendanube, Magento, etc.
- Normalizes orders from each platform to Envia's internal v4 schema.
- Receives webhooks from those platforms when orders are created/updated/fulfilled.
- Persists store config (shop_id, credentials encrypted, mapping tables).
- Pushes fulfillment confirmations BACK to the e-commerce when the MCP creates a label (via `tmp-fulfillment` proxy mentioned in carriers).

**MCP's current touchpoint:** the MCP calls queries' `/tmp-fulfillment/{shop_id}/{order_id}` as a side-effect of `envia_create_label` (Sprint 1 deliverable). Queries proxies that to ecartAPI / eshops. The MCP itself does NOT call these 3 services directly.

## Mandatory reading order

1. `_docs/LESSONS.md` (Step 0).
2. **`_docs/CARRIERS_DEEP_REFERENCE.md` entirely** — depth bar.
3. **Memory: `discovery_ecommerce_backend.md`** — already curated for this bundle.
4. **Memory: `discovery_v1_ecommerce_pro.md`** — V1 ecommerce pro features visual discovery.
5. `_docs/backend-reality-check/ecommerce-eshops-findings.md` (Session A).
6. `_docs/BACKEND_ROUTING_REFERENCE.md` — current routing.
7. `services/ecommerce/README.md` and `CLAUDE.md` if exist.
8. `services/eshops/README.md` and `CLAUDE.md` if exist.
9. `services/ecartApiOauth/README.md` and `CLAUDE.md` if exist.
10. `_meta/analysis-ecommerce*.md` in monorepo root if present.
11. The MCP-side consumer: `src/services/ecommerce-sync.ts` in `ai-agent/envia-mcp-server/`.

## Goal

Produce `_docs/ECOMMERCE_DEEP_REFERENCE.md`. Target: ~92-95% coverage. **1,800-2,500 lines** because there are 3 services to cover. 30-45 sections.

The doc should let any future Claude or human session (a) understand how to build a new MCP tool for ecommerce ops, (b) debug a failed fulfillment sync, (c) onboard a new e-commerce platform integration.

## Mandatory sections

### Part 1 — Bundle architecture
1. Why these 3 services are a bundle (the dependency arrows).
2. Each service's role + tech stack + size.
3. Shared concepts (shop, channel, order, normalization).
4. Routes & endpoints inventory across all 3 services.

### Part 2 — `services/ecommerce`
5. Webhook receivers per platform (Shopify, WooCommerce, Tiendanube, Magento, others).
6. Webhook signature validation per platform.
7. Order ingestion → normalization pipeline.
8. Persistence (which DB / table / models).
9. Authentication for incoming webhooks.

### Part 3 — `services/eshops`
10. Multi-channel normalization rules.
11. Schema mapping per platform → Envia v4 order.
12. Channel-specific quirks (Shopify cancellations vs WooCommerce vs Tiendanube).
13. Order versioning (v1 → v4 evolution).
14. Fulfillment push back (the `/tmp-fulfillment` chain end-to-end).

### Part 4 — `services/ecartApiOauth`
15. OAuth flows per platform.
16. Token storage + encryption (AES per LESSON L-S5 if same pattern as carriers).
17. Token refresh.
18. Disconnect / revoke flows.
19. Multi-shop per company support.

### Part 5 — Inter-service architecture
20. ecartApiOauth → eshops (handshake → connection).
21. eshops → ecommerce (normalized event delivery).
22. ecommerce → queries (order persistence).
23. queries → carriers (rate / generate via API key).
24. carriers → queries `/tmp-fulfillment` → ecommerce/eshops (sync back to e-commerce platform via API).

This is the **end-to-end checkout-to-label-to-fulfilled flow**. Document it as a sequence diagram-style narrative.

### Part 6 — Per-platform integrations
26. Shopify: app installation, OAuth scopes, webhooks, fulfillments.
27. WooCommerce: plugin-vs-API, REST API connection, webhook config.
28. Tiendanube: similar.
29. Magento.
30. Others (BigCommerce, PrestaShop, MercadoLibre — verify which are active).
31. Custom REST/GraphQL integrations.

### Part 7 — Database
32. ecommerce DB schema.
33. eshops DB schema.
34. ecartApiOauth DB schema.
35. Cross-references with queries DB (orders, shipments).

### Part 8 — MCP integration
36. Current MCP touchpoint (`tmp-fulfillment` via queries).
37. Endpoints exposed by ecommerce/eshops/ecartApiOauth that the MCP could consume.
38. Endpoints that should NOT be exposed (admin/dev/onboarding — apply LESSON L-S6 strictly).
39. Recommended new MCP tools (e.g. "list connected stores", "trigger order sync", but BEWARE of L-S6).

### Part 9 — Operational
40. Webhook reliability (retries, dead-letter, idempotency).
41. Order ingestion latency and bottlenecks.
42. Known incidents / known gotchas.

### Part 10 — Honesty
43. Open questions for backend.
44. Self-assessment.

## Methodology — non-negotiable

### Phase 1: Pre-existing knowledge
- Read all reference docs.
- Note: memory `discovery_v1_ecommerce_pro.md` likely has UI-level discovery — useful as user-question source.

### Phase 2: Code map
For each of the 3 services:
- File count.
- Routes file structure.
- Controllers / handlers.
- Models / DB.
- Util / helpers.
- Middlewares / auth.

### Phase 3: Parallel deep-reads

Dispatch agents (`thoroughness: very thorough`):

| Agent | Domain |
|-------|--------|
| 1 | `services/ecommerce` full audit |
| 2 | `services/eshops` full audit |
| 3 | `services/ecartApiOauth` full audit |
| 4 | Inter-service flow (the end-to-end ingestion → fulfillment chain) |
| 5 | Per-platform integration peculiarities (Shopify, WooCommerce, Tiendanube top priority) |

### Phase 4: First synthesis (iter 1)

### Phase 5: Cross-check pass (iter 2 — MANDATORY)

Verify:
- Webhook signature validation actually exists per platform (don't trust agent without spot-check — security-critical).
- OAuth scopes are documented accurately per platform.
- The `tmp-fulfillment` proxy chain matches what carriers' MCP integration claims.
- Multi-shop per company actually works as the agent reports.

### Phase 6: Iteration 2 expansion

### Phase 7: Iteration 3 finalization

- MCP gap analysis with strict L-S6 filter.
- Self-assessment.

### Phase 8: 3 incremental commits.

## Quality gates

- [ ] Every quantitative claim cites file:line.
- [ ] Each platform integration is documented with a separate sub-section.
- [ ] Webhook signature validation status verified per platform (CRITICAL — security gap if missing).
- [ ] OAuth scope inventory complete per platform.
- [ ] L-S6 applied strictly: any tool proposal for the agent must pass the "typical authenticated portal user asks this" test.
- [ ] Final length 1,800-2,500 lines.
- [ ] Self-assessment closes.

## What NOT to do

- **Do NOT propose MCP tools that are admin/dev/onboarding** (L-S6). "Connect a Shopify store" is dev work, not user chat.
- **Do NOT trust webhook signature claims without verification.** Security-critical.
- **Do NOT speculate on OAuth scope sets.** Cite the exact scopes per platform.
- **Do NOT skip cross-platform comparison.** Different platforms have different cancellation semantics — document.
- **Do NOT push to remote.**

## Specific honesty traps

1. **"All platforms are similar"** — false. Shopify webhooks ≠ WooCommerce REST polls ≠ Tiendanube. Each has distinct error modes.
2. **"OAuth tokens are short-lived"** — varies wildly. Some platforms have 60-day access tokens, some are perpetual. Cite the actual lifetime per platform.
3. **"Order normalization is straightforward"** — it isn't. Each platform names fields differently and has edge cases (WooCommerce subscription orders, Shopify GraphQL vs REST, etc.). Document the mappings.
4. **"Webhooks are reliable"** — they aren't. Each platform has different retry policies. Document.
5. **"`tmp-fulfillment` is well-named"** — it has `tmp-` literal prefix per LESSON L-B3. Real, not a typo. Document why it has that name if you can find out.

## Deliverable

`_docs/ECOMMERCE_DEEP_REFERENCE.md` — 1,800-2,500 lines, 30-45 sections, 3 iterations.

## Handoff at end

1. Final line count and section count.
2. Top 5 surprising findings.
3. Webhook signature validation status per platform (security-critical summary).
4. Per-platform integration health (active, deprecated, broken).
5. MCP tool recommendations passing the L-S2 + L-S6 filters.
6. Open questions for backend.
7. Recommendation for next session.

## Out of scope for this session

- ecart-payment (LESSON L-S7, separate vertical).
- carriers / queries / geocodes / admin / accounts (separate prompts).
- Implementing new MCP tools.
- Code changes.
- Push to remote.

Good luck. Multi-platform integration is full of edge cases — depth and honest gap-marking matter most.
