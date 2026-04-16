# Fase 0.5: Integrate Validation Infrastructure into Existing Tools

## Purpose

The 12 existing MCP tools bypass country-specific validation rules discovered in the audit. This causes ~30% of requests to fail at the backend when addresses have untransformed postal codes, missing identification numbers, or incorrect international flags. Fase 0 created the validation infrastructure — this phase wires it into every tool that touches addresses.

## Approach

Minimal, surgical changes to each tool. No new tools, no schema changes, no breaking changes. Each tool gains:
1. **Postal code normalization** — via `transformPostalCode()` (already integrated in `resolveAddress`)
2. **Identification validation** — warn on invalid CPF/CNPJ/NIT format before backend rejects
3. **International detection** — include BR→BR and IN→IN as international (items required)
4. **Tax-aware warnings** — alert when `shouldApplyTaxes()=false` and no items provided
5. **Token sanitization** — mask api_key in any error messages

## Files to Modify

### 1. `src/tools/get-shipping-rates.ts` (quote_shipment)

**Changes:**
- Import `shouldApplyTaxes` from `../services/tax-rules.js`
- Import `DOMESTIC_AS_INTERNATIONAL` from `../services/country-rules.js`
- After addresses are resolved and before building rate payload:
  - Compute `taxesApply = shouldApplyTaxes(originCountry, originState, destCountry, destState)`
  - Compute `effectivelyInternational = originCountry !== destCountry || DOMESTIC_AS_INTERNATIONAL.has(originCountry)`
  - If `!taxesApply` and no items provided: append warning to response text (don't block, just warn)
  - If `effectivelyInternational` and BR/IN domestic: note in output that items will be required for label creation
- No schema changes (rate doesn't require items)

### 2. `src/tools/create-label.ts` (create_shipment)

**Changes (manual mode):**
- Import `shouldApplyTaxes` from `../services/tax-rules.js`
- Import `DOMESTIC_AS_INTERNATIONAL` from `../services/country-rules.js`
- Import `validateCPF`, `validateCNPJ`, `validateNIT`, `isIdentificationRequired` from `../services/identification-validator.js`
- Import `mapCarrierError` from `../utils/error-mapper.js`
- In `handleManualMode()`:
  - After resolving origin/destination addresses:
    - Check `isIdentificationRequired(originCountry, destCountry, 'generate')`
    - If required and origin has `identificationNumber`: validate format (BR→CPF/CNPJ, CO→NIT)
    - If invalid: return descriptive error with correct format hint
    - If required but missing: return error listing which fields need it
  - Compute `taxesApply = shouldApplyTaxes(...)` using resolved states
  - If `!taxesApply` and no items in packages: return error explaining items are required for this route
  - On API error response: use `mapCarrierError(code, message)` for better agent-friendly messages
- In `handleEcommerceMode()`:
  - Already handles BR→BR (isBrDomestic). Add IN→IN detection:
    - `const isInDomestic = originCountryCode === 'IN' && destCountryCode === 'IN'`
    - Use `isInternational || isBrDomestic || isInDomestic` for package building

### 3. `src/tools/cancel-shipment.ts`

**Changes:**
- Import `mapCarrierError` from `../utils/error-mapper.js`
- On API error: use `mapCarrierError()` instead of raw error message

### 4. `src/tools/schedule-pickup.ts`

**Changes:**
- Import `mapCarrierError` from `../utils/error-mapper.js`
- On API error: use `mapCarrierError()`

### 5. `src/tools/track-package.ts`

**Changes:**
- Import `sanitizeToken` from `../utils/token-validator.js`
- Ensure api_key is never included in error messages (it's not today, but add guard)

### 6. `src/tools/validate-address.ts`

**Changes:**
- Import `transformPostalCode` from `../utils/address-resolver.js`
- Apply `transformPostalCode()` to user-provided postal code before calling geocodes API
- This is a safety net — `resolveAddress()` already does this internally, but validate-address calls geocodes directly

### 7. `src/tools/create-commercial-invoice.ts`

**Changes:**
- Import `mapCarrierError` from `../utils/error-mapper.js`
- On API error: use `mapCarrierError()`

### 8. `src/tools/get-ecommerce-order.ts`

**Changes:**
- Import `DOMESTIC_AS_INTERNATIONAL` from `../services/country-rules.js`
- In the order summary output: flag when route is BR→BR or IN→IN with note about items requirement

### 9. `src/tools/list-carriers.ts`, `src/tools/list-additional-services.ts`, `src/tools/get-shipment-history.ts`, `src/tools/classify-hscode.ts`

**Changes:** Minimal — only add `mapCarrierError()` for better error messages on API failures.

## Files NOT Modified

- `src/utils/address-resolver.ts` — Already enhanced in Fase 0 (transformPostalCode integrated)
- `src/builders/address.ts` — No changes needed (SEPARATE_NUMBER_COUNTRIES already correct)
- `src/services/generic-form.ts` — Already used by create-label
- `src/config.ts` — No changes needed

## New Test Cases

Extend existing test files (don't create new ones):

### `tests/tools/create-label.test.ts` (add ~8 tests)
- should warn when BR identification is invalid CPF format
- should warn when CO identification is invalid NIT format
- should error when items missing for BR→BR route
- should error when items missing for IN→IN route
- should error when ES→US missing identification
- should use mapCarrierError for API errors
- should detect IN→IN as international for package building
- should validate CNPJ format for BR origin

### `tests/tools/get-shipping-rates.test.ts` (add ~4 tests)
- should include international warning for BR→BR route
- should include international warning for IN→IN route
- should warn about items requirement when taxes don't apply
- should not warn for domestic MX→MX route

## Verification

1. `npm run build` — zero errors
2. `npm test` — all existing + new tests pass
3. Manual verification:
   - Rate BR→BR: output should mention items requirement
   - Generate CO without NIT: should error with "NIT required for origin and destination"
   - Generate BR with invalid CPF "11111111111": should error with checksum warning
   - Cancel with fake tracking: should return actionable error via mapCarrierError
