/**
 * Tool: envia_generate_packing_slip
 *
 * Generates a packing slip PDF for one or more orders.
 * The PDF is generated server-side; since MCP tools can only return text,
 * this tool confirms successful generation but cannot deliver the binary PDF.
 * Use this to trigger generation — download from the Envia dashboard.
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
 * Register the envia_generate_packing_slip tool on the MCP server.
 */
export function registerGeneratePackingSlip(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_generate_packing_slip',
        {
            description:
                'Generate a packing slip PDF for one or more ecommerce orders. ' +
                'The packing slip includes order details, package information, and tracking numbers. ' +
                'Note: the PDF cannot be delivered directly through MCP (text-only protocol). ' +
                'This tool confirms whether generation succeeded. Download the result from the Envia dashboard.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                order_ids: z.array(z.number().int().min(1)).min(1)
                    .describe('Order IDs to include in the packing slip'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // The endpoint returns raw PDF binary — we use low-level request() so
            // we can check the Content-Type header rather than parsing JSON.
            const url = buildQueryUrl(config.queriesBase, '/orders/packing-slip', {});
            const res = await activeClient.request({
                url,
                method: 'POST',
                body: { order_ids: args.order_ids },
            });

            // A successful PDF response has status 200 and the data object will be
            // largely empty (fetch json() catches fail gracefully). Treat any ok
            // response as success regardless of body shape.
            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to generate packing slip: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                `Packing slip generated successfully for ${args.order_ids.length} order(s).\n` +
                `  Order IDs: ${args.order_ids.join(', ')}\n\n` +
                `Note: The PDF was generated but cannot be delivered through MCP (text-only protocol).\n` +
                `Download the packing slip from the Envia dashboard.`,
            );
        },
    );
}
