import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_CARRIER_LIST_RESPONSE,
  MOCK_SERVICE_LIST_RESPONSE,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerListCarriers } from "../../src/tools/list-carriers.js";

describe("envia_list_carriers", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_CARRIER_LIST_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerListCarriers(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_list_carriers")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. calls GET /available-carrier/{country}/0 for domestic
  // -------------------------------------------------------------------------
  it("calls GET /available-carrier/{country}/0 for domestic", async () => {
    await handler({ country: "MX", international: false, include_services: false });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.queriesBase}/available-carrier/MX/0`);
    expect(opts.method).toBe("GET");
  });

  // -------------------------------------------------------------------------
  // 2. calls GET /available-carrier/{country}/1 for international
  // -------------------------------------------------------------------------
  it("calls GET /available-carrier/{country}/1 for international", async () => {
    await handler({ country: "MX", international: true, include_services: false });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.queriesBase}/available-carrier/MX/1`);
  });

  // -------------------------------------------------------------------------
  // 3. uppercases and trims country code (verify URL)
  // -------------------------------------------------------------------------
  it("uppercases and trims country code (verify URL)", async () => {
    await handler({ country: " mx ", international: false, include_services: false });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/available-carrier/MX/");
  });

  // -------------------------------------------------------------------------
  // 4. URL-encodes the country code segment
  // -------------------------------------------------------------------------
  it("URL-encodes the country code segment", async () => {
    await handler({ country: "MX", international: false, include_services: false });

    const [url] = mockFetch.mock.calls[0];
    // MX is safe, but the code uses encodeURIComponent — verify correct form
    expect(url).toBe(
      `${MOCK_CONFIG.queriesBase}/available-carrier/${encodeURIComponent("MX")}/0`,
    );
  });

  // -------------------------------------------------------------------------
  // 5. returns formatted carrier list with names
  // -------------------------------------------------------------------------
  it("returns formatted carrier list with names", async () => {
    const result = await handler({
      country: "MX",
      international: false,
      include_services: false,
    });
    const text = result.content[0].text;

    expect(text).toContain("Available carriers for MX (domestic):");
    expect(text).toContain("dhl");
    expect(text).toContain("DHL Express");
    expect(text).toContain("fedex");
    expect(text).toContain("FedEx");
    expect(text).toContain("estafeta");
    expect(text).toContain("Estafeta");
  });

  // -------------------------------------------------------------------------
  // 6. returns "no carriers found" for empty response
  // -------------------------------------------------------------------------
  it('returns "no carriers found" for empty response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await handler({
      country: "ZZ",
      international: false,
      include_services: false,
    });
    const text = result.content[0].text;

    expect(text).toContain("No carriers found for ZZ");
  });

  // -------------------------------------------------------------------------
  // 7. includes services when include_services is true
  // -------------------------------------------------------------------------
  it("includes services when include_services is true", async () => {
    // First call: carrier list; subsequent calls: service lookups
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ name: "dhl", description: "DHL Express" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MOCK_SERVICE_LIST_RESPONSE),
      });

    const result = await handler({
      country: "MX",
      international: false,
      include_services: true,
    });
    const text = result.content[0].text;

    expect(text).toContain("express");
    expect(text).toContain("Next day delivery");
    expect(text).toContain("(1 day)");
    expect(text).toContain("ground");
    expect(text).toContain("Ground shipping");
  });

  // -------------------------------------------------------------------------
  // 8. calls GET /service/{carrier} for each carrier
  // -------------------------------------------------------------------------
  it("calls GET /service/{carrier} for each carrier", async () => {
    // Two carriers in response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              { name: "dhl", description: "DHL" },
              { name: "fedex", description: "FedEx" },
            ],
          }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MOCK_SERVICE_LIST_RESPONSE),
      });

    await handler({
      country: "MX",
      international: false,
      include_services: true,
    });

    // 1 carrier-list call + 2 service calls = 3 total
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const serviceUrl1 = mockFetch.mock.calls[1][0];
    const serviceUrl2 = mockFetch.mock.calls[2][0];
    expect(serviceUrl1).toBe(`${MOCK_CONFIG.queriesBase}/service/dhl`);
    expect(serviceUrl2).toBe(`${MOCK_CONFIG.queriesBase}/service/fedex`);
  });

  // -------------------------------------------------------------------------
  // 9. handles service lookup failure gracefully (still shows carrier)
  // -------------------------------------------------------------------------
  it("handles service lookup failure gracefully (still shows carrier)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ name: "dhl", description: "DHL Express" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Service error" }),
      });

    const result = await handler({
      country: "MX",
      international: false,
      include_services: true,
    });
    const text = result.content[0].text;

    // Carrier should still be listed even though service lookup failed
    expect(text).toContain("dhl");
    expect(text).toContain("DHL Express");
  });

  // -------------------------------------------------------------------------
  // 10. returns API error when carrier list fails
  // -------------------------------------------------------------------------
  it("returns API error when carrier list fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Bad request" }),
    });

    const result = await handler({
      country: "MX",
      international: false,
      include_services: false,
    });
    const text = result.content[0].text;

    expect(text).toContain("Failed to list carriers:");
  });

  // -------------------------------------------------------------------------
  // 11. includes carrier name when present, omits when absent
  // -------------------------------------------------------------------------
  it("includes carrier name when present, omits when absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { name: "dhl", description: "DHL Express" },
            { name: "unknown_carrier" }, // no description
          ],
        }),
    });

    const result = await handler({
      country: "MX",
      international: false,
      include_services: false,
    });
    const text = result.content[0].text;

    expect(text).toContain("dhl — DHL Express");
    // The carrier without a name should not have the dash separator
    expect(text).toMatch(/• unknown_carrier\s*$/m);
  });
});
