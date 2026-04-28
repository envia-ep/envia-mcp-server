/**
 * Schema tests for src/schemas/shipping.ts
 *
 * Live fixtures captured 2026-04-28 from api-test.envia.com.
 * Tool #8 generate success shape not capturable in sandbox (requires full address payload);
 * error shape verified from live 400 response.
 */

import { describe, it, expect } from 'vitest';
import {
    QuoteShipmentResponseSchema,
    CreateShipmentResponseSchema,
    TrackPackageResponseSchema,
} from '../../src/schemas/shipping.js';

// ---------------------------------------------------------------------------
// QuoteShipmentResponseSchema — tool #7 (envia_quote_shipment)
// Captured live 2026-04-28: POST /ship/rate with carrier=dhl
// ---------------------------------------------------------------------------

describe('QuoteShipmentResponseSchema', () => {
    const liveFixture = {
        meta: 'rate',
        data: [
            {
                carrierId: 2,
                carrier: 'dhl',
                carrierDescription: 'DHL',
                serviceId: 6,
                service: 'ground',
                serviceDescription: 'DHL Economy ',
                dropOff: 0,
                branchType: null,
                zone: 3,
                deliveryEstimate: '2-4 días',
                deliveryDate: { date: '2026-04-29', dateDifference: 1, timeUnit: 'day', time: '23:59' },
                quantity: 1,
                basePrice: 9.43,
                basePriceTaxes: 1.98,
                extendedFare: 0,
                insurance: 0,
                additionalServices: 0,
                additionalServicesTaxes: 0,
                additionalCharges: 3.76,
                additionalChargesTaxes: 0.79,
                importFee: 0,
                customKeyCost: 0,
                taxes: 2.77,
                totalPrice: 16.01,
                currency: 'EUR',
                smsCost: 0,
                whatsappCost: 0.05,
                customKey: false,
                cashOnDeliveryCommission: 0,
                cashOnDeliveryAmount: 0,
                calculatedDeclaredValue: 0,
                isMps: false,
                shipmentTaxes: [],
                branches: [],
                costSummary: [
                    {
                        quantity: 1,
                        basePrice: 9.43,
                        basePriceTaxes: 1.98,
                        extendedFare: 0,
                        insurance: 0,
                        additionalServices: 0,
                        additionalServicesTaxes: 0,
                        additionalCharges: 3.76,
                        additionalChargesTaxes: 0.79,
                        taxes: 2.77,
                        totalPrice: 16.01,
                        costAdditionalServices: [],
                        costAdditionalCharges: [
                            {
                                id: 71,
                                addToInvoice: 1,
                                conceptId: 24,
                                additionalService: 'fuel',
                                translationTag: 'createLabel.shippingInfo.fuelSurcharge',
                                amount: 1,
                                commission: 1.34,
                                taxes: 0.28,
                                cost: 1.62,
                                value: 0,
                            },
                        ],
                    },
                ],
            },
        ],
    };

    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = QuoteShipmentResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('parses error response shape (meta=error)', () => {
        const errorFixture = {
            meta: 'error',
            error: { code: 1101, description: 'Invalid Option', message: 'Carrier not supported.' },
        };
        const result = QuoteShipmentResponseSchema.safeParse(errorFixture);
        expect(result.success).toBe(true);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { ...liveFixture, new_field: 'hello' };
        const result = QuoteShipmentResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty data array', () => {
        const result = QuoteShipmentResponseSchema.safeParse({ meta: 'rate', data: [] });
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            QuoteShipmentResponseSchema.safeParse(liveFixture);
        }
        expect((performance.now() - start) / ITERATIONS).toBeLessThan(5);
    });
});

// ---------------------------------------------------------------------------
// CreateShipmentResponseSchema — tool #8 (envia_create_shipment)
// Success shape derived from LabelData interface (sandbox requires full generate).
// Error shape verified live 2026-04-28 (400 with meta=error).
// ---------------------------------------------------------------------------

describe('CreateShipmentResponseSchema', () => {
    it('parses error shape (live 2026-04-28: POST /ship/generate 400)', () => {
        const errorFixture = {
            meta: 'error',
            error: { code: 400, description: 'Invalid Option', message: 'Required property missing: settings' },
        };
        const result = CreateShipmentResponseSchema.safeParse(errorFixture);
        expect(result.success).toBe(true);
    });

    it('parses success shape (synthetic — verify against live production)', () => {
        const successFixture = {
            meta: 'generate',
            data: [
                {
                    carrier: 'dhl',
                    service: 'express',
                    shipmentId: 170633,
                    trackingNumber: '9824510570',
                    trackUrl: 'https://test.envia.com/rastreo?label=9824510570',
                    label: 'https://s3.us-east-2.amazonaws.com/envia-staging/uploads/dhl/example.pdf',
                    totalPrice: 14.28,
                    currency: 'EUR',
                },
            ],
        };
        const result = CreateShipmentResponseSchema.safeParse(successFixture);
        expect(result.success).toBe(true);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { meta: 'generate', data: [], new_backend_field: 'hello' };
        const result = CreateShipmentResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const fixture = {
            meta: 'generate',
            data: [{ carrier: 'dhl', service: 'express', trackingNumber: '9824510570', label: 'https://example.com/label.pdf' }],
        };
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            CreateShipmentResponseSchema.safeParse(fixture);
        }
        expect((performance.now() - start) / ITERATIONS).toBeLessThan(5);
    });
});

// ---------------------------------------------------------------------------
// TrackPackageResponseSchema — tool #9 (envia_track_package)
// Captured live 2026-04-28: POST /ship/generaltrack/ with 9824510570
// ---------------------------------------------------------------------------

describe('TrackPackageResponseSchema', () => {
    const liveFixture = {
        meta: 'generaltrack',
        data: [
            {
                company: 'Fedma CO',
                companyId: 254,
                carrier: 'dhl',
                carrierId: 2,
                carrierDescription: 'DHL',
                service: 'express',
                serviceDescription: 'Dhl Express',
                country: 'MX',
                localeId: 1,
                shipmentId: 170633,
                trackingNumber: '9824510570',
                folio: null,
                cashOnDelivery: false,
                accountShipment: 'TENDENCYS',
                trackUrl: 'https://test.envia.com/rastreo?label=9824510570',
                trackUrlSite: 'http://www.dhl.com/en/express/tracking.html?AWB=9824510570',
                status: 'Canceled',
                statusColor: '#dc3545',
                estimatedDelivery: '2026-04-28 23:59:00',
                pickupDate: null,
                shippedAt: null,
                deliveredAt: null,
                signedBy: null,
                informationDetail: null,
                createdAt: '2026-04-27 17:29:42',
                destination: {
                    name: 'Cliente Test',
                    company: '-',
                    email: 'cliente@test.com',
                    phone: '3312345678',
                    street: 'Vallarta',
                    number: '100',
                    district: 'Americana',
                    city: 'Guadalajara',
                    state: 'JAL',
                    country: 'MX',
                    postalCode: '44100',
                    branchInfo: null,
                },
                content: {
                    tracking_number: '9824510570',
                    status_parent_id: 5,
                    parentStatusBackgroundColor: '#F44336',
                    parentStatusTextColor: '#F44336',
                    status_translation_tag: 'shipments.status.4',
                    class_name: 'danger',
                    status: 'Canceled',
                    content: 'General merchandise',
                    type: 'box',
                    length: 20,
                    width: 15,
                    height: 10,
                    weight: 2,
                    totalWeight: 2,
                    weightUnit: 'KG',
                    lengthUnit: 'CM',
                    originalRequest: true,
                },
                eventHistory: [],
                companyInfo: { name: 'Fedma CO', color: null, logo: null },
                additionalFolios: [],
                podFile: null,
                podEvidences: [],
                packages: [],
                parentTrackingNumber: '9824510570',
            },
        ],
    };

    it('parses the live 2026-04-28 sandbox shape', () => {
        const result = TrackPackageResponseSchema.safeParse(liveFixture);
        expect(result.success).toBe(true);
    });

    it('rejects when meta is missing', () => {
        const broken = { data: liveFixture.data };
        const result = TrackPackageResponseSchema.safeParse(broken);
        expect(result.success).toBe(false);
    });

    it('accepts extra fields not in the schema (passthrough mode)', () => {
        const withExtras = { ...liveFixture, new_field: 'hello' };
        const result = TrackPackageResponseSchema.safeParse(withExtras);
        expect(result.success).toBe(true);
    });

    it('accepts empty eventHistory array', () => {
        const withEmpty = { ...liveFixture };
        const result = TrackPackageResponseSchema.safeParse(withEmpty);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.data[0].eventHistory).toHaveLength(0);
        }
    });

    it('accepts nullable deliveredAt', () => {
        const fixture = {
            meta: 'generaltrack',
            data: [{ trackingNumber: 'X', status: 'Delivered', deliveredAt: null }],
        };
        const result = TrackPackageResponseSchema.safeParse(fixture);
        expect(result.success).toBe(true);
    });

    it('parses a representative payload in under 5ms (p95 ceiling)', () => {
        const ITERATIONS = 1000;
        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            TrackPackageResponseSchema.safeParse(liveFixture);
        }
        expect((performance.now() - start) / ITERATIONS).toBeLessThan(5);
    });
});
