/**
 * Security tests: Authentication credential protection
 *
 * Verifies that the API key (bearer token) is never leaked in error
 * messages, URLs, or any user-visible output, regardless of the error
 * condition encountered.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { loadConfig } from "../../src/config.js";
import type { EnviaConfig } from "../../src/config.js";

const SECRET_TOKEN = "SECRET-TOKEN-XYZ-987654";

const config: EnviaConfig = {
  apiKey: SECRET_TOKEN,
  environment: "sandbox",
  shippingBase: "https://api-test.envia.com",
  queriesBase: "https://queries-test.envia.com",
  geocodesBase: "https://geocodes-test.envia.com",
};

describe("Auth Security — API key never leaked", () => {
  let client: EnviaApiClient;

  beforeEach(() => {
    client = new EnviaApiClient(config);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Error messages must not contain the API key
  // -------------------------------------------------------------------------

  it("does not include API key in 401 error message", async () => {
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
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(SECRET_TOKEN);
  });

  it("does not include API key in 400 error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            message: "Invalid postal code format",
          }),
      }),
    );

    const result = await client.get("https://api-test.envia.com/test");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // The friendly error message must never proactively include the API key
    expect(result.error).not.toContain(SECRET_TOKEN);
    // Verify the error still contains useful info
    expect(result.error).toContain("Invalid postal code format");
  });

  it("does not include API key in 500 error message (after retries)", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: `Internal server error processing token ${SECRET_TOKEN}`,
          }),
      }),
    );

    const promise = client.get("https://api-test.envia.com/test");
    // Advance timers past all retry delays: 500 + 1000 + 2000 + buffer
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 1000);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(SECRET_TOKEN);

    vi.useRealTimers();
  });

  it("does not include API key in network error message (fetch rejects)", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new Error(`ECONNREFUSED: could not connect with key ${SECRET_TOKEN}`),
      ),
    );

    const promise = client.get("https://api-test.envia.com/test");
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 1000);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(SECRET_TOKEN);

    vi.useRealTimers();
  });

  it("does not include API key in SSRF blocked error message", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.get("https://evil.com/steal");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain(SECRET_TOKEN);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Token placement: only in Authorization header
  // -------------------------------------------------------------------------

  it("sends token only in Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("https://api-test.envia.com/test");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe(`Bearer ${SECRET_TOKEN}`);
  });

  it("does not append token to URL in GET requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("https://api-test.envia.com/test");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain(SECRET_TOKEN);
    expect(url).not.toContain("token");
    expect(url).not.toContain("api_key");
  });

  it("does not append token to URL in POST requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.post("https://api-test.envia.com/ship/rate/", {
      origin: { country: "MX" },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain(SECRET_TOKEN);
    expect(url).not.toContain("token");
    expect(url).not.toContain("api_key");
  });

  // -------------------------------------------------------------------------
  // loadConfig validation
  // -------------------------------------------------------------------------

  it("loadConfig throws when ENVIA_API_KEY is missing", () => {
    const originalKey = process.env.ENVIA_API_KEY;
    delete process.env.ENVIA_API_KEY;

    try {
      expect(() => loadConfig()).toThrow("ENVIA_API_KEY is required");
    } finally {
      // Restore the original value (may be undefined)
      if (originalKey !== undefined) {
        process.env.ENVIA_API_KEY = originalKey;
      }
    }
  });

  it("loadConfig error message does not contain any token value", () => {
    const originalKey = process.env.ENVIA_API_KEY;
    delete process.env.ENVIA_API_KEY;

    try {
      loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The error should instruct the user to set the key, but never
      // contain an actual key value.
      expect(message).not.toContain(SECRET_TOKEN);
      // Also verify it does not contain the test-suite default key
      expect(message).not.toContain("test-api-key-12345");
    } finally {
      if (originalKey !== undefined) {
        process.env.ENVIA_API_KEY = originalKey;
      }
    }
  });
});
