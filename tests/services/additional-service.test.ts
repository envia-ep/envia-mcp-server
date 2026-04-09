/**
 * Tests for the additional service service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { fetchAvailableAdditionalServices, flattenCategories } from '../../src/services/additional-service.js';

describe('fetchAvailableAdditionalServices', () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return flattened service list from categorized response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                data: [
                    {
                        name: 'insurance',
                        description: 'Insurance options',
                        label: 'insurance.label',
                        child_type: 'form',
                        childs: [
                            {
                                id: 14,
                                category_id: 1,
                                name: 'envia_insurance',
                                description: 'Envia platform insurance',
                                label: 'envia_insurance.label',
                                tooltip_amount: 3000,
                                tooltip: null,
                                json_structure: '{"amount":{"type":"number"}}',
                                front_order_index: 1,
                            },
                        ],
                    },
                    {
                        name: 'delivery_options',
                        description: 'Delivery options',
                        label: 'delivery.label',
                        child_type: 'simple',
                        childs: [
                            {
                                id: 33,
                                category_id: 2,
                                name: 'adult_signature_required',
                                description: 'Adult signature',
                                label: 'adult_sig.label',
                                tooltip_amount: null,
                                tooltip: null,
                                json_structure: null,
                                front_order_index: 2,
                            },
                        ],
                    },
                ],
            }),
        });

        const result = await fetchAvailableAdditionalServices('MX', false, 1, client, MOCK_CONFIG);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            id: 14,
            name: 'envia_insurance',
            description: 'Envia platform insurance',
            category: 'insurance',
            requiresAmount: true,
        });
        expect(result[1]).toEqual({
            id: 33,
            name: 'adult_signature_required',
            description: 'Adult signature',
            category: 'delivery_options',
            requiresAmount: false,
        });
    });

    it('should call the correct URL for domestic shipments', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [] }),
        });

        await fetchAvailableAdditionalServices('MX', false, 1, client, MOCK_CONFIG);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/additional-services/MX/0/1');
        expect(url).not.toContain('destination_country');
    });

    it('should append destination_country for international shipments', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: [] }),
        });

        await fetchAvailableAdditionalServices('MX', true, 1, client, MOCK_CONFIG, 'US');

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/additional-services/MX/1/1');
        expect(url).toContain('destination_country=US');
    });

    it('should return empty array when API call fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Server error' }),
        });

        const result = await fetchAvailableAdditionalServices('MX', false, 1, client, MOCK_CONFIG);

        expect(result).toEqual([]);
    });

    it('should return empty array when response data is not an array', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'not an array' }),
        });

        const result = await fetchAvailableAdditionalServices('MX', false, 1, client, MOCK_CONFIG);

        expect(result).toEqual([]);
    });
});

describe('flattenCategories', () => {
    it('should flatten multiple categories into a single list', () => {
        const categories = [
            {
                name: 'insurance',
                description: 'Insurance',
                label: 'ins',
                child_type: 'form',
                childs: [
                    {
                        id: 1,
                        category_id: 1,
                        name: 'envia_insurance',
                        description: 'Envia insurance',
                        label: 'ei',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: '{"amount":{"type":"number"}}',
                        front_order_index: 1,
                    },
                    {
                        id: 2,
                        category_id: 1,
                        name: 'high_value_protection',
                        description: 'High value',
                        label: 'hvp',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: '{"amount":{"type":"number"}}',
                        front_order_index: 2,
                    },
                ],
            },
            {
                name: 'cod',
                description: 'COD',
                label: 'cod',
                child_type: 'form',
                childs: [
                    {
                        id: 3,
                        category_id: 2,
                        name: 'cash_on_delivery',
                        description: 'Cash on delivery',
                        label: 'cod',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: '{"amount":{"type":"number"}}',
                        front_order_index: 1,
                    },
                ],
            },
        ];

        const result = flattenCategories(categories);

        expect(result).toHaveLength(3);
        expect(result.map((s) => s.name)).toEqual(['envia_insurance', 'high_value_protection', 'cash_on_delivery']);
        expect(result[0].category).toBe('insurance');
        expect(result[2].category).toBe('cod');
    });

    it('should skip categories with no childs array', () => {
        const categories = [
            {
                name: 'broken',
                description: 'Broken',
                label: 'b',
                child_type: 'form',
                childs: null as unknown as [],
            },
        ];

        const result = flattenCategories(categories);

        expect(result).toEqual([]);
    });

    it('should detect requiresAmount from json_structure', () => {
        const categories = [
            {
                name: 'test',
                description: 'Test',
                label: 't',
                child_type: 'form',
                childs: [
                    {
                        id: 1,
                        category_id: 1,
                        name: 'with_amount',
                        description: 'Needs amount',
                        label: 'wa',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: '{"amount":{"type":"number","min":0}}',
                        front_order_index: 1,
                    },
                    {
                        id: 2,
                        category_id: 1,
                        name: 'without_amount',
                        description: 'No amount',
                        label: 'na',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: '{"enabled":{"type":"boolean"}}',
                        front_order_index: 2,
                    },
                    {
                        id: 3,
                        category_id: 1,
                        name: 'null_structure',
                        description: 'Null structure',
                        label: 'ns',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: null,
                        front_order_index: 3,
                    },
                ],
            },
        ];

        const result = flattenCategories(categories);

        expect(result[0].requiresAmount).toBe(true);
        expect(result[1].requiresAmount).toBe(false);
        expect(result[2].requiresAmount).toBe(false);
    });

    it('should handle malformed json_structure gracefully', () => {
        const categories = [
            {
                name: 'test',
                description: 'Test',
                label: 't',
                child_type: 'form',
                childs: [
                    {
                        id: 1,
                        category_id: 1,
                        name: 'bad_json',
                        description: 'Bad JSON',
                        label: 'bj',
                        tooltip_amount: null,
                        tooltip: null,
                        json_structure: '{invalid json',
                        front_order_index: 1,
                    },
                ],
            },
        ];

        const result = flattenCategories(categories);

        expect(result[0].requiresAmount).toBe(false);
    });

    it('should return empty array for empty categories', () => {
        const result = flattenCategories([]);

        expect(result).toEqual([]);
    });
});
