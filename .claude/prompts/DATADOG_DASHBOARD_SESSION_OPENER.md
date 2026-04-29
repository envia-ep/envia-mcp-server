# Session opener — Datadog Observability Dashboard

> Paste this verbatim as the opening message of a new session. The
> session executes `_docs/specs/DATADOG_OBSERVABILITY_DASHBOARD_SPEC.md`
> against production telemetry from `envia-mcp-prod`.

## Model + duration

- **Model:** Opus 4.7 (1M context) if dispatched as an AI session.
- **Alternative:** human DevOps/SRE engineer with Datadog admin
  permissions (the work is mostly Datadog UI + Terraform, not
  TypeScript). The spec is the runbook; the model is needed only
  for synthesis when tradeoffs require explanation.
- **Estimated duration:** 4–6 hours single session.

## Opening message (copy from here)

```
Sesión de DevOps/SRE — bar: dashboard production-grade que sirva
como single pane of glass durante incidentes reales.

Modelo: Opus 4.7 (1M context). Duración esperada: 4-6 horas.

Trabajo: Datadog UI + Terraform (no TypeScript). El spec es el runbook
ejecutable end-to-end.

PRE-FLIGHT (antes de cualquier cambio en Datadog):

1. `git status` desde el monorepo root
   (`/Users/josealbertovidrio/Documents/git_Proyects/envia-repos`).
   Si hay WIP no commiteado: `git stash push -u -m "pre-datadog-WIP"`.
   Esta sesión produce config + commits en el repo de infra
   (Terraform); no toca código del MCP.
2. Working directory para rutas relativas:
   `ai-agent/envia-mcp-server/` (todas las referencias del spec son
   relativas a este path).
3. Confirma acceso: Datadog admin del workspace de Envia +
   permisos para crear dashboards, alerts, monitors.

LECTURA OBLIGATORIA, en este orden exacto:

1. ai-agent/envia-mcp-server/_docs/LESSONS.md — end-to-end. Particular
   atención a:
   - L-G1, L-G3 (no push, working tree limpio)
   - L-S2 (portal-user test — relevante para decidir qué tools merecen
     panels prominentes)
   - L-T4 (cross-check — verificar que los métricas del dashboard
     correspondan a eventos reales en logs)

2. ai-agent/envia-mcp-server/_docs/specs/DATADOG_OBSERVABILITY_DASHBOARD_SPEC.md
   — el spec completo. Listo para ejecución, zero open questions.
   Contiene:
   - §3 Design decisions (single dashboard, time windows, ordering)
   - §4 Panel specs (cada panel con query exacta y tipo de visualización)
   - §5 Alert thresholds y runbook
   - §6 Terraform vs UI tradeoffs
   - §7 Acceptance criteria

3. ai-agent/envia-mcp-server/_docs/SESSION_LOG_2026_04_27.md +
   project memory `project_mcp_expansion_plan.md` — contexto del
   estado actual: Zod Phase 1 emite el evento `schema_validation_failed`
   ya en producción (release 1.1.0, deploy 2026-04-29). Este es el
   data source nuevo más importante del dashboard.

4. ai-agent/envia-mcp-server/src/utils/logger.ts y observability
   instrumentation (Sprint 4a, commit `af71e0b`) — para entender
   qué eventos pino emite hoy: `tool_call_start`, `tool_call_complete`,
   `tool_call_failed`, `schema_validation_failed`. Estructura de
   correlationId.

VERIFICACIÓN PRE-WORK:

1. Confirmar Heroku → Datadog log integration está activa para
   `envia-mcp-prod`. Comando: `heroku addons -a envia-mcp-prod`.
   Si Datadog drain no aparece, surface el blocker, no procedas.
2. Smoke check: enviar una query a Datadog Logs Explorer filtrando
   `service:envia-mcp-server env:production` para confirmar que los
   logs llegan. Si no llegan en los últimos 30 min, hay drift entre
   Heroku y Datadog — surface el blocker.

DISCIPLINA NO NEGOCIABLE:

- Cada panel tiene una query Datadog explícita. No paneles "directional"
  sin métrica concreta detrás.
- Cada alert tiene threshold + ventana + runbook link. Sin runbook
  link no se mergea.
- Test cada alert al menos una vez con condición sintética antes
  de declararla activa (e.g., emitir un log con shape inválido para
  disparar `schema_validation_failed` y ver que la alerta dispara).
- Datadog UI cambios se reflejan en Terraform. Si decides hacer algo
  solo en UI sin Terraform, documenta por qué (snowflake panels son
  deuda técnica).
- L-S6: no exponer en el dashboard métricas de ops admin que no
  pertenezcan al alcance del MCP portal-user. Si ves logs de tools
  reclassified como internos (e.g., `locate-city`), no los promociones
  a panels destacados.
- L-G3: no push directo a master/main de ningún repo. Todos los
  cambios de Terraform en PR.

ESCAPE HATCHES:

- Si Heroku → Datadog drain no existe o está roto: STOP, abre ticket
  al equipo de infra, surface al cierre. No improvises un drain
  alternativo (Logtail, Papertrail, etc.) sin autorización de Jose.
- Si la API de Datadog rate-limita durante setup: pausa, espera
  ventana, no fuerces con bursts paralelos.
- Si encuentras eventos pino con shapes que no calzan con el spec
  (e.g., faltan campos): documenta como ⚪ pending, no rediseñes
  el panel sin confirmar con Jose.

HANDOFF AL CIERRE:

Entrega:
1. URL del dashboard publicado.
2. Lista de alerts creadas + thresholds + runbook links.
3. Terraform diff (si aplica) o JSON exports.
4. Resultado del test sintético de cada alert (qué dispara, qué
   no dispara).
5. Top 3 observaciones del 2026-04-29 → ahora (primer día de prod
   1.1.0): qué patrones se ven en el tráfico real.
6. ⚪ pending list (panels diferidos, integraciones no completadas,
   blockers de infra).
7. Recomendaciones para Stream 4 (Tool Consolidation Audit) cuando
   acumule 30 días de data: qué métricas serán más útiles, qué
   tools ya hoy se ven con uso bajo (preliminary signal, no
   conclusivo).

AUTORIDAD:

Jose Vidrio (jose.vidrio@envia.com) es el único decisor. Cualquier
ambigüedad de scope o decisión de inclusión se surface y espera
input. No decidas unilateralmente sobre alerts a producción.

Arranca.
```

## Why this opening is structured this way

- **Heroku→Datadog drain check first** evita que el agent pierda
  2-4 horas configurando dashboards que no van a poblarse porque
  el log forwarding no existe.
- **Synthetic alert test** elimina alertas "configuradas pero no
  validadas" — el peor failure mode de un dashboard.
- **30-day signal recommendation** prepara el bridge a la siguiente
  sesión (Tool Consolidation Audit) sin pre-comprometer decisiones.
- **L-S6 callout** previene que el dashboard inflate con métricas
  admin-only que no son relevantes al portal-user agent.
