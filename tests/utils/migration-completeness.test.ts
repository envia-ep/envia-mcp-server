/**
 * Phase 1 completeness guard.
 *
 * Verifies that every tool listed as "Phase 1" in
 * _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.6 imports the
 * parseToolResponse helper. If a tool is on the Phase 1 list but the
 * source file does not import the helper, the migration was forgotten.
 *
 * This test is intentionally simple: a grep for the import statement.
 * It does NOT verify the helper is invoked correctly — that is the
 * responsibility of the per-tool tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PHASE_1_TOOLS = [
    'src/tools/shipments/get-shipment-detail.ts',
    'src/tools/shipments/list-shipments.ts',
    'src/tools/shipments/get-shipments-status.ts',
    'src/tools/shipments/get-shipment-invoices.ts',
    'src/tools/tickets/create-ticket.ts',
    'src/tools/get-carrier-constraints.ts',
    'src/tools/get-shipping-rates.ts',
    'src/tools/create-label.ts',
    'src/tools/track-package.ts',
    'src/tools/orders/list-orders.ts',
] as const;

describe('Phase 1 migration completeness', () => {
    for (const path of PHASE_1_TOOLS) {
        it(`${path} imports parseToolResponse`, () => {
            const source = readFileSync(resolve(process.cwd(), path), 'utf8');
            expect(source).toMatch(/parseToolResponse/);
            expect(source).toMatch(/from ['"](?:\.\.\/)+utils\/response-validator\.js['"]/);
        });
    }
});
