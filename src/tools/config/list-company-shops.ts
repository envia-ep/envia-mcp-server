/**
 * Tool: envia_list_company_shops
 *
 * Lists all connected e-commerce shops for the company.
 * NOTE: This endpoint does NOT accept query params — they cause 400.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatCompanyShops } from '../../services/config.js';
import type { CompanyShopsResponse } from '../../types/config.js';

/**
 * Register the envia_list_company_shops tool on the MCP server.
 */
export function registerListCompanyShops(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_company_shops',
        {
            description:
                'List all connected e-commerce shops for the company. ' +
                'Shows shop name, URL, and enabled features (checkout widget, webhooks, order sync). ' +
                'Use shop IDs with envia_create_checkout_rule.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            // NO query params — limit causes 400 on this endpoint
            const res = await queryConfigApi<CompanyShopsResponse>(
                activeClient, config, '/company/shops',
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list company shops: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatCompanyShops(res.data as CompanyShopsResponse));
        },
    );
}
