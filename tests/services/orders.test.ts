import { describe, it, expect } from 'vitest';
import {
    formatOrderSummary,
    formatOrderCounts,
    formatShopSummary,
    formatAnalytics,
} from '../../src/services/orders.js';
import type { OrderRecord, ShopRecord, OrderCountsResponse, OrderAnalyticsResponse } from '../../src/types/orders.js';

// -----------------------------------------------------------------------------
// Factories
// -----------------------------------------------------------------------------

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
    return {
        id: 100,
        status_id: 2,
        ecart_status_name: 'Paid',
        fulfillment_status_id: 3,
        order: {
            identifier: 'MKTID001',
            name: '#100',
            number: '100',
            status_payment: 'paid',
            currency: 'MXN',
            total: 500,
            shipping_method: 'Envío',
            shipping_option_reference: null,
            cod: 0,
            logistic_mode: null,
            created_at_ecommerce: '2026-04-01',
        },
        customer: { name: 'Test User', email: 'test@example.com' },
        shop: { id: 1, name: 'My Shop' },
        ecommerce: { id: 1, name: 'shopify' },
        shipment_data: {
            shipping_address: {
                company: null,
                first_name: 'Test',
                last_name: 'User',
                phone: '5512345678',
                address_1: 'Av Reforma 1',
                address_2: null,
                address_3: null,
                city: 'CDMX',
                state_code: 'CX',
                country_code: 'MX',
                postal_code: '06600',
                email: 'test@example.com',
                reference: null,
                identification_number: null,
                branch_code: null,
            },
            locations: [],
        },
        tags: [],
        is_favorite: false,
        ...overrides,
    };
}

function makeCountsData(): OrderCountsResponse['data'] {
    return {
        payment_pending: { total: 10, total_by_store: [] },
        label_pending: { total: 20, total_by_store: [] },
        pickup_pending: { total: 5, total_by_store: [] },
        shipped: { total: 3, total_by_store: [] },
        canceled: { total: 8, total_by_store: [] },
        other: { total: 2, total_by_store: [] },
        completed: { total: 100, total_by_store: [] },
    };
}

function makeShop(overrides: Partial<ShopRecord> = {}): ShopRecord {
    return {
        id: 33488,
        company_id: 254,
        ecommerce_id: 1,
        ecommerce_name: 'shopify',
        ecommerce_description: 'Shopify',
        name: 'Test Store',
        url: 'https://test.myshopify.com',
        active: 1,
        deleted: 0,
        package_automatic: 0,
        package_automatic_recommended: null,
        checkout: 0,
        origin: '1',
        ...overrides,
    };
}

function makeAnalytics(overrides: Partial<OrderAnalyticsResponse> = {}): OrderAnalyticsResponse {
    return {
        unfullfilledOrders: 50,
        readyToFulFill: 30,
        readyToShip: 20,
        pickUpInTransit: 10,
        percentagePickUpInTransit: '40.00%',
        outForDelivery: 5,
        percentageOutForDelivery: '20.00%',
        delivered: 8,
        percentageDelivered: '32.00%',
        withIncidents: 2,
        percentageWithIncidents: '8.00%',
        returned: 0,
        percentageReturned: '0.00%',
        sumOrdersActive: 25,
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// formatOrderSummary
// -----------------------------------------------------------------------------

describe('formatOrderSummary', () => {
    it('should include order name, shop, and customer', () => {
        const result = formatOrderSummary(makeOrder());

        expect(result).toContain('#100');
        expect(result).toContain('My Shop');
        expect(result).toContain('Test User');
    });

    it('should include all three status dimensions', () => {
        const result = formatOrderSummary(makeOrder());

        expect(result).toContain('Label Pending');
        expect(result).toContain('Paid');
        expect(result).toContain('Unfulfilled');
    });

    it('should include destination city and country', () => {
        const result = formatOrderSummary(makeOrder());

        expect(result).toContain('CDMX');
        expect(result).toContain('MX');
    });

    it('should include tags when present', () => {
        const order = makeOrder({ tags: [{ id: 1, tag: 'priority', source: 'user' }] });
        const result = formatOrderSummary(order);

        expect(result).toContain('priority');
    });

    it('should not include tags line when tags array is empty', () => {
        const result = formatOrderSummary(makeOrder({ tags: [] }));

        expect(result).not.toContain('Tags:');
    });

    it('should handle missing ecart_status_name gracefully', () => {
        const order = makeOrder({ ecart_status_name: undefined });
        const result = formatOrderSummary(order);

        expect(result).toContain('Payment: —');
    });

    it('should map known status_id values to human-readable labels', () => {
        const statuses = [
            [1, 'Payment Pending'],
            [2, 'Label Pending'],
            [3, 'Pickup Pending'],
            [4, 'Shipped'],
            [5, 'Canceled'],
            [7, 'Completed'],
        ] as const;

        for (const [id, label] of statuses) {
            const result = formatOrderSummary(makeOrder({ status_id: id }));
            expect(result).toContain(label);
        }
    });

    it('should map known fulfillment_status_id values to labels', () => {
        const statuses = [
            [1, 'Fulfilled'],
            [2, 'Partial'],
            [3, 'Unfulfilled'],
            [4, 'Other'],
            [5, 'On Hold'],
        ] as const;

        for (const [id, label] of statuses) {
            const result = formatOrderSummary(makeOrder({ fulfillment_status_id: id }));
            expect(result).toContain(label);
        }
    });
});

// -----------------------------------------------------------------------------
// formatOrderCounts
// -----------------------------------------------------------------------------

describe('formatOrderCounts', () => {
    it('should include all 7 status category totals', () => {
        const result = formatOrderCounts(makeCountsData());

        expect(result).toContain('10');  // payment_pending
        expect(result).toContain('20');  // label_pending
        expect(result).toContain('5');   // pickup_pending
        expect(result).toContain('100'); // completed
    });

    it('should include human-readable category labels', () => {
        const result = formatOrderCounts(makeCountsData());

        expect(result).toContain('Payment Pending');
        expect(result).toContain('Label Pending');
        expect(result).toContain('Completed');
    });

    it('should start with summary header', () => {
        const result = formatOrderCounts(makeCountsData());

        expect(result).toContain('Order status summary');
    });
});

// -----------------------------------------------------------------------------
// formatShopSummary
// -----------------------------------------------------------------------------

describe('formatShopSummary', () => {
    it('should include shop id, name, and platform', () => {
        const result = formatShopSummary(makeShop());

        expect(result).toContain('33488');
        expect(result).toContain('Test Store');
        expect(result).toContain('Shopify');
    });

    it('should show "active" for active non-deleted shops', () => {
        const result = formatShopSummary(makeShop({ active: 1, deleted: 0 }));

        expect(result).toContain('active');
    });

    it('should show "inactive" for deleted or inactive shops', () => {
        const resultDeleted = formatShopSummary(makeShop({ active: 1, deleted: 1 }));
        const resultInactive = formatShopSummary(makeShop({ active: 0, deleted: 0 }));

        expect(resultDeleted).toContain('inactive');
        expect(resultInactive).toContain('inactive');
    });

    it('should include the store URL when present', () => {
        const result = formatShopSummary(makeShop({ url: 'https://test.myshopify.com' }));

        expect(result).toContain('https://test.myshopify.com');
    });

    it('should omit URL when null', () => {
        const result = formatShopSummary(makeShop({ url: null }));

        expect(result).not.toContain('https://');
    });
});

// -----------------------------------------------------------------------------
// formatAnalytics
// -----------------------------------------------------------------------------

describe('formatAnalytics', () => {
    it('should include all key analytics fields', () => {
        const result = formatAnalytics(makeAnalytics());

        expect(result).toContain('50');  // unfullfilledOrders
        expect(result).toContain('30');  // readyToFulFill
        expect(result).toContain('25');  // sumOrdersActive
    });

    it('should include percentages', () => {
        const result = formatAnalytics(makeAnalytics());

        expect(result).toContain('40.00%');
        expect(result).toContain('20.00%');
    });

    it('should include all shipment-status categories', () => {
        const result = formatAnalytics(makeAnalytics());

        expect(result).toContain('Unfulfilled orders');
        expect(result).toContain('Ready to fulfill');
        expect(result).toContain('Out for delivery');
        expect(result).toContain('Delivered');
        expect(result).toContain('With incidents');
        expect(result).toContain('Returned');
    });

    it('should start with analytics header', () => {
        const result = formatAnalytics(makeAnalytics());

        expect(result).toContain('Order analytics by shipment status');
    });
});
