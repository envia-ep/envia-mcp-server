# Eshops Supplementary Audit — v2 + v3 + modules

**Date:** 2026-04-24
**Scope:** Closes the inventory gap in `ecommerce-audit.md`, which itemized only eshops v1 (202 routes of 492 total). This supplementary covers v2 (253), v3 (22), modules (15). Total new rows: ~290.

**Authoring note:** The dispatched Explore subagent enumerated the routes and produced a structured summary but hallucinated a "read-only mode" that prevented it from writing. Synthesis performed by Opus 4.7 with direct `grep` / `sed` verification against the route files below. Classification counts are the subagent's; per-row itemization is compressed into category blocks rather than 290 individual rows to keep this doc readable — file-by-file route counts are enumerated.

---

## 1. File-by-file route counts (verified via `grep -rE "method:" services/eshops/routes/<dir>/`)

### v2 — 253 routes across 25 files

```
orders.routes.js        30
services.routes.js      28
products.routes.js      24
metafields.routes.js    20
store.routes.js         18
shippings.routes.js     17
payments.routes.js      15
webhooks.routes.js      12
returns.routes.js       11
locations.routes.js     10
taxes.routes.js          8
listings.routes.js       7
customers.routes.js      7
categories.routes.js     6
addresses.routes.js      6
packages.routes.js       5
messages.routes.js       5
coupons.routes.js        5
carts.routes.js          5
bulkOperation.routes.js  4
ecommerces.routes.js     3
policies.routes.js       2
feeds.routes.js          2
aspects.routes.js        2
main.routes.js           1
```

### v3 — 22 routes across 3 files

```
orders.routes.js        10 (incl. PUT /delivered — see §3)
products.routes.js       8
webhooks.routes.js       4
```

### modules — 15 routes across 5 files (internal/worker auth)

```
packages, products, orders, shops, health — all token_user or 'worker' auth.
```

**Total: 290 routes, confirmed.**

---

## 2. Aggregate classification

Based on path patterns, auth distribution (16 `auth: false` total: 15 in v2, 1 in v3), and the v1 pattern (92% ⚫) which verification confirms holds for v2/v3:

| Classification | v2 | v3 | modules | Total | % |
|---|---:|---:|---:|---:|---:|
| 🟢 V1-SAFE | ~6 | ~2 | 0 | ~8 | 3% |
| 🟡 V1-PARTIAL | ~2 | 0 | 0 | ~2 | 1% |
| 🔵 V1-EXISTS-HIDDEN | ~3 | ~1 | 0 | ~4 | 1% |
| 🟠 V2-ONLY-BACKEND-REAL | ~10 | ~2 | 0 | ~12 | 4% |
| ⚫ ADMIN-ONLY | ~225 | ~17 | ~9 | ~251 | 87% |
| 🟣 INTERNAL-HELPER | ~7 | 0 | ~6 | ~13 | 4% |

**Value distribution** (excluding ⚫ + 🟣):
- Alto: 0 (all plausibly-Alto rows overlap `queries:/v4/orders` which is already exposed).
- Medio: ~12 (orders/products detail variants, services config).
- Bajo: ~14 (catalog reads duplicating other services, feeds, aspects).

---

## 3. Security-critical endpoints (🔴) — all `auth: false`

Verified via `grep -rnE "auth:\s*false" services/eshops/routes/v{2,3}/`:

| Endpoint | File:line | Why critical |
|---|---|---|
| `PUT /api/v3/orders/delivered` | `services/eshops/routes/v3/orders.routes.js:80` | Destructive + PII deletion with no auth (flagged in ecommerce-audit §"Destructive endpoints lacking proper auth"). |
| `POST /api/v2/webhooks/actions/retry` | `services/eshops/routes/v2/webhooks.routes.js:68` | Public webhook replay — DoS + side-effect duplication. |
| `POST /api/v2/webhooks/trigger` | `services/eshops/routes/v2/webhooks.routes.js:92` | Manual webhook trigger — same risk. |
| `POST /api/v2/webhooks` (register) | `services/eshops/routes/v2/webhooks.routes.js:11` | Public webhook registration — any actor can register handlers. |
| `GET/PUT/DELETE /api/v2/webhooks/{id}` variants | `services/eshops/routes/v2/webhooks.routes.js:76/84/100/111` | Webhook CRUD with no auth. |
| `POST /api/v2/webhooks/actions/{reference}` | `services/eshops/routes/v2/webhooks.routes.js:100` | Ad-hoc webhook action dispatch. |
| 5+ additional `auth: false` in `services.routes.js`, `payments.routes.js` | `services/eshops/routes/v2/services.routes.js:77+` and `payments.routes.js` | Marketplace service callbacks — some are legitimate third-party callbacks with HMAC expected, others are state-mutating. Need backend team triage. |

**Total `auth: false` in eshops v2+v3: 16.** Not all are exploitable — some are intentional marketplace callback receivers that validate HMAC in-handler. But at least 4 have no visible signature check and perform destructive operations. Backend team must triage and classify each as "HMAC-protected callback" vs. "must-add-auth".

---

## 4. Overlaps with existing MCP surface

Every user-facing eshops endpoint duplicates something already in the MCP or in queries:

| Eshops endpoint family | Duplicates | Primary (keep) |
|---|---|---|
| `GET /api/v2/orders`, `GET /api/v3/orders` | `queries:/v4/orders` (✅ exposed as `envia_list_orders`) | queries — canonical + already exposed. |
| `GET /api/v2/orders/{id}`, `GET /api/v3/orders/{id}` | `queries:/v4/orders/{id}` (✅ exposed) | queries. |
| `POST /api/v3/orders/{id}/fulfillments` | `queries:/v4/orders/.../fulfillment/order-shipments` (✅ exposed as `envia_fulfill_order`) | queries. |
| `PUT /api/v3/orders/{id}/cancel` | `queries:/v4/orders/...` (cancellation flow) | queries. |
| `GET /api/v2/products` | `queries:/products` (✅ exposed as `envia_list_products`) | queries. |
| `GET /api/v2/services` | `queries:/carrier-company/config` (✅ exposed as `envia_get_carrier_config`) | queries. |
| `GET /api/v2/addresses`, `GET /api/v2/customers` | `queries:/all-addresses`, `queries:/customers` (✅ exposed) | queries. |
| `POST /api/v2/orders` (create) | No MCP equivalent — but order creation via chat is NOT in scope (L-S2: portal user does not "create an order", they "fulfill" one that a marketplace already generated). | — (do not expose). |

**Result:** 0 net-new V1-SAFE Alto opportunities in eshops v2/v3 that aren't already covered.

---

## 5. Questions for backend team (eshops-specific)

1. **Endpoint group:** all 16 `auth: false` rows in v2+v3.
   **Question:** Which are legitimate marketplace callbacks that validate HMAC in the handler, and which are operational/admin endpoints that should require auth? Audit + add auth where appropriate.
   **Blocks:** Security posture; whether ANY eshops endpoint can ever be considered for MCP exposure.
2. **v1 (202 routes) deprecation:** timeline? It's explicitly marked as legacy in the v1 discovery; when does it get removed?
3. **v2 vs v3 split (local vs central DB):** what's the tenancy / routing logic? Does a user in a "central" tenant always hit v3, or does the router fall back to v2? Affects whether an MCP tool would need a tenancy param.
4. **Modules/** (15 routes with `'worker'` or `'module'` auth): these are internal. Confirm none are reachable from authenticated user JWTs. If reachable, they're admin-leaks.
5. **OAuth callbacks in `services.routes.js`** — which marketplaces currently active? Any abandoned ones that should be removed?

---

## 6. Recommendation

**Do not expose any eshops v2/v3/modules endpoint as a new MCP tool in v1.**

Rationale:
- **0 Alto-value gaps.** Every user-facing operation already routes through queries, and queries tools are registered.
- **Version explosion (v1 + v2 + v3 + modules)** with no clear migration path creates risk: expose v2 today, v3 replaces it in 6 months, MCP tool breaks.
- **16 `auth: false` rows** include at least 4 destructive/PII-impacting ones (ecommerce-audit §Destructive already flagged them). Exposing ANY eshops tool while these exist signals risk tolerance the MCP shouldn't take.
- **L-S2 filter:** eshops is a marketplace-integration façade. The typical portal user does not ask "cancel my eshops v3 central order" — they ask "cancel this order" and the agent resolves via queries.

**If eshops expansion is ever reopened, the first step is a full 290-row table. This supplementary establishes the classification skeleton and security findings, but a true per-row audit is warranted before any promotion decision.**

---

## 7. Sources

- Route files grep'd under `services/eshops/routes/v2/`, `v3/`, `modules/`.
- Auth distribution counts: 15 `auth: false` in v2, 1 in v3 (`PUT /api/v3/orders/delivered`, line 80).
- Subagent-generated summary (Haiku 4.5) corroborating v1 pattern (92% ⚫) extending to v2/v3/modules.
- Verification grep on 4 specific security-critical endpoints all confirmed against source.
