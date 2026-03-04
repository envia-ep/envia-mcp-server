/**
 * Tests for input validators
 */

import { describe, it, expect } from "vitest";
import {
  validateCountry,
  validatePostalCode,
  validatePositiveNumber,
  validateTrackingNumbers,
  validateCarrier,
  validateDate,
  requireString,
} from "../../src/utils/validators.js";

describe("validateCountry", () => {
  it("accepts valid 2-letter country codes", () => {
    expect(validateCountry("MX")).toEqual({ valid: true, value: "MX" });
    expect(validateCountry("us")).toEqual({ valid: true, value: "US" });
    expect(validateCountry(" co ")).toEqual({ valid: true, value: "CO" });
  });

  it("rejects codes that are not 2 letters", () => {
    const result = validateCountry("MEX");
    expect(result.valid).toBe(false);
  });

  it("warns but allows unknown country codes", () => {
    const result = validateCountry("ZZ");
    expect(result.valid).toBe(false);
    expect((result as { error: string }).error).toContain("not in the known supported list");
  });
});

describe("validatePostalCode", () => {
  it("accepts valid postal codes", () => {
    expect(validatePostalCode("03100")).toEqual({ valid: true, value: "03100" });
    expect(validatePostalCode("90210")).toEqual({ valid: true, value: "90210" });
    expect(validatePostalCode(" 64000 ")).toEqual({ valid: true, value: "64000" });
  });

  it("rejects too-short codes", () => {
    const result = validatePostalCode("01");
    expect(result.valid).toBe(false);
  });

  it("rejects empty strings", () => {
    const result = validatePostalCode("");
    expect(result.valid).toBe(false);
  });
});

describe("validatePositiveNumber", () => {
  it("accepts positive numbers", () => {
    expect(validatePositiveNumber(5, "weight")).toEqual({ valid: true, value: 5 });
    expect(validatePositiveNumber(0.5, "weight")).toEqual({ valid: true, value: 0.5 });
    expect(validatePositiveNumber("3.14", "height")).toEqual({ valid: true, value: 3.14 });
  });

  it("rejects zero", () => {
    expect(validatePositiveNumber(0, "weight").valid).toBe(false);
  });

  it("rejects negative numbers", () => {
    expect(validatePositiveNumber(-1, "weight").valid).toBe(false);
  });

  it("rejects non-numbers", () => {
    expect(validatePositiveNumber("abc", "weight").valid).toBe(false);
  });
});

describe("validateTrackingNumbers", () => {
  it("accepts a single tracking number", () => {
    expect(validateTrackingNumbers("7520610403")).toEqual({
      valid: true,
      value: ["7520610403"],
    });
  });

  it("accepts comma-separated tracking numbers", () => {
    expect(validateTrackingNumbers("752061, 752062, 752063")).toEqual({
      valid: true,
      value: ["752061", "752062", "752063"],
    });
  });

  it("accepts an array", () => {
    expect(validateTrackingNumbers(["A", "B"])).toEqual({
      valid: true,
      value: ["A", "B"],
    });
  });

  it("rejects empty input", () => {
    expect(validateTrackingNumbers("").valid).toBe(false);
    expect(validateTrackingNumbers([]).valid).toBe(false);
  });
});

describe("validateCarrier", () => {
  it("normalises carrier slugs", () => {
    expect(validateCarrier("DHL")).toEqual({ valid: true, value: "dhl" });
    expect(validateCarrier(" FedEx ")).toEqual({ valid: true, value: "fedex" });
  });

  it("rejects empty carrier", () => {
    expect(validateCarrier("").valid).toBe(false);
  });
});

describe("validateDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(validateDate("2026-03-04")).toEqual({ valid: true, value: "2026-03-04" });
  });

  it("rejects invalid formats", () => {
    expect(validateDate("03/04/2026").valid).toBe(false);
    expect(validateDate("2026-3-4").valid).toBe(false);
  });
});

describe("requireString", () => {
  it("accepts non-empty strings", () => {
    expect(requireString("hello", "name")).toEqual({ valid: true, value: "hello" });
  });

  it("trims whitespace", () => {
    expect(requireString("  hello  ", "name")).toEqual({ valid: true, value: "hello" });
  });

  it("rejects empty or non-string", () => {
    expect(requireString("", "name").valid).toBe(false);
    expect(requireString(null, "name").valid).toBe(false);
    expect(requireString(undefined, "name").valid).toBe(false);
  });
});
