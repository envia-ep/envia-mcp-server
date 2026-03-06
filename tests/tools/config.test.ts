/**
 * Tests for configuration loader
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean relevant env vars
    delete process.env.ENVIA_API_KEY;
    delete process.env.ENVIA_ENVIRONMENT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when ENVIA_API_KEY is missing", () => {
    expect(() => loadConfig()).toThrow("ENVIA_API_KEY is required");
  });

  it("defaults to sandbox when ENVIA_ENVIRONMENT is not set", () => {
    process.env.ENVIA_API_KEY = "test-token";
    const config = loadConfig();

    expect(config.environment).toBe("sandbox");
    expect(config.shippingBase).toBe("https://api-test.envia.com");
    expect(config.queriesBase).toBe("https://queries-test.envia.com");
    // Geocodes API only has a production endpoint — no sandbox version exists
    expect(config.geocodesBase).toBe("https://geocodes.envia.com");
  });

  it("uses production URLs when ENVIA_ENVIRONMENT=production", () => {
    process.env.ENVIA_API_KEY = "test-token";
    process.env.ENVIA_ENVIRONMENT = "production";
    const config = loadConfig();

    expect(config.environment).toBe("production");
    expect(config.shippingBase).toBe("https://api.envia.com");
    expect(config.queriesBase).toBe("https://queries.envia.com");
    expect(config.geocodesBase).toBe("https://geocodes.envia.com");
  });

  it("falls back to sandbox for unknown environment values", () => {
    process.env.ENVIA_API_KEY = "test-token";
    process.env.ENVIA_ENVIRONMENT = "staging";
    const config = loadConfig();

    expect(config.environment).toBe("sandbox");
  });

  it("is case-insensitive for environment", () => {
    process.env.ENVIA_API_KEY = "test-token";
    process.env.ENVIA_ENVIRONMENT = "PRODUCTION";
    const config = loadConfig();

    expect(config.environment).toBe("production");
  });

  it("stores the API key", () => {
    process.env.ENVIA_API_KEY = "my-secret-token";
    const config = loadConfig();

    expect(config.apiKey).toBe("my-secret-token");
  });
});
