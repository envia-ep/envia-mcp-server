/**
 * Config Types — Fase 6
 *
 * Response interfaces for company configuration endpoints:
 * users, shops, carrier config, notification settings,
 * API tokens, checkout rules, and webhooks.
 * All served by the Queries service.
 */

// ---------------------------------------------------------------------------
// Company Users — GET /company/users
// ---------------------------------------------------------------------------

/** A team member on the company account. */
export interface CompanyUser {
    id: number;
    email: string;
    phone: string;
    role_id: number;
    /** Human-readable role name e.g. "Super Admin". */
    role_description: string;
    /** 0=inactive, 1=active. */
    status: number;
    name: string;
    /** Invitation state: "accepted" | "revoked" | "pending". */
    invitation_status: string;
    invitation_status_translation_tag: string;
    expiration_date: string | null;
    is_new_user: boolean;
}

/** Response from GET /company/users. */
export interface CompanyUsersResponse {
    data: CompanyUser[];
}

// ---------------------------------------------------------------------------
// Company Shops — GET /company/shops
// ---------------------------------------------------------------------------

/** A connected e-commerce shop. */
export interface CompanyShop {
    id: number;
    company_id: number;
    ecommerce_id: number;
    user_id: number;
    ecart_shop_id: string;
    ecart_shop_group: string | null;
    name: string;
    url: string;
    store: string | null;
    auth: string;
    /** 1 = checkout widget enabled. */
    checkout: number;
    form_options: number;
    webhook: number;
    order_create: number;
    order_update: number;
    order_delete: number;
}

/** Response from GET /company/shops. */
export interface CompanyShopsResponse {
    data: CompanyShop[];
}

// ---------------------------------------------------------------------------
// Carrier Config — GET /carrier-company/config
// ---------------------------------------------------------------------------

/** A carrier service available to the company. */
export interface CarrierService {
    id: number;
    carrier_id: number;
    service: string;
    name: string;
    description: string;
    delivery_estimate: string;
    active: number;
    cash_on_delivery: number;
    international: number;
    blocked: number;
    blocked_admin: number;
}

/** A carrier and its configured services. */
export interface CarrierConfig {
    id: number;
    name: string;
    description: string;
    has_custom_key: number;
    logo: string;
    country_code: string;
    blocked: number;
    blocked_admin: number;
    services: CarrierService[];
}

/** Response from GET /carrier-company/config. */
export interface CarrierConfigResponse {
    data: CarrierConfig[];
}

// ---------------------------------------------------------------------------
// Notification Settings — GET /config/notification
// ---------------------------------------------------------------------------

/**
 * Notification channel settings for the company.
 * NOTE: API returns a RAW ARRAY — not wrapped in { data: [] }.
 */
export interface NotificationSettings {
    id: number;
    /** 0=disabled, 1=enabled. */
    sms: number;
    flash: number;
    email: number;
    email_generate: number;
    fulfillment: number;
    whatsapp: number;
    ecommerce_cod: number;
    shipment_cod: number;
    shipment_pod: number;
}

// API returns: NotificationSettings[] (raw array)

// ---------------------------------------------------------------------------
// API Tokens — GET /get-api-tokens
// ---------------------------------------------------------------------------

/** An API access token for a company user. */
export interface ApiToken {
    user_name: string;
    user_email: string;
    /** SENSITIVE — always truncate to first 8 chars in output. */
    access_token: string;
    description: string | null;
    /** 0=standard, 1=ecommerce. */
    ecommerce: number;
}

/** Response from GET /get-api-tokens. */
export interface ApiTokensResponse {
    data: ApiToken[];
}

// ---------------------------------------------------------------------------
// Checkout Rules — GET/POST/PUT/DELETE /checkout-rules
// ---------------------------------------------------------------------------

/** A carrier restriction within a checkout rule. */
export interface CheckoutRuleCarrier {
    carrier_id: number;
    name: string;
    logo: string;
    country_code: string;
}

/** A checkout discount/surcharge rule applied in the shipping widget. */
export interface CheckoutRule {
    id: number;
    shop_id: number;
    name: string | null;
    description: string | null;
    /** 0=domestic, 1=international. */
    international: number;
    /** "Money" | "Weight". */
    type: string;
    /** "MXN" for Money, "KG" for Weight. */
    measurement: string;
    selected_country_code: string | null;
    selected_state_code: string | null;
    selected_city_code: string | null;
    min: number | null;
    max: number | null;
    amount: number;
    /** "DISCOUNT". */
    amount_type: string;
    active: number;
    created_at: string;
    created_by: string;
    operation_id: number;
    /** "Flat Value". */
    operation_description: string;
    /** Only present when rule targets specific carriers. */
    carriers?: CheckoutRuleCarrier[];
}

/** Response from GET /checkout-rules. */
export interface CheckoutRulesResponse {
    data: CheckoutRule[];
}

/** Body for POST /checkout-rules. */
export interface CreateCheckoutRuleBody {
    shop_id: number;
    type: string;
    measurement: string;
    min?: number | null;
    max?: number | null;
    amount: number;
    amount_type: string;
    active: number;
    operation_id: number;
}

/** Body for PUT /checkout-rules/{id}. */
export interface UpdateCheckoutRuleBody {
    type?: string;
    measurement?: string;
    min?: number | null;
    max?: number | null;
    amount?: number;
    amount_type?: string;
    active?: number;
    operation_id?: number;
}

// ---------------------------------------------------------------------------
// Webhooks — GET/POST/PUT/DELETE /webhooks
// ---------------------------------------------------------------------------

/** A configured webhook endpoint. */
export interface Webhook {
    id: number;
    type: string;
    url: string;
    /** SENSITIVE — always truncate to first 8 chars in output. */
    auth_token: string;
    /** 0=inactive, 1=active. */
    active: number;
}

/** Response from GET /webhooks. */
export interface WebhooksResponse {
    data: Webhook[];
}

/** Body for POST /webhooks — only url is accepted; server generates auth_token. */
export interface CreateWebhookBody {
    url: string;
}

/** Body for PUT /webhooks/{id}. */
export interface UpdateWebhookBody {
    url?: string;
    active?: number;
}

/** Generic boolean result response. */
export interface BooleanResultResponse {
    data: boolean;
}
