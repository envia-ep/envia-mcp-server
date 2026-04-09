/**
 * Tests for the additional service builder.
 *
 * Covers merging of explicit services, insurance shortcuts, and COD
 * convenience parameters into a unified AdditionalServiceEntry array.
 */

import { describe, it, expect } from 'vitest';
import { buildAdditionalServices } from '../../src/builders/additional-service.js';

describe('buildAdditionalServices', () => {
    it('should return empty array when no inputs are provided', () => {
        const result = buildAdditionalServices(undefined, undefined, undefined, undefined);

        expect(result).toEqual([]);
    });

    it('should pass through explicit additional services', () => {
        const result = buildAdditionalServices(
            [
                { service: 'adult_signature_required' },
                { service: 'proof_of_delivery' },
            ],
            undefined,
            undefined,
            undefined,
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ service: 'adult_signature_required' });
        expect(result[1]).toEqual({ service: 'proof_of_delivery' });
    });

    it('should include amount data when provided in explicit services', () => {
        const result = buildAdditionalServices(
            [{ service: 'envia_insurance', amount: 500 }],
            undefined,
            undefined,
            undefined,
        );

        expect(result[0]).toEqual({ service: 'envia_insurance', data: { amount: 500 } });
    });

    it('should omit data when amount is zero', () => {
        const result = buildAdditionalServices(
            [{ service: 'adult_signature_required', amount: 0 }],
            undefined,
            undefined,
            undefined,
        );

        expect(result[0]).toEqual({ service: 'adult_signature_required' });
    });

    it('should add insurance service from insurance_type shortcut', () => {
        const result = buildAdditionalServices(undefined, 'envia_insurance', 1000, undefined);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ service: 'envia_insurance', data: { amount: 1000 } });
    });

    it('should add insurance without amount when declared_value is zero', () => {
        const result = buildAdditionalServices(undefined, 'high_value_protection', 0, undefined);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ service: 'high_value_protection' });
    });

    it('should add cash_on_delivery from convenience parameter', () => {
        const result = buildAdditionalServices(undefined, undefined, undefined, 350);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ service: 'cash_on_delivery', data: { amount: 350 } });
    });

    it('should merge all three input sources without duplicates', () => {
        const result = buildAdditionalServices(
            [{ service: 'adult_signature_required' }],
            'envia_insurance',
            500,
            200,
        );

        expect(result).toHaveLength(3);
        expect(result.map((s) => s.service)).toEqual([
            'adult_signature_required',
            'envia_insurance',
            'cash_on_delivery',
        ]);
    });

    it('should not duplicate insurance when already in explicit services', () => {
        const result = buildAdditionalServices(
            [{ service: 'envia_insurance', amount: 800 }],
            'envia_insurance',
            500,
            undefined,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ service: 'envia_insurance', data: { amount: 800 } });
    });

    it('should not duplicate cash_on_delivery when already in explicit services', () => {
        const result = buildAdditionalServices(
            [{ service: 'cash_on_delivery', amount: 100 }],
            undefined,
            undefined,
            200,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ service: 'cash_on_delivery', data: { amount: 100 } });
    });

    it('should deduplicate explicit services with the same name', () => {
        const result = buildAdditionalServices(
            [
                { service: 'adult_signature_required' },
                { service: 'adult_signature_required' },
            ],
            undefined,
            undefined,
            undefined,
        );

        expect(result).toHaveLength(1);
    });

    it('should handle carrier insurance type for CO/BR', () => {
        const result = buildAdditionalServices(undefined, 'insurance', 2000, undefined);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ service: 'insurance', data: { amount: 2000 } });
    });
});
