# Fase 0.5: Integrate Validation Infrastructure into Existing Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Fase 0 validation infrastructure (country-rules, tax-rules, identification-validator, error-mapper) into all 12 existing MCP tools so they validate correctly before hitting the backend.

**Architecture:** Surgical edits to existing tools — no new tools, no schema changes, no breaking changes. Each tool gains error mapping, and address-touching tools gain country-specific validation. The changes are additive warnings and pre-flight checks that prevent the ~30% backend rejection rate.

**Tech Stack:** TypeScript, Zod 4, Vitest 3, existing MCP SDK patterns

---

## File Map

| File | Action | Changes |
|------|--------|---------|
| `src/tools/create-label.ts` | Modify | ID validation, tax-aware items check, IN→IN detection, error mapping |
| `src/tools/get-shipping-rates.ts` | Modify | Tax warning for international routes, BR/IN domestic warning |
| `src/tools/cancel-shipment.ts` | Modify | Error mapping |
| `src/tools/schedule-pickup.ts` | Modify | Error mapping |
| `src/tools/track-package.ts` | Modify | Error mapping |
| `src/tools/validate-address.ts` | Modify | Postal code transform before geocoding |
| `src/tools/create-commercial-invoice.ts` | Modify | Error mapping |
| `src/tools/get-ecommerce-order.ts` | Modify | BR/IN domestic flag in output |
| `src/tools/list-carriers.ts` | Modify | Error mapping |
| `src/tools/list-additional-services.ts` | Modify | Error mapping |
| `src/tools/get-shipment-history.ts` | Modify | Error mapping |
| `src/tools/classify-hscode.ts` | Modify | Error mapping |
| `tests/tools/create-label.test.ts` | Extend | 8 new tests |
| `tests/tools/get-shipping-rates.test.ts` | Extend | 4 new tests |

---

### Task 1: Add error mapping to simple tools (cancel, pickup, track, invoice, list-carriers, list-services, history, hscode)

These 8 tools need the same pattern: import `mapCarrierError` and use it on API error responses.

**Files:**
- Modify: `src/tools/cancel-shipment.ts`
- Modify: `src/tools/schedule-pickup.ts`
- Modify: `src/tools/track-package.ts`
- Modify: `src/tools/create-commercial-invoice.ts`
- Modify: `src/tools/list-carriers.ts`
- Modify: `src/tools/list-additional-services.ts`
- Modify: `src/tools/get-shipment-history.ts`
- Modify: `src/tools/classify-hscode.ts`

- [ ] **Step 1: Add import to all 8 files**

Add to each file's import section:
```typescript
import { mapCarrierError } from '../utils/error-mapper.js';
```

- [ ] **Step 2: Replace error handling in cancel-shipment.ts**

Find the `if (!res.ok)` block (around line 53) and replace the error text:
```typescript
// BEFORE:
text: `Cancellation failed: ${res.error}\n\nNote: Some carriers do not allow cancellation...`

// AFTER:
const mapped = mapCarrierError(res.status, res.error ?? '');
text: `Cancellation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`
```

- [ ] **Step 3: Replace error handling in schedule-pickup.ts**

Find the `if (!res.ok)` block (around line 121) and replace:
```typescript
// BEFORE:
text: `Pickup scheduling failed: ${res.error}\n\nTip: Verify the date...`

// AFTER:
const mapped = mapCarrierError(res.status, res.error ?? '');
text: `Pickup scheduling failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`
```

- [ ] **Step 4: Replace error handling in track-package.ts**

Find the `if (!res.ok)` block (around line 73) and replace:
```typescript
// BEFORE:
text: `Tracking failed: ${res.error}`

// AFTER:
const mapped = mapCarrierError(res.status, res.error ?? '');
text: `Tracking failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`
```

- [ ] **Step 5: Apply same pattern to remaining 5 tools**

For each of `create-commercial-invoice.ts`, `list-carriers.ts`, `list-additional-services.ts`, `get-shipment-history.ts`, `classify-hscode.ts`:
- Add the import
- Find any `if (!res.ok)` blocks
- Replace raw `res.error` with `mapCarrierError(res.status, res.error ?? '')` pattern

- [ ] **Step 6: Run build and existing tests**

```bash
npm run build && npm test
```
Expected: All 678 tests pass, zero build errors. These changes only improve error messages — no logic changes.

- [ ] **Step 7: Commit**

```bash
git add src/tools/cancel-shipment.ts src/tools/schedule-pickup.ts src/tools/track-package.ts src/tools/create-commercial-invoice.ts src/tools/list-carriers.ts src/tools/list-additional-services.ts src/tools/get-shipment-history.ts src/tools/classify-hscode.ts
git commit -m "feat: integrate error-mapper into 8 simple tools for agent-friendly error messages"
```

---

### Task 2: Add postal code transform to validate-address

**Files:**
- Modify: `src/tools/validate-address.ts`

- [ ] **Step 1: Add import**

```typescript
import { transformPostalCode } from '../utils/address-resolver.js';
```

- [ ] **Step 2: Transform postal code before geocoding**

In the postal code validation section (around line 83), after `const pc = postal_code.trim();`, add:
```typescript
const normalizedPc = transformPostalCode(countryCode, pc);
```

Then use `normalizedPc` instead of `pc` in the URL construction (line 86):
```typescript
const url = `${config.geocodesBase}/zipcode/${encodeURIComponent(countryCode)}/${encodeURIComponent(normalizedPc)}`;
```

And update the display text to show both original and normalized if they differ:
```typescript
const pcDisplay = normalizedPc !== pc ? `${pc} (normalized to ${normalizedPc})` : pc;
```

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/validate-address.ts
git commit -m "feat: normalize postal codes by country in validate-address tool"
```

---

### Task 3: Add BR/IN domestic warning to get-ecommerce-order

**Files:**
- Modify: `src/tools/get-ecommerce-order.ts`

- [ ] **Step 1: Add import**

```typescript
import { DOMESTIC_AS_INTERNATIONAL } from '../services/country-rules.js';
```

- [ ] **Step 2: Add warning in the output formatting**

Find where the order summary is built (in `formatOutput` or equivalent). After determining origin/destination countries, add:

```typescript
const originCountry = /* extract from transformed order location */;
const destCountry = /* extract from transformed order shipping address */;
const domesticButIntl = originCountry === destCountry && DOMESTIC_AS_INTERNATIONAL.has(originCountry.toUpperCase());

if (domesticButIntl) {
    lines.push('');
    lines.push(`⚠ ${originCountry}→${destCountry} domestic shipments require items in each package (fiscal/customs requirement).`);
    lines.push('  Ensure all products have descriptions, quantities, prices, and productCode (NCM/HS code).');
}
```

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/get-ecommerce-order.ts
git commit -m "feat: warn about items requirement for BR/IN domestic orders"
```

---

### Task 4: Add international warnings to get-shipping-rates

**Files:**
- Modify: `src/tools/get-shipping-rates.ts`
- Test: `tests/tools/get-shipping-rates.test.ts`

- [ ] **Step 1: Add imports**

```typescript
import { shouldApplyTaxes } from '../services/tax-rules.js';
import { DOMESTIC_AS_INTERNATIONAL } from '../services/country-rules.js';
```

- [ ] **Step 2: Add post-rate warning logic**

After rates are collected and formatted (after the `allRates.sort(...)` block), before the "Next step" line, add:

```typescript
// Warn about international requirements for label creation
const originCC = (args.origin_country ?? 'MX').toUpperCase();
const destCC = (args.destination_country ?? 'MX').toUpperCase();
const originSt = origin.state ?? '';
const destSt = destination.state ?? '';
const taxesApply = shouldApplyTaxes(originCC, originSt, destCC, destSt);
const domesticButIntl = originCC === destCC && DOMESTIC_AS_INTERNATIONAL.has(originCC);

if (!taxesApply || domesticButIntl) {
    lines.push('');
    lines.push('Important: This route requires items[] in each package when creating a label.');
    lines.push('Each item needs: description, quantity, price, and productCode (HS/NCM code).');
    if (domesticButIntl) {
        lines.push(`(${originCC} domestic shipments have fiscal/customs requirements even within the same country.)`);
    }
}
```

- [ ] **Step 3: Write 4 new tests**

Add to `tests/tools/get-shipping-rates.test.ts`:

```typescript
describe('international route warnings', () => {
    it('should include items warning for BR→BR route', async () => {
        // Arrange: mock rate response for BR→BR
        // Act: call tool with origin_country='BR', destination_country='BR'
        // Assert: output contains 'requires items[]'
    });

    it('should include items warning for IN→IN route', async () => {
        // Same pattern as BR→BR
    });

    it('should include items warning for MX→US route (international)', async () => {
        // Arrange: mock rate response for MX→US
        // Assert: output contains 'requires items[]'
    });

    it('should not include items warning for MX→MX route (domestic)', async () => {
        // Arrange: mock rate response for MX→MX
        // Assert: output does NOT contain 'requires items[]'
    });
});
```

Note: Follow existing test patterns in the file — use `mockFetchSuccess` from fixtures, mock the multi-carrier rate response.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/tools/get-shipping-rates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-shipping-rates.ts tests/tools/get-shipping-rates.test.ts
git commit -m "feat: add international route warnings to quote_shipment tool"
```

---

### Task 5: Add identification validation and items check to create-label

This is the most complex change. The create_shipment tool needs pre-flight validation for identification documents and international items.

**Files:**
- Modify: `src/tools/create-label.ts`
- Test: `tests/tools/create-label.test.ts`

- [ ] **Step 1: Add imports**

Add to the imports section of `create-label.ts`:
```typescript
import { shouldApplyTaxes } from '../services/tax-rules.js';
import { DOMESTIC_AS_INTERNATIONAL } from '../services/country-rules.js';
import { validateCPF, validateCNPJ, validateNIT, isIdentificationRequired } from '../services/identification-validator.js';
import { detectBrazilianDocumentType } from '../services/country-rules.js';
import { mapCarrierError } from '../utils/error-mapper.js';
```

- [ ] **Step 2: Add identification validation helper**

Add a helper function before `handleManualMode`:

```typescript
/**
 * Validate identification numbers based on country requirements.
 * Returns an error message string if validation fails, undefined if OK.
 */
function validateIdentification(
    originCountry: string,
    destCountry: string,
    originId: string | undefined,
    destId: string | undefined,
): string | undefined {
    const req = isIdentificationRequired(originCountry, destCountry, 'generate');
    if (!req.required) return undefined;

    const errors: string[] = [];

    if (req.fields.includes('origin')) {
        if (!originId || originId.trim() === '') {
            errors.push(`Origin identification number is required for ${originCountry} shipments.`);
        } else if (originCountry === 'BR') {
            const docType = detectBrazilianDocumentType(originId);
            if (docType === 'CPF' && !validateCPF(originId)) {
                errors.push('Origin CPF is invalid (checksum failed). Format: 11 digits, e.g. 529.982.247-25');
            } else if (docType === 'CNPJ' && !validateCNPJ(originId)) {
                errors.push('Origin CNPJ is invalid (checksum failed). Format: 14 digits, e.g. 11.222.333/0001-81');
            }
        } else if (originCountry === 'CO' && !validateNIT(originId)) {
            errors.push('Origin NIT is invalid. Must be 7-10 numeric digits.');
        }
    }

    if (req.fields.includes('destination')) {
        if (!destId || destId.trim() === '') {
            errors.push(`Destination identification number is required for shipments to/from ${originCountry}.`);
        } else if (destCountry === 'BR') {
            const docType = detectBrazilianDocumentType(destId);
            if (docType === 'CPF' && !validateCPF(destId)) {
                errors.push('Destination CPF is invalid (checksum failed). Format: 11 digits.');
            } else if (docType === 'CNPJ' && !validateCNPJ(destId)) {
                errors.push('Destination CNPJ is invalid (checksum failed). Format: 14 digits.');
            }
        } else if (destCountry === 'CO' && !validateNIT(destId)) {
            errors.push('Destination NIT is invalid. Must be 7-10 numeric digits.');
        }
    }

    return errors.length > 0 ? errors.join('\n') : undefined;
}
```

- [ ] **Step 3: Integrate into handleManualMode**

Inside `handleManualMode`, after addresses are resolved and before building the generate payload:

```typescript
// --- Identification validation ---
const originCC = (args.origin_country as string ?? 'MX').toUpperCase();
const destCC = (args.destination_country as string ?? 'MX').toUpperCase();
const idError = validateIdentification(
    originCC, destCC,
    args.origin_identification_number as string | undefined,
    args.destination_identification_number as string | undefined,
);
if (idError) {
    return textResponse(`Identification validation failed:\n${idError}`);
}

// --- Items requirement check ---
const originSt = origin.state ?? '';
const destSt = destination.state ?? '';
const taxesApply = shouldApplyTaxes(originCC, originSt, destCC, destSt);
const domesticButIntl = originCC === destCC && DOMESTIC_AS_INTERNATIONAL.has(originCC);
const needsItems = !taxesApply || domesticButIntl;

if (needsItems) {
    const hasItems = args.items && Array.isArray(args.items) && (args.items as unknown[]).length > 0;
    if (!hasItems) {
        return textResponse(
            `This route (${originCC}→${destCC}) requires items in each package for customs/fiscal declarations.\n\n` +
            'Each item needs: description, quantity, price, and productCode (HS/NCM code).\n' +
            'Use classify_hscode to look up the correct code for each product.\n\n' +
            'Example: items: [{ "description": "Cotton T-shirt", "quantity": 2, "price": 25.00, "productCode": "6109.10.00" }]',
        );
    }
}
```

- [ ] **Step 4: Add IN→IN detection in handleEcommerceMode**

Find where `isBrDomestic` is defined (around line 401) and add IN detection:

```typescript
const isInDomestic = originCountryCode === 'IN' && destCountryCode === 'IN';
```

Then update the package building line to include it:
```typescript
const packages = buildPackagesFromV4(activePackages, isInternational || isBrDomestic || isInDomestic);
```

- [ ] **Step 5: Add error mapping for API errors**

Find all `if (!res.ok)` blocks in both handleManualMode and handleEcommerceMode. Add error mapping:

```typescript
if (!res.ok) {
    const mapped = mapCarrierError(res.status, res.error ?? '');
    return textResponse(`Label creation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
}
```

- [ ] **Step 6: Write 8 new tests for create-label**

Add to `tests/tools/create-label.test.ts`:

```typescript
describe('identification validation', () => {
    it('should error when BR origin has invalid CPF', async () => {
        // Mock: BR→BR with origin_identification_number='11111111111'
        // Assert: response contains 'CPF is invalid'
    });

    it('should error when CO origin missing NIT', async () => {
        // Mock: CO→CO without origin_identification_number
        // Assert: response contains 'identification number is required'
    });

    it('should error when CO NIT has invalid length', async () => {
        // Mock: CO→CO with origin_identification_number='12345' (too short)
        // Assert: response contains 'NIT is invalid'
    });

    it('should error when ES→US missing identification', async () => {
        // Mock: ES→US without identification numbers
        // Assert: response contains 'identification number is required'
    });
});

describe('international items requirement', () => {
    it('should error when BR→BR route has no items', async () => {
        // Mock: BR→BR manual mode without items
        // Assert: response contains 'requires items'
    });

    it('should error when IN→IN route has no items', async () => {
        // Mock: IN→IN manual mode without items
        // Assert: response contains 'requires items'
    });

    it('should error when MX→US route has no items', async () => {
        // Mock: MX→US (international, !taxesApply) without items
        // Assert: response contains 'requires items'
    });

    it('should detect IN→IN as international in ecommerce mode', async () => {
        // Mock: ecommerce order with IN→IN
        // Assert: packages built with items=true flag
    });
});
```

Note: Follow existing mock patterns in the test file. Use `vi.stubGlobal('fetch', ...)` and the fixture helpers.

- [ ] **Step 7: Run all tests**

```bash
npm run build && npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/tools/create-label.ts tests/tools/create-label.test.ts
git commit -m "feat: add identification validation and items requirement check to create_shipment"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full build**

```bash
npm run build
```
Expected: zero errors.

- [ ] **Step 2: Full test suite**

```bash
npm test
```
Expected: ~690+ tests pass (678 existing + 12 new).

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: zero errors.

- [ ] **Step 4: Spot-check validation manually**

Verify the following work as expected by reviewing code paths:
- `transformPostalCode('BR', '01310200')` is called in `validate-address` before geocoding
- `mapCarrierError(1129, ...)` returns actionable message in `cancel-shipment`
- `isIdentificationRequired('BR', 'BR', 'generate')` returns required=true in `create-label`
- `shouldApplyTaxes('MX', 'NL', 'US', 'CA')` returns false in `get-shipping-rates` and triggers warning

- [ ] **Step 5: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final verification pass for Fase 0.5"
```
