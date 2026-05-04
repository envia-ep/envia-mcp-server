# Session opener — Tool Consolidation Pase 2-bis (close the gap)

> Paste this verbatim as the opening message of a new session. The
> session continues the qualitative consolidation work from the
> previous Opus session (commits `a899743..e75a6bd`, merged into
> main 2026-05-04), targeting deferred clusters + missed
> reclassifications + capability restoration.

## Model + duration

- **Model:** **Opus 4.7 (1M context). NON-NEGOTIABLE.** Same rationale
  as Pase 1+2+3 — Cluster 3 design (action discriminator across
  multiple backend endpoints) and wizard-as-mutation extraction are
  synthesis-heavy work where Sonnet loses fidelity.
- **Estimated duration:** 6–8 hours single Opus session. Fragmentable
  across 2 days via commit checkpoints.
- **Goal:** **reduce MCP tool surface from 73 → ~54 tools** by
  closing the gaps left by Pase 1+2+3, while restoring the capability
  loss documented in that session (carriers[] filter on
  quote_shipment, wizard-as-mutation completion).

## Opening message (copy from here)

```
Sesión de Tool Consolidation Pase 2-bis — bar: cerrar el gap honesto
de la sesión anterior (73 tools vs target 49) sin comprometer la
description quality que se logró establecer en Pase 1+2+3.

Modelo: Opus 4.7 (1M context). NON-NEGOTIABLE. Cluster 3 design es
synthesis-heavy y la wizard-as-mutation extraction requiere
visión arquitectónica que Sonnet no provee con la fidelidad
necesaria.

Duración: 6-8 horas, fragmentable en 2 días con commits checkpoint.

CONTEXTO DE LA SESIÓN ANTERIOR (LEER PRIMERO):

La sesión Opus 1M previa (2026-05-04, commits `a899743..e75a6bd`,
ya mergeada a main) ejecutó Pases 1+2+3 con resultado honesto pero
conservador: 90→73 tools, no 92→49. Tu trabajo es continuar desde
ese estado, NO repetirlo.

Lo que YA está hecho (no lo toques):
- 7 admin tools reclassified a internal (Pase 1)
- 10 tools reclassified across clusters 1, 2, 4, 5, 6, 9 (Pase 2)
- Wizard `envia_create_international_shipment` (pre-flight only) (Pase 3)
- 6 tools con descriptions rewritten + "when to use / when NOT to use"
- BREAKING_CHANGES.md producido (en `_docs/TOOL_CONSOLIDATION_BREAKING_CHANGES.md`)

Lo que ESCAPÓ a Pase 1+2+3 (tu trabajo):

A. **Deferred explícitamente** (documentado por agente anterior):
   - ⚪ Cluster 3 (Shipment lists, 8 tools → 2-3) — el más grande pendiente
   - ⚪ Cluster 10 (Generated docs, 5 tools → 1) — wizard con doc_type
   - ⚪ Wizard-as-mutation completion (extract create-label service layer)
   - ⚪ carriers[] filter restoration en quote_shipment (capability LOST)

B. **Missed (no flagged por agente anterior, son deferred-from-v1
   per memoria del proyecto):**
   - Webhook CRUD remanentes: `create_webhook`, `update_webhook`,
     `delete_webhook` (3 tools). El agente solo reclassificó `list_webhooks`.
     Memoria explícitamente dice "Webhook CRUD (dev/admin task)
     deferred from v1" — todos van a internal.
   - Checkout Rules CRUD COMPLETO: `list_checkout_rules`,
     `create_checkout_rule`, `update_checkout_rule`,
     `delete_checkout_rule` (4 tools). Memoria dice "Checkout Rules
     CRUD (no UI in v1 or v2)" — admin/internal por definición.

C. **No analizados pero candidatos obvios** (tu juicio + validación):
   - Order management cluster: `update_order_address`,
     `update_order_packages`, `manage_order_tags`,
     `select_order_service` (4 tools) — posible merge a 1 con
     action enum.
   - `list_orders` + `get_orders_count` + `get_order_filter_options`
     (3 tools) — posible merge si list-with-metadata cubre el caso.
   - `fulfill_order` — single tool, verificar si genuinamente
     standalone o merge candidate.

D. **Description hardening incompleto:** los 6 tools con descriptions
   rewritten cubren clusters 1/2/4/5/6/9 + 1. Survivors de Cluster 3
   (cuando lo proceses), Cluster 10 + cualquier cluster nuevo de §C
   también necesitan el "when to use / when NOT to use" pattern.

OBJETIVO NUMÉRICO:

73 → ~54 tools registradas como LLM-visible. Distribución:

| Acción | Reducción esperada |
|--------|-------------------|
| Cluster 3 (Shipment lists 8 → 2-3) | -5 |
| Cluster 10 (Generated docs 5 → 1) | -4 |
| Webhook CRUD restantes a internal | -3 |
| Checkout Rules CRUD a internal | -4 |
| Order management consolidation | -3 |
| Capability restoration (carriers[] + wizard mutation) | 0 (capability gain, no count change) |
| **Total** | **-19 → 54 tools** |

Si llegas a 54 con descriptions excelentes, has cumplido. Si los
clusters de §C son menos collapsable de lo que parecen, llegar
a 56-58 es aceptable. La meta cualitativa supera la meta numérica.

PRE-FLIGHT (en orden, antes de cualquier otro paso):

1. `git status` desde monorepo root
   (`/Users/josealbertovidrio/Documents/git_Proyects/envia-repos`).
   Si hay WIP no commiteado: `git stash push -u -m "pre-pase-2bis-WIP"`.
2. Working directory: `ai-agent/envia-mcp-server/`. Todas las rutas
   son desde aquí.
3. Crear branch desde main (que ya tiene Pase 1+2+3 mergeado):
   `git checkout -b feat/tool-consolidation-pase2bis`. NO trabajar
   directo en main, NO push (L-G3).
4. Verificar baseline: `npm run build` exit 0, `npx vitest run`
   con 1654+ tests verde. Si no, surface y no procedas.
5. Confirma modelo Opus 4.7 (1M context).

LECTURA OBLIGATORIA, en este orden exacto:

1. `_docs/LESSONS.md` — end-to-end. Particular atención:
   - L-S6 (no admin tools): aplica a Webhook + Checkout Rules + admin candidates §C
   - L-S2 (portal-user test): aplica a cada survivor de cluster
   - L-T1, L-T2, L-T4 (testing discipline)
   - L-G1, L-G3 (clean tree, no push)

2. `_docs/specs/TOOL_CONSOLIDATION_AUDIT_SPEC.md` — el spec original.
   Lee enteramente, especialmente §3 design decisions y §2
   Observation A/B/C — esos son los failure modes que prevenir.

3. `_docs/TOOL_CONSOLIDATION_BREAKING_CHANGES.md` — output del agente
   anterior. Tu trabajo EXTIENDE este doc, no lo reemplaza. Cada
   reclassification/merge/rename nueva se agrega al mismo file.

4. `_docs/SESSION_LOG_2026_05_04.md` (si existe) o el commit messages
   `a899743..e75a6bd` para entender lógica del agente anterior.

5. `.claude/prompts/TOOL_CONSOLIDATION_SESSION_OPENER.md` — el
   opener de Pase 1+2+3. Misma estructura de discipline, mismo
   bar de description quality, mismo override de Datadog data
   dependency aplicas tú también.

6. `_docs/CARRIERS_DEEP_REFERENCE.md` y `_docs/QUERIES_DEEP_REFERENCE.md`
   — necesario para Cluster 3 (shipments tienen múltiples endpoints
   distintos en queries: /shipments, /shipments-status,
   /shipments/cod, /get-shipments-ndr) y para wizard-as-mutation
   (entender el flow de /ship/generate en carriers).

ESTRUCTURA DE TRABAJO — 4 PASES CON CHECKPOINTS:

═══ PASE A — Mecánico: reclassifications missed (1-2h) ═══

Trabajo de bajo riesgo, alto retorno. Sin decisiones de síntesis.

A.1 Webhook CRUD (3 tools restantes a internal):
- `create_webhook`, `update_webhook`, `delete_webhook`
- Patrón a seguir: mismo que `list_webhooks` ya hizo el agente
  anterior (commit `a899743`)
- Mover services, des-registrar, ajustar tests

A.2 Checkout Rules CRUD (4 tools a internal):
- `list_checkout_rules`, `create_checkout_rule`,
  `update_checkout_rule`, `delete_checkout_rule`
- Mismo patrón

A.3 carriers[] filter restoration:
- Issue: Pase 2 cluster 2 reclassificó `ai_rate` a internal.
  ai_rate exponía un parámetro `carriers[]` que filtraba el set
  de carriers a cotizar — capability que `quote_shipment` NO
  cubre actualmente.
- Solución: agregar parámetro opcional `carriers?: string[]` a
  `quote_shipment` que filtre el array de respuesta.
  Description debe documentar el caso de uso.
- Tests: agregar test que verifique filtering correcto.

A.4 Update BREAKING_CHANGES.md con los 7 reclassifications nuevos.

CHECKPOINT A: commit por cada sub-pase.
Esperado: 73 → ~66 tools.

═══ PASE B — Cluster 10: Generated docs wizard (1-2h) ═══

5 tools: `bill_of_lading`, `complement`, `manifest`, `packing_slip`,
`picking_list`. Diseño:

- Crear `envia_generate_document` con param `doc_type: enum
  ['bill_of_lading'|'complement'|'manifest'|'packing_slip'|
  'picking_list']`
- Internamente delega a los 5 services existentes según doc_type
- Description debe enumerar los 5 tipos + "when to use" para cada uno
- Reclassify los 5 tools individuales a internal (services
  preservados)
- Tests: 1 test happy por doc_type + 1 test de error en doc_type
  inválido (Vitest: ≥6 tests nuevos)

CHECKPOINT B: commit `feat(tools): consolidate 5 doc-generation tools
into envia_generate_document wizard`.
Esperado: 66 → 62 tools.

═══ PASE C — Cluster 3: Shipment lists (2-3h, MÁS DIFÍCIL) ═══

8 tools: `list_shipments`, `get_shipments_by_status`,
`get_shipments_status`, `get_shipments_cod`, `get_shipments_ndr`,
`get_shipments_surcharges`, `get_shipment_detail`,
`get_shipment_invoices`.

Decisión de diseño — NO triviales:

C.1 ¿`get_shipment_detail` se mergea o se queda separado?
- Argumento merge: es "list con filter id=X"
- Argumento separate: caso de uso semánticamente distinto
  ("dame el detalle de UNA guía"). Backend usa endpoint distinto
  (/guide/{tracking}).
- Recomendación: SEPARATE. Renombra a `envia_get_shipment` (más
  corto, claro). Description explícita "para UN solo shipment por
  tracking number".

C.2 ¿`get_shipment_invoices` se mergea?
- Backend: endpoint distinto, output distinto (lista de invoices,
  no de shipments).
- Recomendación: SEPARATE. Description rewrite con "when to use".

C.3 Las 6 restantes (`list_shipments`, `get_shipments_by_status`,
    `get_shipments_status`, `get_shipments_cod`, `get_shipments_ndr`,
    `get_shipments_surcharges`):
- TODAS son listas de shipments, diferenciadas por filter
- Decisión: 1 sola tool `envia_list_shipments` con discriminator:
  ```
  filter_type: enum [
    'all',           // default — no filter
    'by_status',     // requires status_id param
    'cod_only',      // shipments con COD
    'ndr',           // non-delivery reports
    'surcharges'     // shipments con surcharges
  ]
  ```
- IMPORTANTE: cross-reference con QUERIES_DEEP_REFERENCE.md para
  confirmar qué endpoints distintos hay y si cada uno acepta los
  mismos params (page, limit, etc.). Si NO son compatibles, el
  merge puede no funcionar — surface decision.
- Tests: 1 test happy por filter_type + 1 test de bad filter.

C.4 Update BREAKING_CHANGES.md.

CHECKPOINT C: commit por subdecision (C.1, C.2, C.3 separados o
juntos según size).
Esperado: 62 → ~57 tools.

═══ PASE D — Order management consolidation (1-2h) ═══

Análisis pendiente. Tools candidatas:
- `update_order_address`
- `update_order_packages`
- `manage_order_tags`
- `select_order_service`
- `list_orders` + `get_orders_count` + `get_order_filter_options`
- `fulfill_order`

D.1 Validar hipótesis: ¿son genuinamente overlap o casos distintos?
Cross-reference con QUERIES_DEEP_REFERENCE.md (orders endpoints).

D.2 Decision tree:
- Si los 4 update_* tools usan el MISMO endpoint con distinto body
  → merge a `envia_update_order` con action enum
- Si usan endpoints distintos → keep separate, pero rewrite
  descriptions para diferenciar
- `list_orders` + `get_orders_count` + `get_order_filter_options`:
  el primero típicamente devuelve metadata (total_count,
  available_filters) — posible merge a 1 con flag `include_metadata`

D.3 `fulfill_order` — verificar si overlapea con
`select_order_service` o algún otro.

CHECKPOINT D: commit por decisión.
Esperado: 57 → ~54 tools.

═══ PASE E — Wizard-as-mutation completion (2-3h, OPCIONAL) ═══

ESTE PASE ES OPCIONAL — solo ejecutar si los pases A-D te dejan
tiempo dentro de las 8h presupuestadas.

Issue: el wizard `envia_create_international_shipment` actual
(commit `fb8221e`) es pre-flight only — devuelve un payload listo
para `envia_create_shipment` pero no hace el create. Esto deja
Observation B del spec mitigada solo a la mitad.

Solución: extraer el service layer de `src/tools/create-label.ts`
a `src/services/shipment-creation.ts`, y que el wizard llame ese
service internamente. NO duplicar código.

Pasos:
E.1 Identificar las funciones puras dentro de create-label.ts
    que pueden moverse a un service.
E.2 Crear `src/services/shipment-creation.ts` con esas funciones.
E.3 `create-label.ts` (la tool) ahora solo wrapea el service.
E.4 Wizard llama el service después del pre-flight.
E.5 Tests: agregar test al wizard cubriendo end-to-end MX→US.
E.6 Verificar que `envia_create_shipment` sigue funcionando idéntico.

Si el refactor es más grande de 200 LOC, surface y deja como
follow-up — no fuerces la complejidad.

CHECKPOINT E: commit `feat(tools): wizard now executes shipment
creation end-to-end (Observation B fully mitigated)`.

═══ PASE F — Description hardening sweep (30 min) ═══

Para CADA survivor de cualquier cluster tocado en Pases A-D
(NO los 6 que ya rewrote el agente anterior), aplicar el "when to
use / when NOT to use" pattern:

F.1 Identificar survivors:
- Pase A: `quote_shipment` (con carriers[] new param) — agregar
  caso al "when to use"
- Pase B: `envia_generate_document` (nuevo wizard)
- Pase C: `envia_list_shipments` (consolidated), `envia_get_shipment`
  (renamed), `envia_get_shipment_invoices` (kept)
- Pase D: cualquier nuevo merger o survivor

F.2 5-prompt synthetic test por description nueva (mismo
patrón que Pase 1+2+3).

F.3 Document en BREAKING_CHANGES.md el rewrite si es material.

DISCIPLINA NO NEGOCIABLE:

Idéntica a Pase 1+2+3. Resumido:
- Cero changes silentes a behavior
- Description quality ≥ count reduction
- L-G3: no push, branch local + commit + Jose mergea
- L-T2: cada commit deja suite verde (1654+ → ≥1654 después de
  agregar tests nuevos)
- L-T4: cross-check antes del último commit
- Conservación: services se preservan, NO se eliminan archivos

COORDINATION CON AGENTIC-AI TEAM:

Update `_docs/TOOL_CONSOLIDATION_BREAKING_CHANGES.md` extendiendo
el doc existente con sección "Pase 2-bis additions". Mantén la
estructura del doc original (por categoría: removed / renamed /
schema_changed / reclassified / new). Jose coordina con
agentic-ai post-merge.

ESCAPE HATCHES:

- Cluster 3 C.3: si descubres que los 6 list endpoints tienen
  shapes de respuesta materialmente distintas (diferentes campos,
  no solo subset), surface — el merge puede no ser viable y
  necesitas re-divide la propuesta.
- Pase E: si el extract del service layer requiere más de 300
  LOC moved, déjalo como follow-up. La meta principal es count
  reduction (Pases A-D), wizard completion es bonus.
- Si `fulfill_order` o cualquier otro tool en §C resulta tener
  caso de uso único legítimo: keep separate, rewrite description,
  documenta el "rejected merge" en BREAKING_CHANGES.md.
- Si la sesión se acerca al context limit: commit lo completado
  en el pase actual, surface el estado, deja prompt para sesión
  siguiente.

OBJETIVO HONESTO:

- 73 → 54 ± 3 tools registradas como LLM-visible
- 7-12 commits checkpoint
- BREAKING_CHANGES.md extendido con todas las reclassifications,
  merges, renames de esta sesión
- carriers[] capability restored
- Idealmente wizard-as-mutation completado (Pase E)
- Self-assessment honesto al cierre

OUT OF SCOPE EXPLÍCITO:

- Reducción a ~40 (sigue reservada para sesión Pase 4 con Datadog
  data, mismo override que Pase 1+2+3)
- Coordinación directa con agentic-ai (Jose lo hace post-merge)
- Eliminar código de tools reclassified (services preservados,
  re-promotables)
- Cambios en backend (100% MCP-side)
- Description rewrites de los 6 tools que ya hizo el agente
  anterior — esos ya pasaron 5-prompt test

HANDOFF AL CIERRE:

Entrega:
1. Count final de tools registradas (esperado ~54).
2. Diff total: tools removed/reclassified/merged/renamed/added por
   pase.
3. Path al BREAKING_CHANGES.md actualizado.
4. 5-prompt synthetic test results para nuevas descriptions.
5. ⚪ Pending list explícita (lo no resuelto, con razón).
6. Capability restorations confirmadas (carriers[] + wizard-as-mutation
   si Pase E ejecutado).
7. Recommendations para Pase 4 cuando llegue Datadog data:
   tools con preliminary signal de bajo tráfico (basado en logs
   recientes de Heroku, no Datadog), clusters que ameritan
   re-evaluation.
8. PR description draft.
9. Commit count + SHAs por pase.

AUTORIDAD:

Jose Vidrio (jose.vidrio@envia.com) es el único decisor. Decisiones
de "merge vs separate" en clusters borderline, "el refactor del
service layer es muy grande", o cualquier ambigüedad de scope se
surface y espera input. NO decidas unilateralmente sobre breaking
changes que afecten agentic-ai más allá de los pases A-D listados.

Arranca.
```

## Why this opening is structured this way

- **Contexto explícito de sesión anterior** previene que el nuevo
  agente repita trabajo o desconozca decisiones ya tomadas. Lista
  exacta de "ya hecho" + "pendiente" + "missed" elimina ambigüedad.
- **Override de Datadog explícito otra vez** — el agente anterior
  respetó el override y este también debe.
- **5 pases con A-D obligatorios + E opcional** — protege contra
  scope creep. Si E se vuelve grande, agente surface en lugar de
  consumir 4h de las 8 disponibles.
- **Cluster 3 C.1/C.2/C.3 split granular** — el cluster más grande
  pendiente. Sin guidance, el agente puede tomar decisiones
  inconsistentes (mergear get_shipment_detail incorrectamente, por
  ejemplo).
- **Cross-reference obligatorio con DEEP_REFERENCE docs** — los
  deep references ahora existen y son la fuente de verdad de
  endpoint compatibility. El agente anterior podría haber
  consultado más; este debe hacerlo.
- **PASE F al final, no al inicio** — agente anterior rewrote
  descriptions de 6 tools. Esto extiende el set sin redundar.
- **Capability restoration explícita** — el agente anterior
  documentó como pending pero no lo cerró. Este pase tiene como
  meta cerrarlo (Pase A.3 + Pase E).
