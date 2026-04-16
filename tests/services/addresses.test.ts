import { describe, it, expect } from 'vitest';
import { formatAddressLine } from '../../src/services/addresses.js';

// =============================================================================
// formatAddressLine
// =============================================================================

describe('formatAddressLine', () => {
    it('should format full address with all fields', () => {
        const result = formatAddressLine({
            street: 'Av. Reforma',
            number: '222',
            district: 'Juárez',
            city: 'CDMX',
            state: 'CX',
            country: 'MX',
            postal_code: '06600',
        });

        expect(result).toBe('Av. Reforma 222 | Juárez, CDMX, CX | MX | 06600');
    });

    it('should skip missing fields gracefully', () => {
        const result = formatAddressLine({
            street: 'Main St',
            city: 'Austin',
            state: 'TX',
            country: 'US',
        });

        expect(result).toBe('Main St | Austin, TX | US');
    });

    it('should return dash for completely empty object', () => {
        expect(formatAddressLine({})).toBe('—');
    });

    it('should handle address with only street and number', () => {
        const result = formatAddressLine({ street: 'Calle 5', number: '100' });

        expect(result).toBe('Calle 5 100');
    });

    it('should handle address with only postal code', () => {
        const result = formatAddressLine({ postal_code: '64000' });

        expect(result).toBe('64000');
    });

    it('should concatenate street and number with space', () => {
        const result = formatAddressLine({ street: 'Av. Constitución', number: '123', city: 'Monterrey', state: 'NL', country: 'MX' });

        expect(result).toContain('Av. Constitución 123');
    });
});
