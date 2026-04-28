/**
 * Tool: envia_create_ticket
 *
 * Creates a new support ticket. When the ticket relates to a specific shipment
 * the caller should pass `tracking_number` (the user-visible "guía") — the tool
 * resolves it to the internal `shipment_id` via GET /guide/{tracking} before
 * calling POST /company/tickets so the ticket is properly linked. Without that
 * linkage the backend stores the ticket with `shipment_id = NULL`, the
 * duplicate-prevention rule does not fire, and reverse lookups by tracking
 * number return nothing.
 *
 * Handles 409 Conflict when an active ticket already exists for the same
 * shipment + type combination.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateTicketApi } from '../../services/tickets.js';
import { queryShipmentsApi } from '../../services/shipments.js';
import { parseToolResponse } from '../../utils/response-validator.js';
import { ShipmentDetailResponseSchema } from '../../schemas/shipments.js';
import { CreateTicketResponseSchema } from '../../schemas/tickets.js';

/**
 * Register the envia_create_ticket tool on the MCP server.
 */
export function registerCreateTicket(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_create_ticket',
        {
            description:
                'Create a new support ticket. Requires type_id (use envia_get_ticket_types to see options). ' +
                'IMPORTANT: when the ticket relates to a specific shipment (the user mentions a tracking number ' +
                'or "guía"), ALWAYS pass `tracking_number` so the ticket is properly linked. The tool resolves ' +
                'tracking_number to the internal shipment_id automatically. Tickets created without a tracking ' +
                'number become orphan and cannot be found by tracking-number search later. ' +
                'Common types: 3=Overweight, 5=Damaged, 6=Wrong delivery, 7=Refund, 8=Delay, 13=Theft, ' +
                '14=Redirection, 25=Delivery attempt.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type_id: z.number().int().min(1)
                    .describe('Ticket type ID (required). Use envia_get_ticket_types to see all available types'),
                tracking_number: z.string().min(1).optional()
                    .describe(
                        'Tracking number ("guía") of the shipment to link this ticket to. ' +
                        'PREFERRED over shipment_id — pass this whenever the user references a shipment. ' +
                        'The tool resolves it to the internal shipment_id automatically.',
                    ),
                shipment_id: z.number().int().min(1).optional()
                    .describe(
                        'Internal numeric shipment ID. Use ONLY if you already have the resolved ID; ' +
                        'otherwise pass tracking_number and the tool will resolve it.',
                    ),
                carrier_id: z.number().int().min(1).optional()
                    .describe('Carrier ID associated with the issue'),
                credit_id: z.number().int().min(1).optional()
                    .describe('Credit ID if the ticket relates to a credit'),
                warehouse_package_id: z.string().optional()
                    .describe('Warehouse package ID for fulfillment-related tickets'),
                comments: z.string().optional()
                    .describe('Initial description of the issue'),
                data: z.string().optional()
                    .describe('JSON string with additional ticket variables (type-specific)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // Resolve tracking_number → shipment_id when the caller provided
            // tracking_number but not shipment_id. If both are present,
            // shipment_id wins (explicit caller intent).
            let resolvedShipmentId = args.shipment_id;

            if (args.tracking_number && args.shipment_id === undefined) {
                const tracking = encodeURIComponent(args.tracking_number.trim());
                const lookup = await queryShipmentsApi<unknown>(
                    activeClient, config, `/guide/${tracking}`, {},
                );

                const validatedLookup = parseToolResponse(
                    ShipmentDetailResponseSchema,
                    lookup.data,
                    'envia_create_ticket',
                );
                const shipmentRecord = validatedLookup.data?.[0];
                if (!lookup.ok || !shipmentRecord?.id) {
                    return textResponse(
                        `Cannot create ticket: tracking number "${args.tracking_number}" was not found for your company. ` +
                        `Verify the tracking number is correct and that the shipment belongs to the authenticated company.`,
                    );
                }

                resolvedShipmentId = shipmentRecord.id;
            }

            const body: Record<string, unknown> = {
                type_id: args.type_id,
            };
            if (resolvedShipmentId !== undefined) body.shipment_id = resolvedShipmentId;
            if (args.carrier_id !== undefined) body.carrier_id = args.carrier_id;
            if (args.credit_id !== undefined) body.credit_id = args.credit_id;
            if (args.warehouse_package_id !== undefined) body.warehouse_package_id = args.warehouse_package_id;
            if (args.comments !== undefined) body.comments = args.comments;
            if (args.data !== undefined) body.data = args.data;

            const res = await mutateTicketApi<unknown>(
                activeClient, config, '/company/tickets', body,
            );

            if (!res.ok) {
                if (res.status === 409) {
                    return textResponse(
                        'Cannot create ticket: an active ticket already exists for this shipment and type. ' +
                        'Use envia_list_tickets with the shipment\'s tracking number to find the existing ticket, ' +
                        'or use envia_add_ticket_comment to add more information.',
                    );
                }
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to create ticket: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const validated = parseToolResponse(CreateTicketResponseSchema, res.data, 'envia_create_ticket');
            const ticketId = validated.id;
            const linkLine = resolvedShipmentId !== undefined
                ? `  Linked to shipment_id: ${resolvedShipmentId}` +
                    (args.tracking_number ? ` (tracking ${args.tracking_number})` : '')
                : '  Not linked to any shipment.';

            const lines: string[] = [
                `Ticket created successfully.`,
                `  Ticket ID: ${ticketId}`,
                linkLine,
                '',
                'Use envia_get_ticket_detail to view full details, or envia_add_ticket_comment to add more information.',
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
