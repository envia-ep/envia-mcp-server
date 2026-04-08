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
        expect(result.declaredValue).toBe(0);
        expect(result.weightUnit).toBe('KG');
        expect(result.lengthUnit).toBe('CM');
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

    it('should include items when includeItems is true', () => {
        const pkg = makePackage();

        const result = buildPackageFromV4(pkg, true);

        expect(result.items).toBeDefined();
        expect(result.items).toHaveLength(1);
        expect(result.items![0].name).toBe('Blue T-Shirt');
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
    it('should map V4 products to package items', () => {
        const products = [makeProduct()];

        const result = buildItemsFromV4(products);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: 'Blue T-Shirt',
            sku: 'TSH-001',
            quantity: 2,
            price: 299.99,
            weight: 0.3,
        });
    });

    it('should default sku to empty string when null', () => {
        const products = [makeProduct({ sku: null })];

        const result = buildItemsFromV4(products);

        expect(result[0].sku).toBe('');
    });

    it('should default weight to 0 when null', () => {
        const products = [makeProduct({ weight: null })];

        const result = buildItemsFromV4(products);

        expect(result[0].weight).toBe(0);
    });
});
