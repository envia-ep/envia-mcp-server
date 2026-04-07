/**
 * Tests for the shared address builder utilities.
 */

import { describe, it, expect } from "vitest";
import { buildAddress, buildQuoteAddress } from "../../src/utils/address.js";
import type { AddressInput, QuoteAddressInput } from "../../src/utils/address.js";

describe("buildAddress", () => {
  const validInput: AddressInput = {
    name: "Juan Perez",
    phone: "+528180001234",
    street: "Av. Constitucion 123",
    city: "Monterrey",
    state: "NL",
    country: "mx",
    postal_code: "64000",
  };

  it("maps flat input to EnviaAddress format", () => {
    const result = buildAddress(validInput);

    expect(result).toEqual({
      name: "Juan Perez",
      phone: "+528180001234",
      street: "Av. Constitucion 123",
      city: "Monterrey",
      state: "NL",
      country: "MX",
      postalCode: "64000",
    });
  });

  it("uppercases country code", () => {
    const result = buildAddress({ ...validInput, country: "co" });
    expect(result.country).toBe("CO");
  });

  it("renames postal_code to postalCode", () => {
    const result = buildAddress(validInput);
    expect(result.postalCode).toBe("64000");
    expect((result as Record<string, unknown>).postal_code).toBeUndefined();
  });

  it("preserves all other fields without modification", () => {
    const input: AddressInput = {
      name: "  María López  ",
      phone: "+52 81 8000 5678",
      street: "Calle Reforma #456, Int. 2",
      city: "Ciudad de México",
      state: "CDMX",
      country: "MX",
      postal_code: "03100",
    };
    const result = buildAddress(input);

    expect(result.name).toBe("  María López  ");
    expect(result.phone).toBe("+52 81 8000 5678");
    expect(result.street).toBe("Calle Reforma #456, Int. 2");
    expect(result.city).toBe("Ciudad de México");
    expect(result.state).toBe("CDMX");
  });

  it("trims country whitespace during uppercase", () => {
    const result = buildAddress({ ...validInput, country: "  us  " });
    expect(result.country).toBe("US");
  });
});

// ---------------------------------------------------------------------------
// buildQuoteAddress
// ---------------------------------------------------------------------------

describe("buildQuoteAddress", () => {
    it("should return all geographic fields plus placeholder street when fully populated", () => {
        const input: QuoteAddressInput = {
            city: "Monterrey",
            state: "NL",
            country: "mx",
            postalCode: "64000",
        };

        const result = buildQuoteAddress(input);

        expect(result).toEqual({
            street: "Calle 1 #100",
            city: "Monterrey",
            state: "NL",
            country: "MX",
            postalCode: "64000",
        });
    });

    it("should always include a placeholder street", () => {
        const result = buildQuoteAddress({ country: "MX" });

        expect(result.street).toBe("Calle 1 #100");
    });

    it("should uppercase the country code", () => {
        const result = buildQuoteAddress({ country: "co", city: "11001000", state: "DC" });

        expect(result.country).toBe("CO");
    });

    it("should trim country whitespace", () => {
        const result = buildQuoteAddress({ country: "  mx  " });

        expect(result.country).toBe("MX");
    });

    it("should omit city when not provided", () => {
        const result = buildQuoteAddress({ country: "MX", postalCode: "64000" });

        expect(result.city).toBeUndefined();
        expect(result).not.toHaveProperty("city");
    });

    it("should omit state when not provided", () => {
        const result = buildQuoteAddress({ country: "MX", postalCode: "64000" });

        expect(result.state).toBeUndefined();
        expect(result).not.toHaveProperty("state");
    });

    it("should omit postalCode when not provided", () => {
        const result = buildQuoteAddress({ country: "CO", city: "11001000", state: "DC" });

        expect(result.postalCode).toBeUndefined();
        expect(result).not.toHaveProperty("postalCode");
    });

    it("should return street and country when no optional fields are provided", () => {
        const result = buildQuoteAddress({ country: "MX" });

        expect(result).toEqual({ street: "Calle 1 #100", country: "MX" });
    });

    it("should not include name or phone fields", () => {
        const result = buildQuoteAddress({
            city: "Monterrey",
            state: "NL",
            country: "MX",
            postalCode: "64000",
        });

        expect(result).not.toHaveProperty("name");
        expect(result).not.toHaveProperty("phone");
    });
});
