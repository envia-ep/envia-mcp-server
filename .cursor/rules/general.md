---
description: Core implementation standards — documentation, principles, language
globs: ["**/*.{js,ts,jsx,tsx,mjs,cjs}"]
---

# General Implementation Standards

## Documentation
- Every exported function and class must include JSDoc with `@param`, `@returns`, and `@throws` where applicable.
- When updating a function's signature or behavior, update its JSDoc in the same commit.
- All code, comments, and documentation must be written in English.

## Principles
- New code must comply with CUPID principles (Composable, Unix philosophy, Predictable, Idiomatic, Domain-based).
- Unit tests must accompany all new or meaningfully changed code — no PR without tests.

## Error Handling
- Never swallow errors silently. Always log or propagate with meaningful context.
- Use custom error classes for domain-specific failures (e.g., `ShipmentNotFoundError`, `TaxValidationError`).
- Async functions must have proper error handling — no unhandled promise rejections.