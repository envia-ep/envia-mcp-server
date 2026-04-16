import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_CANCEL_RESPONSE,
  mockFetchSuccess,
  mockFetchError,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerCancelShipment } from "../../src/tools/cancel-shipment.js";

describe("envia_cancel_shipment", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  const baseArgs = {
    carrier: "dhl",
    tracking_number: "7520610403",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_CANCEL_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);
    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerCancelShipment(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_cancel_shipment")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls POST /ship/cancel/ with carrier and tracking number", async () => {
    await handler({ ...baseArgs });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api-test.envia.com/ship/cancel/");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.carrier).toBe("dhl");
    expect(body.trackingNumber).toBe("7520610403");
  });

  it("lowercases and trims carrier slug", async () => {
    await handler({ carrier: "  DHL  ", tracking_number: "7520610403" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.carrier).toBe("dhl");
  });

  it("trims tracking number", async () => {
    await handler({ carrier: "dhl", tracking_number: "  7520610403  " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.trackingNumber).toBe("7520610403");
  });

  it("returns success message with carrier and tracking number", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Shipment cancelled successfully.");
    expect(text).toContain("dhl");
    expect(text).toContain("7520610403");
  });

  it("reports refund 'Yes (amount not yet posted)' when balanceReturned is true without amount", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Refund:");
    expect(text).toContain("Yes (amount not yet posted)");
  });

  it("reports refund 'Pending' when balanceReturned is false", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            carrier: "dhl",
            trackingNumber: "7520610403",
            balanceReturned: false,
          },
        }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Refund:           Pending");
  });

  it("includes refund date when balanceReturnDate is present", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Refund date:");
    expect(text).toContain("2026-03-06");
  });

  it("shows refund amount with currency when provided", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            carrier: "dhl",
            trackingNumber: "7520610403",
            balanceReturned: true,
            refundAmount: 250,
            refundCurrency: "MXN",
          },
        }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("250.00 MXN");
  });

  it("surfaces daily-limit warning when backend flags it", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            carrier: "dhl",
            trackingNumber: "7520610403",
            balanceReturned: false,
            dailyLimitExceeded: true,
            dailyLimitReason: "5 cancellations per day exceeded",
          },
        }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Daily refund limit reached");
  });

  it("surfaces COD chargeback hint when backend triggered one", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            carrier: "dhl",
            trackingNumber: "7520610403",
            codChargeback: true,
            codAmount: 500,
          },
        }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("COD chargeback");
    expect(text).toContain("500");
  });

  it("returns error message when API fails", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Cannot cancel shipment" }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Cancellation failed:");
    expect(text).toContain("Cannot cancel shipment");
  });

  it("should include mapped suggestion in error response", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Expired" }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Cancellation failed:");
    expect(text).toContain("Suggestion:");
  });

  it("falls back to input args when response data fields are missing", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {},
        }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Shipment cancelled successfully.");
    // When data.carrier is undefined, it falls back to the input carrier arg
    expect(text).toContain("dhl");
    // When data.trackingNumber is undefined, it falls back to the input tracking_number arg
    expect(text).toContain("7520610403");
  });
});
