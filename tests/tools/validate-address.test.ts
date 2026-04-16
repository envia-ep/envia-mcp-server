import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_ZIPCODE_RESPONSE,
  MOCK_CITY_RESPONSE,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerValidateAddress } from "../../src/tools/validate-address.js";
import { clearFormCache } from "../../src/services/generic-form.js";

describe("envia_validate_address", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearFormCache();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_ZIPCODE_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerValidateAddress(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_validate_address")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearFormCache();
  });

  // -------------------------------------------------------------------------
  // 1. validates postal code via GET /zipcode/{country}/{code}
  // -------------------------------------------------------------------------
  it("validates postal code via GET /zipcode/{country}/{code}", async () => {
    await handler({ country: "MX", postal_code: "03100" });

    // 1 zipcode call + 1 generic-form call
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.geocodesBase}/zipcode/MX/03100`);
    expect(opts.method).toBe("GET");
  });

  // -------------------------------------------------------------------------
  // 2. looks up city via GET /locate/{country}/{city}
  // -------------------------------------------------------------------------
  it("looks up city via GET /locate/{country}/{city}", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_CITY_RESPONSE),
    });

    await handler({ country: "MX", city: "Monterrey" });

    // 1 locate call + 1 generic-form call
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.geocodesBase}/locate/MX/Monterrey`);
    expect(opts.method).toBe("GET");
  });

  // -------------------------------------------------------------------------
  // 3. runs both lookups when both provided
  // -------------------------------------------------------------------------
  it("runs both lookups when both provided", async () => {
    // First call for postal code, second for city
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MOCK_ZIPCODE_RESPONSE),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MOCK_CITY_RESPONSE),
      });

    const result = await handler({
      country: "MX",
      postal_code: "03100",
      city: "Monterrey",
    });

    // 1 zipcode + 1 locate + 1 generic-form
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const text = result.content[0].text;
    expect(text).toContain("Postal code 03100 is valid");
    expect(text).toContain("City lookup results for");
  });

  // -------------------------------------------------------------------------
  // 4. returns error when neither postal_code nor city provided
  // -------------------------------------------------------------------------
  it("returns error when neither postal_code nor city provided", async () => {
    const result = await handler({ country: "MX" });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain(
      "Error: Provide at least one of postal_code or city to validate.",
    );
  });

  // -------------------------------------------------------------------------
  // 5. uppercases country code
  // -------------------------------------------------------------------------
  it("uppercases country code", async () => {
    await handler({ country: "mx", postal_code: "03100" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/zipcode/MX/");
  });

  // -------------------------------------------------------------------------
  // 6. URL-encodes postal code segment
  // -------------------------------------------------------------------------
  it("URL-encodes postal code segment (verify URL in fetch call)", async () => {
    await handler({ country: "MX", postal_code: "03 100" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `${MOCK_CONFIG.geocodesBase}/zipcode/MX/${encodeURIComponent("03 100")}`,
    );
  });

  // -------------------------------------------------------------------------
  // 7. URL-encodes city segment
  // -------------------------------------------------------------------------
  it("URL-encodes city segment (verify URL in fetch call)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_CITY_RESPONSE),
    });

    await handler({ country: "MX", city: "San Miguel" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `${MOCK_CONFIG.geocodesBase}/locate/MX/${encodeURIComponent("San Miguel")}`,
    );
  });

  // -------------------------------------------------------------------------
  // 8. returns formatted result with city, state, country on success
  // -------------------------------------------------------------------------
  it("returns formatted result with city, state, country on success", async () => {
    const result = await handler({ country: "MX", postal_code: "03100" });
    const text = result.content[0].text;

    expect(text).toContain("Postal code 03100 is valid.");
    expect(text).toContain("City:    Del Valle");
    expect(text).toContain("State:   Ciudad de México (DF)");
    expect(text).toContain("Country: MX");
    expect(text).toContain("Suburbs: Del Valle Centro");
  });

  // -------------------------------------------------------------------------
  // 8b. shows normalization info when postal code is transformed (e.g. BR)
  // -------------------------------------------------------------------------
  it("should show normalization info when postal code is transformed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_ZIPCODE_RESPONSE),
    });

    const result = await handler({ country: "BR", postal_code: "01001000" });
    const text = result.content[0].text;

    // transformPostalCode('BR', '01001000') => '01001-000'
    expect(text).toContain("(normalized to 01001-000)");
    expect(text).toContain("is valid.");

    // Verify the API was called with the normalized postal code
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/zipcode/BR/01001-000");
  });

  // -------------------------------------------------------------------------
  // 8c. does not show normalization info when postal code is unchanged
  // -------------------------------------------------------------------------
  it("should not show normalization info when postal code is unchanged", async () => {
    const result = await handler({ country: "MX", postal_code: "03100" });
    const text = result.content[0].text;

    expect(text).toContain("Postal code 03100 is valid.");
    expect(text).not.toContain("normalized to");
  });

  // -------------------------------------------------------------------------
  // 9. returns "not found" when postal code data is null
  // -------------------------------------------------------------------------
  it('returns "not found" when postal code data is empty array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    const result = await handler({ country: "MX", postal_code: "99999" });
    const text = result.content[0].text;

    expect(text).toContain("was not found in MX");
  });

  // -------------------------------------------------------------------------
  // 10. returns "not found" when city data is empty array
  // -------------------------------------------------------------------------
  it('returns "not found" when city data is empty array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    const result = await handler({ country: "MX", city: "FakeCity" });
    const text = result.content[0].text;

    expect(text).toContain('was not found in MX');
  });

  // -------------------------------------------------------------------------
  // 11. returns API error message when postal code validation fails
  // -------------------------------------------------------------------------
  it("returns API error message when postal code validation fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Invalid postal code" }),
    });

    const result = await handler({ country: "MX", postal_code: "03100" });
    const text = result.content[0].text;

    expect(text).toContain("Postal code validation failed:");
  });

  // -------------------------------------------------------------------------
  // 12. returns API error message when city lookup fails
  // -------------------------------------------------------------------------
  it("returns API error message when city lookup fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "City not found" }),
    });

    const result = await handler({ country: "MX", city: "Monterrey" });
    const text = result.content[0].text;

    expect(text).toContain("City lookup failed:");
  });
});
