import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_PICKUP_RESPONSE,
  VALID_ORIGIN_ARGS,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerSchedulePickup } from "../../src/tools/schedule-pickup.js";

const BASE_ARGS = {
  ...VALID_ORIGIN_ARGS,
  carrier: "dhl",
  tracking_numbers: "7520610403",
  date: "2026-03-07",
  time_from: 9,
  time_to: 17,
  total_weight: 5.0,
  total_packages: 2,
};

describe("envia_schedule_pickup", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_PICKUP_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerSchedulePickup(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_schedule_pickup")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. calls POST /ship/pickup/ with correct body structure
  // -------------------------------------------------------------------------
  it("calls POST /ship/pickup/ with correct body structure", async () => {
    await handler(BASE_ARGS);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/pickup/`);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty("origin");
    expect(body).toHaveProperty("shipment");
    expect(body.shipment).toHaveProperty("type", 1);
    expect(body.shipment).toHaveProperty("carrier", "dhl");
    expect(body.shipment).toHaveProperty("pickup");
    expect(body.shipment.pickup.trackingNumbers).toEqual(["7520610403"]);
  });

  // -------------------------------------------------------------------------
  // 2. splits and trims tracking numbers
  // -------------------------------------------------------------------------
  it("splits and trims tracking numbers", async () => {
    await handler({
      ...BASE_ARGS,
      tracking_numbers: " 7520610403 , 7520610404 ",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.pickup.trackingNumbers).toEqual([
      "7520610403",
      "7520610404",
    ]);
  });

  // -------------------------------------------------------------------------
  // 3. returns error when no tracking numbers provided
  // -------------------------------------------------------------------------
  it("returns error when no tracking numbers provided", async () => {
    const result = await handler({ ...BASE_ARGS, tracking_numbers: "" });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain(
      "Error: Provide at least one tracking number.",
    );
  });

  // -------------------------------------------------------------------------
  // 4. lowercases and trims carrier slug
  // -------------------------------------------------------------------------
  it("lowercases and trims carrier slug", async () => {
    await handler({ ...BASE_ARGS, carrier: "  DHL  " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.carrier).toBe("dhl");
  });

  // -------------------------------------------------------------------------
  // 5. builds origin address correctly
  // -------------------------------------------------------------------------
  it("builds origin address correctly", async () => {
    await handler(BASE_ARGS);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.origin).toEqual({
      name: VALID_ORIGIN_ARGS.origin_name,
      phone: VALID_ORIGIN_ARGS.origin_phone,
      street: VALID_ORIGIN_ARGS.origin_street,
      number: '',
      city: VALID_ORIGIN_ARGS.origin_city,
      state: VALID_ORIGIN_ARGS.origin_state,
      country: VALID_ORIGIN_ARGS.origin_country.toUpperCase(),
      postalCode: VALID_ORIGIN_ARGS.origin_postal_code,
    });
  });

  // -------------------------------------------------------------------------
  // 6. includes instructions in body when provided
  // -------------------------------------------------------------------------
  it("includes instructions in body when provided", async () => {
    await handler({
      ...BASE_ARGS,
      instructions: "Loading dock B, ring bell",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.pickup.instructions).toBe(
      "Loading dock B, ring bell",
    );
  });

  // -------------------------------------------------------------------------
  // 7. omits instructions from body when not provided
  // -------------------------------------------------------------------------
  it("omits instructions from body when not provided", async () => {
    await handler(BASE_ARGS);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.pickup).not.toHaveProperty("instructions");
  });

  // -------------------------------------------------------------------------
  // 8. returns success with confirmation, carrier, date, window
  // -------------------------------------------------------------------------
  it("returns success with confirmation, carrier, date, window", async () => {
    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Pickup scheduled successfully!");
    expect(text).toContain("Confirmation: PU-2026-001");
    expect(text).toContain("Carrier:");
    expect(text).toContain("Date:");
    expect(text).toContain("Window:");
  });

  // -------------------------------------------------------------------------
  // 9. falls back to input args when response fields missing
  // -------------------------------------------------------------------------
  it("falls back to input args when response fields missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            // All optional fields omitted from response
          },
        }),
    });

    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    // Should fall back to input values
    expect(text).toContain("dhl");
    expect(text).toContain("2026-03-07");
    expect(text).toContain("9:00");
    expect(text).toContain("17:00");
  });

  // -------------------------------------------------------------------------
  // 10. includes total packages and weight in output
  // -------------------------------------------------------------------------
  it("includes total packages and weight in output", async () => {
    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Packages:     2");
    expect(text).toContain("Weight:       5 KG");
  });

  // -------------------------------------------------------------------------
  // 11. returns error message when API fails
  // -------------------------------------------------------------------------
  it("returns error message when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ message: "Invalid pickup date" }),
    });

    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Pickup scheduling failed:");
  });

  // -------------------------------------------------------------------------
  // 12. mentions future business day in error tip
  // -------------------------------------------------------------------------
  it("should include mapped suggestion in error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({ message: "Date must be in the future" }),
    });

    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Pickup scheduling failed:");
    expect(text).toContain("Suggestion:");
  });
});
