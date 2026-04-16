/**
 * Tool: envia_get_company_info
 *
 * Returns a concise snapshot of the caller's company: identity, currency,
 * verification status, credit line summary, and onboarding/integration
 * flags. Mirrors the information a user sees on the "Mi Compañia" page of
 * the Envia portal.
 *
 * Data source: `GET /user-information` (queries service). Decoded from the
 * returned JWT payload — see `services/user-info.ts` for the helper.
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
 * Format the company-info block for chat display. Keeps the output compact
 * (≤10 lines) so it fits naturally in a conversation without bloating the
 * LLM context.
 */
function formatCompanyInfo(payload: UserInfoPayload): string {
    const lines: string[] = ['Company information:', ''];

    lines.push(`  Company:        ${payload.company_name ?? '—'} (ID ${payload.company_id ?? '—'})`);
    lines.push(`  Country:        ${payload.user_country ?? payload.company_locale_code ?? '—'}`);
    lines.push(`  Currency:       ${payload.company_currency ?? '—'}`);
    lines.push(`  Tier:           ${payload.company_tier ?? '—'}`);
    lines.push(`  International:  ${payload.international === 1 ? 'enabled' : 'disabled'}`);
    lines.push(`  Verification:   ${payload.verification_status_name ?? 'pending'} (${payload.verification_type ?? '—'})`);
    lines.push(`  Created:        ${payload.company_created_at ?? '—'}`);

    if (payload.owner_name) {
        lines.push(`  Owner:          ${payload.owner_name} (${payload.owner_email ?? '—'})`);
    }

    const integrationFlags: string[] = [];
    if (payload.has_shopify === 1) integrationFlags.push('Shopify');
    if (payload.has_woocommerce === 1) integrationFlags.push('WooCommerce');
    if (payload.has_shops === 1 && integrationFlags.length === 0) integrationFlags.push('custom shops');
    if (integrationFlags.length) {
        lines.push(`  Integrations:   ${integrationFlags.join(', ')}`);
    }

    return lines.join('\n');
}

/** Register the envia_get_company_info tool on the MCP server. */
export function registerGetCompanyInfo(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_company_info',
        {
            description:
                'Get the caller company profile: name, country, currency, tier, international status, '
                + 'verification state (KYB), creation date, owner, and connected integrations '
                + '(Shopify, WooCommerce, etc.). Equivalent to the "Mi Compañia" page in the portal.',
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
                    `Failed to fetch company information: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(formatCompanyInfo(result.payload));
        },
    );
}

// Export the formatter for isolated testing.
export { formatCompanyInfo };
