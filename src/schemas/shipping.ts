/**
 * Zod schemas for shipping API responses (rate, generate, track).
 *
 * All schemas verified live 2026-04-28 against api-test.envia.com.
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.2 for capture methodology.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const DeliveryDateSchema = z.object({
    date: z.string().optional(),
    dateDifference: z.number().optional(),
    timeUnit: z.string().optional(),
    time: z.string().optional(),
});

const CostAdditionalChargeSchema = z.object({
    id: z.number().optional(),
    addToInvoice: z.number().optional(),
    conceptId: z.number().optional(),
    additionalService: z.string().optional(),
    translationTag: z.string().optional(),
    amount: z.number().optional(),
    commission: z.union([z.number(), z.string()]).optional(),
    taxes: z.union([z.number(), z.string()]).optional(),
    cost: z.union([z.number(), z.string()]).optional(),
    value: z.union([z.number(), z.string()]).optional(),
});

const CostSummaryItemSchema = z.object({
    quantity: z.number().optional(),
    basePrice: z.union([z.number(), z.string()]).optional(),
    basePriceTaxes: z.union([z.number(), z.string()]).optional(),
    extendedFare: z.union([z.number(), z.string()]).optional(),
    insurance: z.union([z.number(), z.string()]).optional(),
    additionalServices: z.union([z.number(), z.string()]).optional(),
    additionalServicesTaxes: z.union([z.number(), z.string()]).optional(),
    additionalCharges: z.union([z.number(), z.string()]).optional(),
    additionalChargesTaxes: z.union([z.number(), z.string()]).optional(),
    taxes: z.union([z.number(), z.string()]).optional(),
    totalPrice: z.union([z.number(), z.string()]).optional(),
    costAdditionalServices: z.array(z.unknown()).optional(),
    costAdditionalCharges: z.array(CostAdditionalChargeSchema).optional(),
});

// ---------------------------------------------------------------------------
// Tool #7 — envia_quote_shipment
// Verified live 2026-04-28 against POST /ship/rate (carriers service)
// Response: { meta: 'rate', data: [...] }
// ---------------------------------------------------------------------------

const RateItemSchema = z.object({
    carrierId: z.number().optional(),
    carrier: z.string().optional(),
    carrierDescription: z.string().optional(),
    serviceId: z.number().optional(),
    service: z.string().optional(),
    serviceDescription: z.string().optional(),
    dropOff: z.number().optional(),
    branchType: z.string().nullable().optional(),
    zone: z.number().optional(),
    deliveryEstimate: z.string().optional(),
    deliveryDate: DeliveryDateSchema.optional(),
    quantity: z.number().optional(),
    basePrice: z.union([z.number(), z.string()]).optional(),
    basePriceTaxes: z.union([z.number(), z.string()]).optional(),
    extendedFare: z.union([z.number(), z.string()]).optional(),
    insurance: z.union([z.number(), z.string()]).optional(),
    additionalServices: z.union([z.number(), z.string()]).optional(),
    additionalServicesTaxes: z.union([z.number(), z.string()]).optional(),
    additionalCharges: z.union([z.number(), z.string()]).optional(),
    additionalChargesTaxes: z.union([z.number(), z.string()]).optional(),
    importFee: z.union([z.number(), z.string()]).optional(),
    customKeyCost: z.union([z.number(), z.string()]).optional(),
    taxes: z.union([z.number(), z.string()]).optional(),
    totalPrice: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    smsCost: z.union([z.number(), z.string()]).optional(),
    whatsappCost: z.union([z.number(), z.string()]).optional(),
    customKey: z.boolean().optional(),
    cashOnDeliveryCommission: z.union([z.number(), z.string()]).optional(),
    cashOnDeliveryAmount: z.union([z.number(), z.string()]).optional(),
    calculatedDeclaredValue: z.union([z.number(), z.string()]).optional(),
    isMps: z.boolean().optional(),
    shipmentTaxes: z.array(z.unknown()).optional(),
    branches: z.array(z.unknown()).optional(),
    costSummary: z.array(CostSummaryItemSchema).optional(),
});

/**
 * Response from POST /ship/rate.
 * Success: { meta: 'rate', data: [...] }
 * Error: { meta: 'error', error: { code, description, message } }
 * Verified live 2026-04-28.
 * Live: 'rate' on success, 'error' on carrier rejection. Always present.
 */
export const QuoteShipmentResponseSchema = z.object({
    meta: z.string(),
    data: z.array(RateItemSchema).optional(),
    /** Error can be an object or string depending on carrier. */
    error: z.union([
        z.string(),
        z.object({
            code: z.number().optional(),
            description: z.string().optional(),
            message: z.string().optional(),
        }),
    ]).optional(),
    /** Top-level message field for non-standard carrier error responses. */
    message: z.string().optional(),
});

export type QuoteShipmentResponseT = z.infer<typeof QuoteShipmentResponseSchema>;

// ---------------------------------------------------------------------------
// Tool #8 — envia_create_shipment
// Verified live 2026-04-28 against POST /ship/generate (carriers service)
// Success: { meta: 'generate', data: [LabelData] }
// Error: { meta: 'error', error: { code, description, message } }
//
// NOTE: Error responses are typically caught by res.ok = false BEFORE calling
// parseToolResponse. The schema covers the success shape. The error union
// exists for the rare case where HTTP 200 contains { meta: 'error' }.
// ---------------------------------------------------------------------------

const LabelDataSchema = z.object({
    carrier: z.string().optional(),
    service: z.string().optional(),
    shipmentId: z.number().optional(),
    trackingNumber: z.string().optional(),
    trackingNumbers: z.array(z.string()).optional(),
    trackUrl: z.string().optional(),
    label: z.string().optional(),
    totalPrice: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
});

/**
 * Response from POST /ship/generate.
 * Success: { meta: 'generate'|string, data: [LabelData] }
 * Error (HTTP 200 with error body): { meta: 'error', error: {...} }
 * Verified live 2026-04-28 (error shape only — success requires a full generate).
 */
export const CreateShipmentResponseSchema = z.object({
    meta: z.string().optional(),
    data: z.array(LabelDataSchema).optional(),
    error: z.object({
        code: z.union([z.number(), z.string()]).optional(),
        description: z.string().optional(),
        message: z.string().optional(),
    }).optional(),
});

export type CreateShipmentResponseT = z.infer<typeof CreateShipmentResponseSchema>;

// ---------------------------------------------------------------------------
// Tool #9 — envia_track_package
// Verified live 2026-04-28 against POST /ship/generaltrack/ (carriers service)
// Response: { meta: 'generaltrack', data: [...] }
// ---------------------------------------------------------------------------

const TrackEventSchema = z.object({
    timestamp: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
});

const TrackAddressSchema = z.object({
    name: z.string().optional(),
    company: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    branchInfo: z.unknown().nullable().optional(),
});

const TrackPackageContentSchema = z.object({
    tracking_number: z.string().optional(),
    status_parent_id: z.number().optional(),
    parentStatusBackgroundColor: z.string().optional(),
    parentStatusTextColor: z.string().optional(),
    status_translation_tag: z.string().optional(),
    class_name: z.string().optional(),
    status: z.string().optional(),
    content: z.string().optional(),
    type: z.string().optional(),
    length: z.union([z.number(), z.string()]).optional(),
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    weight: z.union([z.number(), z.string()]).optional(),
    totalWeight: z.union([z.number(), z.string()]).optional(),
    weightUnit: z.string().optional(),
    lengthUnit: z.string().optional(),
    originalRequest: z.boolean().optional(),
});

const TrackDataSchema = z.object({
    company: z.string().optional(),
    companyId: z.number().optional(),
    carrier: z.string().optional(),
    carrierId: z.number().optional(),
    carrierDescription: z.string().optional(),
    service: z.string().optional(),
    serviceDescription: z.string().optional(),
    country: z.string().optional(),
    localeId: z.number().optional(),
    shipmentId: z.number().optional(),
    trackingNumber: z.string().optional(),
    folio: z.string().nullable().optional(),
    cashOnDelivery: z.boolean().optional(),
    accountShipment: z.string().optional(),
    trackUrl: z.string().optional(),
    trackUrlSite: z.string().optional(),
    status: z.string().optional(),
    statusColor: z.string().optional(),
    estimatedDelivery: z.string().nullable().optional(),
    pickupDate: z.string().nullable().optional(),
    shippedAt: z.string().nullable().optional(),
    deliveredAt: z.string().nullable().optional(),
    signedBy: z.string().nullable().optional(),
    informationDetail: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    destination: TrackAddressSchema.optional(),
    content: TrackPackageContentSchema.optional(),
    /** Event history — typically empty for cancelled shipments. */
    eventHistory: z.array(TrackEventSchema).optional(),
    companyInfo: z.object({
        name: z.string().optional(),
        color: z.string().nullable().optional(),
        logo: z.string().nullable().optional(),
    }).optional(),
    additionalFolios: z.array(z.unknown()).optional(),
    podFile: z.string().nullable().optional(),
    podEvidences: z.array(z.unknown()).optional(),
    packages: z.array(TrackPackageContentSchema).optional(),
    parentTrackingNumber: z.string().optional(),
});

/**
 * Response from POST /ship/generaltrack/.
 * Verified live 2026-04-28 against tracking number 9824510570.
 */
export const TrackPackageResponseSchema = z.object({
    meta: z.string(),
    data: z.array(TrackDataSchema),
});

export type TrackPackageResponseT = z.infer<typeof TrackPackageResponseSchema>;
