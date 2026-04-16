/**
 * Tool: envia_get_ticket_types
 *
 * Lists available ticket types with their conditions and requirements.
 * Each type has rules defining eligible shipment statuses, required files, and input fields.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryTicketsApi, formatTicketType } from '../../services/tickets.js';
import type { TicketTypesResponse } from '../../types/tickets.js';

/**
 * Register the envia_get_ticket_types tool on the MCP server.
 */
export function registerGetTicketTypes(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_ticket_types',
        {
            description:
                'List available ticket types with their conditions and requirements. Each type has rules ' +
                'defining which shipment statuses are eligible, required files, and input fields.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                id: z.number().int().min(1).optional()
                    .describe('Filter by a specific ticket type ID'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.id !== undefined) params.id = args.id;

            const res = await queryTicketsApi<TicketTypesResponse>(
                activeClient, config, '/tickets/types', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to get ticket types: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const types = Array.isArray(res.data?.data) ? res.data.data : [];

            if (types.length === 0) {
                return textResponse('No ticket types found.');
            }

            const lines: string[] = [`${types.length} ticket type(s) available:`, ''];

            for (const type of types) {
                lines.push(formatTicketType(type));
                if (type.rules) {
                    try {
                        const rules = JSON.parse(type.rules) as Record<string, unknown>;
                        const ruleKeys = Object.keys(rules);
                        if (ruleKeys.length > 0) {
                            lines.push(`  Rules: ${ruleKeys.join(', ')}`);
                        }
                    } catch {
                        // rules is not valid JSON — skip
                    }
                }
            }

            lines.push('');
            lines.push('Use type ID with envia_create_ticket to open a new ticket.');

            return textResponse(lines.join('\n'));
        },
    );
}
