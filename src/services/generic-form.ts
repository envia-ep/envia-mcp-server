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
 *
 * ---------------------------------------------------------------------------
 * Scope of validation (intentional — see LESSONS L-C2)
 * ---------------------------------------------------------------------------
 *
 * This service validates ONLY field presence (`rules.required === true`).
 * It INTENTIONALLY does not replicate the following backend constraints
 * client-side:
 *
 *   - `rules.min` / `rules.max` length bounds.
 *   - `rules.validationType` format rules (e.g. CPF/CNPJ checksum, phone
 *     patterns, email format).
 *   - `rules.validationCnpj` / other ad-hoc flags.
 *
 * The backend is the canonical authority on those rules (they change per
 * country, per carrier, and occasionally per promotion). Duplicating them
 * here has historically produced silently-outdated client-side validation.
 * Instead, when the backend rejects a bad value the tool surfaces the
 * mapped error through `mapCarrierError(...)`.
 *
 * Fields listed in {@link UNSUPPORTED_FIELD_IDS} (e.g. `state_registration`,
 * `alias`) are *silently skipped* during required-field extraction even if
 * the form marks them as required — the MCP tool has no parameter to
 * populate them. In those cases the carrier may reject the request at
 * generate-time with a field-missing error; the mapped error will identify
 * the field. See issue P2.1 in `_docs/DECISIONS_2026_04_17.md` for context.
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
};

/**
 * Generic-form field IDs that `create_shipment` does not support.
 *
 * These fields have no corresponding tool parameter and are not sent to the
 * carrier API. When a country marks them as required the validation skips them
 * (with a server-side warning) rather than surfacing an unsatisfiable error to
 * the caller. The shipment is attempted without those fields; if the carrier
 * rejects it, the error will come back from the API.
 *
 * Extend this set when new unsupported fields are discovered.
 */
const UNSUPPORTED_FIELD_IDS: ReadonlySet<string> = new Set(['alias', 'state_registration']);

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
 * Only considers visible fields whose `rules.required` is truthy. Fields
 * listed in {@link UNSUPPORTED_FIELD_IDS} are excluded with a warning — the
 * tool has no parameter for them and cannot satisfy the requirement.
 *
 * @param formFields - Array of form field definitions
 * @returns Descriptors for required fields with fieldId, label, and tool param name
 */
export function getRequiredFields(formFields: GenericFormField[]): RequiredFieldDescriptor[] {
    return formFields
        .filter((f) => {
            if (!f.rules?.required || f.visible === false) return false;
            if (UNSUPPORTED_FIELD_IDS.has(f.fieldId)) {
                console.warn(
                    `[generic-form] Required field "${f.fieldId}" is not supported by create_shipment ` +
                    `and will be skipped. The carrier may reject the request if this field is mandatory.`,
                );
                return false;
            }
            return true;
        })
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

// ---------------------------------------------------------------------------
// High-level helper for address-management tools
// ---------------------------------------------------------------------------

/** Result of a country-aware address validation. */
export interface AddressValidationResult {
    /** True when the address satisfies all required fields for the country. */
    ok: boolean;
    /** Descriptors for fields that are required but missing. */
    missing: RequiredFieldDescriptor[];
    /** Human-readable error message (populated when `ok` is false). */
    errorMessage?: string;
}

/**
 * Map address-tool parameter names (snake_case) to the GenerateAddress keys
 * expected by `validateAddressCompleteness`. Address-management tools use the
 * same snake_case vocabulary as the MCP schemas, so we translate on the way
 * in instead of forcing each tool to build an intermediate object.
 */
const TOOL_PARAM_TO_ADDRESS_KEY: Record<string, string> = {
    postal_code: 'postalCode',
    street: 'street',
    number: 'number',
    interior_number: 'interior_number',
    city: 'city',
    state: 'state',
    district: 'district',
    identification_number: 'identificationNumber',
    reference: 'reference',
};

/**
 * Validate an address against the country-specific generic-form rules.
 *
 * This is the high-level entry point used by CRUD tools on addresses and
 * clients. It hides the three-step dance (fetch form → extract required →
 * check completeness) behind a single call and returns a structured result
 * the caller can surface directly to the agent.
 *
 * Scope: this validates ONLY field presence. See the module-level JSDoc for
 * why `rules.min`, `rules.max`, and `rules.validationType` are intentionally
 * delegated to the backend rather than duplicated here.
 *
 * Graceful degradation: when the form fetch fails (empty array), the helper
 * returns `ok: true` with no missing fields — we prefer to let the backend
 * reject than to block a mutation client-side on transient infra issues.
 *
 * @param country - ISO 3166-1 alpha-2 country code
 * @param input   - Address fields keyed by their snake_case tool parameter name
 * @param client  - Authenticated Envia API client
 * @param config  - Server configuration
 */
export async function validateAddressForCountry(
    country: string,
    input: Record<string, unknown>,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<AddressValidationResult> {
    const normalisedCountry = country.trim().toUpperCase();
    if (normalisedCountry.length !== 2) {
        return { ok: true, missing: [] };
    }

    const form = await fetchGenericForm(normalisedCountry, client, config);
    if (form.length === 0) {
        return { ok: true, missing: [] };
    }

    const required = getRequiredFields(form);
    const addressObject = buildAddressObjectFromToolInput(input);
    const missing = validateAddressCompleteness(addressObject, required);

    if (missing.length === 0) {
        return { ok: true, missing: [] };
    }

    const details = missing
        .map((f) => `${f.fieldLabel} (param \`${f.toolParam}\`)`)
        .join(', ');

    return {
        ok: false,
        missing,
        errorMessage: `The address is missing required fields for ${normalisedCountry}: ${details}.`,
    };
}

/**
 * Translate a snake_case tool input object into the camelCase GenerateAddress
 * keys expected by `validateAddressCompleteness`. Fields without a known
 * mapping are passed through unchanged so unknown keys are simply ignored
 * during validation.
 */
function buildAddressObjectFromToolInput(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        const mapped = TOOL_PARAM_TO_ADDRESS_KEY[key] ?? key;
        out[mapped] = value;
    }
    return out;
}
