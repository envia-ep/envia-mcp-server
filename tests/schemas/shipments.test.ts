/**
 * Schema tests for src/schemas/shipments.ts
 *
 * Live fixtures captured 2026-04-28 from queries-test.envia.com.
 * Sensitive values (emails, addresses) retained for regression accuracy.
 */

import { describe, it, expect } from 'vitest';
import {
    ShipmentDetailResponseSchema,
    ShipmentListResponseSchema,
    ShipmentStatusStatsSchema,
    InvoiceListResponseSchema,
} from '../../src/schemas/shipments.js';

// ---------------------------------------------------------------------------
// ShipmentDetailResponseSchema — tool #1 (envia_get_shipment_detail)
// ---------------------------------------------------------------------------

describe('ShipmentDetailResponseSchema', () => {
    // Captured live 2026-04-28: GET /guide/9824510570
    const liveFixture = {
        data: [
            {
                id: 170633,
                tracking_number: '9824510570',
                folio: null,
                status: 'Canceled',
                status_id: 4,
                balance_returned: 1,
                balance_returned_at: '2026-04-27 17:31:24',
                carrier_id: 2,
                name: 'dhl',
                endpoint: 'https://api-test.envia.com/',
                service_id: 7,
                service: 'express',
                reverse_pickup: 0,
                zone: 0,
                custom_key: 0,
                created_at: '2026-04-27 17:29:42',
                shipped_at: null,
                delivered_at: null,
                signed_by: null,
                information_detail: null,
                sender_name: 'Almacen Test',
                sender_company_name: '-',
                sender_email: 'test@envia.com',
                sender_phone: '5512345678',
                sender_street: 'Insurgentes Sur',
                sender_number: '1602',
                sender_district: 'Credito Constructor',
                sender_city: 'Benito Juarez',
                sender_state: 'DF',
                sender_country: 'MX',
                sender_postalcode: '03940',
                sender_identification_number: null,
                sender_references: null,
                consignee_name: 'Cliente Test',
                consignee_company_name: '-',
                consignee_email: 'cliente@test.com',
                consignee_phone: '3312345678',
                consignee_street: 'Vallarta',
                consignee_number: '100',
                consignee_district: 'Americana',
                consignee_city: 'Guadalajara',
                consignee_state: 'JAL',
                consignee_country: 'MX',
                consignee_postalcode: '44100',
                consignee_postal_code: '44100',
                consignee_identification_number: null,
                consignee_references: null,
                international: 0,
                shipment_type_id: 1,
                shipment_type: 'box',
                shipment_real_weight: null,
                shipment_weight: 2,
                currency: 'EUR',
                insurance: 0,
                insurance_cost: 0,
                extended_zone: 0,
                additional_services_cost: 0,
                import_fee: 0,
                import_tax: 0,
                cash_on_delivery_cost: 0,
                cash_on_delivery_amount: 0,
                custom_key_cost: 0,
                sms_cost: 0,
                overcharge_applied: 0,
                overcharge_cost: null,
                total: 10.43,
                whatsapp_cost: 0.05,
                grand_total: 14.28,
                label_file: 'https://s3.us-east-2.amazonaws.com/envia-staging/uploads/dhl/example.pdf',
                evidence_file: null,
                bol_file: null,
                created_by_name: 'Jose Vidrio',
                created_by_email: 'jose.vidrio@envia.com',
                additional_file: null,
                additional_file_type: null,
                shipment_id: 170633,
                missing_pld_cost: 0,
                failed_pickup_cost: 0,
                address_correction: 0,
                overweight: 0,
            },
        ],
    };

    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = ShipmentDetailResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects responses where tracking_number is missing from the record', () => {
        const broken = { data: [{ id: 1, status_id: 1 }] };
        const result = ShipmentDetailResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = {
            data: [
                {
                    id: 1,
                    tracking_number: 'X',
                    status_id: 1,
                    new_backend_field_added_next_quarter: 'hello',
                    another_new_field: 42,
                },
            ],
        };
        const result = ShipmentDetailResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty data array', () => {
        const result = ShipmentDetailResponseSchema.safeParse({ data: [] });
        expect(result.success).toBe(true);
    });

    it('accepts nullable folio', () => {
        const fixture = { data: [{ id: 1, tracking_number: 'X', status_id: 1, folio: null }] };
        const result = ShipmentDetailResponseSchema.safeParse(fixture);
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            ShipmentDetailResponseSchema.safeParse(liveFixture);
        }
        const elapsed = performance.now() - start;
        const avgMs = elapsed / ITERATIONS;
        expect(avgMs).toBeLessThan(5);
    });
});

// ---------------------------------------------------------------------------
// ShipmentListResponseSchema — tool #2 (envia_list_shipments)
// ---------------------------------------------------------------------------

describe('ShipmentListResponseSchema', () => {
    // Captured live 2026-04-28: GET /shipments?limit=1&page=1
    const liveFixture = {
        data: [
            {
                id: 170661,
                tracking_number: 'UAT600055094321',
                overcharge_applied: 0,
                status_id: 1,
                folio: 'MX4AF91A0EDF4649D1',
                zone: 3,
                reverse_pickup: 0,
                custom_key: 0,
                utc_created_at: '2026-04-28 18:13:53',
                created_at: '2026-04-28 12:13:53',
                shipped_at: null,
                appointment_date: null,
                pickup_date: null,
                delivered_at: null,
                delivered_at_origin_at: null,
                estimated_delivery: '2026-05-11 20:00:00',
                signed_by: null,
                information_detail: null,
                shipment_real_weight: null,
                shipment_weight: 4.36,
                currency: 'EUR',
                insurance: 0,
                insurance_cost: 0,
                extended_zone: 0,
                additional_services_cost: 66.3,
                additional_charges_cost: 0,
                import_fee: 0,
                import_tax: 0,
                cash_on_delivery_cost: 0,
                cash_on_delivery_amount: 0,
                custom_key_cost: 0,
                sms_cost: 0,
                whatsapp_cost: 0.05,
                additional_tax: 0,
                tax: 1.15,
                cost: 10.91,
                total: 12.05,
                grand_total: 78.4,
                canceled: 0,
                canceled_at: null,
                balance_returned: 0,
                security_deposit: 0,
                security_weight: 4.36,
                balance_returned_at: null,
                carrier_id: 134,
                service_id: 404,
                service: 'door_to_door',
                service_description: 'jtexpress Door to Door',
                shipment_type_id: 1,
                international: 0,
                international_documents: 0,
                evidence_file: null,
                bol_file: null,
                pod_file: null,
                label_file: 'https://s3.us-east-2.amazonaws.com/envia-staging/uploads/jtexpress/example.pdf',
                name: 'jtexpress',
                carrier_description: 'jtexpress',
                shipment_type: 'box',
                shipment_type_description: 'Box',
                sender_name: '#1234 - Manuel Almex',
                sender_company_name: 'Sin Contexto',
                sender_email: 'test@envia.com',
                sender_phone: '8527419638',
                sender_street: 'Sample 1',
                sender_number: '111',
                sender_interior_number: null,
                sender_district: 'Arcos del Sol',
                sender_city: 'Monterrey',
                sender_state: 'NL',
                sender_country: 'MX',
                sender_postalcode: '64102',
                sender_identification_number: null,
                sender_references: '111',
                sender_branch: 0,
                consignee_name: 'UGJ TEST',
                consignee_company_name: 'TESTUGJ',
                consignee_email: 'noreply@envia.com',
                consignee_phone: '23123123',
                consignee_street: 'FAV TEST',
                consignee_number: '22',
                consignee_interior_number: null,
                consignee_district: 'Americana',
                consignee_city: 'Guadalajara',
                consignee_state: 'JA',
                consignee_country: 'MX',
                consignee_postalcode: '44100',
                consignee_identification_number: null,
                consignee_references: null,
                consignee_branch: 0,
                return_name: '#1234 - Manuel Almex',
                return_company_name: 'Sin Contexto',
                return_email: 'test@envia.com',
                return_phone: '8527419638',
                return_street: 'Sample 1',
                return_number: '111',
                return_district: 'Arcos del Sol',
                return_city: 'Monterrey',
                return_state: 'NL',
                return_country: 'MX',
                return_postalcode: '64102',
                return_identification_number: null,
                return_references: '111',
                created_by_id: 241,
                created_by_name: 'Test User',
                created_by_email: 'test@envia.com',
                cancelled_by_name: null,
                additional_file: 'UAT60005509432125469f0f8e136c46_0.pdf',
                additional_file_type: 'insurance_voucher',
                action_id: 5,
                ticket_id: null,
                ticket_type_id: null,
                ticket_status_id: null,
                ticket_type_name: null,
                order_id: null,
                order_row_id: null,
                order_currency: null,
                generate_order_id: null,
                shop: null,
                ecommerce: null,
                draft_order_reference: null,
                order_identifier: null,
                carrier_logo: 'https://s3.us-east-2.amazonaws.com/envia-staging/uploads/logos/carriers/jtexpress.png',
                total_declared_value: 3000,
                comment: null,
                last_event_location: null,
                last_event_datetime: null,
                last_event_description: null,
                cod_translation_tag: null,
                cod_color: null,
                pod_confirmation_date: null,
                pod_confirmation_value: null,
                ecommerce_description: null,
                status: 'Created',
                status_parent_id: 1,
                status_translation_tag: 'shipments.status.1',
                class_name: 'secondary',
                packages: [
                    {
                        id: '184561',
                        tracking_number: 'UAT600055094321',
                        status_id: 1,
                        status: 'Created',
                        status_parent_id: 1,
                        status_translation_tag: 'shipments.status.1',
                        class_name: 'secondary',
                        type: 'box',
                        contet: 'Jabones',
                        length: '27.94',
                        width: '27.94',
                        height: '27.94',
                        weight: '4.36',
                        weight_unit_code: 'KG',
                        length_unit_code: 'CM',
                    },
                ],
                additional_services: [
                    {
                        additional_service_id: 125,
                        packageId: null,
                        additionalService: 'envia_insurance',
                        translationTag: 'createLabel.shippingInfo.enviaInsurance',
                        commission: 60,
                        taxes: 12.6,
                        cost: 72.6,
                        value: 6000,
                    },
                ],
                products: [],
            },
        ],
        total: 25,
        total_incidents: 3,
        total_reported: 1,
        total_completed: 5,
    };

    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = ShipmentListResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects a record where tracking_number is missing', () => {
        const broken = { data: [{ id: 1, status_id: 1 }] };
        const result = ShipmentListResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = {
            data: [{ id: 1, tracking_number: 'X', status_id: 1, brand_new_api_field: true }],
            total: 1,
        };
        const result = ShipmentListResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty data array', () => {
        const result = ShipmentListResponseSchema.safeParse({ data: [] });
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            ShipmentListResponseSchema.safeParse(liveFixture);
        }
        const elapsed = performance.now() - start;
        expect(elapsed / ITERATIONS).toBeLessThan(5);
    });
});

// ---------------------------------------------------------------------------
// ShipmentStatusStatsSchema — tool #3 (envia_get_shipments_status)
// ---------------------------------------------------------------------------

describe('ShipmentStatusStatsSchema', () => {
    // Captured live 2026-04-28: GET /shipments/packages-information-by-status
    const liveFixture = {
        packagesPendingShip: 194,
        packagesPendingPickUp: 0,
        packagesPickup: 0,
        percentagePickup: '0.00%',
        packagesShipped: 1,
        percentageShipped: '7.14%',
        packagesOutForDelivery: 0,
        percentageOutForDelivery: '0.00%',
        packagesDeliveryFilter: 5,
        percentagePackagesDeliveryFilter: '35.71%',
        packagesActiveAndDeliveryFilter: 14,
        packagesIssue: 7,
        percentageIssue: '50.00%',
        packagesReturned: 1,
        percentageReturned: '7.14%',
        dateFromMiddleware: '2026-01-01',
        dateTo: '2026-04-28',
    };

    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = ShipmentStatusStatsSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects if percentagePickup is a number instead of string', () => {
        // Guard against regression where backend might change % from string to number
        const broken = { ...liveFixture, percentagePickup: 0 };
        const result = ShipmentStatusStatsSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { ...liveFixture, new_field_from_backend: 'hello' };
        const result = ShipmentStatusStatsSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty object (all fields optional)', () => {
        const result = ShipmentStatusStatsSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            ShipmentStatusStatsSchema.safeParse(liveFixture);
        }
        const elapsed = performance.now() - start;
        expect(elapsed / ITERATIONS).toBeLessThan(5);
    });
});

// ---------------------------------------------------------------------------
// InvoiceListResponseSchema — tool #4 (envia_get_shipment_invoices)
// ---------------------------------------------------------------------------

describe('InvoiceListResponseSchema', () => {
    // Captured live 2026-04-28: GET /shipments/invoices?limit=2&page=1
    const liveFixture = {
        recordsTotal: 5,
        recordsFiltered: 5,
        data: [
            {
                id: 70615,
                month: 10,
                year: 2024,
                total: 85.4,
                invoice_id: null,
                invoice_url: null,
                invoice_type_amount: 'total',
                total_shipments: 9,
                invoiced_by: null,
                status: 'No Invoiced',
                tax_intermediacio_total: 22.56,
            },
        ],
    };

    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = InvoiceListResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects a record where id is missing', () => {
        const broken = { recordsTotal: 1, recordsFiltered: 1, data: [{ month: 1 }] };
        const result = InvoiceListResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = {
            ...liveFixture,
            data: [{ ...liveFixture.data[0], new_billing_field: 'test' }],
        };
        const result = InvoiceListResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty data array', () => {
        const result = InvoiceListResponseSchema.safeParse({ recordsTotal: 0, recordsFiltered: 0, data: [] });
        expect(result.success).toBe(true);
    });
});
