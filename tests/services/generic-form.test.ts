/**
 * Tests for the generic form validation service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import {
    fetchGenericForm,
    getRequiredFields,
    validateAddressCompleteness,
    clearFormCache,
    type GenericFormField,
} from '../../src/services/generic-form.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<GenericFormField> = {}): GenericFormField {
    return {
        fieldId: 'postalCode',
        fieldName: 'postal_code',
        fieldType: 'text',
        fieldLabel: 'Zip Code',
        rules: { required: true, max: '9' },
        visible: true,
        ...overrides,
    };
}

const BR_FORM_FIELDS: GenericFormField[] = [
    makeField({ fieldId: 'postalCode', fieldLabel: 'Zip Code', rules: { required: true } }),
    makeField({ fieldId: 'address1', fieldName: 'street', fieldLabel: 'Address1', rules: { required: true } }),
    makeField({ fieldId: 'address2', fieldName: 'number', fieldLabel: 'Address2', rules: { required: true } }),
    makeField({ fieldId: 'city', fieldName: 'city', fieldLabel: 'City', rules: { required: true } }),
    makeField({ fieldId: 'state', fieldName: 'state', fieldLabel: 'State', rules: { required: true } }),
    makeField({ fieldId: 'identificationNumber', fieldName: 'identification_number', fieldLabel: 'Identification Number', rules: { required: true } }),
    makeField({ fieldId: 'district', fieldName: 'district', fieldLabel: 'Neighborhood', rules: { required: false } }),
    makeField({ fieldId: 'reference', fieldName: 'reference', fieldLabel: 'Reference', rules: { required: false } }),
];

// ---------------------------------------------------------------------------
// getRequiredFields
// ---------------------------------------------------------------------------

describe('getRequiredFields', () => {
    it('should extract fields where rules.required is true', () => {
        const result = getRequiredFields(BR_FORM_FIELDS);

        const fieldIds = result.map((f) => f.fieldId);
        expect(fieldIds).toContain('postalCode');
        expect(fieldIds).toContain('address1');
        expect(fieldIds).toContain('identificationNumber');
        expect(fieldIds).not.toContain('district');
        expect(fieldIds).not.toContain('reference');
    });

    it('should exclude hidden fields even if required', () => {
        const fields = [
            makeField({ fieldId: 'city_select', fieldLabel: 'City', rules: { required: true }, visible: false }),
            makeField({ fieldId: 'city', fieldLabel: 'City', rules: { required: true }, visible: true }),
        ];

        const result = getRequiredFields(fields);

        expect(result).toHaveLength(1);
        expect(result[0].fieldId).toBe('city');
    });

    it('should return empty array when no fields are required', () => {
        const fields = [
            makeField({ rules: { required: false } }),
        ];

        const result = getRequiredFields(fields);

        expect(result).toEqual([]);
    });

    it('should map fieldId to correct toolParam', () => {
        const fields = [
            makeField({ fieldId: 'identificationNumber', fieldLabel: 'CNPJ/CPF', rules: { required: true } }),
        ];

        const result = getRequiredFields(fields);

        expect(result[0].toolParam).toBe('identification_number');
    });

    it('should return empty array for empty input', () => {
        expect(getRequiredFields([])).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// validateAddressCompleteness
// ---------------------------------------------------------------------------

describe('validateAddressCompleteness', () => {
    it('should return empty array when all required fields are present', () => {
        const address = {
            postalCode: '01310-100',
            street: 'Rua Augusta',
            number: '100',
            city: 'São Paulo',
            state: 'SP',
            identificationNumber: '12345678909',
        };
        const required = getRequiredFields(BR_FORM_FIELDS);

        const result = validateAddressCompleteness(address, required);

        expect(result).toEqual([]);
    });

    it('should return missing fields when identificationNumber is absent', () => {
        const address = {
            postalCode: '01310-100',
            street: 'Rua Augusta',
            number: '100',
            city: 'São Paulo',
            state: 'SP',
        };
        const required = getRequiredFields(BR_FORM_FIELDS);

        const result = validateAddressCompleteness(address, required);

        expect(result).toHaveLength(1);
        expect(result[0].fieldId).toBe('identificationNumber');
    });

    it('should detect empty string as missing', () => {
        const address = {
            postalCode: '01310-100',
            street: 'Rua Augusta',
            number: '100',
            city: 'São Paulo',
            state: 'SP',
            identificationNumber: '  ',
        };
        const required = getRequiredFields(BR_FORM_FIELDS);

        const result = validateAddressCompleteness(address, required);

        expect(result.some((f) => f.fieldId === 'identificationNumber')).toBe(true);
    });

    it('should detect null as missing', () => {
        const address = {
            postalCode: '01310-100',
            street: 'Rua Augusta',
            number: '100',
            city: 'São Paulo',
            state: 'SP',
            identificationNumber: null,
        };
        const required = getRequiredFields(BR_FORM_FIELDS);

        const result = validateAddressCompleteness(address, required);

        expect(result.some((f) => f.fieldId === 'identificationNumber')).toBe(true);
    });

    it('should return multiple missing fields', () => {
        const address = { postalCode: '01310-100' };
        const required = getRequiredFields(BR_FORM_FIELDS);

        const result = validateAddressCompleteness(address, required);

        expect(result.length).toBeGreaterThan(1);
    });
});

// ---------------------------------------------------------------------------
// fetchGenericForm
// ---------------------------------------------------------------------------

describe('fetchGenericForm', () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
    });

    it('should fetch and return form fields from API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: BR_FORM_FIELDS }),
        });

        const result = await fetchGenericForm('BR', client, MOCK_CONFIG);

        expect(result).toHaveLength(BR_FORM_FIELDS.length);
        expect(result[0].fieldId).toBe('postalCode');
    });

    it('should call the correct URL with country code', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [] }),
        });

        await fetchGenericForm('BR', client, MOCK_CONFIG);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/generic-form?country_code=BR&form=address_form');
    });

    it('should cache results for the same country', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: BR_FORM_FIELDS }),
        });

        await fetchGenericForm('BR', client, MOCK_CONFIG);
        await fetchGenericForm('BR', client, MOCK_CONFIG);

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should normalize country code to uppercase', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: BR_FORM_FIELDS }),
        });

        await fetchGenericForm('br', client, MOCK_CONFIG);
        const cached = await fetchGenericForm('BR', client, MOCK_CONFIG);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(cached).toHaveLength(BR_FORM_FIELDS.length);
    });

    it('should return empty array on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal error' }),
        });

        const result = await fetchGenericForm('BR', client, MOCK_CONFIG);

        expect(result).toEqual([]);
    });

    it('should parse stringified JSON response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: JSON.stringify(BR_FORM_FIELDS) }),
        });

        const result = await fetchGenericForm('MX', client, MOCK_CONFIG);

        expect(result).toHaveLength(BR_FORM_FIELDS.length);
    });

    it('should return empty array for invalid JSON string', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'not-valid-json' }),
        });

        const result = await fetchGenericForm('XX', client, MOCK_CONFIG);

        expect(result).toEqual([]);
    });
});
