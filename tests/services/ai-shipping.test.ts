/**
 * Unit tests for AI shipping service helpers.
 */

import { describe, it, expect } from 'vitest';
import { summariseRateResult, formatRateSummaries } from '../../src/services/ai-shipping.js';
import type { AiRateCarrierResult, RateSummary } from '../../src/types/ai-shipping.js';

describe('summariseRateResult', () => {
    it('should return null when the carrier call failed at transport level', () => {
        const result: AiRateCarrierResult = { carrier: 'dhl', ok: false, data: {} };

        expect(summariseRateResult(result)).toBeNull();
    });

    it('should return null when backend flagged a business-level error', () => {
        const result: AiRateCarrierResult = {
            carrier: 'dhl',
            ok: true,
            data: { meta: 'error', error: { code: 1300, description: 'Invalid Option', message: 'Coverage not available' } },
        };

        expect(summariseRateResult(result)).toBeNull();
    });

    it('should extract totalPrice, currency and service from a successful payload', () => {
        const result: AiRateCarrierResult = {
            carrier: 'fedex',
            ok: true,
            data: {
                meta: 'rate',
                data: { totalPrice: 250.75, currency: 'MXN', service: 'ground' },
            },
        };

        const summary = summariseRateResult(result);

        expect(summary).toEqual({
            carrier: 'fedex',
            service: 'ground',
            totalPrice: 250.75,
            currency: 'MXN',
            deliveryEstimate: undefined,
        });
    });

    it('should fall back to deliveryDate when deliveryEstimate is missing', () => {
        const result: AiRateCarrierResult = {
            carrier: 'ups',
            ok: true,
            data: {
                meta: 'rate',
                data: { totalPrice: 100, currency: 'USD', deliveryDate: '2026-04-20' },
            },
        };

        const summary = summariseRateResult(result);

        expect(summary?.deliveryEstimate).toBe('2026-04-20');
    });

    it('should return null when data.data is missing', () => {
        const result: AiRateCarrierResult = { carrier: 'fedex', ok: true, data: { meta: 'rate' } };

        expect(summariseRateResult(result)).toBeNull();
    });
});

describe('formatRateSummaries', () => {
    it('should return a no-results message for an empty list', () => {
        expect(formatRateSummaries([])).toBe('No carriers returned a valid rate for this route.');
    });

    it('should sort summaries by price ascending', () => {
        const input: RateSummary[] = [
            { carrier: 'fedex', totalPrice: 200, currency: 'MXN' },
            { carrier: 'dhl', totalPrice: 150, currency: 'MXN' },
            { carrier: 'ups', totalPrice: 180, currency: 'MXN' },
        ];

        const output = formatRateSummaries(input);
        const dhlIndex = output.indexOf('dhl');
        const upsIndex = output.indexOf('ups');
        const fedexIndex = output.indexOf('fedex');

        expect(dhlIndex).toBeLessThan(upsIndex);
        expect(upsIndex).toBeLessThan(fedexIndex);
    });

    it('should move summaries with unknown price to the bottom', () => {
        const input: RateSummary[] = [
            { carrier: 'no-price' },
            { carrier: 'fedex', totalPrice: 100 },
        ];

        const output = formatRateSummaries(input);

        expect(output.indexOf('fedex')).toBeLessThan(output.indexOf('no-price'));
    });

    it('should truncate to 10 results', () => {
        const many: RateSummary[] = Array.from({ length: 15 }, (_, i) => ({
            carrier: `c${i}`,
            totalPrice: i,
            currency: 'MXN',
        }));

        const output = formatRateSummaries(many);

        expect(output).not.toContain('c14');
    });

    it('should include delivery estimate when provided', () => {
        const input: RateSummary[] = [
            { carrier: 'fedex', totalPrice: 100, currency: 'MXN', deliveryEstimate: '2 days' },
        ];

        const output = formatRateSummaries(input);

        expect(output).toContain('(2 days)');
    });

    it('should display "price unavailable" when totalPrice is missing', () => {
        const input: RateSummary[] = [{ carrier: 'fedex' }];

        const output = formatRateSummaries(input);

        expect(output).toContain('price unavailable');
    });
});
