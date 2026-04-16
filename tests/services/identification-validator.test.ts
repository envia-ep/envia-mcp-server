/**
 * Tests for the identification-validator service.
 */

import { describe, it, expect } from 'vitest';
import {
    validateCPF,
    validateCNPJ,
    validateNIT,
    isIdentificationRequired,
} from '../../src/services/identification-validator.js';

describe('validateCPF', () => {
    it('should return true for valid CPF 52998224725', () => {
        expect(validateCPF('52998224725')).toBe(true);
    });

    it('should return true for valid CPF with formatting 529.982.247-25', () => {
        expect(validateCPF('529.982.247-25')).toBe(true);
    });

    it('should return false for all-same-digit 11111111111', () => {
        expect(validateCPF('11111111111')).toBe(false);
    });

    it('should return false for wrong check digit', () => {
        expect(validateCPF('52998224726')).toBe(false);
    });

    it('should return false for too short (10 digits)', () => {
        expect(validateCPF('5299822472')).toBe(false);
    });

    it('should return false for too long (12 digits)', () => {
        expect(validateCPF('529982247250')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(validateCPF('')).toBe(false);
    });
});

describe('validateCNPJ', () => {
    it('should return true for valid CNPJ 11222333000181', () => {
        expect(validateCNPJ('11222333000181')).toBe(true);
    });

    it('should return true for valid CNPJ with formatting 11.222.333/0001-81', () => {
        expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
    });

    it('should return false for all-same-digit 11111111111111', () => {
        expect(validateCNPJ('11111111111111')).toBe(false);
    });

    it('should return false for wrong check digit', () => {
        expect(validateCNPJ('11222333000182')).toBe(false);
    });

    it('should return false for too short', () => {
        expect(validateCNPJ('1122233300018')).toBe(false);
    });

    it('should return false for too long', () => {
        expect(validateCNPJ('112223330001810')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(validateCNPJ('')).toBe(false);
    });
});

describe('validateNIT', () => {
    it('should return true for 7-digit NIT', () => {
        expect(validateNIT('1234567')).toBe(true);
    });

    it('should return true for 10-digit NIT', () => {
        expect(validateNIT('9001234567')).toBe(true);
    });

    it('should return true for NIT with dashes (stripped)', () => {
        expect(validateNIT('900-123-456')).toBe(true);
    });

    it('should return false for 6-digit NIT', () => {
        expect(validateNIT('123456')).toBe(false);
    });

    it('should return false for 11-digit NIT', () => {
        expect(validateNIT('90012345678')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(validateNIT('')).toBe(false);
    });
});

describe('isIdentificationRequired', () => {
    it('should return not required for rate action regardless of country', () => {
        const result = isIdentificationRequired('BR', 'BR', 'rate');
        expect(result.required).toBe(false);
        expect(result.fields).toEqual([]);
    });

    it('should return required for BR generate (origin + destination)', () => {
        const result = isIdentificationRequired('BR', 'US', 'generate');
        expect(result.required).toBe(true);
        expect(result.fields).toEqual(['origin', 'destination']);
    });

    it('should return required for CO generate (origin + destination)', () => {
        const result = isIdentificationRequired('CO', 'MX', 'generate');
        expect(result.required).toBe(true);
        expect(result.fields).toEqual(['origin', 'destination']);
    });

    it('should return required for ES→US generate (intl non-EU, origin + destination)', () => {
        const result = isIdentificationRequired('ES', 'US', 'generate');
        expect(result.required).toBe(true);
        expect(result.fields).toEqual(['origin', 'destination']);
    });

    it('should return not required for ES→FR generate (intra-EU)', () => {
        const result = isIdentificationRequired('ES', 'FR', 'generate');
        expect(result.required).toBe(false);
        expect(result.fields).toEqual([]);
    });

    it('should return not required for MX→MX generate', () => {
        const result = isIdentificationRequired('MX', 'MX', 'generate');
        expect(result.required).toBe(false);
        expect(result.fields).toEqual([]);
    });

    it('should return not required for US→US generate', () => {
        const result = isIdentificationRequired('US', 'US', 'generate');
        expect(result.required).toBe(false);
        expect(result.fields).toEqual([]);
    });
});
