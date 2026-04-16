/**
 * Tool: envia_get_my_salesman
 *
 * Returns the contact details of the Envia salesman (account manager)
 * assigned to the caller's company. Useful when the user asks things like
 * "¿quién es mi salesman?" or needs to escalate support requests.
 *
 * Data source: `GET /user-information` JWT payload — the backend already
 * resolves the primary agent (companyUtils.getPrimaryAgentInfo) and ships
 * the result alongside user context.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { fetchUserInfo } from '../../services/user-info.js';
import type { UserInfoPayload } from '../../types/user-info.js';

/**
 * Format the assigned salesman as a short card. If no salesman is assigned,
 * returns a clear "unassigned" message so the agent can suggest alternatives
 * (e.g. generic support channels) instead of fabricating data.
 */
function formatSalesman(payload: UserInfoPayload): string {
    const name = payload.salesman_name;
    const email = payload.salesman_email;
    const phone = payload.salesman_phone;

    if (!name && !email && !phone) {
        return 'No salesman is currently assigned to your company.\n\n'
            + 'Tip: for general support, open a ticket with envia_create_ticket '
            + 'or contact support at soporte@envia.com.';
    }

    const lines: string[] = ['Your assigned Envia salesman:', ''];
    lines.push(`  Name:   ${name ?? '—'}`);
    lines.push(`  Email:  ${email ?? '—'}`);
    lines.push(`  Phone:  ${phone ?? '—'}`);
    return lines.join('\n');
}

/** Register the envia_get_my_salesman tool on the MCP server. */
export function registerGetMySalesman(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_my_salesman',
        {
            description:
                'Get the contact details (name, email, phone) of the Envia salesman / account '
                + 'manager assigned to the caller\'s company. Returns a clear "unassigned" message '
                + 'when no salesman is linked, so the agent can suggest opening a ticket instead.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const result = await fetchUserInfo(activeClient, config);

            if (!result.ok || !result.payload) {
                const mapped = mapCarrierError(result.status, result.error ?? '');
                return textResponse(
                    `Failed to fetch salesman information: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(formatSalesman(result.payload));
        },
    );
}

// Export the formatter for isolated testing.
export { formatSalesman };
