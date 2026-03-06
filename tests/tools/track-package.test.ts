import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_TRACKING_RESPONSE,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerTrackPackage } from "../../src/tools/track-package.js";

describe("envia_track_package", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_TRACKING_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerTrackPackage(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_track_package")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. calls POST /ship/generaltrack/ with array of tracking numbers
  // -------------------------------------------------------------------------
  it("calls POST /ship/generaltrack/ with array of tracking numbers", async () => {
    await handler({ tracking_numbers: "7520610403" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/generaltrack/`);
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.trackingNumbers).toEqual(["7520610403"]);
  });

  // -------------------------------------------------------------------------
  // 2. splits comma-separated tracking numbers and trims whitespace
  // -------------------------------------------------------------------------
  it("splits comma-separated tracking numbers and trims whitespace", async () => {
    await handler({ tracking_numbers: " 7520610403 , 7520610404 , 7520610405 " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.trackingNumbers).toEqual([
      "7520610403",
      "7520610404",
      "7520610405",
    ]);
  });

  // -------------------------------------------------------------------------
  // 3. returns error when no tracking numbers provided (empty string)
  // -------------------------------------------------------------------------
  it("returns error when no tracking numbers provided (empty string)", async () => {
    const result = await handler({ tracking_numbers: "" });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain(
      "Error: Provide at least one tracking number.",
    );
  });

  // -------------------------------------------------------------------------
  // 4. returns formatted tracking status for single package
  // -------------------------------------------------------------------------
  it("returns formatted tracking status for single package", async () => {
    const result = await handler({ tracking_numbers: "7520610403" });
    const text = result.content[0].text;

    expect(text).toContain("Tracking: 7520610403");
    expect(text).toContain("Status:  In Transit");
  });

  // -------------------------------------------------------------------------
  // 5. returns formatted tracking for multiple packages
  // -------------------------------------------------------------------------
  it("returns formatted tracking for multiple packages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              trackingNumber: "AAA111",
              status: "Delivered",
              carrier: "dhl",
              eventHistory: [],
            },
            {
              trackingNumber: "BBB222",
              status: "In Transit",
              carrier: "fedex",
              eventHistory: [],
            },
          ],
        }),
    });

    const result = await handler({ tracking_numbers: "AAA111,BBB222" });
    const text = result.content[0].text;

    expect(text).toContain("Tracking: AAA111");
    expect(text).toContain("Tracking: BBB222");
    expect(text).toContain("Delivered");
    expect(text).toContain("In Transit");
  });

  // -------------------------------------------------------------------------
  // 6. shows carrier when present in response
  // -------------------------------------------------------------------------
  it("shows carrier when present in response", async () => {
    const result = await handler({ tracking_numbers: "7520610403" });
    const text = result.content[0].text;

    expect(text).toContain("Carrier: DHL Express");
  });

  // -------------------------------------------------------------------------
  // 7. formats event history with timestamp, location, and description
  // -------------------------------------------------------------------------
  it("formats event history with timestamp, location, and description", async () => {
    const result = await handler({ tracking_numbers: "7520610403" });
    const text = result.content[0].text;

    expect(text).toContain("Events:");
    expect(text).toContain("2026-03-05 14:30");
    expect(text).toContain("[Monterrey, NL]");
    expect(text).toContain("Package picked up");
  });

  // -------------------------------------------------------------------------
  // 8. limits displayed events to 10 and shows overflow count
  // -------------------------------------------------------------------------
  it("limits displayed events to 10 and shows overflow count", async () => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      timestamp: `2026-03-${String(i + 1).padStart(2, "0")} 10:00`,
      location: `City ${i}`,
      description: `Event ${i}`,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              trackingNumber: "7520610403",
              status: "In Transit",
              carrier: "dhl",
              eventHistory: events,
            },
          ],
        }),
    });

    const result = await handler({ tracking_numbers: "7520610403" });
    const text = result.content[0].text;

    // Should show exactly 10 event lines + overflow
    expect(text).toContain("... and 5 more events");
    // Should NOT show Event 10-14 (0-indexed)
    expect(text).toContain("Event 9");
    expect(text).not.toContain("Event 10");
  });

  // -------------------------------------------------------------------------
  // 9. shows "Unknown" for missing status
  // -------------------------------------------------------------------------
  it('shows "Unknown" for missing status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              trackingNumber: "7520610403",
              // status omitted
              eventHistory: [],
            },
          ],
        }),
    });

    const result = await handler({ tracking_numbers: "7520610403" });
    const text = result.content[0].text;

    expect(text).toContain("Status:  Unknown");
  });

  // -------------------------------------------------------------------------
  // 10. handles missing events array gracefully
  // -------------------------------------------------------------------------
  it("handles missing events array gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              trackingNumber: "7520610403",
              status: "Delivered",
              // events omitted
            },
          ],
        }),
    });

    const result = await handler({ tracking_numbers: "7520610403" });
    const text = result.content[0].text;

    expect(text).toContain("Tracking: 7520610403");
    expect(text).not.toContain("Events:");
  });

  // -------------------------------------------------------------------------
  // 11. returns "not found" message when API returns empty data array
  // -------------------------------------------------------------------------
  it('returns "not found" message when API returns empty data array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await handler({ tracking_numbers: "INVALID123" });
    const text = result.content[0].text;

    expect(text).toContain("No tracking information found");
  });

  // -------------------------------------------------------------------------
  // 12. returns error when API call fails
  // -------------------------------------------------------------------------
  it("returns error when API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ message: "Invalid tracking number format" }),
    });

    const result = await handler({ tracking_numbers: "BAD" });
    const text = result.content[0].text;

    expect(text).toContain("Tracking failed:");
  });
});
