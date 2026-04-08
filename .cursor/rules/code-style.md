---
description: Formatting and naming conventions — enforced alongside Prettier/ESLint
globs: ["**/*.{js,ts,jsx,tsx,mjs,cjs,json}"]
---

# Code Style

## Formatting (Prettier)
- Single quotes for strings
- 4 spaces indentation, no tabs
- Trailing commas (ES5)
- Print width: 130 characters
- Semicolons required
- Arrow function parentheses: always — `(x) => x`, never `x => x`

## Naming Conventions
- **Files**: `kebab-case.js` (e.g., `shipment-service.js`, `tax-utils.js`)
- **Classes**: `PascalCase` (e.g., `InvoiceBuilder`, `CarrierAdapter`)
- **Functions / variables**: `camelCase` (e.g., `calculateTax`, `shipmentRate`)
- **Constants**: `UPPER_SNAKE_CASE` for true constants (e.g., `MAX_RETRY_COUNT`)
- **Booleans**: prefix with `is`, `has`, `should`, `can` (e.g., `isValid`, `hasTracking`)

## ESLint
- No unused variables (warn level)
- Import validation enabled
- Promise handling required (eslint-plugin-promise)
- Security best practices enforced (eslint-plugin-security)

## Imports
- Group imports in order: (1) node builtins, (2) external packages, (3) internal modules, (4) relative imports. Separate each group with a blank line.
- Never use wildcard imports (`import * as`) unless wrapping an adapter.