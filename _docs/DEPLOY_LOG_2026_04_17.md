# Deploy Log — 2026-04-17

## Environment

| Field              | Value                                                       |
|--------------------|-------------------------------------------------------------|
| App                | `envia-mcp-server`                                          |
| Platform           | Heroku                                                      |
| URL                | `https://envia-mcp-server-c0fa1b3dab48.herokuapp.com`       |
| Deployed commit    | `2eb87a4` (feat: fix HOST binding for Heroku)               |
| Branch             | `main` (local push via `git push heroku main`)              |
| Deploy time        | 2026-04-17 (Sprint 3 execution session)                     |
| Dyno type          | web (1x)                                                    |
| Heroku release     | v6                                                          |

## Environment Variables Set

| Variable              | Value                    | Note                                    |
|-----------------------|--------------------------|-----------------------------------------|
| `ENVIA_API_KEY`       | `ea7aa2285...` (sandbox) | Sandbox token                           |
| `ENVIA_ENVIRONMENT`   | `sandbox`                | Points to `api-test.envia.com`          |
| `ENVIA_ECART_HOSTNAME`| `http://ecart-api-test.envia.com` | ecommerce sync hostname         |
| `HOST`                | `0.0.0.0`                | Required for Heroku HTTP routing        |

## Issues Encountered During Deploy

### Issue 1 — HOST binding (v3→v4)

**Symptom:** Dyno stuck in `starting` state. Heroku router couldn't reach the server.

**Root cause:** Server was binding to `127.0.0.1` (loopback) — Heroku router requires `0.0.0.0`.

**Fix:** `heroku config:set HOST=0.0.0.0`

---

### Issue 2 — DNS-rebinding protection middleware (v4→v5)

**Symptom:** All requests returned `Invalid Host: envia-mcp-server-c0fa1b3dab48.herokuapp.com`.

**Root cause:** `createMcpExpressApp()` (from `@modelcontextprotocol/sdk`) uses its own `host` parameter (default `'127.0.0.1'`) for DNS-rebinding protection middleware, separate from `app.listen(PORT, HOST)`.

**Fix:** Changed `src/index.ts` to `createMcpExpressApp({ host: HOST })`.  
When `HOST=0.0.0.0`, the SDK disables localhost-only validation. When `HOST=127.0.0.1` (local dev), protection stays active.

**Commit:** `2eb87a4`

---

### Issue 3 — Accept header required for SSE (smoke test only)

**Symptom:** curl returned `Not Acceptable: Client must accept both application/json and text/event-stream`.

**Root cause:** Streamable HTTP transport requires both MIME types in the `Accept` header.

**Fix:** All curl commands must include `-H "Accept: application/json, text/event-stream"`.  
Responses arrive as SSE: `event: message\ndata: {...}`.

---

## Smoke Test Results (2026-04-17)

Reference: `_docs/SMOKE_TEST_PLAYBOOK.md`

### Pre-flight

| Check                    | Result |
|--------------------------|--------|
| Dyno status              | ✅ up  |
| `tools/list` returns 72  | ✅ 72 tools confirmed |
| Response format SSE      | ✅ `event: message` + `data: {...}` |

### Step 2.1 — Quote (quote_shipment)

- Route: 03940 (CDMX) → 44100 (Guadalajara), MX, 2 kg DHL express
- **Result:** ✅ 13 rates returned, sorted cheapest first (UPS Saver $14.92 → FedEx Express $3,392.90 MXN)
- Carrier errors noted: sendex (expected), noventa9Minutos (1125), quiken (1126), dostavista (1146) — all sandbox limitations

### Step 2.2 — Create label (create_shipment)

- Carrier: DHL express, DF → JAL
- Attempts:
  - UPS Saver → 1300 (UPS shipper number constraint in sandbox) ⚠️ expected
  - Estafeta ground → 1129 (State code "CMX" not found) → fixed to "DF"
  - DHL express with "DF" state → **✅ label created**
- **Tracking number:** `2178339811`
- **Label PDF:** `https://s3.us-east-2.amazonaws.com/envia-staging/uploads/dhl/217833981125469e27ba1c77e3.pdf`
- **Price charged:** $282.63 MXN

### Step 2.3 — Track (envia_track_package)

- **Result:** ✅ Status: Created | Carrier: DHL | ETA: 2026-04-20

### Step 2.4 — Cancel (envia_cancel_shipment)

- **Result:** ✅ `Shipment cancelled successfully. Carrier: dhl | Tracking: 2178339811`

### Step 2.5 — Balance check (envia_check_balance)

- Amount tested: 500 MXN
- **Result:** ✅ Sufficient — Balance: $9,920,987.48 MXN

### Step 3.1 — Error path (envia_cancel_shipment with invalid API key)

- **Result:** ✅ `Authentication failed — verify your ENVIA_API_KEY is valid and not expired.`
- Error mapper: working correctly

## Smoke Test — PASS

All critical path steps verified: quote → create → track → cancel → balance → error mapping.

---

## Playbook Corrections Found During Execution

The following corrections should be applied to `SMOKE_TEST_PLAYBOOK.md`:

1. **Accept header required:** all curl commands need `-H "Accept: application/json, text/event-stream"`
2. **SSE response format:** responses are prefixed with `event: message\ndata:` — strip the prefix before parsing JSON
3. **Tool name for quoting:** `quote_shipment` (not `envia_get_shipping_rates`)
4. **quote_shipment params:** flat structure — `origin_postal_code`, `destination_postal_code`, `weight` (not nested `packages` array)
5. **create_shipment params:** dimensions use `package_weight`, `package_length`, `package_width`, `package_height` (not `weight`/`length`/`width`/`height`)
6. **MX state codes:** Use `DF` for Ciudad de Mexico, `JAL` for Jalisco (not full state names)
7. **envia_track_package param:** `tracking_numbers` (plural, not `tracking_number`)
8. **envia_check_balance param:** `amount` (not `required_amount`)
9. **Sandbox carrier notes:** UPS Saver fails with error 1300 (shipper number constraint). Use DHL for smoke tests.

---

## Next Steps

- Update `SMOKE_TEST_PLAYBOOK.md` with corrections above (committed separately)
- Sprint 4 (after ≥ 1 week staging stability): observability layer (pino + correlation IDs)
- Production deploy: promote from staging once stability confirmed
