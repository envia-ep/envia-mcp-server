import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  VALID_ORIGIN_ARGS,
  VALID_DESTINATION_ARGS,
  VALID_PACKAGE_ARGS,
  MOCK_LABEL_RESPONSE,
  mockFetchSuccess,
  mockFetchError,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerCreateLabel } from "../../src/tools/create-label.js";

describe("envia_create_label", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  const baseArgs = {
    ...VALID_ORIGIN_ARGS,
    ...VALID_DESTINATION_ARGS,
    ...VALID_PACKAGE_ARGS,
    carrier: "dhl",
    service: "express",
    shipment_type: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_LABEL_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);
    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerCreateLabel(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_create_label")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls POST /ship/generate/ with correctly structured body", async () => {
    await handler({ ...baseArgs });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api-test.envia.com/ship/generate/");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body).toHaveProperty("origin");
    expect(body).toHaveProperty("destination");
    expect(body).toHaveProperty("packages");
    expect(body).toHaveProperty("shipment");
    expect(body.origin.name).toBe(VALID_ORIGIN_ARGS.origin_name);
    expect(body.destination.name).toBe(VALID_DESTINATION_ARGS.destination_name);
    expect(body.shipment.carrier).toBe("dhl");
    expect(body.shipment.service).toBe("express");
    expect(body.packages[0].weight).toBe(VALID_PACKAGE_ARGS.package_weight);
    expect(body.packages[0].dimensions.length).toBe(VALID_PACKAGE_ARGS.package_length);
  });

  it("returns tracking number and label URL on success", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Label created successfully!");
    expect(text).toContain("7520610403");
    expect(text).toContain("https://api.envia.com/labels/7520610403.pdf");
  });

  it("includes price and currency in output when present", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("$150.5");
    expect(text).toContain("MXN");
    expect(text).toContain("Price charged:");
  });

  it("includes multiple tracking numbers when response has array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              carrier: "dhl",
              service: "express",
              trackingNumber: "7520610403",
              trackingNumbers: ["7520610403", "7520610404", "7520610405"],
              label: "https://api.envia.com/labels/7520610403.pdf",
              totalPrice: 150.5,
              currency: "MXN",
            },
          ],
        }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("All tracking #s:");
    expect(text).toContain("7520610403, 7520610404, 7520610405");
  });

  it("includes tracking URL when present in response", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Tracking page:");
    expect(text).toContain("https://tracking.envia.com/7520610403");
  });

  it("returns error message when API responds with error", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ message: "Invalid carrier" }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Label creation failed:");
    expect(text).toContain("Invalid carrier");
  });

  it("returns unexpected response message when trackingNumber is missing", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ carrier: "dhl", service: "express" }] }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("unexpected response");
    expect(text).toContain("No tracking number found");
  });

  it("lowercases and trims carrier slug", async () => {
    await handler({ ...baseArgs, carrier: "  DHL  " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.carrier).toBe("dhl");
  });

  it("trims service code", async () => {
    await handler({ ...baseArgs, service: "  express  " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.service).toBe("express");
  });

  it("uses default values for package_content, declared_value, shipment_type", async () => {
    const argsWithoutDefaults = {
      ...VALID_ORIGIN_ARGS,
      ...VALID_DESTINATION_ARGS,
      package_weight: 2.5,
      package_length: 30,
      package_width: 20,
      package_height: 15,
      package_content: "General merchandise",
      package_declared_value: 0,
      carrier: "dhl",
      service: "express",
      shipment_type: 1,
    };

    await handler(argsWithoutDefaults);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.packages[0].content).toBe("General merchandise");
    expect(body.packages[0].declaredValue).toBe(0);
    expect(body.shipment.type).toBe(1);
  });

  it("builds origin address with country uppercased and postalCode field", async () => {
    await handler({ ...baseArgs, origin_country: "mx" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.origin.country).toBe("MX");
    expect(body.origin.postalCode).toBe(VALID_ORIGIN_ARGS.origin_postal_code);
    expect(body.origin).not.toHaveProperty("postal_code");
  });

  it("builds destination address with country uppercased and postalCode field", async () => {
    await handler({ ...baseArgs, destination_country: "mx" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.destination.country).toBe("MX");
    expect(body.destination.postalCode).toBe(VALID_DESTINATION_ARGS.destination_postal_code);
    expect(body.destination).not.toHaveProperty("postal_code");
  });

  it("includes 'Next steps' guidance in success output", async () => {
    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("Next steps:");
    expect(text).toContain("envia_track_package");
    expect(text).toContain("envia_schedule_pickup");
  });

  it("mentions envia_validate_address in error output tip", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Bad request" }),
    });

    const result = await handler({ ...baseArgs });
    const text = result.content[0].text;

    expect(text).toContain("envia_validate_address");
    expect(text).toContain("Tip:");
  });
});
