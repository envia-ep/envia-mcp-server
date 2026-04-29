# Session Log — 2026-04-28 (Opus 4.7 1M, multi-domain)

## Scope

Continuación del trabajo MCP iniciado 2026-04-27. Foco hoy en
hardening (post-bug-storm) y planning del Sprint de Hardening.

## Logros principales

### Operacional (mcp-expansion branch)
- Smoke test contra stage v9 (envia-mcp-stage) — 6/6 PASS (commit a7c6527)
- Doc polish: BACKEND_ROUTING_REFERENCE.md con aliases backend (a7c6527)
- Audit Sprint 7 coverage gaps + 4 tests defensivos (a7c6527)
- Fix 3 shipments shape-mismatch bugs (a99736a)
- Fix ticket-shipment linkage (tracking_number param + lookup) (9aee101)
- Fix 2 audit findings: status flat shape + invoices fields (9007a5d)
- Cosmetic fix doble %% en shipments_status (1af57ad)
- Cross-service audit de 27 endpoints — 17 OK, 3 fixed, 6 inconclusive
- Rename de 4 tools a envia_ prefix — BREAKING para agentic-ai (83f6b78)
- Cosmetic null-safe rendering en carrier-constraints (96925ce)
- Fix routing list_additional_services para preguntas carrier-specific (f7d809f)

### Strategic / specs
- Análisis crítico del MCP vs best practices industry — produjo
  el Sprint de Hardening roadmap (4 prioridades)
- Spec C11 v1 → v2 → v3 (3 iteraciones, backend deployó sandbox)
- Spec RUNTIME_ZOD_VALIDATION v1 → v1.1 → v1.2 (3 iteraciones)
- Spec LIVE_FIXTURE_TESTING v1 (716 LOC)
- Spec DATADOG_OBSERVABILITY_DASHBOARD v1 (625 LOC)
- Spec TOOL_CONSOLIDATION_AUDIT v1 (591 LOC, analytical-only Phase 1)

### Backend coordination
- C11 deployed sandbox, verificado spec v3 al 100%
- Backend brief actualizado con C11 + closures
- Equipo agentic-ai notificado del rename, coordinando deploy

## Decisiones clave
1. **Bar de excelencia: production-grade enterprise** en todos los specs.
   Cada decisión cita data, no intuición.
2. **Soft-warn por defecto** en Zod runtime (forward-compat con backend).
3. **Manual capture** de fixtures (no cron — evita commit noise).
4. **Tres branches activas en paralelo:** mcp-expansion (fixes),
   mcp-zod-validation (Sonnet implementación Zod), mcp-hardening-specs
   (3 follow-up specs doc-only).
5. **Tool consolidation requires data:** ≥30 días de Datadog antes de
   ejecutar Spec 5.

## Lessons learned
1. **Fixture-vs-reality drift es invisible** sin runtime validation.
   El audit reveló 5 bugs que 1581 tests nunca detectaron.
2. **73 tools causa LLM tool-selection fatigue.** Observado dos veces hoy.
3. **`git commit --amend` después de push causa divergence.** Sonnet de
   Zod tuvo que hacer reset. Anti-pattern añadido a Zod spec §10.
4. **Coordinación cross-repo es crítica.** El rename de 4 tools en
   `envia-mcp-server` rompe `agentic-ai` si no se coordina.
5. **Schema reuse via Zod `.merge()` evita duplication** (Zod spec §5.4).
6. **Spec en 3 iteraciones** (initial → fill gaps → security+bar) produce
   artifacts que Sonnet ejecuta sin preguntas.

## State at end of session
- mcp-expansion: 80+ commits ahead of main, all today's fixes, ready for review
- mcp-zod-validation: Sonnet IN PROGRESS — last seen tool 9/10 (track_package),
  expected to finish tool 10 soon
- mcp-hardening-specs: 3 specs published (b8dc1b5, fc075ca, 094f13b)
  REMOTE OK but LOCAL state was disturbed during session — clean with
  `git checkout mcp-hardening-specs && git reset --hard origin/mcp-hardening-specs`
- main: untouched

## Pending priority
1. Wait for Sonnet to finish Zod Phase 1 → review §14.1 checklist
2. Merge mcp-zod-validation → mcp-expansion
3. Coordinate with agentic-ai for the rename deploy
4. Then arrancar Live-Fixture spec (mcp-live-fixtures branch)

## Pending stalled
- C8 / C9 backend tickets (escalated, no blocker for MCP)
- Sprint Final HTTP auth + CORS (on hold, requires Jose coordination)
- Production promote (after stage smoke of new tools)