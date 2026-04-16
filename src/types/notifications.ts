/**
 * Notifications Types — Fase 9
 *
 * Response interfaces for the notifications API endpoints
 * served by the Queries service (/notifications/*, /company/notifications, /company-notifications).
 */

// ---------------------------------------------------------------------------
// Notification Prices — GET /notifications/prices
// ---------------------------------------------------------------------------

/**
 * Pricing for a single notification channel.
 * NOTE: The API returns a raw array of these — not wrapped in { data: [] }.
 */
export interface NotificationPrice {
    type: string;
    price: number;
    currency: string;
}

// ---------------------------------------------------------------------------
// Company Notifications — GET /company/notifications
// ---------------------------------------------------------------------------

/** A single notification entry in the company feed. */
export interface CompanyNotification {
    id: number;
    title: string;
    content: string;
    redirect_url: string;
    status: Record<string, unknown>;
    category: string;
    active: number;
    is_valid_html: boolean;
    created_at: string;
    rating: unknown | null;
    type: string;
    ticketInformation: unknown | null;
    comment: string | null;
    created_by: string | null;
    utc_created_at: string | null;
}

/** A grouped category bucket in the company notifications feed. */
export interface NotificationCategory {
    notifications: CompanyNotification[];
    unreadCounter: number;
}

/** Response from GET /company/notifications. */
export interface CompanyNotificationsResponse {
    data: Record<string, NotificationCategory>;
    unreadCounter: number;
}

// ---------------------------------------------------------------------------
// Notification Config — GET /company-notifications
// ---------------------------------------------------------------------------

/**
 * A raw notification config entry.
 * The `body` field is a JSON-stringified object — always parse with JSON.parse().
 */
export interface NotificationConfigEntry {
    id: number;
    type: string;
    /** JSON-stringified payload — must be parsed before use. */
    body: string;
    html: string | null;
    redirect_url: string;
    active: number;
    created_at: string;
}

/** Response from GET /company-notifications. */
export interface NotificationConfigResponse {
    data: Record<string, NotificationConfigEntry[]>;
    notificationCount: number;
}
