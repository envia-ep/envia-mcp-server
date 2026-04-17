# Smoke Test Playbook — envia-mcp-server

Repeatable end-to-end verification sequence for every staging or production deploy.
Run top-to-bottom. Each step must PASS before proceeding to the next.

> **Audience:** Engineer or AI agent executing the deploy.
>
> **Environment:** All commands target the staging/sandbox environment by default.
> Replace `<APP>` with the actual Heroku app name (e.g. `envia-mcp-staging`).

---

## 0. Pre-flight — Environment Variables

Verify all required env vars are provisioned before deploying.

```bash
# List current Heroku config
heroku config -a <APP>

# Confirm these are present:
#   ENVIA_API_KEY        — sandbox JWT token (ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3)
#   ENVIA_ENVIRONMENT    — must be "sandbox" for staging
#   ENVIA_ECART_HOSTNAME — https://ecart-api-test.ecartapi.com

# Set any missing var:
heroku config:set ENVIA_ENVIRONMENT=sandbox -a <APP>
heroku config:set ENVIA_ECART_HOSTNAME=https://ecart-api-test.ecartapi.com -a <APP>
```

**Expected:** All three vars present. ENVIA_API_KEY matches the sandbox token.
**Blocker if absent:** Set before proceeding.

---

## 1. Deploy Verification

After `git push heroku main` (or equivalent), confirm the dyno boots.

```bash
# Watch the deploy log
heroku logs --tail -a <APP>
```

**Expected:** Log line `State changed from starting to up` within 60 seconds.
**Response fingerprint:** No `Error R10 (Boot timeout)` or `SIGKILL` in logs.

---

## 2. Happy-Path Sequence (Sandbox)

Export the base URL and token before running the steps:

```bash
export MCP_URL="https://<APP>.herokuapp.com"
export TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
```

> Each curl call sends a JSON-RPC `tools/call` request to the MCP HTTP endpoint.

---

### Step 2.1 — envia_get_shipping_rates (Quote)

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "envia_get_shipping_rates",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "origin": { "postal_code": "64000", "country": "MX" },
        "destination": { "postal_code": "06600", "country": "MX" },
        "parcel": { "weight": 1.5, "height": 10, "width": 15, "length": 20 }
      }
    }
  }' | jq '.result.content[0].text' | head -30
```

**Expected fingerprint:** Response text contains `"carrier"`, `"total_price"`, and at least one rate object.
**FAIL if:** Empty array, HTTP 4xx/5xx, or raw carrier error string (not mapped message).

---

### Step 2.2 — envia_create_label (Create Label)

Replace `<CARRIER_ID>` and `<SERVICE_ID>` with values from Step 2.1.

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "envia_create_label",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "carrier_id": <CARRIER_ID>,
        "service_id": <SERVICE_ID>,
        "origin": {
          "name": "Test Sender", "email": "test@envia.com", "phone": "8180001234",
          "street": "Av Eugenio Garza Sada", "number": "2501",
          "district": "Tecnológico", "city": "Monterrey",
          "state": "NL", "postal_code": "64849", "country": "MX"
        },
        "destination": {
          "name": "Test Receiver", "email": "receiver@envia.com", "phone": "5551234567",
          "street": "Av Insurgentes Sur", "number": "1602",
          "district": "Crédito Constructor", "city": "Ciudad de Mexico",
          "state": "CDMX", "postal_code": "03940", "country": "MX"
        },
        "parcel": { "weight": 1.5, "height": 10, "width": 15, "length": 20 }
      }
    }
  }' | jq '.result.content[0].text'
```

**Expected fingerprint:** Response text contains `"tracking_number"` and `"label_url"` (or similar label link).
**Save output:** Note the `tracking_number` — needed for Step 2.3 and 2.4.

---

### Step 2.3 — envia_track_package (Track)

Replace `<TRACKING_NUMBER>` and `<CARRIER_ID>` with values from Step 2.2.

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "envia_track_package",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "tracking_number": "<TRACKING_NUMBER>",
        "carrier": "<CARRIER_ID>"
      }
    }
  }' | jq '.result.content[0].text'
```

**Expected fingerprint:** Response contains `"status"` field with a string value (e.g. `"pending"`, `"in_transit"`).
**FAIL if:** Error message about tracking number not found (shipment just created — may take 1-2 min to appear).

---

### Step 2.4 — envia_cancel_shipment (Cancel)

Replace `<SHIPMENT_ID>` with the internal shipment ID returned in Step 2.2.

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "envia_cancel_shipment",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "shipment_id": "<SHIPMENT_ID>"
      }
    }
  }' | jq '.result.content[0].text'
```

**Expected fingerprint:** Response contains `"canceled"` or `"success"` indicator.
**FAIL if:** Error about shipment already picked up (sandbox — expected if carrier processed it; acceptable).

---

### Step 2.5 — envia_check_balance (Balance Query)

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "envia_check_balance",
      "arguments": {
        "api_key": "'"$TOKEN"'"
      }
    }
  }' | jq '.result.content[0].text'
```

**Expected fingerprint:** Response contains a balance amount (number or currency string).
**FAIL if:** `401 Unauthorized` or empty response.

---

## 3. Error-Path Sequence (Mapped Error Validation)

Verify that backend errors surface as mapped messages, not raw strings.

### Step 3.1 — Invalid postal code → mapped error

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "envia_get_shipping_rates",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "origin": { "postal_code": "00000", "country": "MX" },
        "destination": { "postal_code": "00000", "country": "MX" },
        "parcel": { "weight": 1, "height": 10, "width": 10, "length": 10 }
      }
    }
  }' | jq '.result.content[0].text'
```

**Expected:** Response contains a human-readable error message (from `mapCarrierError`), NOT a raw JSON dump or an unformatted carrier string.
**FAIL if:** Raw carrier error string appears verbatim with no user guidance.

---

## 4. Rollback Steps

If any step fails unexpectedly:

```bash
# 1. Revert to the previous release on Heroku
heroku rollback -a <APP>

# 2. Confirm rollback succeeded
heroku releases -a <APP> | head -5

# 3. Run Step 2.5 (check_balance) to confirm the old version responds
#    before investigating the root cause.

# 4. Check logs for the failure:
heroku logs --tail -a <APP> --num 200

# 5. Fix the issue locally, run:
#      npm run build && npx vitest run
#    Then re-deploy once green.
```

---

## 5. Outcome Recording

After running, record results in `_docs/DEPLOY_LOG_<DATE>.md`:

```
| Step | Tool | Result | Notes |
|------|------|--------|-------|
| 2.1  | envia_get_shipping_rates | PASS | X carriers returned |
| 2.2  | envia_create_label       | PASS | tracking_number=XXXX |
| 2.3  | envia_track_package      | PASS | status=pending |
| 2.4  | envia_cancel_shipment    | PASS | shipment canceled |
| 2.5  | envia_check_balance      | PASS | balance=X MXN |
| 3.1  | error path (invalid zip) | PASS | mapped message returned |
```

All steps PASS = go criteria satisfied (Decision C). Any FAIL = document root cause and rollback.
