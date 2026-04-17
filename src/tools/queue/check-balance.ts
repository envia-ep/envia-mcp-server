/**
 * Tool: envia_check_balance
 *
 * Answers "¿tengo saldo suficiente para enviar?" by comparing the caller's
 * current account balance against a requested amount.
 *
 * Implementation note: this tool reads balance from the user-information JWT
 * (via `fetchUserInfo`) rather than calling the TMS queue service directly.
 * The TMS `POST /check` endpoint uses its own token system and creates a
 * pending charge (balance hold) as a side effect — neither property is safe
 * for a conversational READ_SAFE tool. See `_docs/SPRINT_2_BLOCKERS.md`.
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
import type { UserInfoResult } from '../../services/user-info.js';
import type { BalanceCheckResult } from '../../types/queue.js';

/**
 * Parse a balance string from the user-info JWT into a finite number.
 *
 * The backend returns balance as a decimal string (e.g. "9920988.48").
 * Returns NaN when the string cannot be parsed.
 *
 * @param value - Raw balance string or number from user-info payload.
 */
function parseBalance(value: string | number | undefined): number {
    if (value === undefined || value === null) return NaN;
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * Format the balance-check result as a human-readable text block.
 *
 * @param balance - Current account balance.
 * @param requested - Amount the user asked to verify.
 * @param currencySymbol - Currency symbol (e.g. "$").
 * @param currency - Currency code (e.g. "MXN").
 */
function formatCheckResult(
    balance: number,
    requested: number,
    currencySymbol: string,
    currency: string,
): string {
    const sufficient = balance >= requested;
    const balanceStr = formatBalance(balance, currencySymbol);
    const requestedStr = formatBalance(requested, currencySymbol);
    const lines: string[] = ['Balance check:', ''];
    lines.push(`  Current balance:   ${balanceStr} ${currency}`);
    lines.push(`  Requested amount:  ${requestedStr} ${currency}`);
    lines.push('');
    if (sufficient) {
        const remaining = balance - requested;
        lines.push(`  Result: ✓ Sufficient — ${formatBalance(remaining, currencySymbol)} ${currency} will remain after the shipment.`);
    } else {
        const shortfall = requested - balance;
        lines.push(`  Result: ✗ Insufficient — you need ${formatBalance(shortfall, currencySymbol)} ${currency} more to proceed.`);
        lines.push('  Tip: Add funds at https://shipping.envia.com/billing before creating the shipment.');
    }
    return lines.join('\n');
}

/**
 * Resolve balance check data from a fetchUserInfo result.
 *
 * Extracts and validates the numeric balance from the user-info payload,
 * returning a typed `BalanceCheckResult` that the handler can act on.
 *
 * @param userInfoResult - Result from fetchUserInfo.
 * @param requestedAmount - Amount the caller wants to verify.
 */
function resolveBalanceCheck(
    userInfoResult: UserInfoResult,
    requestedAmount: number,
): BalanceCheckResult {
    if (!userInfoResult.ok || !userInfoResult.payload) {
        return { ok: false, error: userInfoResult.error ?? 'user-info fetch failed' };
    }

    const balance = parseBalance(userInfoResult.payload.company_balance);
    if (!Number.isFinite(balance)) {
        return { ok: false, error: 'balance field is not a valid number' };
    }

    return {
        ok: true,
        balance,
        currencySymbol: userInfoResult.payload.currency_symbol ?? '$',
        currency: userInfoResult.payload.company_currency ?? '',
        hasSufficientBalance: balance >= requestedAmount,
        requestedAmount,
    };
}

/** Register the envia_check_balance tool on the MCP server. */
export function registerCheckBalance(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_check_balance',
        {
            description:
                'Check whether the account has enough balance to cover a shipment cost. '
                + 'Use when the user asks "¿tengo saldo suficiente para enviar?" or '
                + '"do I have enough balance for a shipment that costs X?". '
                + 'Reads balance from the account — no charges are created.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                amount: z
                    .number()
                    .positive()
                    .describe('The shipment cost to verify against the current balance (in account currency).'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const userInfoResult = await fetchUserInfo(activeClient, config);
            const check = resolveBalanceCheck(userInfoResult, args.amount);

            if (!check.ok) {
                if (check.error === 'balance field is not a valid number') {
                    return textResponse(
                        'Unable to determine account balance — the balance field returned by the API was not a valid number. '
                        + 'Please try again or contact support.',
                    );
                }
                const mapped = mapCarrierError(userInfoResult.status, check.error ?? '');
                return textResponse(
                    `Failed to fetch account balance: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(
                formatCheckResult(check.balance!, args.amount, check.currencySymbol!, check.currency!),
            );
        },
    );
}

// Export helpers for isolated unit testing.
export { parseBalance, formatCheckResult };
