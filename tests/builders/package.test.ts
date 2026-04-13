/**
 * Tests for the package builder functions.
 *
 * Covers manual-input builder (buildManualPackage) and V4-order builders
 * (buildPackageFromV4, buildPackagesFromV4, buildItemsFromV4).
 */

import { describe, it, expect } from 'vitest';
import {
    buildManualPackage,
    buildPackageFromV4,
    buildPackagesFromV4,
    buildItemsFromV4,
    validateInsuranceExclusivity,
} from '../../src/builders/package.js';
import type { V4Package, V4Product } from '../../src/types/ecommerce-order.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<V4Product> = {}): V4Product {
    return {
        name: 'Blue T-Shirt',
        sku: 'TSH-001',
        quantity: 2,
        price: 299.99,
        weight: 0.3,
        identifier: 'prod-1',
        variant_id: 'var-1',
        ...overrides,
    };
}

function makePackage(overrides: Partial<V4Package> = {}): V4Package {
    return {
        id: 100,
        name: 'Package 1',
        content: 'T-Shirts',
        amount: 1,
        box_code: null,
        package_type_id: 1,
        package_type_name: 'Box',
        insurance: 0,
        declared_value: 500,
        dimensions: { height: 10, length: 20, width: 15 },
        weight: 1.5,
        weight_unit: 'KG',
        length_unit: 'CM',
        quote: {
            price: 120,
            service_id: 5,
            carrier_id: 3,
            carrier_name: 'fedex',
            service_name: 'ground',
        },
        shipment: null,
        fulfillment: { status: 'Pending', status_id: 0 },
        products: [makeProduct()],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// buildManualPackage
// ---------------------------------------------------------------------------

describe('buildManualPackage', () => {
    it('should build a package from flat manual input', () => {
        const result = buildManualPackage({
            weight: 2.5,
            length: 30,
            width: 20,
            height: 15,
            content: 'Electronics',
            declaredValue: 500,
        });

        expect(result.type).toBe('box');
        expect(result.content).toBe('Electronics');
        expect(result.amount).toBe(1);
        expect(result.declaredValue).toBe(500);
        expect(result.weight).toBe(2.5);
        expect(result.weightUnit).toBe('KG');
        expect(result.lengthUnit).toBe('CM');
        expect(result.dimensions).toEqual({ length: 30, width: 20, height: 15 });
    });

    it('should apply defaults when optional fields are omitted', () => {
        const result = buildManualPackage({ weight: 1, length: 10, width: 10, height: 10 });

        expect(result.type).toBe('box');
        expect(result.content).toBe('General merchandise');
        expect(result.amount).toBe(1);
        expect(result.declaredValue).toBeUndefined();
        expect(result.weightUnit).toBe('KG');
        expect(result.lengthUnit).toBe('CM');
    });

    it('should include insurance and boxCode when provided', () => {
        const result = buildManualPackage({
            weight: 1,
            length: 10,
            width: 10,
            height: 10,
            insurance: 1000,
            boxCode: 'FLAT_MED',
        });

        expect(result.insurance).toBe(1000);
        expect(result.boxCode).toBe('FLAT_MED');
    });

    it('should omit insurance and boxCode when not provided', () => {
        const result = buildManualPackage({ weight: 1, length: 10, width: 10, height: 10 });

        expect(result.insurance).toBeUndefined();
        expect(result.boxCode).toBeUndefined();
    });

    it('should allow overriding type, amount, and units', () => {
        const result = buildManualPackage({
            weight: 1,
            length: 10,
            width: 10,
            height: 10,
            type: 'envelope',
            amount: 3,
            weightUnit: 'LB',
            lengthUnit: 'IN',
        });

        expect(result.type).toBe('envelope');
        expect(result.amount).toBe(3);
        expect(result.weightUnit).toBe('LB');
        expect(result.lengthUnit).toBe('IN');
    });

    it('should include items when provided', () => {
        const result = buildManualPackage({
            weight: 2,
            length: 10,
            width: 10,
            height: 10,
            items: [{ description: 'Leather handbag', quantity: 1, price: 299, productCode: '4202.21' }],
        });

        expect(result.items).toEqual([
            { description: 'Leather handbag', quantity: 1, price: 299, productCode: '4202.21' },
        ]);
    });

    it('should omit items when array is empty', () => {
        const result = buildManualPackage({
            weight: 1,
            length: 10,
            width: 10,
            height: 10,
            items: [],
        });

        expect(result.items).toBeUndefined();
    });

    it('should omit items when not provided', () => {
        const result = buildManualPackage({ weight: 1, length: 10, width: 10, height: 10 });

        expect(result.items).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// buildPackageFromV4
// ---------------------------------------------------------------------------

describe('buildPackageFromV4', () => {
    it('should map V4 package to shipment package', () => {
        const pkg = makePackage();

        const result = buildPackageFromV4(pkg, false);

        expect(result.type).toBe('box');
        expect(result.content).toBe('T-Shirts');
        expect(result.amount).toBe(1);
        expect(result.declaredValue).toBe(500);
        expect(result.weight).toBe(1.5);
        expect(result.weightUnit).toBe('KG');
        expect(result.lengthUnit).toBe('CM');
        expect(result.dimensions).toEqual({ length: 20, width: 15, height: 10 });
    });

    it('should omit declaredValue when zero', () => {
        const pkg = makePackage({ declared_value: 0 });

        const result = buildPackageFromV4(pkg, false);

        expect(result.declaredValue).toBeUndefined();
    });

    it('should include insurance when greater than zero', () => {
        const pkg = makePackage({ insurance: 2000 });

        const result = buildPackageFromV4(pkg, false);

        expect(result.insurance).toBe(2000);
    });

    it('should omit insurance when zero', () => {
        const pkg = makePackage({ insurance: 0 });

        const result = buildPackageFromV4(pkg, false);

        expect(result.insurance).toBeUndefined();
    });

    it('should include boxCode when present', () => {
        const pkg = makePackage({ box_code: 'FLAT_RATE_SM' });

        const result = buildPackageFromV4(pkg, false);

        expect(result.boxCode).toBe('FLAT_RATE_SM');
    });

    it('should omit boxCode when null', () => {
        const pkg = makePackage({ box_code: null });

        const result = buildPackageFromV4(pkg, false);

        expect(result.boxCode).toBeUndefined();
    });

    it('should include additionalServices when present', () => {
        const pkg = makePackage({
            additional_services: [{ service: 'insurance', data: { amount: 500 } }],
        });

        const result = buildPackageFromV4(pkg, false);

        expect(result.additionalServices).toHaveLength(1);
        expect(result.additionalServices![0]).toEqual({ service: 'insurance', data: { amount: 500 } });
    });

    it('should include items when includeItems is true', () => {
        const pkg = makePackage();

        const result = buildPackageFromV4(pkg, true);

        expect(result.items).toBeDefined();
        expect(result.items).toHaveLength(1);
        expect(result.items![0].description).toBe('Blue T-Shirt');
    });

    it('should omit items when includeItems is false', () => {
        const pkg = makePackage();

        const result = buildPackageFromV4(pkg, false);

        expect(result.items).toBeUndefined();
    });

    it('should lowercase package_type_name for type field', () => {
        const pkg = makePackage({ package_type_name: 'Envelope' });

        const result = buildPackageFromV4(pkg, false);

        expect(result.type).toBe('envelope');
    });

    it('should default to box when package_type_name is empty', () => {
        const pkg = makePackage({ package_type_name: '' });

        const result = buildPackageFromV4(pkg, false);

        expect(result.type).toBe('box');
    });

    it('should default content to General merchandise when empty', () => {
        const pkg = makePackage({ content: '' });

        const result = buildPackageFromV4(pkg, false);

        expect(result.content).toBe('General merchandise');
    });
});

// ---------------------------------------------------------------------------
// buildPackagesFromV4
// ---------------------------------------------------------------------------

describe('buildPackagesFromV4', () => {
    it('should map multiple V4 packages', () => {
        const packages = [makePackage({ id: 1 }), makePackage({ id: 2 })];

        const result = buildPackagesFromV4(packages, false);

        expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
        const result = buildPackagesFromV4([], false);

        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// buildItemsFromV4
// ---------------------------------------------------------------------------

describe('buildItemsFromV4', () => {
    it('should map V4 products to package items using schema field names', () => {
        const products = [makeProduct()];

        const result = buildItemsFromV4(products);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            description: 'Blue T-Shirt',
            sku: 'TSH-001',
            quantity: 2,
            price: 299.99,
            weight: 0.3,
        });
    });

    it('should omit sku when null', () => {
        const products = [makeProduct({ sku: null })];

        const result = buildItemsFromV4(products);

        expect(result[0].sku).toBeUndefined();
    });

    it('should omit weight when null', () => {
        const products = [makeProduct({ weight: null })];

        const result = buildItemsFromV4(products);

        expect(result[0].weight).toBeUndefined();
    });

    it('should omit weight when zero', () => {
        const products = [makeProduct({ weight: 0 })];

        const result = buildItemsFromV4(products);

        expect(result[0].weight).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// buildManualPackage — additional services
// ---------------------------------------------------------------------------

describe('buildManualPackage — additional services', () => {
    it('should include additionalServices when provided', () => {
        const result = buildManualPackage({
            weight: 2,
            length: 10,
            width: 10,
            height: 10,
            additionalServices: [{ service: 'adult_signature_required' }],
        });

        expect(result.additionalServices).toEqual([{ service: 'adult_signature_required' }]);
    });

    it('should include additionalServices with amount data', () => {
        const result = buildManualPackage({
            weight: 2,
            length: 10,
            width: 10,
            height: 10,
            additionalServices: [
                { service: 'cash_on_delivery', data: { amount: 500 } },
                { service: 'envia_insurance', data: { amount: 1000 } },
            ],
        });

        expect(result.additionalServices).toHaveLength(2);
        expect(result.additionalServices![0]).toEqual({ service: 'cash_on_delivery', data: { amount: 500 } });
        expect(result.additionalServices![1]).toEqual({ service: 'envia_insurance', data: { amount: 1000 } });
    });

    it('should omit additionalServices when array is empty', () => {
        const result = buildManualPackage({
            weight: 1,
            length: 10,
            width: 10,
            height: 10,
            additionalServices: [],
        });

        expect(result.additionalServices).toBeUndefined();
    });

    it('should omit additionalServices when not provided', () => {
        const result = buildManualPackage({ weight: 1, length: 10, width: 10, height: 10 });

        expect(result.additionalServices).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// validateInsuranceExclusivity
// ---------------------------------------------------------------------------

describe('validateInsuranceExclusivity', () => {
    it('should return null when no insurance services are present', () => {
        const result = validateInsuranceExclusivity([
            { service: 'cash_on_delivery', data: { amount: 100 } },
            { service: 'adult_signature_required' },
        ]);

        expect(result).toBeNull();
    });

    it('should return null when exactly one insurance service is present', () => {
        const result = validateInsuranceExclusivity([
            { service: 'envia_insurance', data: { amount: 500 } },
            { service: 'cash_on_delivery', data: { amount: 100 } },
        ]);

        expect(result).toBeNull();
    });

    it('should return error when two insurance services are present', () => {
        const result = validateInsuranceExclusivity([
            { service: 'envia_insurance', data: { amount: 500 } },
            { service: 'high_value_protection', data: { amount: 500 } },
        ]);

        expect(result).not.toBeNull();
        expect(result).toContain('envia_insurance');
        expect(result).toContain('high_value_protection');
    });

    it('should return error when all three insurance services are present', () => {
        const result = validateInsuranceExclusivity([
            { service: 'envia_insurance', data: { amount: 500 } },
            { service: 'insurance', data: { amount: 500 } },
            { service: 'high_value_protection', data: { amount: 500 } },
        ]);

        expect(result).not.toBeNull();
    });

    it('should return null for empty array', () => {
        const result = validateInsuranceExclusivity([]);

        expect(result).toBeNull();
    });

    it('should return null when only carrier insurance is present', () => {
        const result = validateInsuranceExclusivity([
            { service: 'insurance', data: { amount: 200 } },
        ]);

        expect(result).toBeNull();
    });
});
