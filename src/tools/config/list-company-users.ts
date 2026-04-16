/**
 * Tool: envia_list_company_users
 *
 * Lists all team members on the company account with role and invitation status.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryConfigApi, formatCompanyUsers } from '../../services/config.js';
import type { CompanyUsersResponse } from '../../types/config.js';

/**
 * Register the envia_list_company_users tool on the MCP server.
 */
export function registerListCompanyUsers(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_list_company_users',
        {
            description:
                'List all team members on the company account. ' +
                'Shows name, email, role, active status, and invitation status for each user.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await queryConfigApi<CompanyUsersResponse>(
                activeClient, config, '/company/users',
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Failed to list company users: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            return textResponse(formatCompanyUsers(res.data as CompanyUsersResponse));
        },
    );
}
