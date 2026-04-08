/**
 * Tests for the ecommerce section builder.
 */

import { describe, it, expect } from 'vitest';
import { buildEcommerceSection } from '../../src/builders/ecommerce.js';
import type { V4Order } from '../../src/types/ecommerce-order.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<V4Order> = {}): V4Order {
    return {
        id: 9001,
        status_id: 2,
        order: {
            identifier: 'SHOP-1234',
            name: '#1234',
            number: '1234',
            status_payment: 'paid',
            currency: 'MXN',
            total: 599.98,
            shipping_method: 'Standard',
            shipping_option_reference: null,
            cod: 0,
            logistic_mode: null,
            created_at_ecommerce: '2026-03-01T10:00:00Z',
        },
        customer: { name: 'Maria Lopez', email: 'maria@example.com' },
        shop: { id: 42, name: 'My Shopify Store' },
        ecommerce: { id: 1, name: 'Shopify' },
        shipment_data: {
            shipping_address: {
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
                reference: null,
                identification_number: null,
                branch_code: null,
            },
            locations: [],
        },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildEcommerceSection', () => {
    it('should extract ecommerce metadata from a V4 order', () => {
        const order = makeOrder();

        const result = buildEcommerceSection(order);

        expect(result).toEqual({
            shop_id: 42,
            order_id: 9001,
            order_identifier: 'SHOP-1234',
            order_name: '#1234',
            order_number: '1234',
            type_generate: 'multi_generate',
        });
    });

    it('should always set type_generate to multi_generate', () => {
        const order = makeOrder();

        const result = buildEcommerceSection(order);

        expect(result.type_generate).toBe('multi_generate');
    });

    it('should use order-level identifiers, not customer info', () => {
        const order = makeOrder();

        const result = buildEcommerceSection(order);

        expect(result.order_identifier).toBe('SHOP-1234');
        expect(result.order_name).toBe('#1234');
        expect(result).not.toHaveProperty('customer');
    });
});
