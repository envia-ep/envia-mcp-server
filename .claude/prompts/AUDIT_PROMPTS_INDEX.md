# Audit Prompts Index — Multi-project deep reference effort

> Master orchestration doc for the 6 audit prompts that produce the
> complete reference documentation across the Envia ecosystem.

## Purpose

The MCP project requires deep, transferable knowledge bases for each backend service it consumes. The pattern is:

1. **Per-project deep reference doc** in `_docs/QUERIES_DEEP_REFERENCE.md`.
2. **Same depth and structure** as `_docs/CARRIERS_DEEP_REFERENCE.md` (gold standard, ~92-95% coverage, 2,142 lines, 40 sections, 3 iterations).
3. **Honest about gaps** — every doc closes with self-assessment + ⚪ pending list.
4. **Decision-relevant** — not just architectural curiosity but enables MCP tool design, debugging, and incident response.

This file lists the 6 prompts, their order, dependencies, and execution guidance.

## The 6 prompts

| # | Project | Prompt file | Status of prior work | Estimated session length |
|---|---------|-------------|----------------------|--------------------------|
| 1 | **carriers** (continuation) | `CARRIERS_CONTINUATION_PROMPT.md` | Already at ~92-95% in v3 (commit `042f91b`); finishes the last ~5-8% | 2-3 hours |
| 2 | **queries** | `QUERIES_DEEP_AUDIT_PROMPT.md` | Memory references exist; no prior deep-ref doc | 3-4 hours (largest) |
| 3 | **geocodes** | `GEOCODES_DEEP_AUDIT_PROMPT.md` | Country rules already curated in `_docs/COUNTRY_RULES_REFERENCE.md`; no prior deep-ref | 2-3 hours (smaller scope, denser rules) |
| 4 | **ecommerce + eshops + ecartApiOauth** | `ECOMMERCE_DEEP_AUDIT_PROMPT.md` | Memory has `discovery_ecommerce_backend.md`; no prior deep-ref | 3-4 hours (3 services bundle) |
| 5 | **admon-monorepo** | `ADMIN_MONOREPO_DEEP_AUDIT_PROMPT.md` | **Primary discovery — no prior docs** | 3-4 hours |
| 6 | **accounts** | `ACCOUNTS_DEEP_AUDIT_PROMPT.md` | Sensitivity-special; mandatory Sensitivity Analysis section + recommendation to Jose | 2-3 hours |

Total estimated effort: **15-21 hours of Opus 4.7 (1M) sessions**, distributed across multiple working days.

## Recommended execution order

**Order rationale:** start with the most-known and lowest-risk to build momentum and validate the approach; end with the highest-stakes audit (accounts) when the bar and expected output structure are well-established.

1. **carriers (continuation)** first — small (~5-8% remaining), validates the audit pattern continues to work after iteration. Output: `_docs/CARRIERS_DEEP_REFERENCE.md` extended to ~98-100%.
2. **queries** — the second-most-relied service for the MCP. Heavy use of memory references. Output: `_docs/QUERIES_DEEP_REFERENCE.md`.
3. **geocodes** — smallest scope but densest in country rules. Important to do BEFORE ecommerce because geocodes country logic informs how ecommerce platforms are normalized. Output: `_docs/GEOCODES_DEEP_REFERENCE.md`.
4. **ecommerce bundle** — 3 services together. Output: `_docs/ECOMMERCE_DEEP_REFERENCE.md`.
5. **admin-monorepo** — primary discovery, mostly admin-only classification (LESSON L-S6). Output: `_docs/ADMIN_MONOREPO_DEEP_REFERENCE.md`.
6. **accounts** — highest stakes (sensitivity, security). Should be done LAST because the rigor learned from prior audits raises the bar for this one. Output: `_docs/ACCOUNTS_DEEP_REFERENCE.md` + a clear inclusion recommendation.

## Dependencies between audits

| Audit | Depends on |
|-------|-----------|
| carriers (continuation) | Baseline (existing v3 doc) |
| queries | None (parallelizable with #1) |
| geocodes | None (parallelizable) |
| ecommerce | Optional cross-reference with queries (the `tmp-fulfillment` chain) |
| admin-monorepo | None (parallelizable with #1, #2, #3) |
| accounts | Reference carriers' Guard.php analysis (already in carriers doc); cross-reference token claims |

**Parallelism opportunity:** #1, #2, #3, #5 can run in **separate parallel sessions**. #4 benefits from #2 being done first. #6 should be last.

## Usage instructions

For each prompt:

1. Open a **new** Claude Code session (or another LLM with similar capabilities and tool access).
2. **Use Opus 4.7 (1M context)**. Sonnet won't have the depth for the synthesis phase.
3. Paste the **opening message template below** (don't use a bare 2-line "execute this prompt" — the bar requires explicit framing).
4. Let the session run end-to-end. Don't interrupt mid-iteration unless something goes wrong.
5. The session will produce: a doc, 3+ commits, a handoff summary at the end.
6. After each session: review the handoff summary, the commit messages, and skim the new doc.

## Opening message template (copy-paste, substitute placeholders)

Replace `<PROJECT>` with carriers/queries/geocodes/ecommerce/admin-monorepo/accounts and `<PROMPT_FILE>` with the corresponding `.md` file from `.claude/prompts/`.

```
Sesión de deep reference audit del proyecto <PROJECT> — bar: ser el mejor del mundo.

Modelo: Opus 4.7 (1M context). Duración esperada: 2-4 horas.

PRE-FLIGHT (antes de cualquier lectura, ejecuta los 3 en orden):

1. `git status` desde el monorepo root. Si hay WIP no commiteado:
   `git stash push -u -m "pre-<PROJECT>-audit-WIP"`. Restáuralo al
   cierre si aplica. Esto cumple LESSON L-G1 y evita que el audit
   mezcle líneas con trabajo previo. Default seguro: stash. Sólo
   commitea si el WIP tiene un checkpoint lógico claro.
2. Confirma modelo: Opus 4.7 (1M context). Si estás en Sonnet,
   aborta y abre Opus — la profundidad requerida no se logra con
   un modelo más chico.
3. Working directory: `ai-agent/envia-mcp-server/` para todas las
   rutas relativas en este opening y en los runbooks.

LECTURA OBLIGATORIA, en este orden exacto:

1. ai-agent/envia-mcp-server/_docs/LESSONS.md — end-to-end. Cada lección
   encoda una corrección que pagué antes; ignorarlas repite mistakes.

2. ai-agent/envia-mcp-server/_docs/CARRIERS_DEEP_REFERENCE.md — gold
   standard. 40 secciones, 2,142 líneas (~53k tokens, ~5% de tu context
   budget en Opus 1M), 3 iteraciones documentadas. ESTE es el bar de
   profundidad y estructura. Si tu output no replica este nivel, no es
   suficiente.

   LECTURA OBLIGATORIAMENTE COMPLETA Y SECUENCIAL. No selectiva — los
   patrones críticos (iteración 1→2→3, cross-check pass, honesty traps,
   self-assessment honesto) están dispersos en §10, §15, §20-22, §28,
   §30, §40. Lectura parcial garantiza output insuficiente. El costo
   de los 53k tokens es trivial vs el costo de producir un doc que
   falle el bar.

3. ai-agent/envia-mcp-server/.claude/prompts/<PROMPT_FILE> — runbook
   ejecutable: scope, methodology, quality gates, honesty traps,
   anti-patterns. Síguelo paso a paso.

RESOLUCIÓN DE RUTAS DEL PROYECTO AUDITADO:

- Primer intento: `services/<PROJECT>/` desde el monorepo root.
- Fallback: `repos_extra/<PROJECT>/` (aplica para accounts y
  ecart-payment).
- Si ninguno existe, usa `find` desde el monorepo con el nombre del
  proyecto. NUNCA inventes paths; si no encuentras, surface el blocker
  al cierre con ⚪ pendiente — no procedas con paths supuestos.

IDIOMA DEL DOC PRODUCIDO:

- Inglés (consistente con `services/carriers/CLAUDE.md` y todos los
  docs existentes en `ai-agent/envia-mcp-server/_docs/`).
- Citas a T&C, knowledge-base u otros docs en español se mantienen en
  español dentro de bloques quote, no se traducen.

DISCIPLINA NO NEGOCIABLE:

- Iteración 1 SIEMPRE produce output superficial. No la aceptes como
  final bajo ninguna circunstancia. La señal de que iteraste mal es
  que iter-2 no encontró nada que corregir — eso es prácticamente
  imposible y revela cross-check insuficiente.
- Cross-check pass (LESSON L-T4) es obligatorio antes del commit final.
  Mínimo: 3 claims numéricos al azar verificados contra source por
  cada sección sintetizada por explorer agents.
- Cita archivo:línea (o csv:row, o knowledge-base path) para cada
  claim cuantitativo. Cero "approximately X" o "around Y".
- Cuando dudes entre conservador y permisivo, elige conservador.
  Marca ⚪ pending sobre lo que no puedas verificar.
- No push a remote (LESSON L-G3). No code changes (es audit, no
  implementación).
- No tomes decisiones unilaterales que requieran criterio humano.
  Surface el dilema con opciones y espera input (LESSON L-P1).

OBJETIVO HONESTO:

- ~92-95% structural coverage. NO 100%. La búsqueda obsesiva del 100%
  produce inventar; la honestidad sobre el ~5-8% restante es output
  de valor.
- 3 commits incrementales mostrando iteración v1 → v2 → v3.
- Self-assessment al cierre con conteo de ⚪ pending.

ESCAPE HATCHES:

- Si el contexto se acerca al límite durante synthesis: commit parcial
  con audits completos + WIP master doc, surface el estado, no apures
  síntesis.
- Si un explorer agent devuelve output visiblemente incompleto
  (counts muy bajos comparados con expectativa del prompt):
  relánzalo con scope más específico antes de sintetizar. NO aceptes
  trabajo superficial por ahorrar tiempo.
- Si descubres algo claramente fuera del scope del proyecto pero útil:
  marca como pending y avisa al cierre, no expandas el audit
  unilateralmente.

HANDOFF AL CIERRE:

Entrega:
1. Path al doc producido + line count + section count.
2. Total commits y SHAs.
3. Top 5 hallazgos sorpresivos descubiertos durante deep-reads.
4. Resumen de correcciones del cross-check pass (qué encontraste vs
   qué los explorer agents reportaron originalmente).
5. ⚪ pending list explícita (qué quedó fuera y por qué).
6. Open questions concretas para el equipo backend (con paths o SQL).
7. Coverage estimada honestamente (% structural).
8. Recomendación de la siguiente sesión.

AUTORIDAD:

Jose Vidrio (jose.vidrio@envia.com) es el único decisor. Cualquier
ambigüedad de scope o decisión de inclusión se surface y espera
input. No decidas unilateralmente.

Arranca.
```

### Why this opening is structured this way

The bare 2-line opening (`Lee y ejecuta X. Step 0: LESSONS.md.`) is **insufficient** for a "best in world" bar because:

1. **No model anchor** — risk of using wrong model.
2. **No bar cultural anchor** — "mejor del mundo" needs to be the first thing the agent sees.
3. **No anti-iter-1 reminder** — agents reliably produce surface-level first drafts; without an explicit anti-pattern callout in the opening, this is rationalized as "complete".
4. **No honest-gap target** — without "92-95%, not 100%", agents invent to fill gaps.
5. **No escape hatches** — without them, the agent makes silent decisions when reality diverges from plan.
6. **No handoff format** — without it, handoffs vary wildly in usefulness.

The template above costs ~30 seconds to read and ~10 seconds to copy-paste-substitute. The alternative is risking 2-4 hours of session output that doesn't meet the bar.

## Quality bar (universal across all 6 prompts)

Every output doc must:

- [ ] Cite file:line OR csv:row OR knowledge-base path for every quantitative claim.
- [ ] Have explicit ⚪ markers for partial sections.
- [ ] Close with a self-assessment section showing % structural coverage and remaining gaps.
- [ ] Be 1,200-3,200 lines (varies by project size).
- [ ] Show iteration evidence in commit history (3 commits per audit minimum).
- [ ] Include cross-check pass findings (LESSON L-T4).
- [ ] Apply LESSON L-S2 (portal-user test), L-S6 (no admin tools), L-S7 (org boundaries) consistently.

## Common pitfalls to avoid

These are baked into each prompt but worth highlighting:

1. **Iter-1 surface-level synthesis** — explorer agents reliably produce surface-level first drafts. The cross-check pass IS the iter-2 mechanism that finds the real depth.
2. **Inferring numbers from code** — always cite the source. The carriers iter-1 misclassified `tooltip_amount` as per-product when it was per-user — found only in iter-3 by reading the actual SQL.
3. **Trusting reference docs uncritically** — memory references can be 27+ days old (warning system shows this). Treat as priors to verify, not facts.
4. **Skipping the gold standard read** — every prompt mandates reading `_docs/CARRIERS_DEEP_REFERENCE.md` first. Skipping it means the bar isn't internalized and the output ends up at iter-1 quality.
5. **Pushing without permission** — LESSON L-G3 is non-negotiable. All commits stay local until Jose explicitly approves push.

## What happens after all 6 audits complete

The bundle of 6 deep-reference docs becomes the **canonical knowledge base** for any future MCP work involving the Envia ecosystem backends. Then:

- A **Decision Session** (Opus, 1M) reads the 6 docs and produces a **per-endpoint inclusion decision matrix** for new MCP tools.
- That decision matrix feeds into **Sprint 4+ implementation prompts** that specify exactly which tools to build, with code paths to follow.
- The 6 deep-ref docs are maintained as the project evolves; updates are small append-or-correct passes, not redos.

This is the multi-session strategic pattern Jose authorized. Each session is finite and high-quality; the cumulative output is comprehensive coverage.

## Cross-cutting LESSON references for all sessions

These LESSONS apply to every audit and are quoted in every prompt:

- **L-S1** V1 production = source of truth.
- **L-S2** Portal-embedded scope criterion: "would a typical authenticated portal user ask this in chat?".
- **L-S4** Verify numeric/structural claims; don't defend, verify.
- **L-S5** Reuse infrastructure; don't parallel-build.
- **L-S6** No admin/dev tools to the LLM.
- **L-S7** Organizational ownership boundaries.
- **L-B1** Test against real responses.
- **L-B4** Source-of-truth docs first; `_meta/` and `reference_*` before code.
- **L-T4** Cross-check explorer reports.
- **L-G1** Clean tree first.
- **L-G3** Never push without explicit instruction.
- **L-P1** Surface decisions; don't make unilaterally.
- **L-P4** Resist scope creep.

## Maintenance

When this doc itself needs updates (new project added to scope, audit completed, prompt revised):

1. Update the table of 6 prompts.
2. Note in commit message what changed.
3. Update memory `MEMORY.md` index entry pointing here.
