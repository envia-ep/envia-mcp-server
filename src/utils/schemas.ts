/**
 * Shared Zod schemas for tool parameters.
 *
 * These enforce input validation at the schema level before any
 * tool handler code runs.
 */

import { z } from "zod";

/** ISO 3166-1 alpha-2 country code — exactly 2 letters. */
export const countrySchema = z
    .string()
    .regex(/^[A-Za-z]{2}$/, "Country must be exactly 2 letters (ISO 3166-1 alpha-2, e.g. MX, US, CO)");

/** Carrier slug — lowercase alphanumeric + hyphens only, max 30 chars. */
export const carrierSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,30}$/, "Carrier code must be 1-30 alphanumeric characters (e.g. 'dhl', 'fedex')");

/** Date in YYYY-MM-DD format. */
export const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** Postal code — 3-10 alphanumeric chars (no slashes, dots, etc.). */
export const postalCodeSchema = z
    .string()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, "Postal code must be 3-10 alphanumeric characters");

/**
 * Account-sensitive API key parameter — used by tools that perform
 * account-level operations (rates, labels, pickups, cancellations, etc.).
 *
 * Optional: when omitted the server-level ENVIA_API_KEY is used. Provide a
 * user-specific key to scope the request to a different account (multi-tenant
 * usage). If provided the value must be non-empty after trimming.
 */
export const requiredApiKeySchema = z
    .string()
    .trim()
    .min(1, 'API key must not be empty when provided')
    .optional()
    .describe(
        'Optional Envia API key. When provided, overrides the server-level ENVIA_API_KEY ' +
        'for this request (multi-tenant / per-user usage). ' +
        'When omitted, the server default key is used. ' +
        'Works with session token or API key. ' +
        'Get yours at https://shipping.envia.com/settings/developers',
    );

/**
 * Optional API key parameter — used by tools that can work with
 * the server default but accept an override (tracking, validation, HS codes).
 */
export const optionalApiKeySchema = z
    .string()
    .trim()
    .min(1, 'API key must not be empty when provided')
    .optional()
    .describe(
        'Optional Envia API key to override the server default. ' +
        'Works with session token or API key.',
    );
