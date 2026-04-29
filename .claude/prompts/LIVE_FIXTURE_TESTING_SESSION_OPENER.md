# Session opener — Live Fixture Testing implementation

> Paste this verbatim as the opening message of a new session. The
> session executes `_docs/specs/LIVE_FIXTURE_TESTING_SPEC.md` to
> replace hand-typed test fixtures with byte-for-byte captures of
> real sandbox responses.

## Model + duration

- **Model:** Sonnet 4.6 (TypeScript implementation work, well-scoped
  spec, mechanical migration phase).
- **Estimated duration:** 5–7 hours single session per spec §0;
  account for 8–10 hours if PII redaction edge cases turn out to be
  more numerous than anticipated.
- **Companion dependency (must be done):** Zod Phase 1 already shipped
  to production (release 1.1.0, deployed 2026-04-29). The Zod schemas
  are the validation layer for fixtures captured by this work.

## Opening message (copy from here)

```
Sesión de implementación — bar: live fixtures como source of truth
para el shape del backend, de modo que cualquier drift se detecte
en el working tree antes de llegar a un usuario.

Modelo: Sonnet 4.6. Duración esperada: 5-7 horas (margen hasta 10).

PRE-FLIGHT (en orden, antes de cualquier cambio):

1. `git status` desde el monorepo root
   (`/Users/josealbertovidrio/Documents/git_Proyects/envia-repos`).
   Si hay WIP: `git stash push -u -m "pre-livefixture-WIP"`.
2. Working directory: `ai-agent/envia-mcp-server/`. Todas las rutas
   relativas en este opening y en el spec son desde aquí.
3. Crear branch desde main: `git checkout -b feat/live-fixture-testing`
   (NO trabajar directo en main, NO push — L-G3).
4. Verificar build limpio antes de empezar: `npm run build` (exit 0)
   y `npx vitest run` (1648 tests pass). Si esto NO pasa, la línea
   base está rota — surface y no procedas.

LECTURA OBLIGATORIA, en este orden:

1. ai-agent/envia-mcp-server/_docs/LESSONS.md — end-to-end. Particular
   atención a:
   - L-S2 (portal-user test): los fixtures deben representar lo que
     el agent en el portal realmente recibiría, no edge cases admin.
   - L-S4 (verifica claims numéricos): cada fixture debe acompañarse
     de la fecha de captura y el endpoint exacto.
   - L-S5 (reuse existing): si ya existe un mock helper para el shape,
     extiéndelo en lugar de duplicar.
   - L-T1, L-T2, L-T4 (testing discipline): AAA, factories, cross-check.
   - L-G1, L-G3 (clean tree, no push).
   - L-B1 (real responses, no inventar): ESTE spec literalmente codifica
     L-B1 como infraestructura.

2. ai-agent/envia-mcp-server/_docs/specs/LIVE_FIXTURE_TESTING_SPEC.md
   — el spec completo. Self-contained, zero open questions. Contiene:
   - §1 Goal (Phase 1: 10 tools de Zod migration)
   - §2 Scope explícito (qué SÍ, qué NO en esta fase)
   - §3 Capture script architecture
   - §4 PII redaction rules (regex + structured field map)
   - §5 Fixture file layout en `tests/fixtures/live/`
   - §6 Test migration pattern (3 ejemplos completos)
   - §7 Diff-based drift detection
   - §8 Acceptance criteria + commit checklist

3. ai-agent/envia-mcp-server/_docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md
   — companion spec, ya implementado. Las Zod schemas en
   `src/schemas/*.ts` son el validador que cada fixture debe pasar.
   Si un fixture capturado falla `safeParse()` contra el schema, hay
   un drift real que documentar (no relajar el schema).

4. ai-agent/envia-mcp-server/src/utils/response-validator.ts y
   src/schemas/*.ts (10 archivos) — la infra de Phase 1 sobre la cual
   esta sesión construye.

5. ai-agent/envia-mcp-server/_docs/SMOKE_TEST_PLAYBOOK.md — los
   payloads canónicos para Rate / Generate / Track. La captura de
   fixtures DEBE usar estos mismos payloads para que los fixtures
   sean reproducibles cross-session.

6. project memory `project_mcp_expansion_plan.md` (en
   `/Users/josealbertovidrio/.claude/projects/.../memory/`) — contexto
   de qué tools fueron migradas en Phase 1 (las 10 con fixtures
   prioritarios).

CREDENCIALES (sandbox — éstas son las que usa el spec):

- Token sandbox:
  `ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3`
- Base URL shipping: `https://api-test.envia.com`
- Base URL queries: `https://queries-test.envia.com`
- Base URL geocodes: `https://geocodes.envia.com` (production-only,
  no sandbox — nota especial cuando captures fixtures de geocodes:
  redacta TODOS los datos de coverage que vengan de prod).

NUNCA usar credenciales de producción en captura de fixtures. Si
necesitas validar contra prod, hazlo OUT-OF-BAND (curl manual,
no hardcodeado en `npm run fixtures:capture`).

DISCIPLINA NO NEGOCIABLE:

- L-B1 codificado: cada fixture es un capture real, NO data
  inventada. Si un endpoint no se puede capturar (e.g., requiere
  estado específico), documenta como ⚪ pending y deja el fixture
  hand-typed con un comentario explícito `// HAND-TYPED — see
  TODO #N for live capture path`.
- PII redaction es BLOCKING. Cada captura pasa por el redactor
  antes de quedar staged. El redactor mismo tiene tests (parte
  del entregable).
- Tests existentes que se migran DEBEN preservar coverage. Si un
  test perdería un edge case al migrarse a fixture live, documenta
  el edge case y deja el test original como `*.edge-case.test.ts`.
- Cada fixture en `tests/fixtures/live/` lleva metadata YAML al
  inicio: endpoint, fecha de captura, schema version, redactor
  version. Sin metadata no se mergea.
- Build + tests deben pasar después de cada commit (no solo al
  final). L-T2 (full isolation): los nuevos tests no dependen del
  orden de ejecución.
- L-G3: no push. Commit autonomously cuando un chunk lógico está
  completo + build clean + tests green (autonomous mode permission D).

COMMIT GRANULARITY (autonomous mode permission D + L-G2):

Mínimo 3 commits para esta sesión:
1. `feat(testing): add live-fixture capture infrastructure` —
   capture script + redactor + fixtures dir layout (sin migrar tests
   todavía).
2. `feat(testing): migrate Phase-1 Zod tools to live fixtures` — los
   10 tools migrados, tests verde.
3. `feat(testing): add drift detection and CI integration` — diff
   tooling, README en `tests/fixtures/live/`.

Si la sesión naturalmente se divide en más, OK. Pero menos de 3 es
señal de bundling — L-G2 violation.

ESCAPE HATCHES:

- Si un endpoint sandbox devuelve shapes diferentes a producción
  (caso conocido del 2026-04-29 con `/company/tickets`): documenta
  AMBOS shapes como fixtures separados (`fixture.sandbox.json`,
  `fixture.prod.json`) con metadata explicativa. NO escojas uno
  sobre el otro silenciosamente.
- Si la PII redaction encuentra un campo nuevo no anticipado por
  el spec: NO improvises la regla. Surface a Jose con ejemplo
  concreto, espera decisión, agrega al spec antes de commitear.
- Si el contexto se acerca al límite: commit parcial con TODO
  list explícita, no apures síntesis.

HANDOFF AL CIERRE:

Entrega:
1. Lista de fixtures capturados (path + endpoint + fecha + schema
   matched: yes/no).
2. Resultado de `npx vitest run` con count antes vs después.
3. Cuántas líneas de hand-typed mock data se eliminaron.
4. Resultado del PII redactor: campos detectados, redacciones
   aplicadas, tests del redactor.
5. Drift findings (si los hay): casos donde el fixture capturado
   NO matched el Zod schema actual — cada uno necesita decisión
   (relajar schema vs. ajustar a backend, NUNCA silenciar).
6. ⚪ pending list: endpoints no capturables, edge cases con
   hand-typed remanente, integraciones futuras (cron, GitHub
   Action nightly).
7. PR description draft.

AUTORIDAD:

Jose Vidrio (jose.vidrio@envia.com) es el único decisor. Cualquier
decisión sobre PII redaction, fixture organization, o drift
resolution se surface y espera input.

Arranca.
```

## Why this opening is structured this way

- **Build/test green check pre-flight** elimina la posibilidad de
  empezar sobre una línea base rota y atribuir fallos al trabajo
  nuevo.
- **Sandbox credentials hardcoded** + **NEVER use prod**: este es el
  failure mode más caro (credenciales reales en fixtures
  públicos). Lección aprendida del session log de hoy.
- **Sandbox vs prod shape divergence escape hatch** captura
  específicamente el caso de `/company/tickets` que descubrimos
  hoy: queremos fixtures de ambos shapes documentados, no uno
  silenciosamente preferido.
- **3-commit minimum** alinea con autonomous mode permission D y
  hace rollback granular posible.
