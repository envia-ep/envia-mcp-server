/**
 * Security tests: Input injection resistance
 *
 * Verifies that malicious payloads in tool parameters (SQL injection,
 * XSS, command injection, Unicode abuse, boundary values) do not crash
 * the handlers and are passed through to the API without local execution.
 *
 * Strategy: register each tool with a mock server, call the handler
 * directly with injection payloads, and verify the handler completes
 * without throwing — returning either a success or an error result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
    MOCK_CONFIG,
    VALID_ORIGIN_ARGS,
    VALID_DESTINATION_ARGS,
    VALID_PACKAGE_ARGS,
    mockFetchSuccess,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerCreateLabel } from "../../src/tools/create-label.js";
import { registerTrackPackage } from "../../src/tools/track-package.js";
import { registerValidateAddress } from "../../src/tools/validate-address.js";
import { registerClassifyHscode } from "../../src/tools/classify-hscode.js";
import { registerSchedulePickup } from "../../src/tools/schedule-pickup.js";
import { registerCreateCommercialInvoice } from "../../src/tools/create-commercial-invoice.js";

describe("Input Injection Resistance", () => {
    let handlers: Map<string, ToolHandler>;

    beforeEach(() => {
        const { server, handlers: h } = createMockServer();
        handlers = h;

        const client = new EnviaApiClient(MOCK_CONFIG);

        // Register all tools we need for injection tests
        registerCreateLabel(server, client, MOCK_CONFIG);
        registerTrackPackage(server, client, MOCK_CONFIG);
        registerValidateAddress(server, client, MOCK_CONFIG);
        registerClassifyHscode(server, client, MOCK_CONFIG);
        registerSchedulePickup(server, client, MOCK_CONFIG);
        registerCreateCommercialInvoice(server, client, MOCK_CONFIG);

        // Default: mock fetch to succeed so handlers reach their formatting logic
        vi.stubGlobal(
            "fetch",
            mockFetchSuccess({
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
                    },
                ],
            }),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Helper: call handler and assert it does not throw
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
    // SQL Injection
    // =========================================================================

    describe("SQL injection", () => {
        it("handles SQL injection in origin_name field (create_label)", async () => {
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                origin_name: "'; DROP TABLE users; --",
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            };

            const result = await callHandler("envia_create_label", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles SQL injection in tracking_number (track_package)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: [
                        {
                            trackingNumber: "7520",
                            status: "Not Found",
                            eventHistory: [],
                        },
                    ],
                }),
            );

            const result = await callHandler("envia_track_package", {
                tracking_numbers: "7520' OR 1=1 --",
            });
            expect(result.content[0].text).toBeDefined();
        });

        it("handles SQL injection in city field (validate_address)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: { city: "Monterrey", state: "NL", country: "MX" },
                }),
            );

            const result = await callHandler("envia_validate_address", {
                country: "MX",
                city: "Monterrey'; DELETE FROM cities; --",
            });
            expect(result.content[0].text).toBeDefined();
        });
    });

    // =========================================================================
    // XSS (Cross-Site Scripting)
    // =========================================================================

    describe("XSS payloads", () => {
        it("handles <script> tags in origin_street (create_label)", async () => {
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                origin_street: '<script>alert("XSS")</script>',
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            };

            const result = await callHandler("envia_create_label", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles HTML img onerror in package_content (create_label)", async () => {
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                package_content: '<img src=x onerror=alert(1)>',
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            };

            const result = await callHandler("envia_create_label", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles event handler attributes in item_description (commercial_invoice)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: {
                        invoiceId: "INV-001",
                        invoiceUrl: "https://api.envia.com/invoices/INV-001.pdf",
                        invoiceNumber: "CI-12345",
                    },
                }),
            );

            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                carrier: "dhl",
                item_description: '<div onmouseover="alert(document.cookie)">cotton shirts</div>',
                item_hs_code: "6109.10",
                item_quantity: 10,
                item_unit_price: 25.0,
                item_country_of_manufacture: "MX",
                export_reason: "sale",
                duties_payment: "sender",
            };

            const result = await callHandler("envia_create_commercial_invoice", args);
            expect(result.content[0].text).toBeDefined();
        });
    });

    // =========================================================================
    // Command Injection
    // =========================================================================

    describe("Command injection", () => {
        it("handles $(command) in description (classify_hscode)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: { hsCode: "6109.10", description: "T-shirts", alternatives: [] },
                    success: true,
                }),
            );

            const result = await callHandler("envia_classify_hscode", {
                description: "cotton $(rm -rf /)",
                include_alternatives: true,
            });
            expect(result.content[0].text).toBeDefined();
        });

        it("handles backtick command substitution in instructions (schedule_pickup)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: {
                        carrier: "dhl",
                        confirmation: "PU-001",
                        status: "Scheduled",
                        date: "2026-03-10",
                        timeFrom: 9,
                        timeTo: 17,
                    },
                }),
            );

            const args = {
                ...VALID_ORIGIN_ARGS,
                carrier: "dhl",
                tracking_numbers: "7520610403",
                date: "2026-03-10",
                time_from: 9,
                time_to: 17,
                total_weight: 5,
                total_packages: 1,
                instructions: "dock B `cat /etc/passwd`",
            };

            const result = await callHandler("envia_schedule_pickup", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles pipe and redirect in tracking_numbers (track_package)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: [
                        {
                            trackingNumber: "7520",
                            status: "Not Found",
                            eventHistory: [],
                        },
                    ],
                }),
            );

            const result = await callHandler("envia_track_package", {
                tracking_numbers: "7520| ls > /tmp/out",
            });
            expect(result.content[0].text).toBeDefined();
        });
    });

    // =========================================================================
    // Unicode abuse
    // =========================================================================

    describe("Unicode abuse", () => {
        it("handles null bytes in origin_name", async () => {
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                origin_name: "Juan\x00Perez",
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            };

            const result = await callHandler("envia_create_label", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles RTL override characters in street address", async () => {
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                origin_street: "Av. Constitucion \u202E321 Evil St\u202C 123",
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            };

            const result = await callHandler("envia_create_label", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles zero-width characters in tracking numbers", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: [
                        {
                            trackingNumber: "7520610403",
                            status: "In Transit",
                            eventHistory: [],
                        },
                    ],
                }),
            );

            const result = await callHandler("envia_track_package", {
                tracking_numbers: "752\u200B061\u200B0403",
            });
            expect(result.content[0].text).toBeDefined();
        });
    });

    // =========================================================================
    // Boundary values
    // =========================================================================

    describe("Boundary values", () => {
        it("handles 10000 char string in description (classify_hscode)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: { hsCode: "6109.10", description: "T-shirts", alternatives: [] },
                    success: true,
                }),
            );

            const longDescription = "A".repeat(10_000);
            const result = await callHandler("envia_classify_hscode", {
                description: longDescription,
                include_alternatives: true,
            });
            expect(result.content[0].text).toBeDefined();
        });

        it("handles 10000 char string in item_description (create_commercial_invoice)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: {
                        invoiceId: "INV-001",
                        invoiceUrl: "https://api.envia.com/invoices/INV-001.pdf",
                        invoiceNumber: "CI-12345",
                    },
                }),
            );

            const longDescription = "B".repeat(10_000);
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                carrier: "dhl",
                item_description: longDescription,
                item_hs_code: "6109.10",
                item_quantity: 10,
                item_unit_price: 25.0,
                item_country_of_manufacture: "MX",
                export_reason: "sale",
                duties_payment: "sender",
            };

            const result = await callHandler("envia_create_commercial_invoice", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles 5000 char string in instructions (schedule_pickup)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: {
                        carrier: "dhl",
                        confirmation: "PU-001",
                        status: "Scheduled",
                        date: "2026-03-10",
                        timeFrom: 9,
                        timeTo: 17,
                    },
                }),
            );

            const longInstructions = "C".repeat(5_000);
            const args = {
                ...VALID_ORIGIN_ARGS,
                carrier: "dhl",
                tracking_numbers: "7520610403",
                date: "2026-03-10",
                time_from: 9,
                time_to: 17,
                total_weight: 5,
                total_packages: 1,
                instructions: longInstructions,
            };

            const result = await callHandler("envia_schedule_pickup", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles 10000 char tracking number (track_package)", async () => {
            vi.stubGlobal(
                "fetch",
                mockFetchSuccess({
                    data: [
                        {
                            trackingNumber: "D".repeat(10_000),
                            status: "Not Found",
                            eventHistory: [],
                        },
                    ],
                }),
            );

            const result = await callHandler("envia_track_package", {
                tracking_numbers: "D".repeat(10_000),
            });
            expect(result.content[0].text).toBeDefined();
        });

        it("handles string of special chars as carrier (bypasses Zod in direct handler call)", async () => {
            // When calling the handler directly (bypassing Zod validation),
            // the handler should still not crash — it just passes the value
            // through to the API which will reject it.
            const args = {
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                carrier: "!@#$%^&*(){}[]|\\:\";<>?,./~`",
                service: "express",
                shipment_type: 1,
            };

            // carrier.trim().toLowerCase() should not throw even on special chars
            const result = await callHandler("envia_create_label", args);
            expect(result.content[0].text).toBeDefined();
        });

        it("handles empty string after trim in tracking_numbers (track_package)", async () => {
            // Empty after trimming should trigger the "at least one" validation
            const result = await callHandler("envia_track_package", {
                tracking_numbers: "   ",
            });

            expect(result.content[0].text).toBeDefined();
            expect(result.content[0].text).toContain("at least one tracking number");
        });
    });
});
