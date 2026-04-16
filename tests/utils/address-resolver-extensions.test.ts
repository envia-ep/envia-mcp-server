import { describe, it, expect } from 'vitest';
import { detectIsland, transformPostalCode, transformPhone } from '../../src/utils/address-resolver.js';

describe('detectIsland', () => {
    it('should detect Sicily for IT postal code starting with 90', () => {
        expect(detectIsland('IT', '90100')).toEqual({ isIsland: true, type: 'Sicily' });
    });

    it('should detect Sicily for IT postal code starting with 98', () => {
        expect(detectIsland('IT', '98100')).toEqual({ isIsland: true, type: 'Sicily' });
    });

    it('should detect Sardinia for IT postal code starting with 07', () => {
        expect(detectIsland('IT', '07100')).toEqual({ isIsland: true, type: 'Sardinia' });
    });

    it('should detect Sardinia for IT postal code starting with 09', () => {
        expect(detectIsland('IT', '09100')).toEqual({ isIsland: true, type: 'Sardinia' });
    });

    it('should return not island for IT mainland postal code', () => {
        expect(detectIsland('IT', '20100')).toEqual({ isIsland: false, type: '' });
    });

    it('should detect Canary Islands for ES postal code starting with 35', () => {
        expect(detectIsland('ES', '35001')).toEqual({ isIsland: true, type: 'Canary Islands' });
    });

    it('should detect Canary Islands for ES postal code starting with 38', () => {
        expect(detectIsland('ES', '38001')).toEqual({ isIsland: true, type: 'Canary Islands' });
    });

    it('should detect Balearic Islands for ES postal code starting with 07', () => {
        expect(detectIsland('ES', '07001')).toEqual({ isIsland: true, type: 'Balearic Islands' });
    });

    it('should return not island for ES mainland postal code', () => {
        expect(detectIsland('ES', '28001')).toEqual({ isIsland: false, type: '' });
    });

    it('should return not island for unsupported country', () => {
        expect(detectIsland('MX', '64000')).toEqual({ isIsland: false, type: '' });
    });

    it('should handle empty postal code', () => {
        expect(detectIsland('IT', '')).toEqual({ isIsland: false, type: '' });
    });

    it('should be case-insensitive for country code', () => {
        expect(detectIsland('it', '90100')).toEqual({ isIsland: true, type: 'Sicily' });
    });
});

describe('re-exported transforms', () => {
    it('should re-export transformPostalCode from country-rules', () => {
        expect(typeof transformPostalCode).toBe('function');
        expect(transformPostalCode('BR', '01310200')).toBe('01310-200');
    });

    it('should re-export transformPhone from country-rules', () => {
        expect(typeof transformPhone).toBe('function');
    });
});
