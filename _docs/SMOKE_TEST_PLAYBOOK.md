# Smoke Test Playbook — envia-mcp-server

Repeatable end-to-end verification sequence for every staging or production deploy.
Run top-to-bottom. Each step must PASS before proceeding to the next.

> **Audience:** Engineer or AI agent executing the deploy.
>
> **Environment:** All commands target the staging/sandbox environment by default.
> Replace `<APP>` with the actual Heroku app name (currently: `envia-mcp-stage`).
>
> **Verified 2026-04-27** against `https://envia-mcp-stage-8942f8239481.herokuapp.com` — 6/6 PASS, see `_docs/DEPLOY_LOG_2026_04_27.md`.
> **Previous verification 2026-04-17** against `https://envia-mcp-server-c0fa1b3dab48.herokuapp.com` (commit `2eb87a4`) — that app URL is no longer active; the staging app was renamed to `envia-mcp-stage` between deploys.

---

## Transport Notes

The MCP server uses **Streamable HTTP transport**. Two requirements:

1. **Accept header is mandatory:**  
   ```
   -H "Accept: application/json, text/event-stream"
   ```
2. **Responses are SSE-formatted:**  
   ```
   event: message
   data: {"result":{"content":[{"type":"text","text":"..."}]},"jsonrpc":"2.0","id":1}
   ```
   Strip `data: ` prefix before parsing JSON, or pipe through:
   ```bash
   grep '^data:' | sed 's/^data: //' | jq '.result.content[0].text'
   ```

---

## 0. Pre-flight — Environment Variables

Verify all required env vars are provisioned before deploying.

```bash
# List current Heroku config
heroku config -a <APP>

# Confirm these are present:
#   ENVIA_API_KEY        — sandbox JWT token
#   ENVIA_ENVIRONMENT    — must be "sandbox" for staging
#   ENVIA_ECART_HOSTNAME — ecommerce sync hostname
#   HOST                 — must be "0.0.0.0" (Heroku HTTP routing requirement)

# Set any missing var:
heroku config:set ENVIA_ENVIRONMENT=sandbox -a <APP>
heroku config:set ENVIA_ECART_HOSTNAME=https://eshop-deve.herokuapp.com -a <APP>
heroku config:set HOST=0.0.0.0 -a <APP>
```

**Expected:** All four vars present. ENVIA_API_KEY matches the sandbox token.  
**Blocker if absent:** Set before proceeding.

---

## 1. Deploy Verification

After `git push heroku main` (or equivalent), confirm the dyno boots.

```bash
# Watch the deploy log
heroku logs --tail -a <APP>
```

**Expected:** Log line `State changed from starting to up` within 60 seconds.  
**FAIL if:** `Error R10 (Boot timeout)` or `SIGKILL` in logs.

---

## 2. Happy-Path Sequence (Sandbox)

Export the base URL and token before running the steps:

```bash
export MCP_URL="https://<APP>.herokuapp.com"
export TOKEN="ea7aa2285b00f166846a0924260ccf2395cf68f2582183b8e204d71e75a665f3"
```

> **Note on state codes (MX):** Carriers expect short codes.
> Use `DF` for Ciudad de Mexico, `JAL` for Jalisco, `NL` for Nuevo Leon, etc.
> Long names like "Ciudad de Mexico" will fail with error 1129 (State code not found).

---

### Step 2.1 — quote_shipment (Quote)

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "quote_shipment",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "origin_postal_code": "03940",
        "destination_postal_code": "44100",
        "origin_country": "MX",
        "destination_country": "MX",
        "weight": 2,
        "length": 20,
        "width": 15,
        "height": 10,
        "content": "ropa"
      }
    }
  }' | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text' | head -20
```

**Expected fingerprint:** Response contains `Found N rate(s)` with at least one carrier line (e.g. `dhl / express`).  
**Save output:** Note a carrier + service for use in Step 2.2.  
**FAIL if:** Empty, HTTP error, or `No carriers available`.

---

### Step 2.2 — create_shipment (Create Label)

> **Sandbox carrier note:** DHL Express works reliably. UPS fails with error 1300 (sandbox shipper number constraint). Use `dhl` / `express`.

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "create_shipment",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "carrier": "dhl",
        "service": "express",
        "origin_name": "Almacen Test",
        "origin_phone": "5512345678",
        "origin_street": "Insurgentes Sur",
        "origin_number": "1602",
        "origin_district": "Credito Constructor",
        "origin_city": "Benito Juarez",
        "origin_state": "DF",
        "origin_country": "MX",
        "origin_postal_code": "03940",
        "origin_email": "test@envia.com",
        "destination_name": "Cliente Test",
        "destination_phone": "3312345678",
        "destination_street": "Vallarta",
        "destination_number": "100",
        "destination_district": "Americana",
        "destination_city": "Guadalajara",
        "destination_state": "JAL",
        "destination_country": "MX",
        "destination_postal_code": "44100",
        "destination_email": "cliente@test.com",
        "package_weight": 2,
        "package_length": 20,
        "package_width": 15,
        "package_height": 10,
        "content": "ropa de prueba"
      }
    }
  }' | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text'
```

**Expected fingerprint:** Response contains `Label created successfully!`, a tracking number, and a label PDF URL.  
**Save output:** Note the `Tracking number` — needed for Steps 2.3 and 2.4.  
**FAIL if:** `Label creation failed` with non-carrier-specific error.

---

### Step 2.3 — envia_track_package (Track)

Replace `<TRACKING_NUMBER>` with the value from Step 2.2.

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "envia_track_package",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "tracking_numbers": "<TRACKING_NUMBER>"
      }
    }
  }' | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text'
```

> **Note:** Parameter is `tracking_numbers` (plural), accepts single string or comma-separated list.

**Expected fingerprint:** Response contains `Status:` with a value (e.g. `Created`, `In Transit`).  
**FAIL if:** Error about tracking not found (shipment just created — may take 1-2 min to register).

---

### Step 2.4 — envia_cancel_shipment (Cancel)

Replace `<TRACKING_NUMBER>` with the value from Step 2.2.

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "envia_cancel_shipment",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "carrier": "dhl",
        "tracking_number": "<TRACKING_NUMBER>"
      }
    }
  }' | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text'
```

**Expected fingerprint:** Response contains `cancelled successfully`.  
**Acceptable alternate:** `already cancelled` or carrier-specific message — shows the tool processed the request.

---

### Step 2.5 — envia_check_balance (Balance Query)

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "envia_check_balance",
      "arguments": {
        "api_key": "'"$TOKEN"'",
        "amount": 500
      }
    }
  }' | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text'
```

> **Note:** Parameter is `amount` (the shipment cost to check against balance).

**Expected fingerprint:** Response contains `Current balance:` and `Result: ✓ Sufficient` or `Result: ✗ Insufficient`.  
**FAIL if:** Auth error or empty response.

---

## 3. Error-Path Sequence (Mapped Error Validation)

Verify that backend errors surface as mapped messages, not raw strings.

### Step 3.1 — Invalid API key → mapped auth error

```bash
curl -s -X POST "$MCP_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "create_shipment",
      "arguments": {
        "api_key": "INVALID_KEY_TEST",
        "carrier": "dhl",
        "service": "express",
        "origin_name": "Test",
        "origin_phone": "5512345678",
        "origin_street": "Insurgentes",
        "origin_number": "1",
        "origin_city": "Benito Juarez",
        "origin_state": "DF",
        "origin_country": "MX",
        "origin_postal_code": "03940",
        "destination_name": "Test",
        "destination_phone": "3312345678",
        "destination_street": "Vallarta",
        "destination_number": "1",
        "destination_city": "Guadalajara",
        "destination_state": "JAL",
        "destination_country": "MX",
        "destination_postal_code": "44100",
        "package_weight": 1,
        "package_length": 10,
        "package_width": 10,
        "package_height": 10
      }
    }
  }' | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text'
```

**Expected:** `Authentication failed — verify your ENVIA_API_KEY is valid and not expired.`  
**FAIL if:** Raw JSON error dump or unformatted carrier string appears without user guidance.

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
| Step | Tool                    | Result | Notes                          |
|------|-------------------------|--------|--------------------------------|
| 2.1  | quote_shipment          | PASS   | 13 carriers returned           |
| 2.2  | create_shipment         | PASS   | tracking_number=2178339811     |
| 2.3  | envia_track_package     | PASS   | status=Created                 |
| 2.4  | envia_cancel_shipment   | PASS   | shipment cancelled             |
| 2.5  | envia_check_balance     | PASS   | balance=$9,920,987 MXN         |
| 3.1  | error path (bad api key)| PASS   | mapped auth message returned   |
```

All steps PASS = go criteria satisfied (Decision C). Any FAIL = document root cause and rollback.
