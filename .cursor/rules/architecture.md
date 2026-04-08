---
description: Architecture and design patterns — when to use each pattern and decision rules
globs: ["**/*.{js,ts,jsx,tsx,mjs,cjs}"]
---

# Architecture & Design Patterns

## When to use each pattern

### Pure Functions / Utils
- Use for stateless, side-effect-free operations (formatting, validation, parsing).
- Never put them in a single `utils.js` — split by domain: `taxUtils`, `dateUtils`, `addressUtils`.
- Every util function must be a pure function: same input → same output, no side effects.

### Classes / Constructors
- Use when an entity has **state + behavior** that belong together.
- Domain models like `Invoice`, `Shipment`, `Carrier` are good candidates.
- If you're passing the same group of arguments to 3+ functions, it should probably be a class.

### Factory
- Use when object creation is conditional, complex, or the caller shouldn't know the concrete type.
- Example: `createTaxHandler(countryCode)` returns the right tax strategy without the caller knowing which class was instantiated.
- Prefer factories over raw `new` when the construction logic may change.

### Strategy
- Use when behavior varies by type/context and you'd otherwise write a large if/else or switch.
- Each strategy implements the same interface.
- Example: tax calculation, validation rules, or carrier-specific logic that differs per country/provider.

### Repository
- All data access goes through repository classes/modules.
- Services never write raw queries — they call `repo.findById()`, `repo.save()`, etc.
- This makes swapping data sources and writing tests straightforward.

### Adapter
- Wrap every external API or third-party service behind an adapter that conforms to our internal interface.
- Core business logic must never import or depend on external SDKs directly.
- Example: `AEATAdapter`, `SDIAdapter`, `CarrierXAdapter` all implement a shared interface.

### Builder
- Use when constructing objects with many optional fields or multi-step assembly.
- Prefer builder over constructors with 5+ parameters.
- Chain methods and call `.build()` at the end, which should validate required fields.

### Observer / Event Emitter
- Use to decouple side effects from core operations.
- The main action (e.g., creating a shipment) should not directly call notification, logging, or billing code.
- Emit a domain event (`shipment.created`) and let listeners handle side effects independently.

### Decorator
- Use to add cross-cutting behavior (caching, retry, logging, metrics) without modifying the original class.
- Prefer decorators over modifying existing code when adding observability or resilience layers.

### Middleware / Pipeline
- Use for sequential processing steps: validation → transformation → execution.
- Each step should be independently testable and reorderable.

### Singleton
- Use **only** for truly global, shared resources: DB connection pools, loggers, app config.
- Never use singletons for business logic. If you think you need one, you probably need dependency injection instead.

## Decision Flowchart

1. Is it a stateless transformation? → **Pure function / util**
2. Does it have state + behavior? → **Class**
3. Is creation logic complex or conditional? → **Factory**
4. Does behavior vary by type/country/provider? → **Strategy**
5. Does it talk to a database? → **Repository**
6. Does it wrap an external service? → **Adapter**
7. Does it have 5+ optional params? → **Builder**
8. Are you triggering side effects after an action? → **Event / Observer**
9. Are you adding behavior without changing existing code? → **Decorator**

## Rules

- Do NOT create a pattern "just in case." Start simple (function → class) and refactor when duplication or rigidity appears.
- Every class and module should have a single, clear responsibility.
- Prefer composition over inheritance.
- External dependencies (APIs, DBs, third-party libs) must always be behind an abstraction (adapter or repository).
- When adding a new integration or country-specific logic, use Strategy or Adapter — never grow an existing if/else chain.