import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_HISTORY_RESPONSE,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerGetShipmentHistory } from "../../src/tools/get-shipment-history.js";

describe("envia_get_shipment_history", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_HISTORY_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerGetShipmentHistory(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_get_shipment_history")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. calls GET /guide/{mm}/{year} with zero-padded month
  // -------------------------------------------------------------------------
  it("calls GET /guide/{mm}/{year} with zero-padded month", async () => {
    await handler({ month: 3, year: 2026 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.queriesBase}/guide/03/2026`);
    expect(opts.method).toBe("GET");
  });

  // -------------------------------------------------------------------------
  // 2. returns formatted shipment list
  // -------------------------------------------------------------------------
  it("returns formatted shipment list", async () => {
    const result = await handler({ month: 2, year: 2026 });
    const text = result.content[0].text;

    expect(text).toContain("Shipment history for 02/2026:");
    expect(text).toContain("7520610403");
    expect(text).toContain("dhl");
    expect(text).toContain("Delivered");
    expect(text).toContain("7520610404");
    expect(text).toContain("fedex");
    expect(text).toContain("In Transit");
  });

  // -------------------------------------------------------------------------
  // 3. limits display to 50 shipments
  // -------------------------------------------------------------------------
  it("limits display to 50 shipments", async () => {
    const shipments = Array.from({ length: 55 }, (_, i) => ({
      tracking_number: `TRACK${i}`,
      name: "dhl",
      status: "Delivered",
      sender_city: "Monterrey",
      consignee_city: "CDMX",
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: shipments }),
    });

    const result = await handler({ month: 1, year: 2026 });
    const text = result.content[0].text;

    // Should show first 50 but not the 51st
    expect(text).toContain("TRACK49");
    expect(text).not.toContain("TRACK50");
  });

  // -------------------------------------------------------------------------
  // 4. shows overflow message for >50 shipments
  // -------------------------------------------------------------------------
  it("shows overflow message for >50 shipments", async () => {
    const shipments = Array.from({ length: 55 }, (_, i) => ({
      tracking_number: `TRACK${i}`,
      name: "dhl",
      status: "Delivered",
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: shipments }),
    });

    const result = await handler({ month: 1, year: 2026 });
    const text = result.content[0].text;

    expect(text).toContain("... and 5 more shipments.");
  });

  // -------------------------------------------------------------------------
  // 5. returns "no shipments found" for empty response
  // -------------------------------------------------------------------------
  it('returns "no shipments found" for empty response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await handler({ month: 12, year: 2025 });
    const text = result.content[0].text;

    expect(text).toContain("No shipments found for 12/2025");
  });

  // -------------------------------------------------------------------------
  // 6. returns error when API fails
  // -------------------------------------------------------------------------
  it("returns error when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Bad request" }),
    });

    const result = await handler({ month: 3, year: 2026 });
    const text = result.content[0].text;

    expect(text).toContain("Failed to retrieve shipment history:");
  });

  // -------------------------------------------------------------------------
  // 7. handles missing optional fields (no sender_city/consignee_city)
  // -------------------------------------------------------------------------
  it("handles missing optional fields (no sender_city/consignee_city)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              tracking_number: "TRACK001",
              name: "dhl",
              status: "In Transit",
              // sender_city and consignee_city omitted
            },
          ],
        }),
    });

    const result = await handler({ month: 3, year: 2026 });
    const text = result.content[0].text;

    expect(text).toContain("TRACK001");
    expect(text).toContain("dhl");
    // Should NOT contain the route arrow since cities are missing
    expect(text).not.toContain("\u2192");
  });

  // -------------------------------------------------------------------------
  // 8. pads single-digit months (month=3 -> "03")
  // -------------------------------------------------------------------------
  it('pads single-digit months (month=3 -> "03")', async () => {
    await handler({ month: 3, year: 2026 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/guide/03/");
  });

  // -------------------------------------------------------------------------
  // 9. displays route arrow when both cities present
  // -------------------------------------------------------------------------
  it("displays route arrow when both cities present", async () => {
    const result = await handler({ month: 2, year: 2026 });
    const text = result.content[0].text;

    expect(text).toContain("Monterrey \u2192 Mexico City");
    expect(text).toContain("Guadalajara \u2192 Cancun");
  });
});
