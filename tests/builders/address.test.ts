/**
 * Tests for the address builder functions.
 *
 * Covers both manual-input builders (buildRateAddress, buildGenerateAddress)
 * and V4-order builders (buildRateAddressFromLocation, etc.).
 */

import { describe, it, expect } from 'vitest';
import {
    buildRateAddress,
    buildRateAddressFromLocation,
    buildRateAddressFromShippingAddress,
    buildGenerateAddress,
    buildGenerateAddressFromLocation,
    buildGenerateAddressFromShippingAddress,
    requiresSeparateNumber,
    PLACEHOLDER_STREET,
    DEFAULT_SEPARATE_NUMBER,
} from '../../src/builders/address.js';
import type { RateAddressInput, GenerateAddressInput } from '../../src/builders/address.js';
import type { V4Location, V4ShippingAddress } from '../../src/types/ecommerce-order.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeLocation(overrides: Partial<V4Location> = {}): V4Location {
    return {
        id: 1,
        first_name: 'Warehouse',
        last_name: 'Norte',
        company: 'ACME Corp',
        phone: '+528180001234',
        address_1: 'Av. Constitucion 123',
        address_2: null,
        city: 'Monterrey',
        state_code: 'NL',
        country_code: 'MX',
        postal_code: '64000',
        packages: [],
        ...overrides,
    };
}

function makeShippingAddress(overrides: Partial<V4ShippingAddress> = {}): V4ShippingAddress {
    return {
        company: null,
        first_name: 'Maria',
        last_name: 'Lopez',
        phone: '+528180005678',
        address_1: 'Calle Reforma 456',
        address_2: null,
        address_3: null,
        city: 'Mexico City',
        state_code: 'CDMX',
        country_code: 'MX',
        postal_code: '03100',
        email: 'maria@example.com',
        reference: 'Near the park',
        identification_number: null,
        branch_code: null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// buildRateAddress
// ---------------------------------------------------------------------------

describe('buildRateAddress', () => {
    it('should return all geographic fields plus placeholder street when fully populated', () => {
        const input: RateAddressInput = {
            city: 'Monterrey',
            state: 'NL',
            country: 'mx',
            postalCode: '64000',
        };

        const result = buildRateAddress(input);

        expect(result).toEqual({
            street: PLACEHOLDER_STREET,
            city: 'Monterrey',
            state: 'NL',
            country: 'MX',
            postalCode: '64000',
        });
    });

    it('should always include a placeholder street', () => {
        const result = buildRateAddress({ country: 'MX' });

        expect(result.street).toBe('Calle 1 #100');
    });

    it('should uppercase the country code', () => {
        const result = buildRateAddress({ country: 'co', city: '11001000', state: 'DC' });

        expect(result.country).toBe('CO');
    });

    it('should trim country whitespace', () => {
        const result = buildRateAddress({ country: '  mx  ' });

        expect(result.country).toBe('MX');
    });

    it('should omit city when not provided', () => {
        const result = buildRateAddress({ country: 'MX', postalCode: '64000' });

        expect(result).not.toHaveProperty('city');
    });

    it('should omit state when not provided', () => {
        const result = buildRateAddress({ country: 'MX', postalCode: '64000' });

        expect(result).not.toHaveProperty('state');
    });

    it('should omit postalCode when not provided', () => {
        const result = buildRateAddress({ country: 'CO', city: '11001000', state: 'DC' });

        expect(result).not.toHaveProperty('postalCode');
    });

    it('should return street and country when no optional fields are provided', () => {
        const result = buildRateAddress({ country: 'MX' });

        expect(result).toEqual({ street: PLACEHOLDER_STREET, country: 'MX' });
    });

    it('should not include name or phone fields', () => {
        const result = buildRateAddress({
            city: 'Monterrey',
            state: 'NL',
            country: 'MX',
            postalCode: '64000',
        });

        expect(result).not.toHaveProperty('name');
        expect(result).not.toHaveProperty('phone');
    });

    it('should include district when provided', () => {
        const result = buildRateAddress({
            city: 'Ciudad Apodaca',
            state: 'NL',
            country: 'MX',
            postalCode: '66612',
            district: 'Andalucía',
        });

        expect(result.district).toBe('Andalucía');
    });

    it('should omit district when not provided', () => {
        const result = buildRateAddress({ country: 'MX', postalCode: '64000' });

        expect(result).not.toHaveProperty('district');
    });
});

// ---------------------------------------------------------------------------
// buildRateAddressFromLocation
// ---------------------------------------------------------------------------

describe('buildRateAddressFromLocation', () => {
    it('should build rate address from a V4 location', () => {
        const loc = makeLocation();

        const result = buildRateAddressFromLocation(loc);

        expect(result.street).toBe(PLACEHOLDER_STREET);
        expect(result.city).toBe('Monterrey');
        expect(result.state).toBe('NL');
        expect(result.country).toBe('MX');
        expect(result.postalCode).toBe('64000');
    });

    it('should uppercase country code', () => {
        const loc = makeLocation({ country_code: 'mx' });

        const result = buildRateAddressFromLocation(loc);

        expect(result.country).toBe('MX');
    });
});

// ---------------------------------------------------------------------------
// buildRateAddressFromShippingAddress
// ---------------------------------------------------------------------------

describe('buildRateAddressFromShippingAddress', () => {
    it('should build rate address from a V4 shipping address', () => {
        const addr = makeShippingAddress();

        const result = buildRateAddressFromShippingAddress(addr);

        expect(result.street).toBe(PLACEHOLDER_STREET);
        expect(result.city).toBe('Mexico City');
        expect(result.state).toBe('CDMX');
        expect(result.country).toBe('MX');
        expect(result.postalCode).toBe('03100');
    });
});

// ---------------------------------------------------------------------------
// buildGenerateAddress
// ---------------------------------------------------------------------------

describe('requiresSeparateNumber', () => {
    it('should return true for MX', () => {
        expect(requiresSeparateNumber('MX')).toBe(true);
    });

    it('should be case-insensitive', () => {
        expect(requiresSeparateNumber('mx')).toBe(true);
    });

    it('should trim whitespace', () => {
        expect(requiresSeparateNumber('  MX  ')).toBe(true);
    });

    it('should return false for US', () => {
        expect(requiresSeparateNumber('US')).toBe(false);
    });

    it('should return false for CO', () => {
        expect(requiresSeparateNumber('CO')).toBe(false);
    });

    it('should return false for BR', () => {
        expect(requiresSeparateNumber('BR')).toBe(false);
    });
});

describe('buildGenerateAddress', () => {
    const mxInput: GenerateAddressInput = {
        name: 'Juan Perez',
        street: 'Av. Constitucion',
        city: 'Monterrey',
        state: 'NL',
        country: 'mx',
        postalCode: '64000',
    };

    const usInput: GenerateAddressInput = {
        name: 'John Doe',
        street: '123 Main Street',
        city: 'Los Angeles',
        state: 'CA',
        country: 'US',
        postalCode: '90001',
    };

    it('should default number to S/N for MX when not provided', () => {
        const result = buildGenerateAddress(mxInput);

        expect(result).toEqual({
            name: 'Juan Perez',
            street: 'Av. Constitucion',
            number: DEFAULT_SEPARATE_NUMBER,
            city: 'Monterrey',
            state: 'NL',
            country: 'MX',
            postalCode: '64000',
        });
    });

    it('should use explicit number for MX when provided', () => {
        const result = buildGenerateAddress({ ...mxInput, number: '123' });

        expect(result.number).toBe('123');
    });

    it('should set number to empty string for non-MX countries', () => {
        const result = buildGenerateAddress(usInput);

        expect(result.number).toBe('');
    });

    it('should set number to empty string for non-MX even when number is provided', () => {
        const result = buildGenerateAddress({ ...usInput, number: '456' });

        expect(result.number).toBe('');
    });

    it('should include optional fields when provided', () => {
        const result = buildGenerateAddress({
            ...mxInput,
            phone: '+528180001234',
            number: '123',
            district: 'Centro',
            interior_number: '4B',
            company: 'Envia Corp',
            email: 'juan@example.com',
            reference: 'Near the park',
            identificationNumber: 'ABCD123456XYZ',
        });

        expect(result.phone).toBe('+528180001234');
        expect(result.number).toBe('123');
        expect(result.district).toBe('Centro');
        expect(result.interior_number).toBe('4B');
        expect(result.company).toBe('Envia Corp');
        expect(result.email).toBe('juan@example.com');
        expect(result.reference).toBe('Near the park');
        expect(result.identificationNumber).toBe('ABCD123456XYZ');
    });

    it('should default number to S/N for MX when empty string', () => {
        const result = buildGenerateAddress({ ...mxInput, number: '' });

        expect(result.number).toBe(DEFAULT_SEPARATE_NUMBER);
    });

    it('should omit optional fields when empty', () => {
        const result = buildGenerateAddress({
            ...mxInput,
            phone: '',
            district: '',
            company: '',
        });

        expect(result).not.toHaveProperty('phone');
        expect(result).not.toHaveProperty('district');
        expect(result).not.toHaveProperty('company');
    });

    it('should omit optional fields when undefined', () => {
        const result = buildGenerateAddress(mxInput);

        expect(result).not.toHaveProperty('phone');
        expect(result).not.toHaveProperty('district');
        expect(result).not.toHaveProperty('interior_number');
        expect(result).not.toHaveProperty('company');
        expect(result).not.toHaveProperty('email');
        expect(result).not.toHaveProperty('reference');
        expect(result).not.toHaveProperty('identificationNumber');
    });

    it('should trim country whitespace', () => {
        const result = buildGenerateAddress({ ...mxInput, country: '  co  ' });

        expect(result.country).toBe('CO');
        expect(result.number).toBe('');
    });
});

// ---------------------------------------------------------------------------
// buildGenerateAddressFromLocation
// ---------------------------------------------------------------------------

describe('buildGenerateAddressFromLocation', () => {
    it('should default number to S/N for MX location', () => {
        const loc = makeLocation();

        const result = buildGenerateAddressFromLocation(loc);

        expect(result.name).toBe('Warehouse Norte');
        expect(result.phone).toBe('+528180001234');
        expect(result.street).toBe('Av. Constitucion 123');
        expect(result.number).toBe(DEFAULT_SEPARATE_NUMBER);
        expect(result.city).toBe('Monterrey');
        expect(result.state).toBe('NL');
        expect(result.country).toBe('MX');
        expect(result.postalCode).toBe('64000');
        expect(result.company).toBe('ACME Corp');
    });

    it('should use address_2 as number for MX when available', () => {
        const loc = makeLocation({ address_2: '456' });

        const result = buildGenerateAddressFromLocation(loc);

        expect(result.number).toBe('456');
    });

    it('should set number to empty string for non-MX location', () => {
        const loc = makeLocation({ country_code: 'US', address_2: '456' });

        const result = buildGenerateAddressFromLocation(loc);

        expect(result.number).toBe('');
    });

    it('should handle null last_name gracefully', () => {
        const loc = makeLocation({ last_name: null });

        const result = buildGenerateAddressFromLocation(loc);

        expect(result.name).toBe('Warehouse');
    });

    it('should omit company when null', () => {
        const loc = makeLocation({ company: null });

        const result = buildGenerateAddressFromLocation(loc);

        expect(result).not.toHaveProperty('company');
    });
});

// ---------------------------------------------------------------------------
// buildGenerateAddressFromShippingAddress
// ---------------------------------------------------------------------------

describe('buildGenerateAddressFromShippingAddress', () => {
    it('should default number to S/N for MX shipping address', () => {
        const addr = makeShippingAddress();

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result.name).toBe('Maria Lopez');
        expect(result.phone).toBe('+528180005678');
        expect(result.street).toBe('Calle Reforma 456');
        expect(result.number).toBe(DEFAULT_SEPARATE_NUMBER);
        expect(result.city).toBe('Mexico City');
        expect(result.state).toBe('CDMX');
        expect(result.country).toBe('MX');
        expect(result.postalCode).toBe('03100');
        expect(result.email).toBe('maria@example.com');
        expect(result.reference).toBe('Near the park');
    });

    it('should use address_2 as number for MX when available', () => {
        const addr = makeShippingAddress({ address_2: '789' });

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result.number).toBe('789');
    });

    it('should set number to empty string for non-MX shipping address', () => {
        const addr = makeShippingAddress({ country_code: 'BR', address_2: '789' });

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result.number).toBe('');
    });

    it('should use address_3 as district when available', () => {
        const addr = makeShippingAddress({ address_3: 'Col. Del Valle' });

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result.district).toBe('Col. Del Valle');
    });

    it('should include identification_number when present', () => {
        const addr = makeShippingAddress({ identification_number: 'RFC123456' });

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result.identificationNumber).toBe('RFC123456');
    });

    it('should uppercase the country code', () => {
        const addr = makeShippingAddress({ country_code: 'mx' });

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result.country).toBe('MX');
    });

    it('should omit optional fields when null or empty', () => {
        const addr = makeShippingAddress({ email: '', company: null, reference: null });

        const result = buildGenerateAddressFromShippingAddress(addr);

        expect(result).not.toHaveProperty('email');
        expect(result).not.toHaveProperty('company');
        expect(result).not.toHaveProperty('reference');
    });
});
