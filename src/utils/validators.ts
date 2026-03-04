/**
 * Envia MCP Server — Input Validators
 *
 * Validate and normalise user-supplied arguments before they reach the API.
 * Each function returns `{ valid: true, value }` or `{ valid: false, error }`.
 */

// ---------------------------------------------------------------------------
// Generic result type
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
  | { valid: true; value: T; warning?: string }
  | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Country code
// ---------------------------------------------------------------------------

const SUPPORTED_COUNTRIES = new Set([
  "MX", "US", "CA", "CO", "CL", "PE", "BR", "AR", "EC", "CR",
  "PA", "GT", "SV", "HN", "NI", "DO", "UY", "PY", "BO", "VE",
  "ES", "DE", "FR", "GB", "IT", "NL", "PT", "CN", "JP", "KR",
  "IN", "AU",
]);

export function validateCountry(raw: string): ValidationResult<string> {
  const code = raw.trim().toUpperCase();
  if (code.length !== 2) {
    return { valid: false, error: `Country code must be exactly 2 letters (ISO 3166-1 alpha-2). Got "${raw}".` };
  }
  if (!SUPPORTED_COUNTRIES.has(code)) {
    return {
      valid: true,
      value: code,
      warning: `Country "${code}" is not in the known supported list. Envia may still support it — use envia_list_carriers to check.`,
    };
  }
  return { valid: true, value: code };
}

// ---------------------------------------------------------------------------
// Postal code
// ---------------------------------------------------------------------------

export function validatePostalCode(raw: string): ValidationResult<string> {
  const pc = raw.trim().replace(/\s+/g, "");
  if (pc.length < 3 || pc.length > 10) {
    return { valid: false, error: `Postal code looks invalid (length ${pc.length}). Expected 3–10 characters.` };
  }
  return { valid: true, value: pc };
}

// ---------------------------------------------------------------------------
// Positive number (weight, dimensions)
// ---------------------------------------------------------------------------

export function validatePositiveNumber(raw: unknown, fieldName: string): ValidationResult<number> {
  const n = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  if (isNaN(n) || n <= 0) {
    return { valid: false, error: `${fieldName} must be a positive number. Got "${raw}".` };
  }
  return { valid: true, value: n };
}

// ---------------------------------------------------------------------------
// Tracking number(s)
// ---------------------------------------------------------------------------

export function validateTrackingNumbers(raw: string | string[]): ValidationResult<string[]> {
  const list = Array.isArray(raw) ? raw : raw.split(",").map((s) => s.trim());
  const cleaned = list.filter((s) => s.length > 0);
  if (cleaned.length === 0) {
    return { valid: false, error: "At least one tracking number is required." };
  }
  return { valid: true, value: cleaned };
}

// ---------------------------------------------------------------------------
// Carrier slug
// ---------------------------------------------------------------------------

export function validateCarrier(raw: string): ValidationResult<string> {
  const slug = raw.trim().toLowerCase();
  if (slug.length === 0) {
    return { valid: false, error: "Carrier is required (e.g. \"dhl\", \"fedex\", \"estafeta\")." };
  }
  return { valid: true, value: slug };
}

// ---------------------------------------------------------------------------
// Date string (YYYY-MM-DD)
// ---------------------------------------------------------------------------

export function validateDate(raw: string): ValidationResult<string> {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
  if (!match) {
    return { valid: false, error: `Date must be in YYYY-MM-DD format. Got "${raw}".` };
  }
  return { valid: true, value: raw.trim() };
}

// ---------------------------------------------------------------------------
// Required string
// ---------------------------------------------------------------------------

export function requireString(raw: unknown, fieldName: string): ValidationResult<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { valid: false, error: `${fieldName} is required and must be a non-empty string.` };
  }
  return { valid: true, value: raw.trim() };
}
