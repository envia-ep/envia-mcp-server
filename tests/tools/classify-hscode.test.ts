import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_HSCODE_RESPONSE,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerClassifyHscode } from "../../src/tools/classify-hscode.js";

describe("envia_classify_hscode", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_HSCODE_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerClassifyHscode(server, client, MOCK_CONFIG);
    handler = handlers.get("classify_hscode")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. calls POST /utils/classify-hscode with description
  // -------------------------------------------------------------------------
  it("calls POST /utils/classify-hscode with description", async () => {
    await handler({
      description: "cotton t-shirt",
      include_alternatives: true,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.shippingBase}/utils/classify-hscode`);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.description).toBe("cotton t-shirt");
  });

  // -------------------------------------------------------------------------
  // 2. includes hs_code_provided in body when specified
  // -------------------------------------------------------------------------
  it("includes hs_code_provided in body when specified", async () => {
    await handler({
      description: "cotton t-shirt",
      hs_code_provided: "6109.10",
      include_alternatives: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.hsCodeProvided).toBe("6109.10");
  });

  // -------------------------------------------------------------------------
  // 3. trims hs_code_provided
  // -------------------------------------------------------------------------
  it("trims hs_code_provided", async () => {
    await handler({
      description: "cotton t-shirt",
      hs_code_provided: "  6109.10  ",
      include_alternatives: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.hsCodeProvided).toBe("6109.10");
  });

  // -------------------------------------------------------------------------
  // 4. splits and uppercases destination_countries
  // -------------------------------------------------------------------------
  it("splits and uppercases destination_countries", async () => {
    await handler({
      description: "cotton t-shirt",
      destination_countries: " mx , us , co ",
      include_alternatives: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipToCountries).toEqual(["MX", "US", "CO"]);
  });

  // -------------------------------------------------------------------------
  // 5. sets includeAlternatives from include_alternatives param
  // -------------------------------------------------------------------------
  it("sets includeAlternatives from include_alternatives param", async () => {
    await handler({
      description: "cotton t-shirt",
      include_alternatives: false,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.includeAlternatives).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. returns formatted HS code with description and confidence on success
  // -------------------------------------------------------------------------
  it("returns formatted HS code with description and confidence on success", async () => {
    const result = await handler({
      description: "cotton t-shirt",
      include_alternatives: true,
    });
    const text = result.content[0].text;

    expect(text).toContain('HS Code classification for: "cotton t-shirt"');
    expect(text).toContain("Recommended HS code: 6109.10");
    expect(text).toContain("Description:");
    expect(text).toContain("Confidence:");
    expect(text).toContain("92%");
  });

  // -------------------------------------------------------------------------
  // 7. includes alternatives list when present
  // -------------------------------------------------------------------------
  it("includes alternatives list when present", async () => {
    const result = await handler({
      description: "cotton t-shirt",
      include_alternatives: true,
    });
    const text = result.content[0].text;

    expect(text).toContain("Alternatives:");
    expect(text).toContain("6109.90");
    expect(text).toContain("T-shirts of other textile materials");
    expect(text).toContain("78%");
    expect(text).toContain("6110.20");
    expect(text).toContain("Jerseys, pullovers of cotton");
    expect(text).toContain("65%");
  });

  // -------------------------------------------------------------------------
  // 8. returns "could not classify" when hsCode is missing
  // -------------------------------------------------------------------------
  it('returns "could not classify" when hsCode is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            // hsCode omitted
            description: "Unknown",
          },
          success: true,
        }),
    });

    const result = await handler({
      description: "some weird object",
      include_alternatives: true,
    });
    const text = result.content[0].text;

    expect(text).toContain("Could not classify");
  });

  // -------------------------------------------------------------------------
  // 9. returns error when API fails
  // -------------------------------------------------------------------------
  it("returns error when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: "Validation error" }),
    });

    const result = await handler({
      description: "cotton t-shirt",
      include_alternatives: true,
    });
    const text = result.content[0].text;

    expect(text).toContain("HS code classification failed:");
  });

  // -------------------------------------------------------------------------
  // 10. omits hsCodeProvided from body when not specified
  // -------------------------------------------------------------------------
  it("omits hsCodeProvided from body when not specified", async () => {
    await handler({
      description: "cotton t-shirt",
      include_alternatives: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("hsCodeProvided");
  });

  // -------------------------------------------------------------------------
  // 11. omits shipToCountries from body when not specified
  // -------------------------------------------------------------------------
  it("omits shipToCountries from body when not specified", async () => {
    await handler({
      description: "cotton t-shirt",
      include_alternatives: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("shipToCountries");
  });
});
