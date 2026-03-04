/**
 * Tests for shared Zod schemas — input validation security
 */

import { describe, it, expect } from "vitest";
import { countrySchema, carrierSchema, dateSchema, postalCodeSchema } from "../../src/utils/schemas.js";

describe("countrySchema", () => {
  it("accepts valid 2-letter codes", () => {
    expect(countrySchema.parse("MX")).toBe("MX");
    expect(countrySchema.parse("US")).toBe("US");
    expect(countrySchema.parse("co")).toBe("co"); // lowercase accepted, handler uppercases
  });

  it("rejects path traversal attempts", () => {
    expect(() => countrySchema.parse("../../admin")).toThrow();
    expect(() => countrySchema.parse("../")).toThrow();
    expect(() => countrySchema.parse("..")).toThrow();
  });

  it("rejects codes with special characters", () => {
    expect(() => countrySchema.parse("M?")).toThrow();
    expect(() => countrySchema.parse("M/")).toThrow();
    expect(() => countrySchema.parse("M#")).toThrow();
    expect(() => countrySchema.parse("M%")).toThrow();
  });

  it("rejects codes that are too long or too short", () => {
    expect(() => countrySchema.parse("M")).toThrow();
    expect(() => countrySchema.parse("MEX")).toThrow();
    expect(() => countrySchema.parse("")).toThrow();
  });
});

describe("carrierSchema", () => {
  it("accepts valid carrier slugs", () => {
    expect(carrierSchema.parse("dhl")).toBe("dhl");
    expect(carrierSchema.parse("fedex")).toBe("fedex");
    expect(carrierSchema.parse("estafeta")).toBe("estafeta");
    expect(carrierSchema.parse("ups-ground")).toBe("ups-ground");
  });

  it("rejects path traversal attempts", () => {
    expect(() => carrierSchema.parse("../../../etc/passwd")).toThrow();
    expect(() => carrierSchema.parse("dhl/../admin")).toThrow();
  });

  it("rejects URL injection attempts", () => {
    expect(() => carrierSchema.parse("dhl?admin=true")).toThrow();
    expect(() => carrierSchema.parse("dhl#fragment")).toThrow();
    expect(() => carrierSchema.parse("dhl/../../secret")).toThrow();
  });

  it("rejects empty or overly long values", () => {
    expect(() => carrierSchema.parse("")).toThrow();
    expect(() => carrierSchema.parse("a".repeat(31))).toThrow();
  });
});

describe("dateSchema", () => {
  it("accepts valid YYYY-MM-DD dates", () => {
    expect(dateSchema.parse("2026-03-04")).toBe("2026-03-04");
    expect(dateSchema.parse("2025-12-31")).toBe("2025-12-31");
  });

  it("rejects other formats", () => {
    expect(() => dateSchema.parse("03/04/2026")).toThrow();
    expect(() => dateSchema.parse("2026-3-4")).toThrow();
    expect(() => dateSchema.parse("March 4, 2026")).toThrow();
  });
});

describe("postalCodeSchema", () => {
  it("accepts valid postal codes", () => {
    expect(postalCodeSchema.parse("03100")).toBe("03100");
    expect(postalCodeSchema.parse("90210")).toBe("90210");
    expect(postalCodeSchema.parse("SW1A 1AA")).toBe("SW1A 1AA"); // UK format
  });

  it("rejects codes with dangerous characters", () => {
    expect(() => postalCodeSchema.parse("../")).toThrow();
    expect(() => postalCodeSchema.parse("031?00")).toThrow();
    expect(() => postalCodeSchema.parse("031#00")).toThrow();
    expect(() => postalCodeSchema.parse("031/00")).toThrow();
  });
});
