/**
 * Envia MCP Server — National Identification Validator
 *
 * Validates national identification documents with format and checksum verification.
 * - Brazil: CPF (11 digits, mod-11 checksum) and CNPJ (14 digits, mod-11 checksum)
 * - Colombia: NIT (7-10 numeric digits)
 * - Spain: DNI, NIE, NIF detection
 *
 * Also determines whether identification is required for a given route and action.
 */

import { IDENTIFICATION_REQUIRED_ALWAYS } from './country-rules.js';
import { isIntraEU } from './tax-rules.js';

/** Describes whether identification is required and which legs need it. */
export interface IdentificationRequirement {
    required: boolean;
    fields: readonly string[];
}

/**
 * Validate a Brazilian CPF (Cadastro de Pessoas Fisicas).
 *
 * Strips non-digit characters, verifies length (11 digits), rejects
 * all-same-digit sequences, and validates both mod-11 check digits.
 *
 * @param cpf - The CPF string, optionally formatted (e.g. 529.982.247-25).
 * @returns `true` if the CPF is valid.
 */
export function validateCPF(cpf: string): boolean {
    const digits = cpf.replace(/\D/g, '');

    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;

    // First check digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(digits[i], 10) * (10 - i);
    }
    let remainder = sum % 11;
    const d1 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(digits[9], 10) !== d1) return false;

    // Second check digit
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(digits[i], 10) * (11 - i);
    }
    remainder = sum % 11;
    const d2 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(digits[10], 10) !== d2) return false;

    return true;
}

/**
 * Validate a Brazilian CNPJ (Cadastro Nacional da Pessoa Juridica).
 *
 * Strips non-digit characters, verifies length (14 digits), rejects
 * all-same-digit sequences, and validates both mod-11 check digits.
 *
 * @param cnpj - The CNPJ string, optionally formatted (e.g. 11.222.333/0001-81).
 * @returns `true` if the CNPJ is valid.
 */
export function validateCNPJ(cnpj: string): boolean {
    const digits = cnpj.replace(/\D/g, '');

    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false;

    // First check digit
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(digits[i], 10) * weights1[i];
    }
    let remainder = sum % 11;
    const d1 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(digits[12], 10) !== d1) return false;

    // Second check digit
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    sum = 0;
    for (let i = 0; i < 13; i++) {
        sum += parseInt(digits[i], 10) * weights2[i];
    }
    remainder = sum % 11;
    const d2 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(digits[13], 10) !== d2) return false;

    return true;
}

/**
 * Validate a Colombian NIT (Numero de Identificacion Tributaria).
 *
 * Strips non-digit characters and verifies the digit count is between 7 and 10.
 *
 * @param nit - The NIT string, optionally with dashes (e.g. 900-123-456).
 * @returns `true` if the NIT has a valid length.
 */
export function validateNIT(nit: string): boolean {
    const digits = nit.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 10;
}

/**
 * Determine whether identification documents are required for a route and action.
 *
 * - Rate action: never requires identification.
 * - Generate action: checks country-level requirements and ES special rules.
 *
 * @param originCountry - ISO 3166-1 alpha-2 origin country code.
 * @param destCountry - ISO 3166-1 alpha-2 destination country code.
 * @param action - The shipping action being performed.
 * @returns An object indicating whether identification is required and which fields.
 */
export function isIdentificationRequired(
    originCountry: string,
    destCountry: string,
    action: 'rate' | 'generate',
): IdentificationRequirement {
    if (action === 'rate') {
        return { required: false, fields: [] };
    }

    const oc = originCountry.toUpperCase().trim();
    const dc = destCountry.toUpperCase().trim();

    // Check countries that always require identification
    const requiredFields = IDENTIFICATION_REQUIRED_ALWAYS.get(oc);
    if (requiredFields) {
        return { required: true, fields: requiredFields };
    }

    // ES special: international non-EU requires identification
    if (oc === 'ES' && dc !== 'ES' && !isIntraEU(oc, dc)) {
        return { required: true, fields: ['origin', 'destination'] };
    }

    return { required: false, fields: [] };
}
