# Session opener — Tool Consolidation (Pases 1+2+3) end-to-end

> Paste this verbatim as the opening message of a new session. The
> session executes the qualitative consolidation phase of
> `_docs/specs/TOOL_CONSOLIDATION_AUDIT_SPEC.md` end-to-end,
> overriding the 30-day-Datadog-data gate with explicit authorization.

## Model + duration

- **Model:** **Opus 4.7 (1M context). NON-NEGOTIABLE.** Sonnet does
  not have the synthesis depth to write descriptions that fix the
  LLM tool-selection problem this session is designed to solve.
- **Estimated duration:** 8–10 hours single Opus session, fragmentable
  across 2 working days if needed (commit checkpoints between Pases
  make this safe).
- **Goal:** **reduce MCP tool surface from 92 registered tools to
  ~49 tools** through qualitative consolidation (not data-driven
  retirement — that is reserved for a future session after Datadog
  has 30+ days of usage data, see §"Out of scope" below).

## Opening message (copy from here)

```
Sesión de Tool Consolidation Audit (Pases 1+2+3) end-to-end — bar:
calidad de descriptions que el LLM pueda picar correctamente en ≥95%
de casos. La meta numérica (92→49) es secundaria a la meta cualitativa
(menos tools, MEJOR descritas).

Modelo: Opus 4.7 (1M context). NON-NEGOTIABLE. Si arrancas en Sonnet,
ABORTA y abre Opus — la síntesis de descriptions consolidadas (Pase 2)
es donde Sonnet pierde fidelidad y produce regression del agent UX.

Duración: 8-10 horas, fragmentable en 2 días con commits checkpoint.

OVERRIDE EXPLÍCITO DEL SPEC ORIGINAL:

El spec `_docs/specs/TOOL_CONSOLIDATION_AUDIT_SPEC.md` §Audience dice:
"This spec depends on: Datadog dashboard (companion spec) having
≥30 days of usage data... If you reach this spec without that data,
STOP and report."

JOSE VIDRIO (CTO) AUTORIZÓ EXPLÍCITAMENTE PROCEDER SIN ESA DATA
(2026-04-29) bajo las siguientes restricciones:

1. **NO retiras tools por "no se usan" sin data** — esa decisión
   queda para una sesión futura cuando Datadog acumule 30+ días.
2. **SÍ consolidas tools por overlap qualitative** — descripcions
   redundantes, CRUD patterns, filters del mismo dataset, wizards
   composables.
3. **SÍ reclasificas tools admin/operational** a internal helpers
   per L-S6 — no requiere data.
4. **NO eliminas tools del codebase** — solo des-registras (mueves
   a internal). Implementación queda disponible para re-promoción
   futura si data muestra demanda.
5. **El refinamiento final a ~40** queda EXPLÍCITAMENTE FUERA DE
   SCOPE de esta sesión. Tu meta es ~49.

PRE-FLIGHT (en orden, antes de cualquier otro paso):

1. `git status` desde el monorepo root
   (`/Users/josealbertovidrio/Documents/git_Proyects/envia-repos`).
   Si hay WIP no commiteado: `git stash push -u -m "pre-tool-consolidation-WIP"`.
2. Working directory: `ai-agent/envia-mcp-server/`. Todas las rutas
   relativas en este opening son desde aquí.
3. Crear branch desde main:
   `git checkout -b feat/tool-consolidation-qualitative` (NO trabajar
   directo en main, NO push — L-G3 / autonomous-mode permission B
   forbidden).
4. Verificar baseline limpio: `npm run build` exit 0, `npx vitest run`
   con todos verde (debe ser 1648+ tests). Si NO pasa, surface y no
   procedas — la consolidación necesita una línea base estable.
5. Confirma modelo Opus 4.7 (1M context) — si dudas, aborta.

LECTURA OBLIGATORIA, en este orden exacto:

1. ai-agent/envia-mcp-server/_docs/LESSONS.md — end-to-end. Particular
   atención para esta sesión:
   - L-S2 (portal-user test): cada tool sobreviviente debe responder
     "¿podría un usuario del portal preguntar esto en chat?". Si la
     respuesta es no, reclassify a internal.
   - L-S6 (no admin tools): tools de ops/admin (`list_company_users`,
     `list_api_tokens`, `list_company_shops`, `get_carrier_config`,
     `check_billing_info`, `locate_city`, `get_carriers_stats`,
     `get_dce_status`, etc.) van a internal. Lista tentativa de 16
     candidatos abajo — debes validarlos uno por uno.
   - L-S7 (org boundaries): tools que crucen tenant scope a admin.
   - L-S5 (reuse existing): si ya existe un internal helper que
     hace lo mismo, no duplicar.
   - L-G1, L-G3 (clean tree, no push).
   - L-T1, L-T2 (testing discipline para los tests que migran).

2. ai-agent/envia-mcp-server/_docs/specs/TOOL_CONSOLIDATION_AUDIT_SPEC.md
   — el spec completo. Lee TODO incluso las partes que asumen
   Datadog data (sección §3 "Tools to retire by usage cohort"). Esa
   sección NO la ejecutas — pero te informa cuál es el bar de
   description quality que el spec espera.

3. ai-agent/envia-mcp-server/_docs/SESSION_LOG_2026_04_28.md y
   _docs/SESSION_LOG_2026_04_27.md — contexto de las observaciones
   A/B/C documentadas en spec §2 (LLM picks wrong tool, doesn't find
   ai_address_requirements, double-call rename pattern). Estos son
   CASOS DE FALLA REALES — tu output debe prevenirlos.

4. project memory `project_mcp_expansion_plan.md` — state del proyecto
   al 2026-04-29 (post-deploy 1.1.0).

5. ai-agent/envia-mcp-server/_docs/CARRIERS_DEEP_REFERENCE.md y
   _docs/QUERIES_DEEP_REFERENCE.md — conocimiento de los backends.
   Útil para validar que un consolidation no rompe contrato con el
   backend (e.g., si mergas list_clients y get_client_detail, el
   backend tiene UN solo endpoint? o dos? ¿qué params discriminan?).

INVENTARIO ACTUAL (verificar al arranque):

Comando: `grep -rh "server.registerTool('envia_" src/ -o | sort -u`
debe devolver ~92 tools únicas. Si el conteo difiere materialmente
(>5 diferencia), surface — la realidad cambió desde 2026-04-29.

CLUSTERS-HIPÓTESIS PRE-ANÁLISIS (input para validar, NO commitments):

La sesión previa (Jose + Claude Opus 4.7, 2026-04-29) identificó 11
clusters candidatos por inspección de nombres. NO son ground truth.
Tu trabajo en Pase 2 incluye validar cada uno contra el código real
y refinar la propuesta. Lista para arrancar discovery, no para
implementar ciegamente:

| # | Cluster | Tools actuales | Reducción hipótesis |
|---|---------|----------------|---------------------|
| 1 | Branches/drop-off | search_branches, search_branches_bulk, get_branches_catalog, find_drop_off | 4 → 2 |
| 2 | Quoting | quote_shipment, get_shipping_rates, ai_rate | 3 → 1-2 |
| 3 | Shipment lists | list_shipments, get_shipments_by_status/cod/ndr/surcharges/status, get_shipment_detail, get_shipment_invoices | 8 → 2-3 |
| 4 | Analytics | orders_count, orders_analytics, issues_analytics, monthly_analytics, carriers_stats, cod_counters | 6 → 2 |
| 5 | Address CRUD | list/get_default/set_default/create/update/delete_address | 6 → 2 |
| 6 | Client CRUD | list_clients, get_client_detail, get_clients_summary, create/update/delete_client | 6 → 2 |
| 7 | Webhook CRUD | list/create/update/delete_webhook | 4 → 0 (internal) |
| 8 | Checkout Rules CRUD | list/create/update/delete_checkout_rule | 4 → 0 (internal) |
| 9 | Notifications config | get_notification_config/prices/settings, list_notifications | 4 → 1 |
| 10 | Generated docs | bill_of_lading, complement, manifest, packing_slip, picking_list | 5 → 1 (wizard) |
| 11 | Admin/operational | locate_city, carriers_stats, dce_status, check_billing_info, list_company_users, list_api_tokens, list_company_shops + list_shops dups, get_carrier_config | 8 → 0 (internal) |

ESTRUCTURA DE TRABAJO — 3 PASES CON CHECKPOINT ENTRE CADA UNO:

═══ PASE 1 — Reclasificar admin/operational (clusters 7, 8, 11) ═══

Trabajo MECÁNICO. Decisión criteria:
- L-S6: "¿podría un usuario del portal preguntar esto?". No → internal.
- Duplicados (`list_company_shops` vs `list_shops`): pickear uno,
  eliminar registración del otro, dejar el código por compatibilidad.
- `locate_city`: memoria dice "reclassified from tool" pero sigue
  registrado — verificar y completar reclassification.

Para cada tool reclassified:
- Mover `src/tools/X.ts` a `src/services/X.ts` o eliminar el wrapper
  `registerTool` dejando solo la función pura.
- Update `src/tools/index.ts` (o equivalente) para no registrar.
- Update tests: si el test sólo cubre el flow `registerTool`, eliminar.
  Si cubre lógica del helper, mover test a `tests/services/`.
- Verify build clean + tests verde DESPUÉS de cada reclassification.

CHECKPOINT 1: commit `refactor(tools): reclassify N admin/operational
tools to internal (Pase 1)`. Build + tests verde. Reporta count
intermediate (esperado ~76).

═══ PASE 2 — Cluster collapse (clusters 1-6, 9) ═══

Trabajo SÍNTESIS. ESTE ES EL CRITICAL PASS — donde Opus se gana
el costo vs Sonnet. Para cada cluster:

a) **Validate hipótesis**: lee las descriptions actuales de cada
   tool del cluster. ¿Realmente overlapean? ¿O cubren casos
   semánticamente distintos que el merge perdería?

b) **Decision tree**:
   - ¿Mergear con un `action` enum param? (CRUD: create/update/delete)
   - ¿Mergear con un `filter` enum param? (shipment lists by status)
   - ¿Mergear con un `metric` enum param? (analytics)
   - ¿Mantener separados pero rewrite descriptions para diferenciar?
   - ¿Reclassify uno a internal y solo conservar el principal?

c) **Description quality bar** (ESTE ES EL PUNTO):
   La description nueva DEBE:
   - Comunicar el caso de uso primario en la primera oración.
   - Listar cuándo SÍ usar la tool (3-5 ejemplos concretos).
   - Listar cuándo NO usar la tool (qué otra tool sería mejor) —
     esto previene Observation A del spec §2.
   - Ser ≤500 palabras total. Si necesitas más, el cluster es
     demasiado amplio — re-divide.

   Antes de aceptar una description como final, escribe 5 prompts
   sintéticos representativos del usuario y verifica que la
   description sería pickeada correctamente por un LLM razonablemente
   competente. Si dudas, refactor.

d) **Edge case preservation**: cuando mergas N tools en 1, los
   tests de las N originales deben mappear al test de la merged.
   Listar TODOS los edge cases en el commit message. Cero ediciones
   silenciosas de behavior.

e) **Backend contract validation**: cross-reference con
   CARRIERS_DEEP_REFERENCE.md o QUERIES_DEEP_REFERENCE.md. Si los
   tools mergean dos endpoints distintos del backend, la nueva tool
   debe disparar el endpoint correcto según los args — documentar
   la lógica.

CHECKPOINT 2 (intermedio): commit por cada cluster colapsado, con
mensaje detallando: tools mergeadas, description nueva, edge cases
preservados, decisión de descartes si los hubo. Build + tests verde
después de cada cluster.

CHECKPOINT 2 (final): commit `refactor(tools): consolidate N clusters
via qualitative pass (Pase 2)`. Build + tests verde. Count esperado
~54.

═══ PASE 3 — Wizard composition + final touches ═══

Crear UN wizard tool: `envia_create_international_shipment`.

Internamente compone:
- Step 1: validate address (international flag).
- Step 2: classify HS code (productos del envío).
- Step 3: get address requirements per país destino.
- Step 4: quote rates filtrando international services.
- Step 5: create shipment con add-ons fiscales correctos.

NO duplica el código de los tools individuales — los llama
internamente vía sus services. Description debe enfatizar
"end-to-end international flow" para que el LLM lo pickee en lugar
de iterar manualmente (preventing Observation B del spec §2).

Tests: un test de integración cubriendo MX→US end-to-end (mock
backend) y otro MX→ES (multi-país, multi-currency).

CHECKPOINT 3: commit `feat(tools): add envia_create_international_shipment
wizard (Pase 3)`. Build + tests verde. Count final ~49-50.

DISCIPLINA NO NEGOCIABLE:

- **Cero changes silentes a behavior.** Cada consolidation que
  pierda un edge case debe ser EXPLICITA en el commit message. Si
  no estás seguro, conserva el caso (default conservador).
- **Description quality ≥ count reduction.** Si llegas a 49 con
  descriptions mediocres, has empeorado el agent. Mejor llegar a
  55 con descriptions excelentes que a 40 con descriptions OK.
- **L-G3: no push.** Branch `feat/tool-consolidation-qualitative`
  queda local + remote del feature branch (push del feature, NO
  de main). Jose decide cuándo mergear vía PR review.
- **L-T2: tests aislados.** Cada commit deja la suite verde. Si un
  cluster requiere ediciones cross-file, hazlo todo en un commit
  no-divisible para preservar atomicidad.
- **L-T4: cross-check obligatorio.** Antes del último commit,
  re-verifica que los 92 tools originales estén o (a) registrados
  con descriptions nuevas, o (b) reclassified a internal con tests
  preservados, o (c) explícitamente listados como "merged into X".
  Cero tools desaparecidos sin trazabilidad.

COORDINATION CON AGENTIC-AI TEAM (BREAKING CHANGE):

Cualquier rename o retiro de tool LLM-visible es **BREAKING para
agentic-ai consumer**. Tu sesión NO coordina con ese equipo
directamente, pero DEBES producir:

`_docs/TOOL_CONSOLIDATION_BREAKING_CHANGES.md` — un doc estructurado
listando:
- Tools removidas con redirect a su reemplazo.
- Tools renombradas con mapping old→new.
- Tools con input schema cambiado, con before/after.
- Tools reclassified a internal (ya no llamables).
- Migration guide concreto para agentic-ai team.

Jose coordina con agentic-ai team la propagación del cambio
post-merge. Tu output queda listo para esa coordinación.

ESCAPE HATCHES:

- Si encuentras un cluster que en realidad NO es overlap (los tools
  cubren casos genuinamente distintos): documenta en
  TOOL_CONSOLIDATION_BREAKING_CHANGES.md el "rejected merge" con
  justificación. Surface al cierre. NO fuerzes el merge.
- Si descubres tools que no estaban en los 11 clusters pero también
  son candidatos obvios: agrégalos al pase apropiado. Documenta el
  hallazgo en handoff.
- Si la sesión se acerca al context limit a mitad de Pase 2: commit
  los clusters completados, surface al cierre, deja un follow-up
  prompt para sesión siguiente.
- Si encuentras un breaking change inesperado en el backend
  (e.g. endpoint que el cluster asumía igual pero responde
  diferente): STOP, abre item en BACKEND_TEAM_BRIEF, surface a
  Jose, no improvises consolidation que rompa contrato.

OBJETIVO HONESTO:

- 92 → ~49-50 tools registradas como LLM-visible.
- Descriptions quality medible: cada description sometida al
  "5-prompt synthetic test" de §c arriba.
- 3 commits checkpoint mínimo (uno por pase) + commits intermedios
  por cluster.
- TOOL_CONSOLIDATION_BREAKING_CHANGES.md en `_docs/` como contract
  con agentic-ai team.

OUT OF SCOPE EXPLÍCITO:

- Reducción a ~40 tools (requiere Datadog data, sesión futura).
- Retirement por bajo tráfico (requiere data).
- Coordination directa con agentic-ai team (Jose lo hace).
- Eliminar código de tools reclassified (queda como helper
  reusable).
- Cambios en backend (esto es 100% MCP-side).

HANDOFF AL CIERRE:

Entrega:
1. Count final de tools registradas (esperado ~49-50).
2. Diff total: tools removidas/reclassified/merged/added (wizard).
3. Path al doc TOOL_CONSOLIDATION_BREAKING_CHANGES.md producido.
4. Resumen del 5-prompt synthetic test por cluster — ejemplos
   concretos de prompts y la tool que el LLM debería pickear.
5. ⚪ Pending list: clusters rechazados (con razón), tools no
   tocadas (con razón), edge cases marcados para review humano.
6. Recomendaciones para sesión Pase 4 (cuando Datadog tenga 30+
   días de data): qué tools tienen señal preliminar de bajo
   tráfico, qué consolidations ameritan re-evaluation con data.
7. PR description draft para review.
8. Commit count + SHAs por cluster.

AUTORIDAD:

Jose Vidrio (jose.vidrio@envia.com) es el único decisor. Cualquier
ambigüedad de scope, decisión de merge vs separate, o cluster
rechazado se surface y espera input. NO decidas unilateralmente
sobre breaking changes que afecten agentic-ai más allá de los 11
clusters listados.

Arranca.
```

## Why this opening is structured this way

- **Override explícito del data dependency** previene que el agente lea el spec, vea el "STOP and report" gate, y se rehúse a proceder. La autorización tiene que estar en la primera mitad del opener.
- **5-prompt synthetic test** convierte description quality de subjetivo a verificable. Sin esto, "good enough" es opinable.
- **3 pases con checkpoint** permite parar y reanudar entre días. Si la sesión se cae a mitad de Pase 2, el Pase 1 ya está committed y verde.
- **TOOL_CONSOLIDATION_BREAKING_CHANGES.md como entregable obligatorio** convierte la coordinación con agentic-ai team de "ojalá se acuerde mencionarlo" a "documento concreto en el repo".
- **Cluster hipótesis como input no commitment** evita que el agente ejecute mecánicamente sin validar — la depth de Opus debe usarse para refinar, no para implementar ciegamente.
- **Out of scope explícito** elimina la tentación de "ya que estoy" — si el agent intenta llegar a ~40 sin data, está fuera de scope autorizado y debe surface en lugar de seguir.
