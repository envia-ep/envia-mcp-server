/**
 * Security tests: SSRF (Server-Side Request Forgery) prevention
 *
 * Verifies that EnviaApiClient blocks requests to any domain not in the
 * allowlist and that fetch is never called for blocked requests.
 *
 * Allowed domains:
 *   api.envia.com, api-test.envia.com,
 *   queries.envia.com, queries-test.envia.com,
 *   geocodes.envia.com (production only — no sandbox endpoint exists)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import type { EnviaConfig } from "../../src/config.js";

const config: EnviaConfig = {
    apiKey: "test-token",
    environment: "sandbox",
    shippingBase: "https://api-test.envia.com",
    queriesBase: "https://queries-test.envia.com",
    geocodesBase: "https://geocodes.envia.com",
};

describe("SSRF Prevention", () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        client = new EnviaApiClient(config);
        mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // Private / internal IP addresses
    // -------------------------------------------------------------------------

    it("blocks requests to 127.0.0.1 (IPv4 loopback)", async () => {
        const result = await client.request({ url: "http://127.0.0.1/admin" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks requests to 10.0.0.1 (private class A)", async () => {
        const result = await client.request({ url: "http://10.0.0.1/internal" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks requests to 192.168.1.1 (private class C)", async () => {
        const result = await client.request({ url: "http://192.168.1.1/router" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks requests to 172.16.0.1 (private class B)", async () => {
        const result = await client.request({ url: "http://172.16.0.1/vpc" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks requests to [::1] (IPv6 loopback)", async () => {
        const result = await client.request({ url: "http://[::1]/test" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks requests to 0.0.0.0 (unspecified address)", async () => {
        const result = await client.request({ url: "http://0.0.0.0/test" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Cloud metadata endpoints
    // -------------------------------------------------------------------------

    it("blocks requests to 169.254.169.254 (AWS metadata service)", async () => {
        const result = await client.request({
            url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks requests to metadata.google.internal (GCP metadata)", async () => {
        const result = await client.request({
            url: "http://metadata.google.internal/computeMetadata/v1/",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Dangerous protocols
    // -------------------------------------------------------------------------

    it("blocks file:// URLs", async () => {
        const result = await client.request({ url: "file:///etc/passwd" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks ftp:// URLs", async () => {
        const result = await client.request({ url: "ftp://evil.com/data.csv" });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks gopher:// URLs", async () => {
        const result = await client.request({
            url: "gopher://evil.com/_SSRF%0ATEST",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks javascript: URLs", async () => {
        // javascript: is not a valid URL for `new URL()` — should be caught
        // as an invalid URL and blocked.
        const result = await client.request({
            url: "javascript:alert(document.cookie)",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // URL manipulation / hostname spoofing
    // -------------------------------------------------------------------------

    it("blocks URL with @ to spoof hostname (credential section attack)", async () => {
        // The URL userinfo section before @ can make it look like the host is
        // api-test.envia.com, but the actual host is evil.com.
        const result = await client.request({
            url: "https://api-test.envia.com@evil.com/test",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks URL with double-encoded characters in hostname", async () => {
        // Attempt to bypass allowlist with URL encoding in the hostname.
        // new URL() decodes the hostname, so %65%76%69%6c = "evil"
        const result = await client.request({
            url: "https://%65%76%69%6c.com/test",
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(0);
        expect(result.error).toContain("Blocked");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Positive test: legitimate Envia domain
    // -------------------------------------------------------------------------

    it("allows requests to legitimate Envia domains", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: "ok" }),
        });

        const result = await client.request({
            url: "https://api-test.envia.com/ship/rate/",
        });

        expect(result.ok).toBe(true);
        expect(result.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledOnce();
    });
});
