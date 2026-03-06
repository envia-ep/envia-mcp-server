/**
 * Advanced API client tests: retry logic, backoff timing, timeout, malformed JSON.
 *
 * These complement the existing api-client.test.ts which covers SSRF, auth
 * headers, error codes, and basic HTTP behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import type { EnviaConfig } from "../../src/config.js";

const config: EnviaConfig = {
  apiKey: "test-token",
  environment: "sandbox",
  shippingBase: "https://api-test.envia.com",
  queriesBase: "https://queries-test.envia.com",
  geocodesBase: "https://geocodes-test.envia.com",
};

describe("EnviaApiClient — advanced behaviour", () => {
  let client: EnviaApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    client = new EnviaApiClient(config);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Retry logic
  // -------------------------------------------------------------------------
  describe("Retry logic", () => {
    it("retries up to 3 times on 500 errors then returns error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Internal error" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const promise = client.get("https://api-test.envia.com/test");

      // Advance through all retry delays: 500ms + 1000ms + 2000ms
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;

      // 1 initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("server error");
    });

    it("retries on 429 (rate limited) errors", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "ok" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const promise = client.get("https://api-test.envia.com/test");
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
    });

    it("does NOT retry on 400 (client error)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Bad request" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get("https://api-test.envia.com/test");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Bad request");
    });

    it("does NOT retry on 401 (auth error)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get("https://api-test.envia.com/test");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Authentication failed");
    });

    it("does NOT retry on 422 (validation error)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: "Invalid field" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get("https://api-test.envia.com/test");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Validation error");
    });

    it("succeeds on second attempt after initial 500", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "recovered" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const promise = client.get("https://api-test.envia.com/test");
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Network-level errors (fetch rejection)
  // -------------------------------------------------------------------------
  describe("Network-level errors", () => {
    it("retries on network errors up to 3 times", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      vi.stubGlobal("fetch", mockFetch);

      const promise = client.get("https://api-test.envia.com/test");
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Network error");
      // Must NOT leak raw error details
      expect(result.error).not.toContain("ECONNREFUSED");
    });
  });

  // -------------------------------------------------------------------------
  // Malformed response handling
  // -------------------------------------------------------------------------
  describe("Malformed response handling", () => {
    it("handles response with invalid JSON gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get("https://api-test.envia.com/test");

      // Falls back to {} instead of crashing
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({});
    });

    it("handles response.json() rejection on error response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error("not json")),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.get("https://api-test.envia.com/test");

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Timeout handling
  // -------------------------------------------------------------------------
  describe("Timeout handling", () => {
    it("aborts requests that exceed the timeout", async () => {
      // Mock fetch that never resolves (simulates hanging connection)
      const mockFetch = vi.fn().mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          }),
      );
      vi.stubGlobal("fetch", mockFetch);

      const promise = client.request({
        url: "https://api-test.envia.com/test",
        timeoutMs: 5000,
      });

      // Advance past timeout (5s) + retry delays
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });
});
