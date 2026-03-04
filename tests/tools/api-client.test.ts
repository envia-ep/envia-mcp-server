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
  geocodesBase: "https://geocodes-test.envia.com",
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
