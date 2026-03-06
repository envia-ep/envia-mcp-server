import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  VALID_ORIGIN_ARGS,
  VALID_DESTINATION_ARGS,
  VALID_PACKAGE_ARGS,
  MOCK_RATES_RESPONSE,
  mockFetchSuccess,
  mockFetchError,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerGetShippingRates } from "../../src/tools/get-shipping-rates.js";

describe("envia_get_shipping_rates", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  const baseArgs = {
    ...VALID_ORIGIN_ARGS,
    ...VALID_DESTINATION_ARGS,
    ...VALID_PACKAGE_ARGS,
    carriers: "dhl,fedex",
    shipment_type: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);
    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerGetShippingRates(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_get_shipping_rates")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends parallel rate requests for comma-separated carriers", async () => {
    await handler({ ...baseArgs, carriers: "dhl,fedex,estafeta" });

    expect(mockFetch).toHaveBeenCalledTimes(3);

    const urls = mockFetch.mock.calls.map((call: unknown[]) => call[0]);
    expect(urls.every((u: string) => u === "https://api-test.envia.com/ship/rate/")).toBe(true);

    const bodies = mockFetch.mock.calls.map((call: unknown[]) =>
      JSON.parse((call[1] as { body: string }).body),
    );
    const carriers = bodies.map((b: { shipment: { carrier: string } }) => b.shipment.carrier);
    expect(carriers).toContain("dhl");
    expect(carriers).toContain("fedex");
    expect(carriers).toContain("estafeta");
  });

  it("returns rates sorted by price cheapest first", async () => {
    // First carrier returns expensive rate, second returns cheap rate
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                carrier: "fedex",
                service: "overnight",
                totalPrice: "500.00",
                currency: "MXN",
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                carrier: "dhl",
                service: "ground",
                totalPrice: "100.00",
                currency: "MXN",
              },
            ],
          }),
      });

    const result = await handler({ ...baseArgs, carriers: "fedex,dhl" });
    const text = result.content[0].text;

    const groundIndex = text.indexOf("dhl / ground");
    const overnightIndex = text.indexOf("fedex / overnight");
    expect(groundIndex).toBeLessThan(overnightIndex);
  });

  it("formats rate output with carrier, service, price, and delivery estimate", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "express",
              serviceDescription: "DHL Express",
              totalPrice: "250.00",
              currency: "MXN",
              deliveryEstimate: "1-2 business days",
            },
          ],
        }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl" });
    const text = result.content[0].text;

    expect(text).toContain("dhl / express");
    expect(text).toContain("(DHL Express)");
    expect(text).toContain("$250.00 MXN");
    expect(text).toContain("1-2 business days");
  });

  it("handles single carrier correctly", async () => {
    await handler({ ...baseArgs, carriers: "dhl" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.carrier).toBe("dhl");
  });

  it("caps carrier list at 10 entries", async () => {
    const twelveCarriers = "c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12";
    await handler({ ...baseArgs, carriers: twelveCarriers });

    expect(mockFetch).toHaveBeenCalledTimes(10);
  });

  it("returns error when no carriers provided (empty string)", async () => {
    const result = await handler({ ...baseArgs, carriers: "" });
    const text = result.content[0].text;

    expect(text).toContain("Error");
    expect(text).toContain("at least one carrier");
  });

  it("lowercases and trims carrier slugs", async () => {
    await handler({ ...baseArgs, carriers: "  DHL , FedEx  " });

    const bodies = mockFetch.mock.calls.map((call: unknown[]) =>
      JSON.parse((call[1] as { body: string }).body),
    );
    const carriers = bodies.map((b: { shipment: { carrier: string } }) => b.shipment.carrier);
    expect(carriers).toContain("dhl");
    expect(carriers).toContain("fedex");
  });

  it("returns error messages when all carrier requests fail", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Invalid carrier" }),
    });

    const result = await handler({ ...baseArgs, carriers: "badcarrier1,badcarrier2" });
    const text = result.content[0].text;

    expect(text).toContain("No rates found");
    expect(text).toContain("Errors");
  });

  it("returns partial results when some carriers succeed and others fail", async () => {
    mockFetch.mockReset();
    // First carrier succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "express",
              totalPrice: "250.00",
              currency: "MXN",
            },
          ],
        }),
    });
    // Second carrier fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Invalid carrier" }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl,badcarrier" });
    const text = result.content[0].text;

    // Should still include the successful rate
    expect(text).toContain("dhl / express");
    expect(text).toContain("$250.00");
    // Should also mention errors
    expect(text).toContain("Carrier errors:");
  });

  it("handles Promise.allSettled rejected entries (network errors)", async () => {
    mockFetch.mockReset();
    // First carrier succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "express",
              totalPrice: "250.00",
              currency: "MXN",
            },
          ],
        }),
    });
    // Second carrier throws network error
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await handler({ ...baseArgs, carriers: "dhl,fedex" });
    const text = result.content[0].text;

    // Should still have the successful rate
    expect(text).toContain("dhl / express");
  });

  it("handles API error responses for individual carriers", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: "Validation error" }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl" });
    const text = result.content[0].text;

    expect(text).toContain("No rates found");
  });

  it("handles empty rates array from successful API response", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl" });
    const text = result.content[0].text;

    expect(text).toContain("No rates");
  });

  it("omits delivery estimate when not present", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "standard",
              totalPrice: "180.00",
              currency: "MXN",
            },
          ],
        }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl" });
    const text = result.content[0].text;

    // The line should NOT have " | " delivery estimate suffix
    const rateLine = text.split("\n").find((l: string) => l.startsWith("•"));
    expect(rateLine).toBeDefined();
    expect(rateLine).not.toContain("|");
  });

  it("omits service description when not present", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "standard",
              totalPrice: "180.00",
              currency: "MXN",
            },
          ],
        }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl" });
    const text = result.content[0].text;

    const rateLine = text.split("\n").find((l: string) => l.startsWith("•"));
    expect(rateLine).toBeDefined();
    // Should not have parenthesized service description
    expect(rateLine).not.toMatch(/\(.*\)/);
  });

  it("defaults currency to MXN when not specified", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "express",
              totalPrice: "250.00",
              // no currency field
            },
          ],
        }),
    });

    const result = await handler({ ...baseArgs, carriers: "dhl" });
    const text = result.content[0].text;

    expect(text).toContain("$250.00 MXN");
  });

  it("includes 'Next step' guidance in success output", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Next step:");
    expect(text).toContain("envia_create_label");
  });
});
