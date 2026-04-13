/**
 * Additional Service Builder
 *
 * Merges the convenience parameters (insurance_type, cash_on_delivery_amount)
 * with an explicit additional_services array into a single unified list of
 * AdditionalServiceEntry objects ready for the carriers API payload.
 *
 * Shared by quote_shipment and create_shipment.
 */

import type { AdditionalServiceEntry, InsuranceServiceType } from '../types/carriers-api.js';

/** Raw input shape from tool schemas for individual additional service entries. */
interface RawAdditionalServiceInput {
    service: string;
    amount?: number;
}

/**
 * Build a unified additionalServices array from tool parameters.
 *
 * Merges explicit `additional_services` entries with the convenience
 * shortcuts `insurance_type` and `cash_on_delivery_amount`, avoiding
 * duplicates. Service names are trimmed and lowercased before deduplication
 * and payload output so that whitespace variants and mixed-case inputs are
 * treated as the same service.
 *
 * @param rawServices         - Explicit additional service entries from tool input
 * @param insuranceType       - Insurance convenience shortcut
 * @param declaredValue       - Declared value (used as insurance amount)
 * @param cashOnDeliveryAmount - COD convenience shortcut amount
 * @returns Merged array of AdditionalServiceEntry
 */
export function buildAdditionalServices(
    rawServices: RawAdditionalServiceInput[] | undefined,
    insuranceType: InsuranceServiceType | undefined,
    declaredValue: number | undefined,
    cashOnDeliveryAmount: number | undefined,
): AdditionalServiceEntry[] {
    const services: AdditionalServiceEntry[] = [];
    const seen = new Set<string>();

    if (rawServices) {
        for (const raw of rawServices) {
            const name = raw.service.trim().toLowerCase();
            if (!name || seen.has(name)) continue;
            seen.add(name);

            const entry: AdditionalServiceEntry = { service: name };
            if (raw.amount != null && raw.amount > 0) {
                entry.data = { amount: raw.amount };
            }
            services.push(entry);
        }
    }

    if (insuranceType && !seen.has(insuranceType)) {
        seen.add(insuranceType);
        const amount = declaredValue != null && declaredValue > 0 ? declaredValue : undefined;
        const entry: AdditionalServiceEntry = { service: insuranceType };
        if (amount) {
            entry.data = { amount };
        }
        services.push(entry);
    }

    if (cashOnDeliveryAmount != null && cashOnDeliveryAmount > 0 && !seen.has('cash_on_delivery')) {
        services.push({
            service: 'cash_on_delivery',
            data: { amount: cashOnDeliveryAmount },
        });
    }

    return services;
}
