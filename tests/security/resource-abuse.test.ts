/**
 * Security tests: Resource abuse / DoS prevention
 *
 * Verifies that handlers gracefully handle oversized inputs, large
 * response payloads, and excessive element counts without crashing,
 * hanging, or consuming unbounded memory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
    MOCK_CONFIG,
    VALID_ORIGIN_ARGS,
    VALID_DESTINATION_ARGS,
    VALID_PACKAGE_ARGS,
    VALID_QUOTE_ARGS,
    mockFetchSuccess,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerTrackPackage } from "../../src/tools/track-package.js";
import { registerGetShippingRates } from "../../src/tools/get-shipping-rates.js";
import { registerGetShipmentHistory } from "../../src/tools/get-shipment-history.js";
import { registerCreateLabel } from "../../src/tools/create-label.js";
import { registerListCarriers } from "../../src/tools/list-carriers.js";
import { registerValidateAddress } from "../../src/tools/validate-address.js";
import { resolveAddress } from "../../src/utils/address-resolver.js";

vi.mock("../../src/utils/address-resolver.js", () => ({
    resolveAddress: vi.fn(),
}));

const resolveAddressMock = vi.mocked(resolveAddress);

describe("Resource Abuse / DoS Prevention", () => {
    let handlers: Map<string, ToolHandler>;

    beforeEach(() => {
        resolveAddressMock.mockResolvedValue({
            postalCode: "64000",
            country: "MX",
            city: "Monterrey",
            state: "NL",
        });

        const { server, handlers: h } = createMockServer();
        handlers = h;

        const client = new EnviaApiClient(MOCK_CONFIG);

        registerTrackPackage(server, client, MOCK_CONFIG);
        registerGetShippingRates(server, client, MOCK_CONFIG);
        registerGetShipmentHistory(server, client, MOCK_CONFIG);
        registerCreateLabel(server, client, MOCK_CONFIG);
        registerListCarriers(server, client, MOCK_CONFIG);
        registerValidateAddress(server, client, MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Helper
    async function callHandler(name: string, args: Record<string, unknown>) {
        const handler = handlers.get(name);
        expect(handler).toBeDefined();
        const result = await handler!(args);
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        return result;
    }

    // =========================================================================
    // track_package: large tracking number lists
    // =========================================================================

    it("track_package: handles 100 comma-separated tracking numbers without crashing", async () => {
        const numbers = Array.from({ length: 100 }, (_, i) => `TRK${String(i).padStart(6, "0")}`);
        const trackingData = numbers.map((n) => ({
            trackingNumber: n,
            status: "In Transit",
            eventHistory: [],
        }));

        vi.stubGlobal("fetch", mockFetchSuccess({ data: trackingData }));

        const result = await callHandler("envia_track_package", {
            tracking_numbers: numbers.join(","),
        });

        expect(result.content[0].text).toBeDefined();
        expect(result.content[0].text.length).toBeGreaterThan(0);
    });

    it("track_package: handles 1000 comma-separated tracking numbers without crashing", async () => {
        const numbers = Array.from({ length: 1000 }, (_, i) => `TRK${String(i).padStart(6, "0")}`);
        const trackingData = numbers.map((n) => ({
            trackingNumber: n,
            status: "In Transit",
            eventHistory: [],
        }));

        vi.stubGlobal("fetch", mockFetchSuccess({ data: trackingData }));

        const result = await callHandler("envia_track_package", {
            tracking_numbers: numbers.join(","),
        });

        expect(result.content[0].text).toBeDefined();
        expect(result.content[0].text.length).toBeGreaterThan(0);
    });

    // =========================================================================
    // get_shipping_rates: carrier list caps
    // =========================================================================

    it("get_shipping_rates: caps carrier list at 10 even with 20 provided", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    data: [
                        {
                            carrier: "test",
                            service: "standard",
                            totalPrice: "100.00",
                            currency: "MXN",
                        },
                    ],
                }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const twentyCarriers = Array.from({ length: 20 }, (_, i) => `carrier${i}`)
            .join(",");

        const args = {
            ...VALID_QUOTE_ARGS,
            carriers: twentyCarriers,
        };

        await callHandler("quote_shipment", args);

        // The handler should cap at MAX_CARRIERS = 10
        expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it("get_shipping_rates: handles empty carriers after splitting (just commas)", async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        const args = {
            ...VALID_QUOTE_ARGS,
            carriers: ",,,,",
        };

        const result = await callHandler("quote_shipment", args);

        // All entries are empty after split + trim + filter(Boolean),
        // so the handler should return an error about providing at least one carrier.
        expect(result.content[0].text).toContain("at least one carrier");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("get_shipping_rates: handles carriers with only whitespace", async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        const args = {
            ...VALID_QUOTE_ARGS,
            carriers: "  ,  ,  ",
        };

        const result = await callHandler("quote_shipment", args);

        expect(result.content[0].text).toContain("at least one carrier");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // =========================================================================
    // get_shipment_history: display limits
    // =========================================================================

    it("get_shipment_history: limits display to 50 entries", async () => {
        const shipments = Array.from({ length: 75 }, (_, i) => ({
            tracking_number: `TRK${String(i).padStart(6, "0")}`,
            name: "dhl",
            status: "Delivered",
            created_at: "2026-02-15",
            sender_city: "Monterrey",
            consignee_city: "Mexico City",
        }));

        vi.stubGlobal("fetch", mockFetchSuccess({ data: shipments }));

        const result = await callHandler("envia_get_shipment_history", {
            month: 2,
            year: 2026,
        });

        const text = result.content[0].text;

        // Should report total count of 75
        expect(text).toContain("75 shipment(s)");

        // Should only list 50 entries (each starts with a bullet)
        const bulletCount = (text.match(/^  ?[*\u2022] /gm) || []).length;
        expect(bulletCount).toBeLessThanOrEqual(50);
    });

    it("get_shipment_history: shows overflow count for >50 shipments", async () => {
        const shipments = Array.from({ length: 75 }, (_, i) => ({
            tracking_number: `TRK${String(i).padStart(6, "0")}`,
            name: "dhl",
            status: "Delivered",
            created_at: "2026-02-15",
            sender_city: "Monterrey",
            consignee_city: "Mexico City",
        }));

        vi.stubGlobal("fetch", mockFetchSuccess({ data: shipments }));

        const result = await callHandler("envia_get_shipment_history", {
            month: 2,
            year: 2026,
        });

        const text = result.content[0].text;
        // Should indicate remaining shipments (75 - 50 = 25)
        expect(text).toContain("25 more");
    });

    // =========================================================================
    // track_package: event display limits
    // =========================================================================

    it("track_package: limits displayed events to 10 per tracking number", async () => {
        const events = Array.from({ length: 25 }, (_, i) => ({
            timestamp: `2026-03-0${Math.min(i + 1, 9)} 10:00`,
            location: `City ${i}`,
            description: `Event ${i}`,
        }));

        vi.stubGlobal(
            "fetch",
            mockFetchSuccess({
                data: [
                    {
                        trackingNumber: "7520610403",
                        status: "In Transit",
                        carrier: "dhl",
                        eventHistory: events,
                    },
                ],
            }),
        );

        const result = await callHandler("envia_track_package", {
            tracking_numbers: "7520610403",
        });

        const text = result.content[0].text;

        // Count event lines (indented with 4 spaces starting with a timestamp or dash)
        const eventLines = text.split("\n").filter(
            (line: string) => line.startsWith("    ") && !line.includes("... and"),
        );
        expect(eventLines.length).toBeLessThanOrEqual(10);
    });

    it("track_package: shows overflow count for >10 events", async () => {
        const events = Array.from({ length: 25 }, (_, i) => ({
            timestamp: `2026-03-01 ${String(i).padStart(2, "0")}:00`,
            location: `City ${i}`,
            description: `Event ${i}`,
        }));

        vi.stubGlobal(
            "fetch",
            mockFetchSuccess({
                data: [
                    {
                        trackingNumber: "7520610403",
                        status: "In Transit",
                        carrier: "dhl",
                        eventHistory: events,
                    },
                ],
            }),
        );

        const result = await callHandler("envia_track_package", {
            tracking_numbers: "7520610403",
        });

        const text = result.content[0].text;
        // Should indicate remaining events (25 - 10 = 15)
        expect(text).toContain("15 more events");
    });

    // =========================================================================
    // Oversized API responses
    // =========================================================================

    it("create_label: handles oversized API response body (100KB JSON) without crashing", async () => {
        // Simulate a 100KB+ response with a very large nested object
        const largeData = {
            data: [
                {
                    carrier: "dhl",
                    service: "express",
                    trackingNumber: "7520610403",
                    trackingNumbers: ["7520610403"],
                    trackUrl: "https://tracking.envia.com/7520610403",
                    label: "https://api.envia.com/labels/7520610403.pdf",
                    totalPrice: 150.5,
                    currency: "MXN",
                    // Extra large field to push response past 100KB
                    _debug_padding: "X".repeat(100_000),
                },
            ],
        };

        vi.stubGlobal("fetch", mockFetchSuccess(largeData));

        const args = {
            ...VALID_ORIGIN_ARGS,
            ...VALID_DESTINATION_ARGS,
            ...VALID_PACKAGE_ARGS,
            carrier: "dhl",
            service: "express",
            shipment_type: 1,
        };

        const result = await callHandler("envia_create_label", args);

        expect(result.content[0].text).toBeDefined();
        expect(result.content[0].text).toContain("Label created successfully");
    });

    it("list_carriers: handles response with 500 carriers without crashing", async () => {
        const carriers = Array.from({ length: 500 }, (_, i) => ({
            name: `carrier-${i}`,
            description: `Carrier Number ${i}`,
        }));

        vi.stubGlobal("fetch", mockFetchSuccess({ data: carriers }));

        const result = await callHandler("envia_list_carriers", {
            country: "MX",
            international: false,
            include_services: false,
        });

        expect(result.content[0].text).toBeDefined();
        // Should contain at least some carrier entries
        expect(result.content[0].text).toContain("carrier-0");
        expect(result.content[0].text.length).toBeGreaterThan(0);
    });

    it("validate_address: handles response with deeply nested JSON gracefully", async () => {
        // Build a deeply nested object (50 levels deep)
        let nested: Record<string, unknown> = { city: "Monterrey", state: "NL", country: "MX" };
        for (let i = 0; i < 50; i++) {
            nested = { data: nested, level: i, metadata: { nested: true } };
        }

        vi.stubGlobal("fetch", mockFetchSuccess(nested));

        const result = await callHandler("envia_validate_address", {
            country: "MX",
            postal_code: "64000",
        });

        expect(result.content[0].text).toBeDefined();
        // The handler accesses res.data?.data, so deeply nested data
        // won't match the expected shape — but it should not crash.
        expect(result.content[0].text.length).toBeGreaterThan(0);
    });
});
