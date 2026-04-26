# Queries Backend — Bugs & Findings to Triage

**Date:** 2026-04-25
**Source:** Iter-7 deep-reference audit + DB ground-truth pass + sandbox curl verification
**Audit doc:** `_docs/QUERIES_DEEP_REFERENCE.md` (3,863 lines, 7 iterations, ~95-97% coverage)
**Audience:** Queries backend lead + DBA + Tech Lead Envia

This document is **action-ready**. Each item below has: severity, sandbox repro, root cause, proposed fix with LOC count, and effort estimate. Items 1-5 are confirmed bugs. Items 6-12 are open questions / observations the backend team likely has context on.

---

## Summary table

| # | Item | Severity | Status | Effort to fix |
|---|------|----------|--------|---------------|
| 1 | `/get-shipments-ndr?type=…` 422 (MySQL 8 alias-in-HAVING) | **HIGH** | Confirmed bug | ~10 min, 5 LOC |
| 2 | `/company/tickets` 422 (JSON.parse(undefined)) | **HIGH** | Confirmed bug | ~5 min, 2 LOC |
| 3 | `POST /shipments/config-columns` wrong handler | **HIGH** | Confirmed bug | ~10 min, 5-10 LOC |
| 4 | `validateHash` not timing-safe | LOW | Hardening | ~10 min, 5 LOC |
| 5 | Raw MySQL errors leaking to clients | MEDIUM | Pattern fix | ~15 min |
| 6 | WooCommerce has no fulfillment strategy (#1 platform by shops!) | **HIGH** (operational) | Open question | TBD per answer |
| 7 | type_id=8 access_tokens (1,625 rows) — no auth handler | MEDIUM | Open question | Investigation |
| 8 | `users.image_profile` + `image_background` defaults SWAPPED | LOW | Open question | ~2 min if intentional / 5 min ALTER |
| 9 | `shops.checkout` is `double NOT NULL` (was `int`) | LOW | Open question | Verify intent |
| 10 | `db-schema.mdc` heavily stale (Cursor `alwaysApply: true` context) | MEDIUM | Hygiene | ~1 h regenerate + select tables |
| 11 | `invitation_status` enum has 5 states not all documented | LOW | Documentation | Internal |
| 12 | Multiple ecommerce platforms registered in DB but no strategy file (~14 platforms) | TBD | Open question | Per-platform audit |

---

## 1. `/get-shipments-ndr?type=…` returns 422 with raw MySQL error

### Severity
**HIGH** — list endpoint with `type` filter is functionally broken; MySQL error message leaking to client (information disclosure).

### Sandbox repro
```bash
curl -s "https://queries-test.envia.com/get-shipments-ndr?type=attention&limit=3" \
  -H "Authorization: Bearer <token>"

# Response: 422 Unprocessable Entity
# {"statusCode":422,"error":"Unprocessable Entity",
#  "message":"ER_BAD_FIELD_ERROR: Unknown column 'ndr_action' in 'having clause'"}
```

### Root cause
**File:** `services/queries/controllers/ndr.controller.js:62-66`

```js
const types = {
    attention: 'HAVING ndr_action IS NULL',
    requested: 'HAVING ndr_action IS NOT NULL',
    rto: "HAVING s.status_id IN (11,13) AND ndr_action = 'Return To Origin'",
};
```

The alias `ndr_action` is defined in SELECT at line 152:
```sql
IF(sndr.action_id IS NULL, NULL, cna.action_name) AS ndr_action
```

**MySQL 8 with `ONLY_FULL_GROUP_BY` (default sql_mode) rejects alias references in HAVING clauses.** This worked in MySQL 5.7. The dev DB is now running MySQL 8.0.44 (verified via `SELECT VERSION()`).

DB confirmation: searched `information_schema.columns` for any column named `ndr_action` across all 683 enviadev tables → **0 results**. The column doesn't exist; it's only an alias.

### Proposed fix
Replace the alias with the literal expression in HAVING clauses:

```js
// services/queries/controllers/ndr.controller.js:62-66
const types = {
    attention: 'HAVING IF(sndr.action_id IS NULL, NULL, cna.action_name) IS NULL',
    requested: 'HAVING IF(sndr.action_id IS NULL, NULL, cna.action_name) IS NOT NULL',
    rto: "HAVING s.status_id IN (11,13) AND IF(sndr.action_id IS NULL, NULL, cna.action_name) = 'Return To Origin'",
};
```

OR (cleaner): for `attention`/`requested`, simply check `sndr.action_id IS NULL` / `IS NOT NULL`:

```js
const types = {
    attention: 'HAVING sndr.action_id IS NULL',
    requested: 'HAVING sndr.action_id IS NOT NULL',
    rto: "HAVING s.status_id IN (11,13) AND IF(sndr.action_id IS NULL, NULL, cna.action_name) = 'Return To Origin'",
};
```

### Effort
~10 minutes, 5 LOC, one regression test added.

### Impact on MCP
MCP currently uses **client-side tab filtering as workaround** (per `_docs/V1_SAFE_TOOL_INVENTORY.md`). After fix, MCP can pass `type=attention` directly and remove the workaround.

---

## 2. `/company/tickets` returns 422 with JSON.parse(undefined)

### Severity
**HIGH** — list-tickets endpoint completely broken when any ticket has 0 comments.

### Sandbox repro
```bash
curl -s "https://queries-test.envia.com/company/tickets?limit=3&page=1" \
  -H "Authorization: Bearer <token>"

# Response: 422 Unprocessable Entity
# {"statusCode":422,"error":"Unprocessable Entity",
#  "message":"Unexpected token u in JSON at position 0"}
```

The error string `"Unexpected token u in JSON at position 0"` is the canonical V8 error when calling `JSON.parse(undefined)` (which coerces to the string `"undefined"`, and `'u'` is the first character).

### Root cause
**File:** `services/queries/controllers/company.controller.js:1261-1262`

```js
results.data.forEach((item) => {
    item.allComments = JSON.parse(item.allComments).sort((a, b) => a.id - b.id);
    item.last_comment = JSON.parse(item.last_comment);
    ...
});
```

When a ticket has 0 comments, the SQL `GROUP_CONCAT(...)` aggregation returns NULL for `allComments` and `last_comment`. The mysql2 driver returns these as `undefined` properties. `JSON.parse(undefined)` throws.

### Proposed fix
**File:** `services/queries/controllers/company.controller.js:1261-1262`

```js
results.data.forEach((item) => {
    item.allComments = JSON.parse(item.allComments || '[]').sort((a, b) => a.id - b.id);
    item.last_comment = JSON.parse(item.last_comment || 'null');
    ...
});
```

### Effort
~5 minutes, 2 LOC, one regression test (with a ticket-has-zero-comments fixture).

### Impact on MCP
MCP `envia_list_tickets` tool fails in sandbox today. After fix, the tool will work for any company that has tickets without comments.

---

## 3. `POST /shipments/config-columns` routed to wrong handler

### Severity
**HIGH** — endpoint name and payload contract don't match the executed code.

### Repro
**File:** `services/queries/routes/shipment.routes.js:472-481`

```js
{
    method: 'POST',
    path: `${path}/config-columns`,
    handler: controller.pinFavoriteShipment,    // ← name suggests config; handler is favorite
    options: {
        auth: 'token_user',
        validate: {
            payload: Joi.object({
                shipment_id: Joi.number().integer().required(),  // ← schema is for favorites
            }),
        },
    },
},
```

The endpoint is named `/config-columns` (suggesting display column configuration) but routes to `pinFavoriteShipment` with a `{shipment_id}` schema (only valid for the favorite endpoint).

### Root cause hypothesis
Either:
- Original handler `configureColumns` was renamed/removed but the route was never updated.
- Copy-paste error during a refactor.

### Proposed fix
Two options for backend team to choose:
1. **Delete the route** if config-columns feature was deprecated.
2. **Implement `configureColumns` handler** with appropriate schema (probably `{ columns: string[] }` or similar).

### Effort
Option 1: ~5 min. Option 2: ~30-60 min.

### Impact on MCP
MCP does NOT expose this endpoint. Low MCP-side impact. Surfaces as a code-quality / contract-correctness issue.

---

## 4. `validateHash` is not timing-safe

### Severity
LOW — hardening only, not currently exploitable in practice.

### Repro
**File:** `services/queries/util/crypto.utils.js:33-35`

```js
validateHash(text, reference, key) {
    return this.signText(text, key) === reference;
}
```

`signText` returns hex-encoded HMAC-SHA256 (verified at line 43-46). `validateHash` does string-equality comparison — this is **not constant time** and theoretically leaks byte-by-byte timing info.

### Where it matters
- `processors/credit.processor.js:76` — HMAC validation on incoming payment events (PAYMENTS_PROCESSOR_SECRET).
- `middlewares/secret.middleware.js` — HMAC validation on `/webhooks/update/user`, `/webhooks/verification` (ACCOUNTS_TOKEN).

### Proposed fix
**File:** `services/queries/util/crypto.utils.js:33-35`

```js
validateHash(text, reference, key) {
    const expected = this.signText(text, key);
    if (expected.length !== reference.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(reference, 'hex'),
    );
}
```

Note: `timingSafeEqual` requires equal-length buffers, hence the explicit length check first.

### Effort
~10 minutes, 5 LOC, one unit test.

### Impact on MCP
None directly. Pure backend hardening.

---

## 5. Raw MySQL errors are leaking to API clients

### Severity
MEDIUM — information disclosure (DB schema and column names visible to clients via error messages).

### Examples observed
- `/get-shipments-ndr?type=attention` (item 1 above) returned `"ER_BAD_FIELD_ERROR: Unknown column 'ndr_action' in 'having clause'"` — exposes that there's no column with that name.
- Other query failures may expose similar info.

### Root cause
Hapi's default exception handler converts unhandled errors into 500/422 responses with the raw error message in `.message`. Without a global exception wrapper, mysql2 errors propagate directly to the client.

### Proposed fix
Add a global response decorator or `onPreResponse` extension that wraps any non-Boom error into a generic `Boom.internal('Internal server error')` while logging the original to Datadog/Sentry.

```js
// In server.js, after server.start():
server.ext('onPreResponse', (request, h) => {
    const response = request.response;
    if (response.isBoom && response.output.statusCode >= 500) {
        // Log full error for ops, return generic message to client
        observability.captureError(response, { route: request.path });
        response.output.payload.message = 'Internal server error';
    }
    return h.continue;
});
```

### Effort
~15 minutes, 10-15 LOC, integration test.

### Impact on MCP
MCP would receive cleaner errors (currently propagates raw mysql2 messages through to the LLM agent).

---

## 6. WooCommerce has no fulfillment strategy — but it's the #1 platform by active shops

### Severity
**HIGH (operational)** — pending answer to a single binary question.

### Observation
**Live DB query (verified 2026-04-25):**

```sql
SELECT e.id AS ecommerce_id, e.name, COUNT(s.id) AS shop_count, SUM(s.active) AS active_shops
FROM ecommerce e LEFT JOIN shops s ON s.ecommerce_id = e.id
GROUP BY e.id ORDER BY shop_count DESC LIMIT 5;

ecommerce_id | name         | shop_count | active_shops
-------------|--------------|------------|-------------
2            | woocommerce  | 211        | 96    ← #1
1            | shopify      | 182        | 46
20           | tiendanube   | 87         | 23
12           | mercadolibre | 28         | 14
7            | wix          | 19         | 7
```

WooCommerce is the **#1 ecommerce platform by active shops** in production. But:

- ❌ NO `services/fulfillment/strategies/woocommerce.strategy.js` exists.
- ❌ NO `WOOCOMMERCE: <id>` entry in `constants/ecommerce-ids.js`.
- ❌ NO registration in `services/fulfillment/strategies/index.js` (16 strategies registered, none for WooCommerce).

Per `services/fulfillment/fulfillment.service.js` JSDoc:
> "Platforms not in this map require no ecommerce-specific payload transformation."

So **96 active WooCommerce shops route through the generic fulfillment path** without ecommerce-specific transformation.

### Three hypotheses
- **(A) Regression:** strategy existed, was deleted, flow not adjusted.
- **(B) Intentional:** WooCommerce REST API accepts the vanilla payload; no transformation needed.
- **(C) Bug latent:** WooCommerce DOES need transformation but fails silently for some shops.

### Question for backend lead — binary answer needed

> What is the `fulfillment.completed{ecommerce=woocommerce, status=success}` rate vs `status=failed` rate over the last 30 days in production? Datadog should have this metric per `constructors/queues.constructor.js:46-55` instrumentation.

**If success rate > 95%** → hypothesis (B), no action needed. Document the intentional design.

**If success rate < 80%** → hypothesis (C), prioritize building `woocommerce.strategy.js`.

**If unable to measure** → schedule a 1-day audit of `orderUtil.fulfillmentOrder` outcomes for WooCommerce-tagged shops.

### Adjacent finding
The same pattern applies to **9 other ecommerce platforms** with shops in production but no strategy or `ECOMMERCE_IDS` entry: `wix` (19 shops), `magento2` (11), `kometia`, `adobecommerce`, `zoho` (12), `shoplazza`, `sap`, `bling` (9), `tray`, `cdiscount`, `claroShop`, `jumpseller` (4), `etsy`, `shein`. These probably share the WooCommerce decision (intentional vanilla path), but should be confirmed.

---

## 7. `access_tokens.type_id = 8` exists but no auth handler accepts it

### Severity
MEDIUM — 1,625 production tokens that cannot authenticate via documented strategies.

### Observation
**Live DB query (verified 2026-04-25):**

```sql
SELECT type_id, COUNT(*) FROM access_tokens GROUP BY type_id;
type_id | count
1       | 6,832  (personal access tokens, with expiration)
2       | 2,644  (API tokens, must have company_id)
7       | 43     (other expirable type)
8       | 1,625  ← UNDOCUMENTED
```

**`auth.middleware.js:133, 192, 321`** — `token_user`, `token_admin`, `token_verify` all filter `WHERE at.type_id IN (1, 2, 7)`. `grep "type_id" middlewares/ util/auth*` returns 0 matches for type 8.

### Sample of type_8 tokens
```sql
SELECT type_id, ecommerce, valid_until IS NULL AS no_expiry, COUNT(*) AS cnt
FROM access_tokens WHERE type_id = 8 GROUP BY type_id, ecommerce, no_expiry;

type_id | ecommerce | no_expiry | cnt
8       | 0         | 0         | 1,625    (all have valid_until set, ecommerce=0, no description)
```

### Question for backend lead
What flow creates `type_id = 8` tokens, and which middleware/process accepts them for authentication?

Hypotheses:
- Verification flow tokens (KYC/KYB temporary access)?
- Webhook signing or service-to-service tokens?
- Migration leftover that should be cleaned up?

### Effort
5 minutes for backend lead to confirm. If "deprecated/leftover" → housekeeping task to clean up. If active flow → document and add to auth strategies surface.

---

## 8. `users.image_profile` and `image_background` defaults are SWAPPED

### Severity
LOW — visual bug at registration time.

### Observation
**Live DB query:**
```sql
SHOW COLUMNS FROM users WHERE field IN ('image_profile', 'image_background');

Field             | Default
image_profile     | image_background_envia.png    ← background filename as profile default
image_background  | image_profile_default.jpg     ← profile filename as background default
```

Compared to `db-schema.mdc:85-86`:
```
image_profile  varchar(150) DEFAULT 'image_profile_default.jpg'
image_background varchar(150) DEFAULT 'image_background_envia.png'
```

The defaults appear swapped at some point. New users may be registering with their profile pic showing the background image and vice versa.

### Question for backend lead
Is this swap intentional (e.g. visual redesign requiring new defaults) or accidental (DDL drift)?

### Fix if accidental
```sql
ALTER TABLE users
    ALTER COLUMN image_profile SET DEFAULT 'image_profile_default.jpg',
    ALTER COLUMN image_background SET DEFAULT 'image_background_envia.png';
```

---

## 9. `shops.checkout` is `double NOT NULL` (was `int`)

### Severity
LOW — type drift, possibly long-standing.

### Observation
**Live:** `shops.checkout double NOT NULL`
**Documented:** `shops.checkout int NOT NULL` (db-schema.mdc:241)

Storing what is semantically a flag/foreign-key as `double` is unusual. May indicate:
- A migration set the wrong type.
- Decimal values are intentionally being stored (uncommon for a "checkout" field).

### Question for backend lead
- When did the type change?
- Are existing `checkout` values integer-valued (suggests no actual decimal usage)?
- Should this be `int` or `tinyint`?

Likely a 5-minute follow-up.

---

## 10. `db-schema.mdc` is heavily stale — Cursor IDE injects stale schema as `alwaysApply: true` context

### Severity
MEDIUM — degrades developer experience for everyone using Cursor.

### Observation
`services/queries/db-schema.mdc` opens with:
```yaml
---
alwaysApply: true
---
```

Cursor IDE injects this file's content into every code-completion context. The file has 5 CREATE TABLE statements: `products`, `users`, `companies`, `shops`, `product_dimensions`.

**Live DB has 683 tables** (`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='enviadev'` → 683). The 5 are intentional cherry-picks, but they've drifted significantly.

### Drift summary

**`companies` table:** ~30 NEW columns since `db-schema.mdc` was last updated:
- `fiscal_name`, `plan_id`, `business_type_id`, `account_type_id`, `accounts_id` (UNIQUE)
- `inhouse_ltl`, `credit_line_days_front`, `credit_days`, `credit_created_at`
- `legacy_tracking_page`, `pod_id`
- `website`, `industry`, `company_type`, `phone`, `phone_prefix`, `general_email`
- `language`, `timezone`, `date_format` (all NOT NULL with defaults)
- `shipping_street`, `shipping_int_number`, `shipping_colonia`, `shipping_city`, `shipping_state`, `shipping_postal_code`
- `instagram`, `facebook`, `linkedin`, `twitter`
- Plus `kam_ltl`, `has_onboarding`, `updated_by`

**Type/default changes in `companies`:**
- `auto_billing` DEFAULT '0' → DEFAULT 1 NOT NULL
- `verification_status` DEFAULT '1' → DEFAULT 3
- `credit` decimal(65,2) → **double(66,2)**
- `zoho_customer_id` varchar(255) → varchar(100)

**`users` table:**
- `account_id` varchar(50) → varchar(255)
- `country` char(2) → varchar(20)
- Image defaults swapped (see item 8)

**`products` table:**
- `description` text → mediumtext
- `product_type` enum('product','service') NEW
- `barcode` varchar(45) NEW

**`shops` table:**
- `checkout` int → double (see item 9)

### Proposed action
1. Run `services/queries/generate-db-schema.js` (already exists in repo) against the dev DB.
2. Output to `db-schema.mdc` with the SAME 5 (or expanded) tables.
3. Establish a quarterly refresh cadence — auto via CI or manual.

**Recommended expanded list of "always-on" Cursor context tables (15 total):**
`access_tokens`, `additional_service_prices`, `catalog_carrier_branches`, `companies`, `company_tickets`, `company_webhooks`, `generic_forms`, `orders`, `products`, `services`, `shipments`, `shops`, `user_companies`, `users`, `product_dimensions`.

### Effort
~1 hour: regenerate + select tables + verify Cursor context refresh works.

---

## 11. `invitation_status` enum has 5 states; only `'accepted'` filter is widely used

### Severity
LOW — documentation gap.

### Observation
**Live DB:**
```sql
DESCRIBE user_companies;

invitation_status enum('sent','accepted','rejected','revoked','expired') DEFAULT 'accepted'
invitation_expires_at datetime
is_new_user tinyint(1)
default_unique_check int UNIQUE STORED GENERATED  ← clever invariant: ensures one is_default per user
```

`auth.middleware.js:117` filters `AND uc.invitation_status = 'accepted'`. The other 4 states (`sent`, `rejected`, `revoked`, `expired`) and the expiration mechanism are not surfaced in any audit doc found.

### Question for backend lead
- Which routes drive transitions between these states?
- Is `revoked` admin-triggered or self-service?
- What happens at `invitation_expires_at` — auto-transition to `expired` or hard delete?

### Use case
The MCP has no concept of invitations today (LESSON L-S2 — admin tasks). But understanding state transitions helps when auditing why a user "can't see their company" (likely revoked or expired).

---

## 12. ~14 ecommerce platforms registered in DB but not in `strategies/` or `ECOMMERCE_IDS`

### Severity
TBD — depends on whether these platforms are actively used and how fulfillment works for them.

### Live DB list (active platforms WITHOUT a strategy file)

```
id  | name           | shop_count | active_shops
----|----------------|------------|-------------
2   | woocommerce    | 211        | 96    ← see item 6
4   | kometia        | ?          | ?
5   | adobecommerce  | ?          | ?
7   | wix            | 19         | 7
9   | magento2       | 11         | 2
13  | shiphero       | ?          | ?
14  | tradegecko     | ?          | ?
15  | zoho           | 12         | 6
16  | ship4shop      | ?          | ?
17  | opencart       | 5          | 1
21  | jumpseller     | 4          | 1
22  | ecwid          | 2          | 1
23  | etsy           | 2          | 0
24  | claroShop      | ?          | ?
26  | shoplazza      | ?          | ?
27  | sap            | ?          | ?
28  | yampi          | 10         | 6
31  | shein          | 2          | 0
32  | bling          | 9          | 3
34  | tray           | ?          | ?
36  | cdiscount      | ?          | ?
```

Same question pattern as item 6: is the generic fulfillment path producing successful fulfillments for these platforms? If yes, document the contract. If not, prioritize building strategies.

---

## How to consume this document

1. **Quick scan:** Section "Summary table" at top has all items with severity + effort.
2. **Pick a bug to fix:** each numbered section has a sandbox repro (curl), root cause with file:line, proposed fix code, and effort estimate. Should be possible to assign each bug to a backend engineer for a 30-60 min PR.
3. **Open questions:** items 6, 7, 8, 9, 11, 12 require backend domain knowledge to resolve. Items 6 and 12 in particular may justify follow-up audits.
4. **Schema hygiene:** item 10 (`db-schema.mdc` regeneration) is high leverage for everyone using Cursor in this repo.

## Companion artifacts
- `_docs/QUERIES_DEEP_REFERENCE.md` (3,863 lines) — full architecture audit.
- `_docs/COUNTRY_RULES_REFERENCE.md` — updated 2026-04-25 with the `address_form` → `address_info` correction.
- Commit `0193936` (envia-mcp-server) — fix for the silent no-op `validateAddressForCountry` bug discovered during this audit (the only bug in the MCP repo itself; all 12 items above are queries-side or DB-side).

## Triage suggestion

**Sprint priorities (my opinion as MCP owner):**

1. **Bugs 1, 2** — both are HIGH and total ~15 min of fix work. Ship both in a single PR with regression tests. Unblocks MCP `envia_list_tickets` and `envia_get_shipments_ndr` workarounds.
2. **Bug 6 (WooCommerce question)** — single binary question to backend lead via Datadog metric. 5 min of conversation. If answer is concerning, schedule dedicated audit.
3. **Bug 5 (raw MySQL leak)** — defensive fix, prevents future similar leaks. ~15 min PR.
4. **Item 10 (`db-schema.mdc` refresh)** — 1 h of work that improves DX for everyone using Cursor. Run quarterly thereafter.
5. **Bug 4 (timing-safe HMAC)** — hardening, can be batched with other security tasks.
6. **Bug 3, items 7-9, 11-12** — backlog; each is short and self-contained.

Total fix time for all confirmed bugs (1-5): **~50 minutes of code + tests.**
