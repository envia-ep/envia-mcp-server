/**
 * Tool: envia_generate_picking_list
 *
 * Generates a picking list PDF for one or more orders.
 * The picking list includes columns for Qty, Description, SKU, Total Weight,
 * and a Picked checkbox — used by warehouse staff to prepare shipments.
 * Since MCP tools can only return text, this confirms generation success only.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { buildQueryUrl } from '../../services/shipments.js';

/**
 * Register the envia_generate_picking_list tool on the MCP server.
 */
export function registerGeneratePickingList(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_generate_picking_list',
        {
            description:
                'Generate a picking list PDF for one or more ecommerce orders. ' +
                'The picking list is used by warehouse staff to locate and pick items, ' +
                'with columns for Qty, Description, SKU, Total Weight, and a Picked checkbox. ' +
                'Note: the PDF cannot be delivered directly through MCP (text-only protocol). ' +
                'This tool confirms whether generation succeeded. Download from the Envia dashboard.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                order_ids: z.array(z.number().int().min(1)).min(1)
                    .describe('Order IDs to include in the picking list'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // The endpoint returns raw PDF binary — use low-level request() to handle
            // the binary response gracefully (json() parse will silently fail/empty).
            const url = buildQueryUrl(config.queriesBase, '/orders/picking-list', {});
            const res = await activeClient.request({
                url,
                method: 'POST',
                body: { order_ids: args.order_ids },
            });

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to generate picking list: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Picking list generated successfully for ${args.order_ids.length} order(s).\n` +
                `  Order IDs: ${args.order_ids.join(', ')}\n\n` +
                `Note: The PDF was generated but cannot be delivered through MCP (text-only protocol).\n` +
                `Download the picking list from the Envia dashboard.`,
            );
        },
    );
}
