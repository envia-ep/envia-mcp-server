/**
 * Tool: envia_create_ticket
 *
 * Creates a new support ticket. A ticket can optionally be linked to a shipment.
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
import type { CreateTicketResponse } from '../../types/tickets.js';

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
                'Optionally link to a shipment_id. Common types: 3=Overweight, 5=Damaged, 6=Wrong delivery, ' +
                '7=Refund, 8=Delay, 13=Theft, 14=Redirection.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                type_id: z.number().int().min(1)
                    .describe('Ticket type ID (required). Use envia_get_ticket_types to see all available types'),
                shipment_id: z.number().int().min(1).optional()
                    .describe('Shipment ID to link this ticket to'),
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

            const body: Record<string, unknown> = {
                type_id: args.type_id,
            };
            if (args.shipment_id !== undefined) body.shipment_id = args.shipment_id;
            if (args.carrier_id !== undefined) body.carrier_id = args.carrier_id;
            if (args.credit_id !== undefined) body.credit_id = args.credit_id;
            if (args.warehouse_package_id !== undefined) body.warehouse_package_id = args.warehouse_package_id;
            if (args.comments !== undefined) body.comments = args.comments;
            if (args.data !== undefined) body.data = args.data;

            const res = await mutateTicketApi<CreateTicketResponse>(
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

            const ticketId = res.data?.id;
            const lines: string[] = [
                `Ticket created successfully.`,
                `  Ticket ID: ${ticketId}`,
                '',
                'Use envia_get_ticket_detail to view full details, or envia_add_ticket_comment to add more information.',
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
