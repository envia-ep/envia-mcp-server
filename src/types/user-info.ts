/**
 * Envia MCP Server — User Information Types
 *
 * The `GET /user-information` endpoint in queries returns a single JWT whose
 * payload contains the complete user + company context: identity, role,
 * company details, assigned salesman, balance, credit line, verification
 * status, and integration flags.
 *
 * These types describe the decoded payload. Three portal-agent tools consume
 * subsets of this data:
 *   - `envia_get_company_info`  — company-level fields
 *   - `envia_get_my_salesman`   — salesman contact
 *   - `envia_get_balance_info`  — balance + credit + payment settings
 */

/**
 * Decoded JWT payload from `GET /user-information`.
 *
 * Field names mirror the backend JWT exactly to avoid accidental remapping.
 * All fields are optional because the backend may omit them depending on
 * verification state, plan, or role.
 */
export interface UserInfoPayload {
    // Identity
    user_id?: number;
    user_email?: string;
    user_name?: string;
    user_phone?: string;
    user_status?: number;
    user_language?: string;
    user_role_id?: number;
    user_role?: string;
    user_country?: string;

    // Company
    company_id?: number;
    company_name?: string;
    company_logo?: string | null;
    company_balance?: string | number;
    company_currency?: string;
    currency_symbol?: string;
    company_locale_code?: string;
    company_status?: number;
    company_created_at?: string;
    company_tier?: string | number;

    // Verification
    verification_status?: number;
    verification_status_name?: string;
    verification_type?: string;
    verification_retry?: number;
    ticket_verification?: number | null;
    has_accepted_terms?: number;

    // Credit line
    credit_line_days?: number;
    credit_line_limit?: number | null;
    ticket_credit?: number | null;
    credit?: number | null;

    // Payment settings
    auto_billing?: number;
    auto_payment?: number;
    has_autopayment_active_rule?: boolean;
    ecartpay_email?: string | null;

    // Salesman (Envia account manager)
    salesman_name?: string | null;
    salesman_email?: string | null;
    salesman_phone?: string | null;

    // Company owner
    owner_id?: number;
    owner_name?: string | null;
    owner_email?: string | null;

    // Business flags
    international?: number;
    has_shops?: number;
    has_shopify?: number;
    has_woocommerce?: number;
    has_pobox_packages?: number;
    has_consolidated_shipments?: number;
    onboarding_multicompany?: boolean;

    // Referral
    referral_code?: string | null;

    // Allow unknown fields without losing type safety for known ones
    [key: string]: unknown;
}

/** Raw response shape returned by `GET /user-information`. */
export interface UserInfoResponse {
    token: string;
}
