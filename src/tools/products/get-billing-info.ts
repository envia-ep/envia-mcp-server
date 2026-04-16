/**
 * Tool: envia_get_billing_info
 *
 * Retrieves the company billing information (legal name, RFC/tax ID,
 * address, email, phone) used for invoicing.
 *
 * NOTE: The API response includes a billing_data field that is JSON-stringified.
 * This tool uses only the top-level fields and never parses billing_data.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryBillingInfo, formatBillingInfo } from '../../services/products.js';
import type { BillingInformation } from '../../types/products.js';

/**
 * Register the envia_get_billing_info tool on the MCP server.
 */
export function registerGetBillingInfo(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_billing_info',
        {
            description:
                'Get the company billing information: legal name, RFC/tax ID, ' +
                'billing address, email, and phone. Used for invoice generation.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryBillingInfo(activeClient, config);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to get billing information: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatBillingInfo(res.data as BillingInformation));
        },
    );
}
