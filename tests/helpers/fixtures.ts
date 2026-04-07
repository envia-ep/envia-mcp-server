/**
 * Shared test fixtures and mock data for the Envia MCP Server test suite.
 */

import { vi } from "vitest";
import type { EnviaConfig } from "../../src/config.js";

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

export const MOCK_CONFIG: EnviaConfig = {
    apiKey: "test-api-key-12345",
    environment: "sandbox",
    shippingBase: "https://api-test.envia.com",
    queriesBase: "https://queries-test.envia.com",
    geocodesBase: "https://geocodes.envia.com",
};

// ---------------------------------------------------------------------------
// Valid tool argument sets (flat, as tools receive them)
// ---------------------------------------------------------------------------

export const VALID_ORIGIN_ARGS = {
    origin_name: "Juan Perez",
    origin_phone: "+528180001234",
    origin_street: "Av. Constitucion 123",
    origin_city: "Monterrey",
    origin_state: "NL",
    origin_country: "MX",
    origin_postal_code: "64000",
};

export const VALID_DESTINATION_ARGS = {
    destination_name: "Maria Lopez",
    destination_phone: "+528180005678",
    destination_street: "Calle Reforma 456",
    destination_city: "Mexico City",
    destination_state: "CDMX",
    destination_country: "MX",
    destination_postal_code: "03100",
};

export const VALID_PACKAGE_ARGS = {
    package_weight: 2.5,
    package_length: 30,
    package_width: 20,
    package_height: 15,
    package_content: "Electronics",
    package_declared_value: 500,
};

// ---------------------------------------------------------------------------
// Mock API responses
// ---------------------------------------------------------------------------

export const MOCK_LABEL_RESPONSE = {
    data: [
        {
            carrier: "dhl",
            service: "express",
            shipmentId: 12345,
            trackingNumber: "7520610403",
            trackingNumbers: ["7520610403"],
            trackUrl: "https://tracking.envia.com/7520610403",
            label: "https://api.envia.com/labels/7520610403.pdf",
            totalPrice: 150.5,
            currency: "MXN",
        },
    ],
};

export const MOCK_RATES_RESPONSE = {
    data: [
        {
            carrier: "dhl",
            service: "express",
            serviceDescription: "DHL Express",
            totalPrice: "250.00",
            currency: "MXN",
            deliveryEstimate: "1-2 business days",
        },
        {
            carrier: "dhl",
            service: "ground",
            serviceDescription: "DHL Ground",
            totalPrice: "120.00",
            currency: "MXN",
            deliveryEstimate: "3-5 business days",
        },
    ],
};

export const MOCK_TRACKING_RESPONSE = {
    data: [
        {
            trackingNumber: "7520610403",
            status: "In Transit",
            carrier: "dhl",
            carrierDescription: "DHL Express",
            trackUrl: "https://tracking.envia.com/7520610403",
            estimatedDelivery: "2026-03-08",
            eventHistory: [
                {
                    timestamp: "2026-03-05 14:30",
                    location: "Monterrey, NL",
                    description: "Package picked up",
                },
                {
                    timestamp: "2026-03-05 18:00",
                    location: "Mexico City, CDMX",
                    description: "In transit to destination",
                },
            ],
        },
    ],
};

export const MOCK_CARRIER_LIST_RESPONSE = {
    data: [
        { name: "dhl", description: "DHL Express" },
        { name: "fedex", description: "FedEx" },
        { name: "estafeta", description: "Estafeta" },
    ],
};

export const MOCK_SERVICE_LIST_RESPONSE = {
    data: [
        { name: "express", description: "Next day delivery", delivery_estimate: "1 day" },
        { name: "ground", description: "Ground shipping", delivery_estimate: "5 days" },
    ],
};

export const MOCK_CANCEL_RESPONSE = {
    data: {
        carrier: "dhl",
        trackingNumber: "7520610403",
        balanceReturned: true,
        balanceReturnDate: "2026-03-06",
    },
};

export const MOCK_PICKUP_RESPONSE = {
    data: {
        carrier: "dhl",
        confirmation: "PU-2026-001",
        status: "Scheduled",
        date: "2026-03-07",
        timeFrom: 9,
        timeTo: 17,
    },
};

export const MOCK_HSCODE_RESPONSE = {
    data: {
        hsCode: "6109.10",
        description:
            "T-shirts, singlets, tank tops and similar garments, knitted or crocheted, of cotton",
        confidenceScore: 0.92,
        alternatives: [
            { hsCode: "6109.90", description: "T-shirts of other textile materials", confidenceScore: 0.78 },
            { hsCode: "6110.20", description: "Jerseys, pullovers of cotton", confidenceScore: 0.65 },
        ],
    },
    success: true,
};

export const MOCK_INVOICE_RESPONSE = {
    data: {
        invoiceId: "INV-2026-001",
        invoiceUrl: "https://api.envia.com/invoices/INV-2026-001.pdf",
        invoiceNumber: "CI-12345",
    },
};

export const MOCK_HISTORY_RESPONSE = {
    data: [
        {
            tracking_number: "7520610403",
            name: "dhl",
            status: "Delivered",
            created_at: "2026-02-15",
            sender_city: "Monterrey",
            consignee_city: "Mexico City",
        },
        {
            tracking_number: "7520610404",
            name: "fedex",
            status: "In Transit",
            created_at: "2026-02-20",
            sender_city: "Guadalajara",
            consignee_city: "Cancun",
        },
    ],
};

/** Geocodes API returns a raw array — not wrapped in { data: ... }. */
export const MOCK_ZIPCODE_RESPONSE = [
    {
        zip_code: "03100",
        country: { name: "México", code: "MX" },
        state: { name: "Ciudad de México", code: { "2digit": "DF", "3digit": "CMX" } },
        locality: "Del Valle",
        suburbs: ["Del Valle Centro", "Del Valle Norte", "Del Valle Sur"],
        coordinates: { latitude: "19.3782", longitude: "-99.1716" },
    },
];

/** Geocodes locate API also returns a raw array. */
export const MOCK_CITY_RESPONSE = [
    {
        country: { name: "México", code: "MX" },
        state: { name: "Nuevo León", code: { "2digit": "NL", "3digit": "NLE" } },
        zip_codes: [
            { zip_code: "64000", locality: "Monterrey" },
            { zip_code: "64010", locality: "Monterrey" },
        ],
    },
];

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

export function mockFetchSuccess(data: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(data),
    });
}

export function mockFetchError(
    status: number,
    body: Record<string, unknown> = {},
) {
    return vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: () => Promise.resolve(body),
    });
}
