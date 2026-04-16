import { describe, it, expect } from 'vitest';
import { formatClientAddress, formatClientContact } from '../../src/services/clients.js';

// =============================================================================
// formatClientAddress
// =============================================================================

describe('formatClientAddress', () => {
    it('should format full client address', () => {
        const result = formatClientAddress({
            street: 'Av. Reforma',
            number: '222',
            city: 'CDMX',
            state: 'CX',
            country: 'MX',
            postal_code: '06600',
        });

        expect(result).toBe('Av. Reforma 222 | CDMX, CX, MX | 06600');
    });

    it('should return dash for null address', () => {
        expect(formatClientAddress(null)).toBe('—');
    });

    it('should return dash for undefined address', () => {
        expect(formatClientAddress(undefined)).toBe('—');
    });

    it('should handle partial address', () => {
        const result = formatClientAddress({ city: 'Monterrey', country: 'MX' });

        expect(result).toBe('Monterrey, MX');
    });

    it('should handle address with only street', () => {
        const result = formatClientAddress({ street: 'Calle 5' });

        expect(result).toBe('Calle 5');
    });
});

// =============================================================================
// formatClientContact
// =============================================================================

describe('formatClientContact', () => {
    it('should format full contact', () => {
        const result = formatClientContact({
            full_name: 'Juan Perez',
            email: 'juan@test.com',
            phone: '5512345678',
        });

        expect(result).toBe('Juan Perez · juan@test.com · 5512345678');
    });

    it('should return dash for null contact', () => {
        expect(formatClientContact(null)).toBe('—');
    });

    it('should return dash for undefined contact', () => {
        expect(formatClientContact(undefined)).toBe('—');
    });

    it('should handle contact with only name', () => {
        expect(formatClientContact({ full_name: 'Maria' })).toBe('Maria');
    });

    it('should handle contact with only email', () => {
        expect(formatClientContact({ email: 'test@test.com' })).toBe('test@test.com');
    });
});
