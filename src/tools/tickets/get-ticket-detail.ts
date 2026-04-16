/**
 * Tool: envia_get_ticket_detail
 *
 * Retrieves full details for a single support ticket by ID.
 * Includes status, linked shipment, consignee, files, comments, and CSAT rating.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryTicketsApi, TICKET_STATUS_NAMES, formatTicketComment } from '../../services/tickets.js';
import type { TicketDetailResponse } from '../../types/tickets.js';

/**
 * Register the envia_get_ticket_detail tool on the MCP server.
 */
export function registerGetTicketDetail(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_ticket_detail',
        {
            description:
                'Get complete details for a support ticket by ID. Includes: ticket type and status, ' +
                'linked shipment and carrier info, consignee address, file attachments, comment thread ' +
                '(if requested), CSAT rating, and additional services.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                ticket_id: z.number().int().min(1).describe('Ticket ID to retrieve'),
                getComments: z.boolean().default(true).describe('Include the full comment thread (default: true)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryTicketsApi<TicketDetailResponse>(
                activeClient, config, `/company/tickets/${args.ticket_id}`,
                { getComments: args.getComments },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get ticket #${args.ticket_id}: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const tickets = Array.isArray(res.data?.data) ? res.data.data : [];
            if (tickets.length === 0) {
                return textResponse(
                    `Ticket #${args.ticket_id} not found or does not belong to your account.`,
                );
            }

            const t = tickets[0];
            const status = TICKET_STATUS_NAMES.get(t.ticket_status_id) ?? t.ticket_status_name;
            const cons = t.consignee;

            const lines: string[] = [
                `Ticket #${t.id} — ${t.ticket_type_name}`,
                `Status: ${status} (ID ${t.ticket_status_id})`,
                `Created: ${t.created_at} | Updated: ${t.updated_at}`,
                '',
            ];

            // Shipment / carrier info
            if (t.shipment_id || t.tracking_number || t.carrier) {
                lines.push('--- Shipment ---');
                if (t.shipment_id) lines.push(`  Shipment ID:     ${t.shipment_id}`);
                if (t.tracking_number) lines.push(`  Tracking:        ${t.tracking_number}`);
                if (t.carrier) lines.push(`  Carrier:         ${t.carrier}`);
                if (t.service) lines.push(`  Service:         ${t.service.trim()}`);
                lines.push('');
            }

            // Consignee
            const consigneeName = cons?.consignee_name ?? t.name;
            if (consigneeName) {
                lines.push('--- Consignee ---');
                if (consigneeName) lines.push(`  Name:            ${consigneeName}`);
                if (cons?.consignee_email ?? t.email) lines.push(`  Email:           ${cons?.consignee_email ?? t.email}`);
                if (cons?.consignee_phone ?? t.phone) lines.push(`  Phone:           ${cons?.consignee_phone ?? t.phone}`);
                const city = cons?.consignee_city ?? t.city;
                const state = cons?.consignee_state ?? t.state;
                const country = cons?.consignee_country ?? t.country;
                if (city || state || country) lines.push(`  Location:        ${[city, state, country].filter(Boolean).join(', ')}`);
                lines.push('');
            }

            // Initial description
            if (t.comments) {
                lines.push('--- Description ---');
                lines.push(`  ${t.comments}`);
                lines.push('');
            }

            // Files
            if (t.file_quantity > 0) {
                lines.push(`--- Files (${t.file_quantity}) ---`);
                for (const f of t.files) {
                    lines.push(`  ${f.file_url}`);
                }
                lines.push('');
            }

            // Comments thread
            if (args.getComments && Array.isArray(t.allComments) && t.allComments.length > 0) {
                lines.push(`--- Comments (${t.allComments.length}) ---`);
                for (const c of t.allComments) {
                    lines.push(`  ${formatTicketComment(c)}`);
                }
                lines.push('');
            }

            // CSAT rating — only meaningful when status is Accepted(2) or Declined(3)
            if (t.rating?.evaluated === 1) {
                lines.push('--- Rating ---');
                const score = t.rating.rating !== null ? `${t.rating.rating}/5` : 'Not rated yet';
                lines.push(`  Score:           ${score}`);
                if (t.rating.comment) lines.push(`  Comment:         ${t.rating.comment}`);
                lines.push('');
            } else if (t.ticket_status_id === 2 || t.ticket_status_id === 3) {
                lines.push('--- Rating ---');
                lines.push('  Not yet rated. Use envia_rate_ticket to submit your CSAT score.');
                lines.push('');
            }

            // Additional services
            if (Array.isArray(t.additional_services) && t.additional_services.length > 0) {
                lines.push('--- Additional Services ---');
                for (const svc of t.additional_services) {
                    lines.push(`  ${svc.additionalService}: $${svc.value} (cost: $${svc.cost})`);
                }
                lines.push('');
            }

            return textResponse(lines.join('\n'));
        },
    );
}
