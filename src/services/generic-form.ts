/**
 * Generic Form Validation Service
 *
 * Fetches country-specific address form definitions from the Envia Queries API
 * and validates address completeness against the required fields.
 *
 * Used by both `create_shipment` (pre-generation validation) and
 * `envia_validate_address` (proactive field requirements surfacing).
 *
 * Results are cached per country code for the process lifetime to avoid
 * redundant API calls when multiple shipments target the same countries.
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validation rules for a single form field. */
interface GenericFormFieldRules {
    required?: boolean;
    max?: string;
    min?: string;
    validationType?: string;
    validationCnpj?: boolean;
}

/** A single field definition from the generic_forms table. */
export interface GenericFormField {
    fieldId: string;
    fieldName: string;
    fieldType: string;
    fieldLabel: string;
    fieldLabelLang?: string;
    fieldPlaceholder?: string;
    rules: GenericFormFieldRules;
    visible?: boolean;
    size?: string;
    dataType?: string;
}

/** A required field extracted from the form definition. */
export interface RequiredFieldDescriptor {
    fieldId: string;
    fieldLabel: string;
    toolParam: string;
}

// ---------------------------------------------------------------------------
// Field ID -> MCP tool parameter mapping
// ---------------------------------------------------------------------------

/**
 * Maps generic_forms `fieldId` values to the corresponding MCP tool parameter
 * names used in `create_shipment`. Used for error messages so the AI agent
 * knows exactly which parameter to provide.
 */
const FIELD_TO_TOOL_PARAM: Record<string, string> = {
    postalCode: 'postal_code',
    address1: 'street',
    address2: 'number',
    address3: 'interior_number',
    city: 'city',
    city_select: 'city',
    state: 'state',
    district: 'district',
    district_select: 'district',
    identificationNumber: 'identification_number',
    reference: 'reference',
    alias: 'alias',
    state_registration: 'state_registration',
};

/**
 * Maps generic_forms `fieldId` values to GenerateAddress property names for
 * address completeness validation.
 */
const FIELD_TO_ADDRESS_KEY: Record<string, string> = {
    postalCode: 'postalCode',
    address1: 'street',
    address2: 'number',
    address3: 'interior_number',
    city: 'city',
    city_select: 'city',
    state: 'state',
    district: 'district',
    district_select: 'district',
    identificationNumber: 'identificationNumber',
    reference: 'reference',
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const formCache = new Map<string, GenericFormField[]>();

/**
 * Clear the generic form cache. Primarily useful for testing.
 */
export function clearFormCache(): void {
    formCache.clear();
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the address form definition for a country from the Queries API.
 *
 * Returns cached results when available. On API failure, returns an empty
 * array (graceful degradation — shipment creation is not blocked).
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param client - Envia API client
 * @param config - Server configuration with queriesBase URL
 * @returns Array of form field definitions, or empty on failure
 */
export async function fetchGenericForm(
    countryCode: string,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<GenericFormField[]> {
    const cc = countryCode.trim().toUpperCase();
    const cached = formCache.get(cc);
    if (cached) return cached;

    const url = `${config.queriesBase}/generic-form?country_code=${encodeURIComponent(cc)}&form=address_form`;
    const res = await client.get<{ data: GenericFormField[] | string }>(url);

    if (!res.ok) {
        console.error(`[generic-form] Failed to fetch form for ${cc}: ${res.error}`);
        return [];
    }

    let fields: GenericFormField[];
    const raw = res.data?.data;

    if (typeof raw === 'string') {
        try {
            fields = JSON.parse(raw) as GenericFormField[];
        } catch {
            console.error(`[generic-form] Failed to parse form JSON for ${cc}`);
            return [];
        }
    } else if (Array.isArray(raw)) {
        fields = raw;
    } else {
        return [];
    }

    formCache.set(cc, fields);
    return fields;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/**
 * Extract descriptors for all required fields from a form definition.
 *
 * Only considers visible fields whose `rules.required` is truthy.
 *
 * @param formFields - Array of form field definitions
 * @returns Descriptors for required fields with fieldId, label, and tool param name
 */
export function getRequiredFields(formFields: GenericFormField[]): RequiredFieldDescriptor[] {
    return formFields
        .filter((f) => f.rules?.required && f.visible !== false)
        .map((f) => ({
            fieldId: f.fieldId,
            fieldLabel: f.fieldLabel || f.fieldName || f.fieldId,
            toolParam: FIELD_TO_TOOL_PARAM[f.fieldId] || f.fieldName || f.fieldId,
        }));
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

/**
 * Validate that an address object contains all required fields for its country.
 *
 * @param address - Address data as a string-keyed record (e.g. GenerateAddress)
 * @param requiredFields - Required field descriptors from {@link getRequiredFields}
 * @returns Array of missing field descriptors (empty when valid)
 */
export function validateAddressCompleteness(
    address: Record<string, unknown>,
    requiredFields: RequiredFieldDescriptor[],
): RequiredFieldDescriptor[] {
    return requiredFields.filter((field) => {
        const addressKey = FIELD_TO_ADDRESS_KEY[field.fieldId];
        if (!addressKey) return false;

        const value = address[addressKey];
        return value == null || (typeof value === 'string' && value.trim() === '');
    });
}
