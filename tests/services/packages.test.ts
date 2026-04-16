import { describe, it, expect } from 'vitest';
import { formatPackageType, formatDimensions } from '../../src/services/packages.js';

// =============================================================================
// formatPackageType
// =============================================================================

describe('formatPackageType', () => {
    it('should return Box for type 1', () => {
        expect(formatPackageType(1)).toBe('Box');
    });

    it('should return Envelope for type 2', () => {
        expect(formatPackageType(2)).toBe('Envelope');
    });

    it('should return Pallet for type 3', () => {
        expect(formatPackageType(3)).toBe('Pallet');
    });

    it('should return Tube for type 4', () => {
        expect(formatPackageType(4)).toBe('Tube');
    });

    it('should return fallback for unknown type', () => {
        expect(formatPackageType(99)).toBe('Type 99');
    });

    it('should return dash for undefined', () => {
        expect(formatPackageType(undefined)).toBe('—');
    });
});

// =============================================================================
// formatDimensions
// =============================================================================

describe('formatDimensions', () => {
    it('should format complete dimensions', () => {
        expect(formatDimensions({ length: 30, width: 20, height: 15, length_unit: 'CM' }))
            .toBe('30×20×15 CM');
    });

    it('should default unit to CM when missing', () => {
        expect(formatDimensions({ length: 10, width: 10, height: 10 }))
            .toBe('10×10×10 CM');
    });

    it('should show ? for missing dimensions', () => {
        expect(formatDimensions({ length: 30, length_unit: 'IN' }))
            .toBe('30×?×? IN');
    });

    it('should return dash when all dimensions are missing', () => {
        expect(formatDimensions({})).toBe('—');
    });

    it('should handle zero dimensions as falsy', () => {
        expect(formatDimensions({ length: 0, width: 0, height: 0 })).toBe('—');
    });
});
