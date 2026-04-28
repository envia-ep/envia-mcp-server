# Zod schemas (response validation)

Schemas in this directory mirror the `src/types/` split (one file per
domain: `shipments.ts`, `tickets.ts`, `orders.ts`, etc.).

## Conventions

- Schema name = TypeScript type name + `Schema` suffix.
  Example: `ShipmentDetailResponseSchema` parses into the same
  shape as `ShipmentDetailResponse` from `src/types/`.
- Field-level rules in spec §3.7 (nullability) and §3.9 (types).
- Every schema gets a JSDoc citing "Verified live YYYY-MM-DD against
  {endpoint}".
- Every schema is consumed via `parseToolResponse(schema, data,
  toolName)` from `src/utils/response-validator.ts`. Do not call
  `.parse()` or `.safeParse()` directly from tool code.

## Adding a new schema

See `_docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md` §5.4 for the
migration template.
