/**
 * Tool: envia_get_additional_service_prices
 *
 * Returns the pricing catalog for all additional services available on a
 * specific carrier service (identified by service_id). Includes standard
 * amounts and any company-level custom pricing that overrides defaults.
 *
 * Data source: GET /additional-services/prices/{service_id} (queries service).
 * Verified 2026-04-27 via company.controller.js:2173-2212.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { requiredApiKeySchema } from '../utils/schemas.js';
import { textResponse } from '../utils/mcp-response.js';
import { mapCarrierError } from '../utils/error-mapper.js';

/** A single row returned by /additional-services/prices/{service_id}. */
interface AdditionalServicePriceRow {
    service_id: number;
    id: number;
    name: string;
    description: string;
    currency: string;
    currency_symbol: string;
    apply_to: string;
    custom_id: number | null;
    amount: number | string;
    minimum_amount: number | string | null;
    operation_id: number;
    is_custom: boolean;
    operator: string;
}

/**
 * Format a price row into a compact readable line.
 *
 * @param row - A single service price entry
 * @returns Formatted summary string
 */
function formatPriceRow(row: AdditionalServicePriceRow): string {
    const amountStr = row.amount != null ? `${row.currency_symbol}${row.amount}` : '—';
    const minStr = row.minimum_amount != null ? ` (min ${row.currency_symbol}${row.minimum_amount})` : '';
    const customBadge = row.is_custom ? ' [custom]' : '';
    return `  • ${row.name}${customBadge}: ${amountStr}${minStr} ${row.operator} — ${row.description}`;
}

/**
 * Register the envia_get_additional_service_prices tool on the MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerGetAdditionalServicePrices(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_additional_service_prices',
        {
            description:
                'Get the pricing for all optional add-on services available on a specific carrier service. ' +
                'Returns standard prices and any company-level custom overrides. ' +
                'Use envia_list_carriers to find service IDs, or use the service_id from a quote response. ' +
                'Useful for showing the cost of insurance, COD, or signature services before creating a shipment.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                service_id: z.number().int().min(1).describe(
                    'Carrier service ID (numeric). Available from envia_list_carriers or a quote response.',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const url = `${config.queriesBase}/additional-services/prices/${args.service_id}`;
            const res = await activeClient.get<AdditionalServicePriceRow[]>(url);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            const rows = Array.isArray(res.data) ? res.data : [];
            if (rows.length === 0) {
                return textResponse(
                    `No additional service prices found for service_id ${args.service_id}. ` +
                    'The service may not be active or may not have configurable add-ons.',
                );
            }

            const currency = rows[0]?.currency ?? '';
            const lines: string[] = [
                `Additional service prices for service_id ${args.service_id} (${currency}):`,
                '',
            ];
            for (const row of rows) {
                lines.push(formatPriceRow(row));
            }
            lines.push('');
            lines.push('Pass service names via additional_services in quote_shipment or create_shipment.');

            return textResponse(lines.join('\n'));
        },
    );
}
