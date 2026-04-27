/**
 * Envia MCP Server — Country-Specific Rules
 *
 * Central service for per-country address transformations, phone formatting,
 * document type detection, and shipping metadata. Every tool that handles
 * addresses must consult these rules before sending data to the backend.
 *
 * Countries covered: MX, BR, CO, AR, CL, PE, US, ES, FR, IT, IN, GT, HN, SV, EC, PA
 */

/** EU member states (ISO 3166-1 alpha-2). */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/**
 * Overseas or exceptional territories that may have distinct customs rules.
 *
 * Aligned 2026-04-27 with the source-of-truth list in geocodes
 * (`services/geocodes/controllers/web.js:1762-1776`). Drift removed:
 * - `ES-35`, `ES-38` were ad-hoc HASC variants not present in geocodes
 *   (Canarias is uniquely identified there by `ES-CN/TF/GC` + the
 *   Canary Islands country override `IC` for postal-code-based detection).
 * - `FR-MC` was incorrect — Monaco is its own country (ISO `MC`), not
 *   a French territory. Geocodes never listed it.
 *
 * Drift added (previously missing):
 * - `ES-CE` (Ceuta), `ES-ML` (Melilla) — listed in geocodes excStates
 *   alongside the other Spanish territories outside the EU customs zone.
 */
export const EXCEPTIONAL_TERRITORIES: ReadonlySet<string> = new Set([
    'FR-GF', 'FR-GP', 'FR-MQ', 'FR-YT', 'FR-RE',
    'PT-20', 'PT-30',
    'ES-CN', 'ES-TF', 'ES-GC',
    'ES-CE', 'ES-ML',
    'NL-SX',
]);

/** Countries where the exterior/interior number is a separate field. */
export const COUNTRIES_WITH_SEPARATE_NUMBER: ReadonlySet<string> = new Set(['MX', 'BR']);

/** Countries where domestic shipments are processed through the international pipeline. */
export const DOMESTIC_AS_INTERNATIONAL: ReadonlySet<string> = new Set(['BR', 'IN']);

/** Countries that always require identification documents, with the legs that need them. */
export const IDENTIFICATION_REQUIRED_ALWAYS: ReadonlyMap<string, readonly string[]> = new Map([
    ['BR', ['origin', 'destination']],
    ['CO', ['origin', 'destination']],
]);

/** Default declared values by country (in local currency). */
export const DEFAULT_DECLARED_VALUES: ReadonlyMap<string, number> = new Map([
    ['MX', 3000],
]);

/** Aggregated shipping metadata for a single country. */
export interface CountryShippingMeta {
    requiresSeparateNumber: boolean;
    treatedAsInternationalDomestic: boolean;
    defaultDeclaredValue: number | undefined;
    identificationRequiredFor: readonly string[];
}

/**
 * Normalise a postal code according to country-specific formatting rules.
 *
 * - BR: inserts dash at position 5 for 8+ digit CEPs without one.
 * - AR: strips the leading letter prefix (e.g. C1425 -> 1425).
 * - US: formats ZIP+4 (9 digits) or truncates to 5 digits.
 * - Others: returned as-is after trimming.
 */
export function transformPostalCode(country: string, postalCode: string): string {
    const cc = country.toUpperCase();
    const trimmed = postalCode.trim();

    switch (cc) {
        case 'BR': {
            if (trimmed.length >= 8 && !trimmed.includes('-')) {
                return `${trimmed.slice(0, 5)}-${trimmed.slice(5)}`;
            }
            return trimmed;
        }
        case 'AR': {
            if (trimmed.length > 4) {
                return trimmed.slice(1);
            }
            return trimmed;
        }
        case 'US': {
            const digits = trimmed.replace(/\D/g, '');
            if (digits.length === 9) {
                return `${digits.slice(0, 5)}-${digits.slice(5)}`;
            }
            if (digits.length > 5 && digits.length !== 9) {
                return digits.slice(0, 5);
            }
            return digits || trimmed;
        }
        default:
            return trimmed;
    }
}

/**
 * Normalise a phone number according to country-specific formatting rules.
 *
 * - FR: ensures the +33 international prefix and removes the leading 0.
 * - Others: strips everything except digits and a leading +.
 */
export function transformPhone(country: string, phone: string): string {
    const cc = country.toUpperCase();
    const cleaned = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

    if (cc === 'FR') {
        let digits = cleaned.replace(/\+/g, '');

        if (digits.startsWith('33') && digits.length > 9) {
            digits = digits.slice(2);
        }

        if (digits.startsWith('0')) {
            digits = digits.slice(1);
        }

        return `+33${digits}`;
    }

    return cleaned;
}

/**
 * Detect whether a Brazilian identification string is a CPF or CNPJ.
 *
 * CPF has 11 digits; CNPJ has 14 digits. Formatting characters are stripped
 * before counting.
 */
export function detectBrazilianDocumentType(id: string): 'CPF' | 'CNPJ' | 'unknown' {
    const digits = id.replace(/\D/g, '');

    if (digits.length === 11) return 'CPF';
    if (digits.length === 14) return 'CNPJ';
    return 'unknown';
}

/**
 * Detect whether a Spanish identification string is a DNI, NIE, or NIF.
 *
 * - DNI: 8 digits + 1 letter (e.g. 12345678A).
 * - NIE: X/Y/Z + 7 digits + 1 letter (e.g. X1234567L).
 * - NIF: letter A-W + 7-8 digits + optional alphanumeric (e.g. A12345678).
 */
export function detectSpanishDocumentType(id: string): 'DNI' | 'NIE' | 'NIF' | 'unknown' {
    const clean = id.trim().toUpperCase();

    if (/^\d{8}[A-Z]$/.test(clean)) return 'DNI';
    if (/^[XYZ]\d{7}[A-Z]$/.test(clean)) return 'NIE';
    if (/^[A-W]\d{7,8}[A-Z0-9]?$/.test(clean)) return 'NIF';
    return 'unknown';
}

/**
 * Normalise a Mexican state code from legacy DB variants to their ISO/INEGI codes.
 *
 * Mirrors `Util::setStateCodeMx` from
 * `services/geocodes/libraries/util.js` (verified 2026-04-27 against
 * both `libraries/util.js:252-289` and `controllers/web.js:251-285` — the
 * two source copies are identical). Applied before sending `state_code` to
 * any geocodes or carriers endpoint that consumes it.
 *
 * Pass-through: any code not listed (e.g. `NL`, `JAL`, `OAX`) is returned
 * unchanged — those are already canonical.
 *
 * @param stateCode Raw MX state code from user input or DB.
 * @returns Normalised ISO state code.
 */
export function applyMxStateRemap(stateCode: string): string {
    switch (stateCode.trim().toUpperCase()) {
        case 'BN': return 'BC';   // Baja California (legacy INEGI)
        case 'CP': return 'CS';   // Chiapas
        case 'DF': return 'CX';   // Ciudad de México (pre-2016 name)
        case 'CA': return 'CO';   // Colima
        case 'DU': return 'DG';   // Durango
        case 'GJ': return 'GT';   // Guanajuato
        case 'HI': return 'HG';   // Hidalgo
        case 'MX': return 'EM';   // Estado de México
        case 'MC': return 'MI';   // Michoacán
        case 'MR': return 'MO';   // Morelos
        case 'QE': return 'QT';   // Querétaro
        default:   return stateCode;
    }
}

/**
 * Retrieve aggregated shipping metadata for a country.
 *
 * Consults the module-level constants and returns a single object with all
 * relevant flags and defaults for the given ISO country code.
 */
export function getCountryMeta(country: string): CountryShippingMeta {
    const cc = country.toUpperCase();

    return {
        requiresSeparateNumber: COUNTRIES_WITH_SEPARATE_NUMBER.has(cc),
        treatedAsInternationalDomestic: DOMESTIC_AS_INTERNATIONAL.has(cc),
        defaultDeclaredValue: DEFAULT_DECLARED_VALUES.get(cc),
        identificationRequiredFor: IDENTIFICATION_REQUIRED_ALWAYS.get(cc) ?? [],
    };
}
