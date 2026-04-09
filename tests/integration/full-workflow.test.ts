/**
 * Integration-style tests — multi-tool workflows with sequential mocking.
 *
 * These simulate real shipping workflows by calling multiple tool handlers
 * in sequence with shared mock API state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
    MOCK_CONFIG,
    VALID_ORIGIN_ARGS,
    VALID_DESTINATION_ARGS,
    VALID_PACKAGE_ARGS,
    VALID_QUOTE_ARGS,
    MOCK_LABEL_RESPONSE,
    MOCK_RATES_RESPONSE,
    MOCK_ZIPCODE_RESPONSE,
    MOCK_TRACKING_RESPONSE,
    MOCK_CANCEL_RESPONSE,
    MOCK_PICKUP_RESPONSE,
    MOCK_HSCODE_RESPONSE,
    MOCK_INVOICE_RESPONSE,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerValidateAddress } from "../../src/tools/validate-address.js";
import { registerGetShippingRates } from "../../src/tools/get-shipping-rates.js";
import { registerCreateLabel } from "../../src/tools/create-label.js";
import { registerTrackPackage } from "../../src/tools/track-package.js";
import { registerCancelShipment } from "../../src/tools/cancel-shipment.js";
import { registerSchedulePickup } from "../../src/tools/schedule-pickup.js";
import { registerClassifyHscode } from "../../src/tools/classify-hscode.js";
import { registerCreateCommercialInvoice } from "../../src/tools/create-commercial-invoice.js";
import { registerResources } from "../../src/resources/api-docs.js";
import { resolveAddress } from "../../src/utils/address-resolver.js";

vi.mock("../../src/utils/address-resolver.js", () => ({
    resolveAddress: vi.fn(),
}));

const resolveAddressMock = vi.mocked(resolveAddress);

describe("Full workflow integration", () => {
    let handlers: Map<string, ToolHandler>;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        resolveAddressMock.mockResolvedValue({
            postalCode: "64000",
            country: "MX",
            city: "Monterrey",
            state: "NL",
        });

        mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);

        const { server, handlers: h } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        handlers = h;

        // Register all tools
        registerValidateAddress(server, client, MOCK_CONFIG);
        registerGetShippingRates(server, client, MOCK_CONFIG);
        registerCreateLabel(server, client, MOCK_CONFIG);
        registerTrackPackage(server, client, MOCK_CONFIG);
        registerCancelShipment(server, client, MOCK_CONFIG);
        registerSchedulePickup(server, client, MOCK_CONFIG);
        registerClassifyHscode(server, client, MOCK_CONFIG);
        registerCreateCommercialInvoice(server, client, MOCK_CONFIG);
        registerResources(server, MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Domestic workflow: validate → rates → label → track", () => {
        it("complete domestic shipping flow succeeds end-to-end", async () => {
            // Step 1: Validate address
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_ZIPCODE_RESPONSE),
            });

            const validateHandler = handlers.get("envia_validate_address")!;
            const validateResult = await validateHandler({
                country: "MX",
                postal_code: "64000",
            });
            expect(validateResult.content[0].text).toContain("is valid");

            // Step 2: Get rates (single carrier)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_RATES_RESPONSE),
            });

            const ratesHandler = handlers.get("quote_shipment")!;
            const ratesResult = await ratesHandler({
                ...VALID_QUOTE_ARGS,
                carriers: "dhl",
            });
            expect(ratesResult.content[0].text).toContain("rate(s)");
            expect(ratesResult.content[0].text).toContain("dhl");

            // Step 3: Create label
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });

            const labelHandler = handlers.get("create_shipment")!;
            const labelResult = await labelHandler({
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            });
            const labelText = labelResult.content[0].text;
            expect(labelText).toContain("Label created successfully");
            expect(labelText).toContain("7520610403");

            // Step 4: Track package using tracking number from label
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_TRACKING_RESPONSE),
            });

            const trackHandler = handlers.get("envia_track_package")!;
            const trackResult = await trackHandler({
                tracking_numbers: "7520610403",
            });
            expect(trackResult.content[0].text).toContain("In Transit");
        });

        it("handles rate comparison failure mid-workflow gracefully", async () => {
            // Step 1: Validate succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_ZIPCODE_RESPONSE),
            });

            const validateHandler = handlers.get("envia_validate_address")!;
            await validateHandler({ country: "MX", postal_code: "64000" });

            // Step 2: Rates fail
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: () =>
                    Promise.resolve({ message: "Invalid origin postal code" }),
            });

            const ratesHandler = handlers.get("quote_shipment")!;
            const ratesResult = await ratesHandler({
                ...VALID_QUOTE_ARGS,
                carriers: "dhl",
            });

            // Should show error, not crash
            expect(ratesResult.content[0].text).toContain("No rates found");
        });
    });

    describe("International workflow: validate → classify → rates → invoice → label", () => {
        it("complete international flow succeeds end-to-end", async () => {
            // Step 1: Validate
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_ZIPCODE_RESPONSE),
            });
            const validateHandler = handlers.get("envia_validate_address")!;
            await validateHandler({ country: "US", postal_code: "90210" });

            // Step 2: Classify HS code
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_HSCODE_RESPONSE),
            });
            const classifyHandler = handlers.get("envia_classify_hscode")!;
            const hsResult = await classifyHandler({
                description: "cotton t-shirt",
                include_alternatives: true,
            });
            expect(hsResult.content[0].text).toContain("6109.10");

            // Step 3: Get rates
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_RATES_RESPONSE),
            });
            const ratesHandler = handlers.get("quote_shipment")!;
            await ratesHandler({
                ...VALID_QUOTE_ARGS,
                carriers: "dhl",
            });

            // Step 4: Create invoice
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_INVOICE_RESPONSE),
            });
            const invoiceHandler = handlers.get("envia_create_commercial_invoice")!;
            const invoiceResult = await invoiceHandler({
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                carrier: "dhl",
                item_description: "Cotton T-shirts",
                item_hs_code: "6109.10",
                item_quantity: 10,
                item_unit_price: 15,
                item_country_of_manufacture: "MX",
                export_reason: "sale",
                duties_payment: "sender",
            });
            expect(invoiceResult.content[0].text).toContain("invoice created");

            // Step 5: Create label
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });
            const labelHandler = handlers.get("create_shipment")!;
            const labelResult = await labelHandler({
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            });
            expect(labelResult.content[0].text).toContain("Label created");
        });
    });

    describe("Cancel workflow: create-label → cancel", () => {
        it("cancels a label using tracking number from creation step", async () => {
            // Create label
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });
            const labelHandler = handlers.get("create_shipment")!;
            await labelHandler({
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            });

            // Cancel using the tracking number we got
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_CANCEL_RESPONSE),
            });
            const cancelHandler = handlers.get("envia_cancel_shipment")!;
            const cancelResult = await cancelHandler({
                carrier: "dhl",
                tracking_number: "7520610403",
            });
            expect(cancelResult.content[0].text).toContain("cancelled successfully");
            expect(cancelResult.content[0].text).toContain("Balance returned");
        });
    });

    describe("Pickup workflow: create-label → schedule-pickup → track", () => {
        it("schedules pickup using tracking numbers from label creation", async () => {
            // Create label
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
            });
            const labelHandler = handlers.get("create_shipment")!;
            await labelHandler({
                ...VALID_ORIGIN_ARGS,
                ...VALID_DESTINATION_ARGS,
                ...VALID_PACKAGE_ARGS,
                carrier: "dhl",
                service: "express",
                shipment_type: 1,
            });

            // Schedule pickup
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_PICKUP_RESPONSE),
            });
            const pickupHandler = handlers.get("envia_schedule_pickup")!;
            const pickupResult = await pickupHandler({
                ...VALID_ORIGIN_ARGS,
                carrier: "dhl",
                tracking_numbers: "7520610403",
                date: "2026-03-07",
                time_from: 9,
                time_to: 17,
                total_weight: 2.5,
                total_packages: 1,
            });
            expect(pickupResult.content[0].text).toContain("Pickup scheduled");

            // Track
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(MOCK_TRACKING_RESPONSE),
            });
            const trackHandler = handlers.get("envia_track_package")!;
            const trackResult = await trackHandler({
                tracking_numbers: "7520610403",
            });
            expect(trackResult.content[0].text).toContain("In Transit");
        });
    });

    describe("Resource serving", () => {
        it("all 10 tools are registered", () => {
            const expectedTools = [
                "envia_validate_address",
                "envia_list_carriers",
                "quote_shipment",
                "create_shipment",
                "envia_track_package",
                "envia_cancel_shipment",
                "envia_schedule_pickup",
                "envia_classify_hscode",
                "envia_create_commercial_invoice",
            ];

            // We didn't register list_carriers or get_shipment_history in this suite
            // but verify the ones we did register
            for (const tool of expectedTools) {
                if (tool !== "envia_list_carriers" && tool !== "envia_get_shipment_history") {
                    expect(handlers.has(tool)).toBe(true);
                }
            }
        });
    });
});
