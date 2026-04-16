import { describe, it, expect } from 'vitest';
import {
    TICKET_STATUS_NAMES,
    formatTicketSummary,
    formatTicketComment,
    formatTicketType,
} from '../../src/services/tickets.js';
import type { TicketRecord, TicketComment, TicketType } from '../../src/types/tickets.js';

// =============================================================================
// Factories
// =============================================================================

function makeTicket(overrides: Partial<TicketRecord> = {}): TicketRecord {
    return {
        id: 101,
        company_id: 1,
        carrier_id: 5,
        shipment_id: 9999,
        credit_id: null,
        warehouse_package_id: null,
        comments: 'Package arrived with damage',
        created_by: 42,
        created_at: '2026-04-10 10:00:00',
        updated_at: '2026-04-11 09:00:00',
        utc_created_at: '2026-04-10T10:00:00Z',
        ticket_status_id: 1,
        ticket_status_name: 'pending',
        ticket_status_color: '#FFB136',
        ticket_class_name: 'warning',
        ticket_type_id: 5,
        ticket_type_name: 'damaged',
        reference: null,
        ticket_type_active: 1,
        tracking_number: 'TRACK12345',
        service: 'express',
        carrier: 'DHL',
        carrier_description: 'DHL Express',
        file_quantity: 0,
        files: [],
        last_comment: {},
        allComments: [],
        data: null,
        name: null,
        company: null,
        email: null,
        phone: null,
        street: null,
        number: null,
        district: null,
        city: null,
        state: null,
        postal_code: null,
        country: null,
        consignee: {
            consignee_name: 'Maria Lopez',
            consignee_company_name: null,
            consignee_email: 'maria@test.com',
            consignee_phone: '5512345678',
            consignee_street: 'Calle 5',
            consignee_number: '10',
            consignee_district: 'Centro',
            consignee_city: 'CDMX',
            consignee_state: 'CX',
            consignee_postal_code: '06600',
            consignee_country: 'MX',
        },
        payment_method: {},
        rating: { evaluated: 0, rating: null, comment: null },
        additional_services: [],
        ...overrides,
    };
}

function makeComment(overrides: Partial<TicketComment> = {}): TicketComment {
    return {
        type: 'client',
        status_id: 1,
        tracking_number: null,
        status_name: 'pending',
        status_color: '#FFB136',
        description: 'I need an update on this ticket.',
        created_by_name: 'Juan Perez',
        created_at: '2026-04-10 11:00:00',
        ...overrides,
    };
}

function makeTicketType(overrides: Partial<TicketType> = {}): TicketType {
    return {
        id: 5,
        name: 'damaged',
        description: 'Damaged Package',
        rules: null,
        type: null,
        active: 1,
        ...overrides,
    };
}

// =============================================================================
// TICKET_STATUS_NAMES
// =============================================================================

describe('TICKET_STATUS_NAMES', () => {
    it('should map all 10 documented status IDs', () => {
        expect(TICKET_STATUS_NAMES.size).toBe(10);
    });

    it('should return Pending for status 1', () => {
        expect(TICKET_STATUS_NAMES.get(1)).toBe('Pending');
    });

    it('should return Accepted for status 2', () => {
        expect(TICKET_STATUS_NAMES.get(2)).toBe('Accepted');
    });

    it('should return Declined for status 3', () => {
        expect(TICKET_STATUS_NAMES.get(3)).toBe('Declined');
    });

    it('should return In Review for status 6', () => {
        expect(TICKET_STATUS_NAMES.get(6)).toBe('In Review');
    });

    it('should return Claim In Review for status 10', () => {
        expect(TICKET_STATUS_NAMES.get(10)).toBe('Claim In Review');
    });

    it('should return undefined for an unknown status', () => {
        expect(TICKET_STATUS_NAMES.get(99)).toBeUndefined();
    });
});

// =============================================================================
// formatTicketSummary
// =============================================================================

describe('formatTicketSummary', () => {
    it('should format a full ticket summary', () => {
        const result = formatTicketSummary(makeTicket());

        expect(result).toBe('#101 — damaged (Pending) | Carrier: DHL | Tracking: TRACK12345 | Created: 2026-04-10 10:00:00');
    });

    it('should use TICKET_STATUS_NAMES map for status label', () => {
        const result = formatTicketSummary(makeTicket({ ticket_status_id: 2, ticket_status_name: 'accepted' }));

        expect(result).toContain('(Accepted)');
    });

    it('should fall back to ticket_status_name for unknown status IDs', () => {
        const result = formatTicketSummary(makeTicket({ ticket_status_id: 99, ticket_status_name: 'custom_status' }));

        expect(result).toContain('(custom_status)');
    });

    it('should show dash when carrier is null', () => {
        const result = formatTicketSummary(makeTicket({ carrier: null }));

        expect(result).toContain('Carrier: —');
    });

    it('should show dash when tracking_number is null', () => {
        const result = formatTicketSummary(makeTicket({ tracking_number: null }));

        expect(result).toContain('Tracking: —');
    });
});

// =============================================================================
// formatTicketComment
// =============================================================================

describe('formatTicketComment', () => {
    it('should format a client comment', () => {
        const result = formatTicketComment(makeComment());

        expect(result).toBe('[client] Juan Perez (2026-04-10 11:00:00): I need an update on this ticket.');
    });

    it('should format an admin comment', () => {
        const result = formatTicketComment(makeComment({
            type: 'admin',
            created_by_name: 'Support Agent',
            description: 'We are reviewing your case.',
            created_at: '2026-04-11 08:00:00',
        }));

        expect(result).toBe('[admin] Support Agent (2026-04-11 08:00:00): We are reviewing your case.');
    });

    it('should handle empty description', () => {
        const result = formatTicketComment(makeComment({ description: '' }));

        expect(result).toBe('[client] Juan Perez (2026-04-10 11:00:00): ');
    });
});

// =============================================================================
// formatTicketType
// =============================================================================

describe('formatTicketType', () => {
    it('should format an active ticket type', () => {
        const result = formatTicketType(makeTicketType());

        expect(result).toBe('Damaged Package (ID: 5) — Active');
    });

    it('should format an inactive ticket type', () => {
        const result = formatTicketType(makeTicketType({ active: 0, description: 'Old Type', id: 99 }));

        expect(result).toBe('Old Type (ID: 99) — Inactive');
    });

    it('should include the type ID in output', () => {
        const result = formatTicketType(makeTicketType({ id: 13, description: 'Theft' }));

        expect(result).toContain('ID: 13');
    });
});
