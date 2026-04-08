/**
 * Ecommerce Section Builder
 *
 * Constructs the ecommerce metadata block for label generation
 * payloads (POST /ship/generate) when creating labels from
 * ecommerce platform orders.
 */

import type { EcommerceSection } from '../types/carriers-api.js';
import type { V4Order } from '../types/ecommerce-order.js';

/**
 * Build the ecommerce metadata block for a generate payload.
 *
 * This section links the generated label to its source ecommerce order
 * for tracking, fulfillment, and reconciliation.
 *
 * @param order - V4 order from the Queries API
 * @returns Ecommerce section for the generate payload
 */
export function buildEcommerceSection(order: V4Order): EcommerceSection {
    return {
        shop_id: order.shop.id,
        order_id: order.id,
        order_identifier: order.order.identifier,
        order_name: order.order.name,
        order_number: order.order.number,
        type_generate: 'multi_generate',
    };
}
