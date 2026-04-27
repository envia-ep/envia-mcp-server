/**
 * Tests for the tax-rules service.
 */

import { describe, it, expect } from 'vitest';
import { shouldApplyTaxes, isIntraEU } from '../../src/services/tax-rules.js';

describe('shouldApplyTaxes', () => {
    it('should return true for same country MX→MX', () => {
        expect(shouldApplyTaxes('MX', 'NL', 'MX', 'JAL')).toBe(true);
    });

    it('should return true for same country BR→BR', () => {
        expect(shouldApplyTaxes('BR', 'SP', 'BR', 'RJ')).toBe(true);
    });

    it('should return true for same country ES→ES (mainland)', () => {
        expect(shouldApplyTaxes('ES', 'M', 'ES', 'B')).toBe(true);
    });

    it('should return true for US→PR (combined territory, treated as domestic)', () => {
        expect(shouldApplyTaxes('US', 'CA', 'PR', '00')).toBe(true);
    });

    it('should return true for PR→US (combined territory, treated as domestic)', () => {
        expect(shouldApplyTaxes('PR', '00', 'US', 'NY')).toBe(true);
    });

    it('should return true for PR→PR (same combined territory)', () => {
        expect(shouldApplyTaxes('PR', '00', 'PR', '01')).toBe(true);
    });

    it('should return false for ES mainland→Canarias (state CN, HASC)', () => {
        // Aligned 2026-04-27 with geocodes excStates source-of-truth.
        // Postal-code-prefix variants (state="35" / "38") are no longer
        // recognised here — Canarias is detected via the country
        // override `IC` in geocodes-helpers, not via state membership.
        expect(shouldApplyTaxes('ES', 'M', 'ES', 'CN')).toBe(false);
    });

    it('should return false for ES mainland→Canarias (state TF, Tenerife)', () => {
        expect(shouldApplyTaxes('ES', 'B', 'ES', 'TF')).toBe(false);
    });

    it('should return false for ES Canarias (Gran Canaria HASC)→mainland', () => {
        expect(shouldApplyTaxes('ES', 'GC', 'ES', 'M')).toBe(false);
    });

    it('should return false for ES mainland→Ceuta (ES-CE, exceptional territory)', () => {
        expect(shouldApplyTaxes('ES', 'M', 'ES', 'CE')).toBe(false);
    });

    it('should return false for ES mainland→Melilla (ES-ML, exceptional territory)', () => {
        expect(shouldApplyTaxes('ES', 'M', 'ES', 'ML')).toBe(false);
    });

    it('should return true for ES with state="35" — postal-prefix not a state code in geocodes', () => {
        // Defensive: this asserts the 2026-04-27 drift fix removed the
        // ad-hoc ES-35 / ES-38 entries that did not exist in geocodes
        // excStates. Canarias detection is now via country override
        // (applyCanaryIslandsOverride), not via state membership.
        expect(shouldApplyTaxes('ES', 'M', 'ES', '35')).toBe(true);
    });

    it('should return false for FR→French Guiana (state GF)', () => {
        expect(shouldApplyTaxes('FR', '75', 'FR', 'GF')).toBe(false);
    });

    it('should return false for FR→Martinique (state MQ)', () => {
        expect(shouldApplyTaxes('FR', '75', 'FR', 'MQ')).toBe(false);
    });

    it('should return false for PT→Azores (state 20)', () => {
        expect(shouldApplyTaxes('PT', '01', 'PT', '20')).toBe(false);
    });

    it('should return false for PT→Madeira (state 30)', () => {
        expect(shouldApplyTaxes('PT', '01', 'PT', '30')).toBe(false);
    });

    it('should return false for NL→SX', () => {
        expect(shouldApplyTaxes('NL', 'NH', 'NL', 'SX')).toBe(false);
    });

    it('should return true for different countries both EU (ES→FR)', () => {
        expect(shouldApplyTaxes('ES', 'M', 'FR', '75')).toBe(true);
    });

    it('should return false for different countries one EU (ES→US is international)', () => {
        expect(shouldApplyTaxes('ES', 'M', 'US', 'CA')).toBe(false);
    });

    it('should return false for different countries neither EU (MX→CO is international)', () => {
        expect(shouldApplyTaxes('MX', 'NL', 'CO', 'DC')).toBe(false);
    });

    it('should handle case-insensitive input', () => {
        expect(shouldApplyTaxes('mx', 'nl', 'mx', 'jal')).toBe(true);
        expect(shouldApplyTaxes('us', 'ca', 'pr', '00')).toBe(true);
        expect(shouldApplyTaxes('es', 'm', 'es', 'cn')).toBe(false);
    });
});

describe('isIntraEU', () => {
    it('should return true for both EU countries', () => {
        expect(isIntraEU('ES', 'FR')).toBe(true);
        expect(isIntraEU('DE', 'IT')).toBe(true);
    });

    it('should return false if one is not EU', () => {
        expect(isIntraEU('ES', 'US')).toBe(false);
        expect(isIntraEU('MX', 'FR')).toBe(false);
    });

    it('should return false if neither is EU', () => {
        expect(isIntraEU('MX', 'CO')).toBe(false);
        expect(isIntraEU('US', 'BR')).toBe(false);
    });
});
