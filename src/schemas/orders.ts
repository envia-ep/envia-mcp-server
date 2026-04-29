/**
 * Zod schemas for order-related API responses.
 *
 * Verified live 2026-04-28 against GET /v4/orders (queries service).
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md §5.2 for capture methodology.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const OrderShippingOptionSchema = z.object({
    endpoint: z.string().optional(),
    carrier_id: z.number().optional(),
    service_id: z.number().optional(),
    carrier_name: z.string().optional(),
    service_name: z.string().optional(),
});

const OrderCommentSchema = z.object({
    comment: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    created_by: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    updated_by: z.string().nullable().optional(),
});

const OrderCustomerSchema = z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
});

const OrderShopSchema = z.object({
    id: z.number().optional(),
    name: z.string().optional(),
});

const OrderEcommerceSchema = z.object({
    id: z.number().optional(),
    name: z.string().optional(),
});

const ShipmentInfoStatusSchema = z.object({
    id: z.number().nullable().optional(),
    name: z.string().nullable().optional(),
    class_name: z.string().nullable().optional(),
    dashboard_color: z.string().nullable().optional(),
    translation_tag: z.string().nullable().optional(),
    is_cancellable: z.unknown().nullable().optional(),
});

const PackageShipmentSchema = z.object({
    tracking_number: z.string().nullable().optional(),
    carrier: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
    additional_file: z.string().nullable().optional(),
    track_url: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    service_name: z.string().nullable().optional(),
    method: z.string().nullable().optional(),
    weight_total: z.number().nullable().optional(),
    estimate: z.string().nullable().optional(),
    total_cost: z.union([z.number(), z.string()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    fulfillment_id: z.number().nullable().optional(),
    shipment_id: z.number().nullable().optional(),
    fulfillment_method: z.string().nullable().optional(),
    shipment_method: z.string().nullable().optional(),
    info_status: ShipmentInfoStatusSchema.optional(),
});

const ProductDimensionsSchema = z.object({
    id: z.number().optional(),
    product_id: z.number().optional(),
    product_identifier: z.string().optional(),
    height: z.union([z.number(), z.string()]).optional(),
    length: z.union([z.number(), z.string()]).optional(),
    width: z.union([z.number(), z.string()]).optional(),
    weight: z.union([z.number(), z.string()]).optional(),
    length_unit: z.string().optional(),
    weight_unit: z.string().optional(),
});

const ProductLogisticSchema = z.object({
    logistic_mode: z.string().nullable().optional(),
    logistic_free: z.boolean().optional(),
    logistic_me1Suported: z.unknown().nullable().optional(),
    logistic_rates: z.unknown().nullable().optional(),
});

const OrderProductSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    ecart_id: z.union([z.string(), z.number()]).optional(),
    index: z.union([z.string(), z.number()]).optional(),
    order_product_id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    sku: z.string().nullable().optional(),
    variant: z.union([z.string(), z.number()]).optional(),
    price: z.union([z.number(), z.string()]).optional(),
    weight: z.union([z.number(), z.string()]).optional(),
    quantity: z.number().optional(),
    total_quantity: z.number().optional(),
    image_url: z.string().nullable().optional(),
    return_reason: z.string().nullable().optional(),
    harmonized_system_code: z.string().nullable().optional(),
    country_code_origin: z.string().nullable().optional(),
    barcode: z.string().nullable().optional(),
    dimensions: ProductDimensionsSchema.optional(),
    logistic: ProductLogisticSchema.optional(),
});

const PackageSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    tracking_number: z.string().nullable().optional(),
    shipment: PackageShipmentSchema.optional(),
    products: z.array(OrderProductSchema).optional(),
});

const OrderShippingAddressSchema = z.object({
    company: z.string().nullable().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    address_1: z.string().optional(),
    address_2: z.string().nullable().optional(),
    address_3: z.string().nullable().optional(),
    interior_number: z.string().nullable().optional(),
    country_code: z.string().optional(),
    state_code: z.string().optional(),
    city: z.string().optional(),
    city_select: z.string().nullable().optional(),
    postal_code: z.string().optional(),
    identification_number: z.string().nullable().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    reference: z.string().nullable().optional(),
    branch_code: z.string().nullable().optional(),
});

const OrderLocationSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    first_name: z.string().optional(),
    company: z.string().optional(),
    address_1: z.string().optional(),
    address_2: z.string().optional(),
    address_3: z.string().nullable().optional(),
    interior_number: z.string().nullable().optional(),
    country_code: z.string().optional(),
    state_code: z.string().optional(),
    city: z.string().optional(),
    city_select: z.string().nullable().optional(),
    postal_code: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    reference: z.string().optional(),
    packages: z.array(PackageSchema).optional(),
});

const OrderDataSchema = z.object({
    identifier: z.string().optional(),
    name: z.string().optional(),
    number: z.union([z.string(), z.number()]).optional(),
    total_price: z.union([z.number(), z.string()]).optional(),
    discount: z.union([z.number(), z.string()]).optional(),
    subtotal: z.union([z.number(), z.string()]).optional(),
    cod: z.union([z.number(), z.boolean()]).optional(),
    currency: z.string().optional(),
    partial_available: z.number().optional(),
    shipping_method: z.string().optional(),
    shipping_option_reference: z.string().nullable().optional(),
    shipping_options: z.array(OrderShippingOptionSchema).optional(),
    shipping_address_available: z.boolean().optional(),
    fraud_risk: z.number().optional(),
    cod_confirmation_status: z.unknown().nullable().optional(),
    pod_confirmation_date: z.string().nullable().optional(),
    pod_confirmation_value: z.string().nullable().optional(),
    shipping_rule_id: z.number().optional(),
});

const OrderShipmentDataSchema = z.object({
    shipping_address: OrderShippingAddressSchema.optional(),
    locations: z.array(OrderLocationSchema).optional(),
});

/**
 * A single order record from GET /v4/orders.
 * Verified live 2026-04-28.
 */
const OrderRecordSchema = z.object({
    id: z.number(),
    status_id: z.number().optional(),
    status_name: z.string().optional(),
    ecart_status_id: z.number().optional(),
    ecart_status_name: z.string().optional(),
    ecart_status_class: z.string().optional(),
    fulfillment_status_id: z.number().optional(),
    created_at_ecommerce: z.string().optional(),
    estimated_delivery_in: z.string().nullable().optional(),
    logistic: z.object({ mode: z.string().nullable().optional() }).optional(),
    order: OrderDataSchema.optional(),
    order_comment: OrderCommentSchema.optional(),
    customer: OrderCustomerSchema.optional(),
    shop: OrderShopSchema.optional(),
    ecommerce: OrderEcommerceSchema.optional(),
    shipment_data: OrderShipmentDataSchema.optional(),
    tags: z.array(z.unknown()).optional(),
    is_favorite: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Tool #10 — envia_list_orders
// Verified live 2026-04-28 against GET /v4/orders (queries service)
// ---------------------------------------------------------------------------

/**
 * Response from GET /v4/orders.
 * Structure: { orders_info: [...], countries: [...], totals: number }
 * Verified live 2026-04-28.
 */
export const OrderListResponseSchema = z.object({
    orders_info: z.array(OrderRecordSchema),
    countries: z.array(z.string()).optional(),
    totals: z.number().optional(),
});

export type OrderListResponseT = z.infer<typeof OrderListResponseSchema>;
