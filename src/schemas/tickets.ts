/**
 * Zod schemas for ticket-related API responses.
 *
 * Verified live 2026-04-28 against queries-test.envia.com.
 * NOTE: /company/tickets returned 404 in sandbox (auth scope).
 * CreateTicketResponseSchema is derived from src/types/tickets.ts CreateTicketResponse
 * (synthetic — verify against production when possible).
 *
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.2 for capture methodology.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool #5 — envia_create_ticket
//
// Two endpoints touched per call:
//   1. GET /guide/{tracking} → reuse ShipmentDetailResponseSchema from shipments.ts
//   2. POST /company/tickets → CreateTicketResponseSchema
//
// Sandbox returned 404 for /company/tickets (auth scope issue).
// Schema derived from src/types/tickets.ts. Synthetic fixture — mark accordingly.
// ---------------------------------------------------------------------------

/**
 * Response from POST /company/tickets.
 * Synthetic — derived from src/types/tickets.ts CreateTicketResponse.
 * Verified against live production shape when available.
 */
export const CreateTicketResponseSchema = z.object({
    id: z.number(),
});

export type CreateTicketResponseT = z.infer<typeof CreateTicketResponseSchema>;
