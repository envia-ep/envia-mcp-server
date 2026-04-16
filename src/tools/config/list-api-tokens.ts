/**
 * Tool: envia_list_api_tokens
 *
 * Lists active API tokens for the company.
 * Tokens are truncated for security — only first 8 chars shown.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatApiTokens } from '../../services/config.js';
import type { ApiTokensResponse } from '../../types/config.js';

/**
 * Register the envia_list_api_tokens tool on the MCP server.
 */
export function registerListApiTokens(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_api_tokens',
        {
            description:
                'List active API tokens for the company. ' +
                'Shows the user associated with each token and its type (standard or ecommerce). ' +
                'Tokens are truncated for security — manage full tokens in the Envia dashboard.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                limit: z.number().int().min(1).max(100).optional().describe('Max tokens to return'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {};
            if (args.limit !== undefined) params.limit = args.limit;

            const res = await queryConfigApi<ApiTokensResponse>(
                activeClient, config, '/get-api-tokens', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list API tokens: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatApiTokens(res.data as ApiTokensResponse));
        },
    );
}
