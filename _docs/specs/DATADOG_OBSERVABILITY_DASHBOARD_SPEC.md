# Spec — Datadog Observability Dashboard for the MCP Server

**Version:** v1 — drafted 2026-04-28 by Jose Vidrio (CTO) + Claude Opus 4.7.
**Status:** READY FOR IMPLEMENTATION (DevOps / SRE session, expected after Zod Phase 1 has landed).
**Estimated effort:** 4–6 hours single session (mostly Datadog UI + Terraform).
**Companion specs:** `RUNTIME_ZOD_VALIDATION_SPEC.md` (data source for `schema_validation_failed` events), `LIVE_FIXTURE_TESTING_SPEC.md` (complementary).

---

## Audience

You are the operations / SRE engineer (or AI session with Datadog
admin permissions) building the production observability dashboard
for the Envia MCP server. This spec specifies what to build, what
each panel measures, what alert thresholds are set, and how to
publish.

This spec is NOT for an AI session that writes TypeScript — the work
is Datadog configuration. If using Terraform for Datadog (recommended),
the Terraform deltas go in the existing infra repo, not in
`envia-mcp-server`.

---

## 1. Goal

Productionize observability for the MCP server so that:

1. **Drift surfaces in minutes, not weeks.** When the backend changes
   shape, the relevant Datadog alert fires before users notice.
2. **Tool usage is measurable.** We can answer "which 10 tools are
   the most-called", "which tool has the highest error rate",
   "which tool's p99 latency just regressed".
3. **Tool consolidation (next spec) has data.** The audit to drop
   from 73 tools to ~40 needs usage metrics by tool — those metrics
   come from this dashboard.
4. **Incidents have a single pane of glass.** When something breaks,
   on-call opens this dashboard first.

**Success looks like:** the next time a backend deploy introduces a
shape mismatch, the Datadog "diversity alert" fires within 5 minutes
of the first request. On-call receives a page with the affected tool
and a link to the dashboard panel showing the issue rate.

**Out of scope:** synthetic monitoring (canary calls), custom log
parsers, Datadog APM trace sampling tweaks (those are infra-team
decisions outside this spec), error-budget tracking against SLOs
(separate quarterly effort).

---

## 2. Background — what we have today

The MCP server already emits structured pino logs with correlation
IDs (Sprint 4a, commit `af71e0b`). Every tool call produces:
- `tool_call_start` (when the tool handler runs).
- `tool_call_complete` (success path) — with `tool`, `duration_ms`,
  `status: "success"`.
- `tool_call_failed` (failure path) — with `tool`, `error_class`,
  `error_message`.

After Zod Phase 1 ships:
- `schema_validation_failed` (drift signal) — with `tool`,
  `issue_count`, `issues` (sanitized: path, code, message).

These events flow to Datadog via the existing pino → stdout →
Heroku logs → Datadog log integration (already configured at the
Heroku-app level — verify before starting the dashboard work).

**What does NOT exist today:**
- A dashboard collecting these events into views.
- Alerts on them.
- A runbook for on-call.

This spec delivers all three.

---

## 3. Design decisions

### 3.1 One dashboard, multiple sections

A single dashboard with collapsible sections:
- **Overview** (always-visible top): aggregate health.
- **Tool usage** (volume by tool).
- **Tool latency** (p50, p95, p99 by tool).
- **Tool errors** (failure rate + types).
- **Schema drift** (the new `schema_validation_failed` from Zod).
- **Backend dependencies** (queries / carriers backend latency, if
  the existing logs carry it).

Rationale: a dashboard sprawl over 5 separate dashboards loses the
"one pane" property. Sections are collapsible so on-call can focus.

### 3.2 Time-window default: 24h, with quick zoom to 5min

Default window 24h shows daily patterns. Quick-zoom buttons at the
top let on-call drop to "last 5 min", "last 1 h", "last 24 h",
"last 7 d" with one click.

### 3.3 Alerts ride on the same metrics — no separate query layer

Datadog alerts use the same log queries as the dashboard panels.
Reason: alert behaviour exactly matches what's visible. No "alert
said X but dashboard says Y" confusion.

### 3.4 Alert severity tiers

- **P1 (page immediately):** systemic problem affecting many tools.
- **P2 (page during business hours):** localised drift on a single
  high-traffic tool.
- **P3 (Slack notification, no page):** background drift, low
  urgency.

Each alert is documented in §6 with severity, runbook link, and
auto-resolve criteria.

### 3.5 Provisioning path: Terraform first, manual fallback

If Envia uses `dd-cli` or Terraform for Datadog config, the
dashboard + alerts go in IaC. If not, manually click in Datadog UI
and export the JSON definition into this repo at
`_docs/observability/dashboard.json` for review/version control.

The implementer documents which path was used in the final report.

### 3.6 No PII in dashboard queries

Datadog queries reference fields from the structured logs (tool
name, error_class, etc.). The Zod helper (companion spec §3.10 S1)
ensures these never carry PII. Verify by spot-checking one query
result in Datadog and confirming no customer data appears.

If any query inadvertently surfaces a value that looks like PII
(phone, email, address), STOP — that means the upstream logger has a
leak. Fix the leak before publishing the dashboard.

### 3.7 Versioning

Each dashboard / alert change goes through a PR (whether IaC or JSON
export). Changelog at the top of `_docs/observability/dashboard.json`
records every modification.

---

## 4. Dashboard layout

### 4.1 Top bar

- **Time range selector** (5m, 1h, 24h default, 7d).
- **Environment filter** (sandbox / staging / production). Default
  production.
- **Tool filter** (multi-select, default = all).
- **Search box** (free text on log message).

### 4.2 Section "Overview" (always visible)

Four single-stat panels in one row:

| Panel | Query (concept) | Healthy range |
|---|---|---|
| **Total tool calls (24h)** | `count of tool_call_complete + tool_call_failed events` | varies; baseline established after 1 week of traffic |
| **Success rate (24h)** | `tool_call_complete / (complete + failed) * 100` | >99% in steady state; drop below 99% triggers P3 |
| **Schema drift events (24h)** | `count of schema_validation_failed` | 0 in steady state; any non-zero is P3 |
| **Median p95 latency (24h)** | `percentile(duration_ms, 95) across all tools` | depends on tool mix; alert on >50% increase week-over-week |

### 4.3 Section "Tool usage"

Two panels:

**Panel U1 — Top 20 most-called tools (last 24h, bar chart)**

Datadog log query (sketch — adapt to actual query syntax):
```
service:envia-mcp-server status:info @event:tool_call_complete
| fields @tool
| stats count by @tool
| sort -count
| head 20
```

**Panel U2 — Bottom 20 least-called tools (last 7d, bar chart)**

Same query, reverse sort. Tools with zero calls in 7 days are
candidates for the consolidation audit (companion spec).

### 4.4 Section "Tool latency"

Two panels:

**Panel L1 — p50 / p95 / p99 latency by tool (heatmap, last 24h)**

Datadog timeseries or heatmap (whichever is clearer at the
expected cardinality of 73 tools):
```
service:envia-mcp-server @event:tool_call_complete
| stats percentile(duration_ms, 50, 95, 99) by @tool
```

**Panel L2 — Latency week-over-week change (table)**

For each tool, show this-week-p95 vs last-week-p95, with %
change. Sorted by % change descending so regressions surface at
the top.

### 4.5 Section "Tool errors"

Three panels:

**Panel E1 — Failure rate by tool (last 24h, line graph)**

```
service:envia-mcp-server @event:tool_call_failed
| stats count_over_time(1m) by @tool
```

**Panel E2 — Top error classes by frequency (last 24h, pie chart)**

```
service:envia-mcp-server @event:tool_call_failed
| stats count by @error_class
```

**Panel E3 — Most-failing tools (last 24h, table)**

Tool name, total calls, error count, failure rate %. Sorted by
failure rate descending.

### 4.6 Section "Schema drift" (NEW — depends on Zod Phase 1)

Three panels (already documented in
`RUNTIME_ZOD_VALIDATION_SPEC.md` §15.1, restated here for
completeness):

**Panel D1 — `schema_validation_failed` event rate by tool**

```
service:envia-mcp-server @event:schema_validation_failed
| stats count_over_time(1m) by @tool
```

Expected baseline: 0. Any non-zero = P3 alert.

**Panel D2 — Top 10 tools with most schema-drift events (last 24h)**

```
service:envia-mcp-server @event:schema_validation_failed
| stats count by @tool
| sort -count
| head 10
```

**Panel D3 — Issue paths heatmap (last 24h)**

Aggregate `issues[*].path` across all `schema_validation_failed`
events. Useful for "is this one field, or many?".

### 4.7 Section "Backend dependencies"

Two panels (only if existing logs carry backend latency — verify
before adding):

**Panel B1 — Outbound HTTP latency by backend (queries / carriers /
geocodes)**

`@event:tool_call_complete | stats percentile(duration_ms, 95) by @backend`

**Panel B2 — Backend error rate (queries / carriers / geocodes)**

Counts of `tool_call_failed` partitioned by inferred backend (the
tool's known target — derived from BACKEND_ROUTING_REFERENCE.md).

If existing logs do NOT carry the `@backend` dimension, add it as a
follow-up: emit it from `decorateServerWithLogging` based on the
target URL. Out of scope for this dashboard spec — flag for next
sprint.

---

## 5. Alerts

Each alert has: query, threshold, severity, runbook (one-line),
auto-resolve.

### 5.1 P1 — Schema drift across many tools (diversity alert)

**Query:**
```
service:envia-mcp-server @event:schema_validation_failed
| stats count_distinct(@tool) over 5m
```

**Threshold:** `> 5` distinct tools simultaneously firing
`schema_validation_failed`.

**Severity:** P1 (page immediately).

**Runbook:** "Backend likely shipped a breaking change. Identify
the common field across the affected tools (use Panel D3). Hotfix
the affected schemas in the MCP. Coordinate with backend team to
confirm intent."

**Auto-resolve:** distinct count drops below 5 for 10 consecutive
minutes.

### 5.2 P1 — MCP server down

**Query:**
```
service:envia-mcp-server @event:tool_call_complete
| stats count over 5m
```

**Threshold:** `< 1` (zero events for 5 minutes during business
hours = the MCP is not receiving traffic, which is suspicious).

**Severity:** P1.

**Runbook:** "Check Heroku app status. Check chat agent (agentic-
ai) — the MCP receives no traffic if its only consumer is down."

**Auto-resolve:** count > 0.

### 5.3 P2 — Single tool high schema-drift rate

**Query:**
```
service:envia-mcp-server @event:schema_validation_failed
| stats count over 5m by @tool
```

**Threshold:** any single tool > 20 events / 5 min.

**Severity:** P2 (page during business hours).

**Runbook:** "Backend changed shape on this tool's endpoint.
Re-capture the live fixture (live-fixture spec §5.2), update the
Zod schema, ship. Until then, MCP returns slightly drifted data
to users (warn mode default per Zod spec §3.1)."

**Auto-resolve:** rate drops below 5/5min for 10 minutes.

### 5.4 P2 — Single tool failure rate spike

**Query:**
```
service:envia-mcp-server @event:tool_call_failed
| stats count_over_time(5m) by @tool
| join (
    @event:tool_call_complete
    | stats count_over_time(5m) by @tool
)
| eval failure_rate = failed / (failed + complete) * 100
```

**Threshold:** failure_rate > 25% for any tool over a 5-minute
window with at least 10 calls (avoid alerting on a single failed
call out of 2).

**Severity:** P2.

**Runbook:** "Tool X is failing >25% in last 5 min. Likely backend
issue. Check Panel E2 for error_class — auth, validation, 5xx?"

**Auto-resolve:** rate drops below 10% for 10 minutes.

### 5.5 P3 — Sustained low-rate schema drift

**Query:**
```
service:envia-mcp-server @event:schema_validation_failed
| stats count over 30m
```

**Threshold:** > 0 events for 30 consecutive minutes.

**Severity:** P3 (Slack only).

**Runbook:** "A tool is receiving slightly drifted shapes from
backend. Not urgent but warrants a schema update within a sprint."

**Auto-resolve:** count = 0 for 30 minutes.

### 5.6 P3 — Latency regression

**Query:**
```
service:envia-mcp-server @event:tool_call_complete
| stats percentile(duration_ms, 95) over 1h by @tool
```

**Threshold:** any tool's p95 increases > 50% week-over-week (this
requires Datadog's anomaly detection, not a fixed threshold).

**Severity:** P3.

**Runbook:** "Tool latency regression. Check backend dependency
panels (B1, B2) — is it the upstream backend or the MCP itself?"

**Auto-resolve:** anomaly detection clears.

---

## 6. Runbook

The runbook lives at `_docs/observability/runbook.md` (new file in
the MCP repo, even though Datadog is the operational platform). It
documents, for each alert above:
1. What the alert means.
2. First three diagnostic steps.
3. Most likely root cause.
4. How to mitigate (hotfix, rollback, etc.).
5. How to confirm resolved.

A Sonnet session writing this spec should also produce a first
draft of the runbook based on the alert descriptions in §5.

### 6.1 Runbook table of contents

```
# MCP Server On-Call Runbook

## Section 1 — Alert response by severity
- P1: schema drift across many tools (diversity)
- P1: MCP server down (no traffic)
- P2: single-tool schema-drift spike
- P2: single-tool failure rate spike
- P3: sustained low-rate schema drift
- P3: latency regression

## Section 2 — Common diagnostic queries
- "Show me all tool calls for tool X in last hour"
- "Show me all `schema_validation_failed` events with their issue paths"
- "Show me failure rate by error_class"

## Section 3 — Hotfix workflows
- Backend changed shape, MCP returns drifted data
- A specific tool is failing all calls
- The MCP server is not booting after deploy

## Section 4 — Escalation paths
- Backend bug → backend team channel
- MCP server bug → MCP team channel
- Chat agent bug → agentic-ai team channel
- Heroku platform issue → Heroku status page first
```

---

## 7. Operational verification

### 7.1 Smoke the dashboard against real data

After publishing, on-call (or the implementer) confirms each panel
shows non-empty, sensible data over the last 24h. Specifically:

- Panel "Total tool calls" shows a number matching expectations
  (~100s/min during business hours, less off-hours).
- Panel "Top 20 tools" lists tools that we know are hot (quote,
  create, track).
- Panel "Schema drift" shows zero events (post-Zod-Phase-1; we
  expect zero in steady state).
- Panels show different data for different time windows (zoom test).

### 7.2 Smoke each alert

For each P1/P2 alert, manually trigger the condition once (in
sandbox / staging, not production) and confirm:
- The alert fires within its evaluation window.
- The runbook link works.
- Auto-resolve fires when the condition clears.

For schema-drift alerts (P1 diversity, P2 single-tool), the
trigger is: deploy a temporarily-broken Zod schema in stage,
generate enough traffic to cross threshold, observe alert,
revert.

For latency regression: harder to fake without distorting real
data. Skip the manual test and rely on production observation
over 1-2 weeks.

### 7.3 No PII in dashboard

Click into 5 random panel data points and inspect the underlying
log entries shown by Datadog. Confirm no field surfaces a
customer phone, email, address, or tracking number that would be
PII.

If any does, the upstream logger has a leak (the Zod helper or the
Sprint 4a decorator must NOT log PII per spec §3.10 S1).

---

## 8. Acceptance criteria

- [ ] Dashboard exists in Datadog, exported as JSON to
      `_docs/observability/dashboard.json`.
- [ ] All sections from §4 present and showing data.
- [ ] All alerts from §5 configured.
- [ ] Each alert has been smoke-tested (P1, P2 manually triggered;
      P3 verified via query inspection).
- [ ] Runbook draft committed at `_docs/observability/runbook.md`.
- [ ] PII spot-check passed on 5 panel data points.
- [ ] On-call rotation receives the alert routes (PagerDuty / Slack
      configured per severity).
- [ ] Existing Sprint-4a logger output verified to NOT include PII
      (`Authorization`, `api_key`, customer fields). If a leak is
      found, flag for the next sprint — do NOT block dashboard
      publication.
- [ ] If using Terraform: changes merged to the infra repo, dashboard
      managed by IaC.
- [ ] If manual: JSON export committed and reviewed via PR.

---

## 9. Anti-patterns to avoid

1. **Do NOT include PII in dashboard queries.** Even if Datadog
   redacts it on display, the query string itself is searchable.
2. **Do NOT alert on metrics derived from less than 10 events per
   window.** Statistical noise produces false alarms; pages get
   ignored.
3. **Do NOT couple alerts to different queries than the panels.**
   Alert query = panel query, always.
4. **Do NOT skip the runbook.** An alert without a runbook is a
   page-the-on-call-engineer-without-instructions; that's antagonistic.
5. **Do NOT stack 30 panels in one section.** Each section caps at
   5 panels for cognitive load.
6. **Do NOT page on metric anomalies that auto-resolve in <2 min.**
   Use ≥10-minute auto-resolve windows for P1 and P2 — anything
   shorter triggers re-pages on noise.
7. **Do NOT track the same metric in two panels.** If you find
   yourself doing this, one of them is misnamed; fix the labels.
8. **Do NOT expose the dashboard publicly.** Datadog SSO + role
   restriction — only Envia engineering and ops sees it.
9. **Do NOT skip the smoke tests in §7.** "Looks reasonable" is not
   verification.

---

## 10. Open questions and verified assumptions

- **Q: Do we have an existing PagerDuty / Opsgenie integration with
  Datadog?** A: Verify with Jose / ops before configuring P1/P2
  alerts. If no integration exists, P1/P2 reduce to P3 (Slack-only)
  until paging is set up.
- **Q: Does the MCP service currently emit a `service:envia-mcp-server`
  tag in Datadog?** A: Verify by searching `service:envia-mcp-server`
  in Datadog logs. If no, ops needs to add the tag in the Heroku log
  drain config.
- **Q: Are there existing dashboards for other services (carriers,
  queries) that we should match style/layout?** A: Recommend looking
  at one existing dashboard for visual consistency.
- **Verified assumption:** Pino logs from the MCP flow to Datadog
  via the Heroku log drain (already configured). Confirm by
  searching one known recent event.
- **Verified assumption:** The `schema_validation_failed` event
  added by Zod Phase 1 is structured (JSON), not free-text — so
  Datadog's structured-log query syntax can extract `@tool`,
  `@issues`, etc.

---

## 11. Spec metadata

- **Author:** Claude Opus 4.7 (1M context), session 2026-04-28.
- **Reviewer:** Jose Vidrio (CTO).
- **Operational owner:** Ops / SRE team.
- **Status:** READY FOR IMPLEMENTATION (after Zod Phase 1 ships).
- **Estimated effort:** 4–6 hours (Datadog UI + Terraform delta).
- **Branch target:** `mcp-observability` (created from `mcp-expansion`
  for the runbook draft + JSON export commit; the Datadog config
  itself lives in the IaC repo if applicable).
- **Predecessor specs:** `RUNTIME_ZOD_VALIDATION_SPEC.md` v1.2 (data
  source). `LIVE_FIXTURE_TESTING_SPEC.md` (complementary).

---

## 12. Reporting back

When the session completes, the final response must include:

1. Path to the dashboard JSON export (`_docs/observability/dashboard.json`).
2. Path to the runbook draft (`_docs/observability/runbook.md`).
3. List of alerts configured with their severity and trigger thresholds.
4. Confirmation that each alert was smoke-tested (or noted "skipped
   for safety reasons" with rationale).
5. PII spot-check result: 5 panels inspected, 0 leaks found.
6. Any panel that could not be built because the underlying log
   field was missing (e.g. `@backend` not yet emitted).
7. Any judgment call deviating from this spec.

---

## 13. Session bootstrap prompt

```
Implementa el spec en
_docs/specs/DATADOG_OBSERVABILITY_DASHBOARD_SPEC.md, rama
mcp-observability (crear desde mcp-expansion).

Lee el spec end-to-end ANTES de empezar configuración Datadog. La
mayoría del trabajo es UI o Terraform — no código TS.

Secciones que NO son opcionales:
  - §3.6 No PII en queries
  - §4 Layout completo (overview + 5 secciones colapsables)
  - §5 Alerts (6 totales: 2 P1, 2 P2, 2 P3)
  - §7.3 PII spot-check antes de publicar
  - §6 Runbook draft committed con el dashboard

Al terminar, reporta según §12.

Pre-requisitos:
  - Zod Phase 1 debe estar deployado (sino la sección "Schema drift" tiene 0 datos).
  - Confirmar que el log drain Heroku→Datadog está configurado.
  - Confirmar que existe integration PagerDuty/Slack/etc para alerts.

Bar: production-grade enterprise. Esto es para el on-call de
incidentes reales — debe servir cuando hay presión a las 3am.
```

---

End of spec.
