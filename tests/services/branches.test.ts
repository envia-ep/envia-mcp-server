import { describe, it, expect } from 'vitest';
import {
    BRANCH_TYPE_LABELS,
    buildBranchUrl,
    formatBranchSummary,
    formatBranchDetail,
} from '../../src/services/branches.js';
import type { BranchRecord } from '../../src/types/branches.js';

// =============================================================================
// Factories
// =============================================================================

function makeBranch(overrides: Partial<BranchRecord> = {}): BranchRecord {
    return {
        distance: 1.86,
        branch_id: 'YMU',
        branch_code: 'MTY',
        branch_type: 1,
        reference: 'MTY - ALAMEDA',
        branch_rules: null,
        address: {
            city: 'Monterrey',
            state: 'NL',
            number: '400',
            street: 'Pino Suarez',
            country: 'MX',
            delivery: true,
            latitude: '25.674113',
            locality: 'Monterrey',
            admission: true,
            longitude: '-100.319496',
            postalCode: '64400',
        },
        hours: [],
        ...overrides,
    };
}

// =============================================================================
// BRANCH_TYPE_LABELS
// =============================================================================

describe('BRANCH_TYPE_LABELS', () => {
    it('should map 1 to Pickup', () => {
        expect(BRANCH_TYPE_LABELS.get(1)).toBe('Pickup');
    });

    it('should map 2 to Drop-off', () => {
        expect(BRANCH_TYPE_LABELS.get(2)).toBe('Drop-off');
    });

    it('should map 3 to Pickup & Drop-off', () => {
        expect(BRANCH_TYPE_LABELS.get(3)).toBe('Pickup & Drop-off');
    });

    it('should return undefined for unknown type', () => {
        expect(BRANCH_TYPE_LABELS.get(99)).toBeUndefined();
    });
});

// =============================================================================
// buildBranchUrl
// =============================================================================

describe('buildBranchUrl', () => {
    it('should build URL with no params', () => {
        const url = buildBranchUrl('https://queries-test.envia.com', '/branches/fedex/MX');
        expect(url).toBe('https://queries-test.envia.com/branches/fedex/MX');
    });

    it('should append query params', () => {
        const url = buildBranchUrl('https://queries-test.envia.com', '/branches/fedex/MX', {
            zipcode: '64000',
            type: 1,
        });
        expect(url).toContain('zipcode=64000');
        expect(url).toContain('type=1');
    });

    it('should omit undefined and null params', () => {
        const url = buildBranchUrl('https://queries-test.envia.com', '/branches/fedex/MX', {
            zipcode: undefined,
            locality: null,
            type: 1,
        });
        expect(url).not.toContain('zipcode');
        expect(url).not.toContain('locality');
        expect(url).toContain('type=1');
    });

    it('should omit empty string params', () => {
        const url = buildBranchUrl('https://queries-test.envia.com', '/branches/fedex/MX', {
            state: '',
            type: 2,
        });
        expect(url).not.toContain('state=');
        expect(url).toContain('type=2');
    });
});

// =============================================================================
// formatBranchSummary
// =============================================================================

describe('formatBranchSummary', () => {
    it('should include branch code and reference', () => {
        const line = formatBranchSummary(makeBranch());
        expect(line).toContain('[MTY]');
        expect(line).toContain('MTY - ALAMEDA');
    });

    it('should include type label', () => {
        const line = formatBranchSummary(makeBranch({ branch_type: 1 }));
        expect(line).toContain('Pickup');
    });

    it('should include city, state, postal code', () => {
        const line = formatBranchSummary(makeBranch());
        expect(line).toContain('Monterrey');
        expect(line).toContain('NL');
        expect(line).toContain('64400');
    });

    it('should include distance when present', () => {
        const line = formatBranchSummary(makeBranch({ distance: 2.5 }));
        expect(line).toContain('2.5 km');
    });

    it('should omit distance when null', () => {
        const line = formatBranchSummary(makeBranch({ distance: null }));
        expect(line).not.toContain('km');
    });

    it('should use locality as fallback when city is null', () => {
        const branch = makeBranch();
        branch.address.city = null;
        branch.address.locality = 'Guadalajara';
        const line = formatBranchSummary(branch);
        expect(line).toContain('Guadalajara');
    });

    it('should show em-dash when city and locality are both null', () => {
        const branch = makeBranch();
        branch.address.city = null;
        branch.address.locality = null;
        const line = formatBranchSummary(branch);
        expect(line).toContain('—');
    });

    it('should use drop-off type label for type 2', () => {
        const line = formatBranchSummary(makeBranch({ branch_type: 2 }));
        expect(line).toContain('Drop-off');
    });

    it('should use fallback label for unknown branch type', () => {
        const line = formatBranchSummary(makeBranch({ branch_type: 99 }));
        expect(line).toContain('Type 99');
    });
});

// =============================================================================
// formatBranchDetail
// =============================================================================

describe('formatBranchDetail', () => {
    it('should include branch reference name', () => {
        const detail = formatBranchDetail(makeBranch());
        expect(detail).toContain('MTY - ALAMEDA');
    });

    it('should include branch code and ID', () => {
        const detail = formatBranchDetail(makeBranch());
        expect(detail).toContain('MTY');
        expect(detail).toContain('YMU');
    });

    it('should include full street address', () => {
        const detail = formatBranchDetail(makeBranch());
        expect(detail).toContain('Pino Suarez');
        expect(detail).toContain('400');
    });

    it('should include distance', () => {
        const detail = formatBranchDetail(makeBranch({ distance: 1.86 }));
        expect(detail).toContain('1.9 km');
    });

    it('should show em-dash for distance when null', () => {
        const detail = formatBranchDetail(makeBranch({ distance: null }));
        expect(detail).toContain('Distance: —');
    });

    it('should show delivery and admission status', () => {
        const detail = formatBranchDetail(makeBranch());
        expect(detail).toContain('Delivery: Yes');
        expect(detail).toContain('Admission: Yes');
    });

    it('should show No for delivery when false', () => {
        const branch = makeBranch();
        branch.address.delivery = false;
        const detail = formatBranchDetail(branch);
        expect(detail).toContain('Delivery: No');
    });

    it('should handle null street with em-dash fallback', () => {
        const branch = makeBranch();
        branch.address.street = null;
        branch.address.number = null;
        const detail = formatBranchDetail(branch);
        expect(detail).toContain('—');
    });
});
