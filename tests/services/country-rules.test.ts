/**
 * Tests for the country-rules service.
 */

import { describe, it, expect } from 'vitest';
import {
    transformPostalCode,
    transformPhone,
    detectBrazilianDocumentType,
    detectSpanishDocumentType,
    getCountryMeta,
} from '../../src/services/country-rules.js';

describe('transformPostalCode', () => {
    it('should insert dash for BR 8-digit CEP', () => {
        expect(transformPostalCode('BR', '01310200')).toBe('01310-200');
    });

    it('should not modify BR CEP that already has dash', () => {
        expect(transformPostalCode('BR', '01310-200')).toBe('01310-200');
    });

    it('should not modify BR CEP shorter than 8 chars', () => {
        expect(transformPostalCode('BR', '12345')).toBe('12345');
    });

    it('should remove first char for AR postal > 4 chars', () => {
        expect(transformPostalCode('AR', 'C1425')).toBe('1425');
    });

    it('should not modify AR postal with 4 chars', () => {
        expect(transformPostalCode('AR', '1425')).toBe('1425');
    });

    it('should truncate US ZIP to 5 digits when longer than 5 but not 9', () => {
        expect(transformPostalCode('US', '902101234')).toBe('90210-1234');
    });

    it('should format US ZIP+4 with 9 digits', () => {
        expect(transformPostalCode('US', '123456789')).toBe('12345-6789');
    });

    it('should not modify US 5-digit ZIP', () => {
        expect(transformPostalCode('US', '90210')).toBe('90210');
    });

    it('should strip non-digits from US ZIP before processing', () => {
        // '90210-1234' -> strip non-digits -> '902101234' (9 digits) -> ZIP+4 format
        expect(transformPostalCode('US', '90210-1234')).toBe('90210-1234');
    });

    it('should return trimmed value for MX', () => {
        expect(transformPostalCode('MX', '64000')).toBe('64000');
    });

    it('should return trimmed value for unknown country', () => {
        expect(transformPostalCode('ZZ', '  ABC123  ')).toBe('ABC123');
    });

    it('should handle empty string', () => {
        expect(transformPostalCode('MX', '')).toBe('');
    });
});

describe('transformPhone', () => {
    it('should normalize FR phone with +33 prefix', () => {
        expect(transformPhone('FR', '+33612345678')).toBe('+33612345678');
    });

    it('should normalize FR phone with 0 prefix', () => {
        expect(transformPhone('FR', '0612345678')).toBe('+33612345678');
    });

    it('should normalize FR phone with 33 prefix', () => {
        expect(transformPhone('FR', '33612345678')).toBe('+33612345678');
    });

    it('should strip spaces and dashes from FR phone', () => {
        expect(transformPhone('FR', '+33 6 12-34-56-78')).toBe('+33612345678');
    });

    it('should return cleaned phone for non-FR country', () => {
        expect(transformPhone('MX', '+5218112345678')).toBe('+5218112345678');
    });

    it('should strip non-digits except leading +', () => {
        expect(transformPhone('US', '+1 (555) 123-4567')).toBe('+15551234567');
    });
});

describe('detectBrazilianDocumentType', () => {
    it('should return CPF for 11 digits', () => {
        expect(detectBrazilianDocumentType('52998224725')).toBe('CPF');
    });

    it('should return CNPJ for 14 digits', () => {
        expect(detectBrazilianDocumentType('11222333000181')).toBe('CNPJ');
    });

    it('should strip formatting before detecting CPF', () => {
        expect(detectBrazilianDocumentType('529.982.247-25')).toBe('CPF');
    });

    it('should return unknown for other lengths', () => {
        expect(detectBrazilianDocumentType('12345')).toBe('unknown');
    });
});

describe('detectSpanishDocumentType', () => {
    it('should detect DNI', () => {
        expect(detectSpanishDocumentType('12345678A')).toBe('DNI');
    });

    it('should detect NIE', () => {
        expect(detectSpanishDocumentType('X1234567L')).toBe('NIE');
    });

    it('should detect NIF', () => {
        expect(detectSpanishDocumentType('A12345678')).toBe('NIF');
    });

    it('should return unknown for invalid format', () => {
        expect(detectSpanishDocumentType('INVALID')).toBe('unknown');
    });
});

describe('getCountryMeta', () => {
    it('should return separate number true for MX', () => {
        expect(getCountryMeta('MX').requiresSeparateNumber).toBe(true);
    });

    it('should return separate number true for BR', () => {
        expect(getCountryMeta('BR').requiresSeparateNumber).toBe(true);
    });

    it('should return domestic-as-international true for BR', () => {
        expect(getCountryMeta('BR').treatedAsInternationalDomestic).toBe(true);
    });

    it('should return domestic-as-international true for IN', () => {
        expect(getCountryMeta('IN').treatedAsInternationalDomestic).toBe(true);
    });

    it('should return default declared value 3000 for MX', () => {
        expect(getCountryMeta('MX').defaultDeclaredValue).toBe(3000);
    });

    it('should return identification required for CO', () => {
        expect(getCountryMeta('CO').identificationRequiredFor).toEqual(['origin', 'destination']);
    });

    it('should return empty identification for US', () => {
        expect(getCountryMeta('US').identificationRequiredFor).toEqual([]);
    });
});
