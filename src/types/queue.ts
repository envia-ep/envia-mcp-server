/**
 * Envia MCP Server — Queue / TMS type definitions
 *
 * The TMS queue service (`queue-private.envia.com`) uses its own JWT issuance
 * separate from the Envia portal JWT. Direct TMS integration is deferred to
 * Sprint 3. `envia_check_balance` is implemented using user-information balance
 * data instead (READ_SAFE, zero financial side effects).
 *
 * See `_docs/SPRINT_2_BLOCKERS.md` for full auth-verification findings.
 */

/** Result returned by the check-balance tool. */
export interface BalanceCheckResult {
    /** True when the query succeeded (user-info fetch worked). */
    ok: boolean;
    /** Current account balance (numeric string from user-info JWT). */
    balance?: number;
    /** Currency symbol from account (e.g. "$"). */
    currencySymbol?: string;
    /** Currency code from account (e.g. "MXN"). */
    currency?: string;
    /** Whether the account has at least `requestedAmount`. */
    hasSufficientBalance?: boolean;
    /** The amount the caller asked to verify (passed through for display). */
    requestedAmount?: number;
    /** Human-readable error when ok is false. */
    error?: string;
}
