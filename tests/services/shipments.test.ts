import { describe, it, expect } from 'vitest';
import { buildQueryUrl, formatAddressSummary, formatCurrency } from '../../src/services/shipments.js';

// =============================================================================
// buildQueryUrl
// =============================================================================

describe('buildQueryUrl', () => {
    it('should build URL with query params', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', { status_id: 1, page: 2 });

        expect(url).toBe('https://queries.envia.com/shipments?status_id=1&page=2');
    });

    it('should skip undefined and null params', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', {
            status_id: 1,
            carrier: undefined,
            name: null,
        });

        expect(url).toBe('https://queries.envia.com/shipments?status_id=1');
    });

    it('should skip empty string params', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', { status_id: 1, carrier: '' });

        expect(url).toBe('https://queries.envia.com/shipments?status_id=1');
    });

    it('should handle path with no params', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', {});

        expect(url).toBe('https://queries.envia.com/shipments');
    });

    it('should encode special characters in values', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', { name: 'José García' });

        expect(url).toContain('name=Jos');
    });

    it('should handle boolean params as strings', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', { include_archived: true });

        expect(url).toBe('https://queries.envia.com/shipments?include_archived=true');
    });

    it('should handle numeric zero as a valid param', () => {
        const url = buildQueryUrl('https://queries.envia.com', '/shipments', { international: 0 });

        expect(url).toBe('https://queries.envia.com/shipments?international=0');
    });
});

// =============================================================================
// formatAddressSummary
// =============================================================================

describe('formatAddressSummary', () => {
    it('should format full address with all fields', () => {
        expect(formatAddressSummary({ name: 'John', city: 'CDMX', state: 'DF', country: 'MX' }))
            .toBe('John, CDMX, DF, MX');
    });

    it('should skip undefined fields', () => {
        expect(formatAddressSummary({ city: 'CDMX', country: 'MX' })).toBe('CDMX, MX');
    });

    it('should return dash for undefined address', () => {
        expect(formatAddressSummary(undefined)).toBe('—');
    });

    it('should return dash for empty address object', () => {
        expect(formatAddressSummary({})).toBe('—');
    });

    it('should return single field when only name is present', () => {
        expect(formatAddressSummary({ name: 'Maria Lopez' })).toBe('Maria Lopez');
    });
});

// =============================================================================
// formatCurrency
// =============================================================================

describe('formatCurrency', () => {
    it('should format amount with explicit currency', () => {
        expect(formatCurrency(150.5, 'MXN')).toBe('$150.50 MXN');
    });

    it('should default to MXN when currency is omitted', () => {
        expect(formatCurrency(100)).toBe('$100.00 MXN');
    });

    it('should return dash for undefined amount', () => {
        expect(formatCurrency(undefined)).toBe('—');
    });

    it('should handle zero amount', () => {
        expect(formatCurrency(0, 'USD')).toBe('$0.00 USD');
    });

    it('should format large numbers with two decimal places', () => {
        expect(formatCurrency(12345.678, 'MXN')).toBe('$12345.68 MXN');
    });
});
