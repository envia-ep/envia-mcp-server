# Tool Consolidation — Breaking Changes for `agentic-ai`

> **Audience:** the team owning [`agentic-ai`](https://github.com/envia-ep/agentic-ai)
> (the portal-embedded conversational layer that calls this MCP).
>
> **Source session:** 2026-04-29, branch
> `feat/tool-consolidation-qualitative`, Opus 4.7 (1M context).
>
> **Authority:** Jose Vidrio (CTO, jose.vidrio@envia.com). All decisions
> here were taken under the explicit override documented in
> `.claude/prompts/TOOL_CONSOLIDATION_OPENER.md` (CEO directive L-S9
> suspends the "real user demand signal" gate; portal-user test L-S2,
> no admin/dev tools L-S6, and ownership boundaries L-S7 still apply).
>
> **Status:** ready for `agentic-ai` migration. Coordinate timing with
> Jose before merging this branch — old tool names no longer respond.

---

## Summary

The MCP went from **90 LLM-visible tools to 73**. Source files and
helper functions were *retained* — every reclassified tool can still be
called by other internal helpers in this MCP. The change is a
**registration-level breaking change**: the tools listed below are no
longer exposed to the LLM, so any `agentic-ai` prompt or routing logic
that names them by `envia_*` will receive `tool not found`.

| Section | Cluster | Removed from LLM | Why |
|---|---|---|---|
| §1 | 11 — admin / operational | 7 | L-S6: admin, dev, or duplicates |
| §2 | 7 — webhooks | 1 (`envia_list_webhooks`) | Webhook CRUD already internal in Sprint 0 |
| §3 | 1 — branches | 2 | Strict subset of `envia_find_drop_off` |
| §4 | 2 — quoting | 1 (`envia_ai_rate`) | Subsumed by `envia_quote_shipment` default behaviour |
| §5 | 9 — notifications | 2 | Overlap with `envia_list_notifications` / admin |
| §6 | 5 — address CRUD | 2 | Derivable from `envia_list_addresses` / rare action |
| §7 | 6 — client CRUD | 2 | Detail derivable from `envia_list_clients` / admin |
| §8 | 4 — analytics | 2 | Overlap with `envia_get_monthly_analytics` |
| §9 | new wizard | +1 (`envia_create_international_shipment`) | Composed pre-flight (replaces 6-turn LLM loop) |

Net: **-17 + 1 = -16 tools** registered. New surface area: **73**.

> **Deferred (no breaking change yet):**
> - **Cluster 3** — Shipment lists (8 tools). Real merge needs an action
>   enum + multiple backend endpoints; deferred to a follow-up session.
> - **Cluster 10** — Generated docs (4 tools). `envia_generate_*` tools
>   are still individually registered; description tightening only,
>   no count reduction.
> - **Full wizard** — the Pase 3 wizard does pre-flight only, not the
>   actual `/ship/generate` POST. See §9 below.

---

## §1 — Cluster 11 (admin / operational, 7 tools → internal)

| Old tool name | Decision | Replacement / next step |
|---|---|---|
| `envia_list_webhooks`        | RECLASSIFY → internal | Webhook config is admin / dev. Module export retained for internal reuse. |
| `envia_check_billing_info`   | RECLASSIFY → internal | Use `envia_get_billing_info` — it surfaces missing-data signal natively. |
| `envia_list_company_users`   | RECLASSIFY → internal | Team-roster admin, not chat-driven. No replacement. |
| `envia_list_api_tokens`      | RECLASSIFY → internal | Developer-integration setup. No replacement. |
| `envia_list_company_shops`   | RECLASSIFY → internal | Use `envia_list_shops` (orders module — same dataset, used by order management). |
| `envia_get_carrier_config`   | RECLASSIFY → internal | Per-company carrier credentials, admin-only. No replacement. |
| `envia_get_dce_status`       | RECLASSIFY → internal | Brazil DCe compliance niche admin. No replacement. |

`agentic-ai` action: remove these tool names from any prompt / routing
list. If a feature genuinely requires them in chat, escalate to Jose so
the decision can be reopened with explicit reasoning.

---

## §2 — Cluster 7 (webhooks)

The webhook CRUD set (`envia_create_webhook`, `envia_update_webhook`,
`envia_delete_webhook`) was already internal-only as of Sprint 0
(2026-04). This pass deregisters the read-only `envia_list_webhooks` for
consistency: webhook administration is a one-time integration setup, not
a chat-user task.

---

## §3 — Cluster 1 (branches, 4 → 2)

| Old tool name | Decision | Replacement |
|---|---|---|
| `envia_search_branches`      | RECLASSIFY → internal | Use `envia_find_drop_off`. It is a strict superset (same fields + capacity + dimension filters). |
| `envia_search_branches_bulk` | RECLASSIFY → internal | Use `envia_find_drop_off`. **Lost capability:** the bulk endpoint's compact response format. If a high-volume use case needs it, call `find_drop_off` with an aggressive `limit`. |
| `envia_get_branches_catalog` | KEEP | Distinct intent — returns the hierarchical state→localities map for coverage discovery (no concrete branches). |
| `envia_find_drop_off`        | KEEP | Canonical branches-search tool with rewritten description. |

`agentic-ai` action: any prompt mentioning `search_branches` or
`search_branches_bulk` should refer to `envia_find_drop_off`. Inputs are
strictly compatible — `find_drop_off` accepts everything `search_branches`
accepted plus optional capacity / dimension filters.

---

## §4 — Cluster 2 (quoting)

| Old tool name | Decision | Replacement |
|---|---|---|
| `envia_ai_rate` | RECLASSIFY → internal | Use `envia_quote_shipment`. Multi-carrier comparison is its default behaviour (returns ALL services across all carriers, sorted by price). |

**Lost capability:** `envia_ai_rate` accepted an optional
`carriers: string[]` filter to restrict the comparison to a subset
(e.g. `["fedex", "dhl"]`). `envia_quote_shipment` does not currently
expose that param. If a flow needs it, the right fix is to add an
optional `carriers` parameter to `envia_quote_shipment` (low-risk
extension) — out of scope for this session.

---

## §5 — Cluster 9 (notifications, 4 → 2)

| Old tool name | Decision | Replacement |
|---|---|---|
| `envia_get_notification_config` | RECLASSIFY → internal | Use `envia_list_notifications` — its description was rewritten to absorb the "parsed details (tracking number, carrier, amount)" phrasing. |
| `envia_get_notification_prices` | RECLASSIFY → internal | No replacement — per-channel notification pricing is admin/billing curiosity, not chat. |
| `envia_list_notifications`      | KEEP | Now the canonical inbox feed. |
| `envia_get_notification_settings` | KEEP | Channel toggles (email/SMS/WhatsApp/COD/POD). |

---

## §6 — Cluster 5 (address CRUD, 6 → 4)

| Old tool name | Decision | Replacement |
|---|---|---|
| `envia_get_default_address` | RECLASSIFY → internal | Use `envia_list_addresses` and read the `is_default` flag (surfaced via ★ marker). |
| `envia_set_default_address` | RECLASSIFY → internal | **No drop-in replacement.** Rare admin-flavour action; defaults are typically configured during onboarding. If chat ever needs it, propose a wizard. |
| `envia_list_addresses`      | KEEP | Description rewritten with explicit redirects. |
| `envia_create_address` / `envia_update_address` / `envia_delete_address` | KEEP | Standard CRUD. |

---

## §7 — Cluster 6 (client CRUD, 6 → 4)

| Old tool name | Decision | Replacement |
|---|---|---|
| `envia_get_client_detail`   | RECLASSIFY → internal | Use `envia_list_clients` with a `search` filter — its summary fields cover the common chat questions. |
| `envia_get_clients_summary` | RECLASSIFY → internal | Aggregate counters are admin / analytics flavour. No drop-in replacement. |
| `envia_list_clients`        | KEEP | Description rewritten; explicit redirect away from `envia_list_orders`. |
| `envia_create_client` / `envia_update_client` / `envia_delete_client` | KEEP | Standard CRUD. |

---

## §8 — Cluster 4 (analytics, 5 → 3)

| Old tool name | Decision | Replacement |
|---|---|---|
| `envia_get_carriers_stats`   | RECLASSIFY → internal | Use `envia_get_monthly_analytics`. **Lost detail:** the carriers-stats response includes "top origin and destination regions" which monthly analytics does not — internal helper still callable for that data. |
| `envia_get_packages_module`  | RECLASSIFY → internal | Use `envia_get_monthly_analytics`. Per-carrier performance metrics overlap. |
| `envia_get_monthly_analytics` | KEEP | Description rewritten as the canonical carrier-performance dashboard. |
| `envia_get_issues_analytics` | KEEP | Distinct problem-focused intent. |
| `envia_get_shipments_by_status` | KEEP | Distinct status-focused intent. |

---

## §9 — Pase 3 wizard (new tool)

`envia_create_international_shipment` was added as a composed pre-flight
tool. The motivating observation (from the spec) is that the LLM
iterates 6+ turns on cross-border flows asking for fields that
`envia_ai_address_requirements` + `envia_classify_hscode` already know.

### What this wizard does

1. Validates that origin and destination countries differ (else refuses
   with a redirect to the standard flow).
2. Issues two parallel calls: address-requirements GET for the
   destination, plus one classify-HS-code POST per item missing a
   `productCode`.
3. Returns a single text block with: requirements summary, an
   HS-code-enriched item table, and a "Next steps" block hinting that
   the caller should now issue a single `envia_create_shipment`.

### What this wizard does NOT do (yet)

It **does not itself POST `/ship/generate`**. Doing that requires
duplicating ~1,000 LOC of orchestration that lives in
`src/tools/create-label.ts` (carriers fan-out, fulfillment sync, DCe,
tax-rules, identification validation, etc.). Implementing the
"one-shot" wizard properly needs a shared service layer extracted from
`create-label.ts`.

### Recommended `agentic-ai` integration

When the user says "international shipment" / "envío internacional" /
"cross-border" / "customs", call `envia_create_international_shipment`
FIRST. Its output already includes the next-step hint pointing to
`envia_create_shipment`. This eliminates the trial-and-error loop
without forcing every flow to learn the wizard contract directly.

---

## §10 — Edge cases preserved vs lost

### Preserved (no behavioural change for callers using the surviving tools)

- All input-schemas of surviving tools are unchanged.
- All output formats of surviving tools are unchanged.
- `envia_quote_shipment`, `envia_create_shipment`, `envia_track_package`,
  `envia_cancel_shipment`, and `envia_get_balance_info` (the §3.7
  off-limits set in `_docs/specs/TOOL_CONSOLIDATION_AUDIT_SPEC.md`) are
  untouched.

### Lost (and how to recover, if needed later)

| What was lost | How to recover |
|---|---|
| `ai_rate` `carriers[]` filter | Add optional param to `envia_quote_shipment`. Low-risk. |
| `search_branches_bulk` compact format | Internal helper still callable; or pass aggressive `limit` to `find_drop_off`. |
| `set_default_address` direct action | Rebuild as a wizard if chat-need re-surfaces. |
| `get_carriers_stats` "top regions" detail | Internal helper still callable for backend reports. |
| `get_clients_summary` aggregate counters | Internal helper still callable; partial recovery via `list_clients` counts. |

Per session authorisation, **no source files were deleted**. If demand
data later shows any of these capabilities is genuinely needed in chat,
the registration can be re-enabled in a single-line edit to
`src/index.ts`.

---

## §11 — Migration checklist for `agentic-ai`

- [ ] Search `agentic-ai` source for any literal `envia_*` tool name
      appearing in the §1–§8 "Old tool name" columns. Replace each
      with the documented replacement (or remove if no replacement).
- [ ] Update routing tables / skill descriptions / system prompts that
      reference removed tool names.
- [ ] Add `envia_create_international_shipment` to the cross-border
      skill's recommended tool list. Trigger phrases: "international",
      "cross-border", "customs", "envío internacional", "exportación".
- [ ] Smoke test: run a representative cross-border flow end-to-end
      against a stage MCP after this branch deploys. Confirm the wizard
      returns the next-step hint and the LLM follows it with a single
      `envia_create_shipment`.
- [ ] Coordinate with Jose on the deploy window — the rename window for
      Sprint 4 was a useful template (1 staged deploy, then 24h
      observation, then production).

---

## §12 — Future work (deferred from this session)

| Item | Rationale | Estimated effort |
|---|---|---|
| Cluster 3 — Shipment list consolidation (8 → 2-3) | The 8 list-by-X tools (`get_shipments_cod`, `_ndr`, `_surcharges`, etc.) hit different backend endpoints. A real merge needs an `intent` discriminator + per-intent service routing. Heaviest of the remaining clusters. | 2-3h |
| Cluster 10 — Generated docs (4 → 1) | `envia_generate_complement` / `_manifest` / `_packing_slip` / `_picking_list` could merge behind a `document_type` enum but each has distinct inputs. Real merge needs a discriminated union and care to preserve the carrier-specific fields. | 1.5h |
| Wizard-as-mutation extension | Extract `create-label.ts` core into a service so the wizard can short-circuit the second-tool-call. | 3-4h |
| Real Datadog data + Pase 4 | Once 30+ days of usage data accumulate, re-evaluate the deferred clusters AND any surviving tool with <0.1 calls/day. | 4-6h |
| `envia_quote_shipment` `carriers[]` filter | Restore the lost capability from `envia_ai_rate`. | 30min |

These are **NOT** in scope for the current branch. Logged here so the
next session can pick them up without context loss.

---

End of breaking-changes notice.
