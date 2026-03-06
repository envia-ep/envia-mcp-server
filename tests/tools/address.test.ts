/**
 * Tests for the shared address builder utility.
 */

import { describe, it, expect } from "vitest";
import { buildAddress } from "../../src/utils/address.js";
import type { AddressInput } from "../../src/utils/address.js";

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
