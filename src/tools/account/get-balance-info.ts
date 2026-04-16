/**
 * Tool: envia_get_balance_info
 *
 * Returns the caller's current account balance plus credit-line summary and
 * auto-payment settings. Covers the most frequent account questions users
 * ask ("¿cuánto saldo tengo?", "¿tengo línea de crédito?").
 *
 * Data source: `GET /user-information` JWT payload.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { fetchUserInfo, formatBalance } from '../../services/user-info.js';
import type { UserInfoPayload } from '../../types/user-info.js';

/**
 * Format balance + credit line + auto-payment flags. Keeps the output
 * compact and readable in a chat: only shows credit fields when a credit
 * line is actually configured, avoiding noisy "—" rows.
 */
function formatBalanceInfo(payload: UserInfoPayload): string {
    const balance = formatBalance(payload.company_balance, payload.currency_symbol);
    const currency = payload.company_currency ?? '—';

    const lines: string[] = ['Account balance and payment settings:', ''];
    lines.push(`  Balance:         ${balance} ${currency}`);

    const hasCreditLine = payload.credit_line_limit !== null && payload.credit_line_limit !== undefined;
    if (hasCreditLine) {
        const limit = formatBalance(payload.credit_line_limit ?? 0, payload.currency_symbol);
        lines.push(`  Credit line:     ${limit} ${currency} (${payload.credit_line_days ?? 0} days)`);
    } else {
        lines.push('  Credit line:     not configured');
    }

    lines.push(`  Auto-billing:    ${payload.auto_billing === 1 ? 'enabled' : 'disabled'}`);
    lines.push(`  Auto-payment:    ${payload.auto_payment === 1 ? 'enabled' : 'disabled'}`);

    if (payload.ecartpay_email) {
        lines.push(`  EcartPay email:  ${payload.ecartpay_email}`);
    }

    return lines.join('\n');
}

/** Register the envia_get_balance_info tool on the MCP server. */
export function registerGetBalanceInfo(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_balance_info',
        {
            description:
                'Get the caller company account balance, currency, credit line (if configured), and '
                + 'auto-billing/auto-payment settings. Use this when the user asks about their '
                + 'current balance, credit limit, or payment configuration.',
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
                    `Failed to fetch balance information: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(formatBalanceInfo(result.payload));
        },
    );
}

// Export the formatter for isolated testing.
export { formatBalanceInfo };
