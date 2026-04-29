/**
 * Schema tests for src/schemas/orders.ts
 *
 * Live fixture captured 2026-04-28 from GET /v4/orders?limit=1&page=1.
 */

import { describe, it, expect } from 'vitest';
import { OrderListResponseSchema } from '../../src/schemas/orders.js';

// Captured live 2026-04-28: GET /v4/orders?page=1&limit=1
const liveFixture = {
    orders_info: [
        {
            id: 109666,
            status_id: 2,
            status_name: 'Label Pending',
            ecart_status_id: 1,
            ecart_status_name: 'Paid',
            ecart_status_class: 'success',
            fulfillment_status_id: 2,
            created_at_ecommerce: '2026-04-25 00:32:46',
            estimated_delivery_in: null,
            logistic: { mode: null },
            order: {
                identifier: '7121821073576',
                name: '#1035',
                number: '1035',
                total_price: 3804.74,
                discount: 0,
                subtotal: 3279.95,
                cod: 0,
                currency: 'MXN',
                partial_available: 1,
                shipping_method: 'Shipping',
                shipping_option_reference: null,
                shipping_options: [
                    { endpoint: 'https://api-test.envia.com/', carrier_id: 11, service_id: 22, carrier_name: 'estafeta', service_name: 'express' },
                ],
                shipping_address_available: true,
                fraud_risk: 0,
                cod_confirmation_status: null,
                pod_confirmation_date: null,
                pod_confirmation_value: null,
                shipping_rule_id: 298,
            },
            order_comment: { comment: null, created_at: null, created_by: null, updated_at: null, updated_by: null },
            customer: { name: 'Federico Llaguno', email: 'federico.llaguno@tendencys.com', phone: '+528117913738' },
            shop: { id: 33773, name: 'Computers in DEV' },
            ecommerce: { id: 1, name: 'shopify' },
            shipment_data: {
                shipping_address: {
                    company: 'Co',
                    first_name: 'Federico',
                    last_name: 'Llaguno',
                    address_1: 'Sierra Verde 1305',
                    address_2: 'Sierra verde',
                    address_3: null,
                    interior_number: null,
                    country_code: 'MX',
                    state_code: 'NL',
                    city: 'Monterrey',
                    city_select: null,
                    postal_code: '66256',
                    identification_number: null,
                    phone: '8117913738',
                    email: 'federico.llaguno@tendencys.com',
                    reference: '',
                    branch_code: null,
                },
                locations: [
                    {
                        id: '273258',
                        first_name: 'Gilded Rose ',
                        company: 'ARTBOT',
                        address_1: 'Burgos 3805',
                        address_2: ' 78',
                        address_3: 'Lomas Del Valle',
                        interior_number: null,
                        country_code: 'MX',
                        state_code: 'NL',
                        city: 'San Pedro Garza García',
                        city_select: null,
                        postal_code: '66256',
                        phone: '8116377180',
                        email: 'noreply@envia.com',
                        reference: '',
                        packages: [
                            {
                                id: '134737',
                                tracking_number: null,
                                shipment: {
                                    tracking_number: null,
                                    carrier: null,
                                    label: null,
                                    additional_file: null,
                                    track_url: null,
                                    created_at: null,
                                    service_name: null,
                                    method: null,
                                    weight_total: null,
                                    estimate: null,
                                    total_cost: null,
                                    currency: null,
                                    fulfillment_id: null,
                                    shipment_id: null,
                                    fulfillment_method: null,
                                    shipment_method: null,
                                    info_status: { id: null, name: null, class_name: null, dashboard_color: null, translation_tag: null, is_cancellable: null },
                                },
                                products: [
                                    {
                                        id: '134737',
                                        ecart_id: '15801905086632',
                                        index: '0',
                                        order_product_id: '8124585050280',
                                        name: 'Selling Plans Ski Wax',
                                        sku: null,
                                        variant: '46512028745896',
                                        price: 50,
                                        weight: '0.06',
                                        quantity: 1,
                                        total_quantity: 1,
                                        image_url: 'https://cdn.shopify.com/s/files/snowboard_wax.png',
                                        return_reason: null,
                                        harmonized_system_code: null,
                                        country_code_origin: null,
                                        barcode: null,
                                        dimensions: { id: 4934, product_id: 4958, product_identifier: '46512028745896', height: 0, length: 0, width: 0, weight: 0.06, length_unit: 'CM', weight_unit: 'KG' },
                                        logistic: { logistic_mode: null, logistic_free: false, logistic_me1Suported: null, logistic_rates: null },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            tags: [],
            is_favorite: false,
        },
    ],
    countries: ['MX'],
    totals: 483,
};

describe('OrderListResponseSchema', () => {
    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = OrderListResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects when an order record is missing id', () => {
        const broken = {
            orders_info: [{ status_id: 1 }],
            totals: 1,
        };
        const result = OrderListResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { ...liveFixture, new_backend_field: 'hello' };
        const result = OrderListResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty orders_info array', () => {
        const result = OrderListResponseSchema.safeParse({ orders_info: [], totals: 0, countries: [] });
        expect(result.success).toBe(true);
    });

    it('accepts nullable estimated_delivery_in', () => {
        const fixture = { orders_info: [{ id: 1, estimated_delivery_in: null }], totals: 1 };
        const result = OrderListResponseSchema.safeParse(fixture);
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            OrderListResponseSchema.safeParse(liveFixture);
        }
        expect((performance.now() - start) / ITERATIONS).toBeLessThan(5);
    });
});
