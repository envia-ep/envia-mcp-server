---
description: Testing standards — only injected when working on test files
globs: ["**/*.{test,spec}.{js,ts,jsx,tsx}", "**/__tests__/**"]
---

# Testing Standards

## Framework
- Vitest 3.x — do not use Jest APIs or globals.
- Coverage focus: critical business logic and database operations first.

## Structure
- **AAA pattern**: every test has three visually distinct sections — Arrange, Act, Assert. Separate them with a blank line.
- **One logical assertion per test**: each `it()` block verifies a single concept or execution path.
- **No control flow in tests**: never use `if`, `for`, `while`, or `try/catch` inside a test. If you need branching, the test is poorly designed — split it.

## Naming
- Use the pattern: `should [expected result] when [state/condition]`
- The test name must read as a complete sentence.
- `describe` blocks match the function or class under test.

```js
// Good
describe('calculateTax', () => {
    it('should return zero when the country is tax-exempt', () => { ... });
    it('should throw TaxValidationError when rate is negative', () => { ... });
});
```

## Isolation
- Every test must be fully independent — no shared mutable state between tests.
- Mock all external dependencies (DB, APIs, filesystem, environment variables).
- Use `vi.fn()` and `vi.spyOn()` — never call real external services.

## Data
- **Factories over fixtures**: build minimal, inline test data using factory functions. Avoid large static JSON files that obscure what the test actually needs.
- **Determinism**: no randomness. Use fixed dates, seeded values, and always mock `Date.now()` or equivalent.

```js
// Good — factory with minimal, explicit data
const makeInvoice = (overrides = {}) => ({
    id: 'inv-001',
    amount: 100,
    currency: 'EUR',
    ...overrides,
});
```

## Coverage
- Happy path is not enough. Write explicit tests for:
  - Null / undefined inputs
  - Empty arrays and objects
  - Invalid or out-of-range values
  - Boundary conditions (0, -1, MAX_INT)
  - Error paths and thrown exceptions

## Readability
- **DAMP over DRY**: repeat setup code for clarity rather than over-abstracting into shared helpers that hide context. A reader should understand the test without jumping to another file.