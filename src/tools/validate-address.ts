/**
 * Tool: envia_validate_address
 *
 * Validates a postal code or looks up a city to get normalised address data.
 * Always call this before requesting rates — it prevents label failures caused
 * by invalid or mismatched address fields.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";

export function registerValidateAddress(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_validate_address",
    "Validate a postal code or look up a city to get the correct city, state, and country values. " +
      "Use this before creating labels to prevent address-related errors. " +
      "Provide either postal_code or city (or both). Country is always required (2-letter ISO code, e.g. MX, US, CO).",
    {
      country: z.string().describe("ISO 3166-1 alpha-2 country code (e.g. MX, US, CO, BR)"),
      postal_code: z
        .string()
        .optional()
        .describe("Postal / ZIP code to validate (e.g. 03100, 90210)"),
      city: z
        .string()
        .optional()
        .describe("City name to look up (e.g. Monterrey, Bogota). Used when postal code is unknown."),
    },
    async ({ country, postal_code, city }) => {
      const countryCode = country.trim().toUpperCase();

      // At least one of postal_code or city is required
      if (!postal_code && !city) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Provide at least one of postal_code or city to validate.",
            },
          ],
        };
      }

      const results: string[] = [];

      // 1. Validate postal code
      if (postal_code) {
        const pc = postal_code.trim();
        const url = `${config.geocodesBase}/zipcode/${countryCode}/${pc}`;
        const res = await client.get<{ data: Record<string, unknown> }>(url);

        if (!res.ok) {
          results.push(`Postal code validation failed: ${res.error}`);
        } else if (!res.data?.data) {
          results.push(
            `Postal code "${pc}" was not found in ${countryCode}. Double-check the code or try envia_validate_address with the city name instead.`,
          );
        } else {
          const d = res.data.data as Record<string, unknown>;
          results.push(
            `Postal code ${pc} is valid.\n` +
              `  City:    ${d.city ?? "—"}\n` +
              `  State:   ${d.state ?? "—"}\n` +
              `  Country: ${countryCode}`,
          );
        }
      }

      // 2. Look up city
      if (city) {
        const cityName = city.trim();
        const url = `${config.geocodesBase}/locate/${countryCode}/${encodeURIComponent(cityName)}`;
        const res = await client.get<{ data: Record<string, unknown> }>(url);

        if (!res.ok) {
          results.push(`City lookup failed: ${res.error}`);
        } else if (!res.data?.data) {
          results.push(`City "${cityName}" was not found in ${countryCode}.`);
        } else {
          const d = res.data.data as Record<string, unknown>;
          results.push(
            `City lookup result:\n` +
              `  City:    ${d.city ?? cityName}\n` +
              `  State:   ${d.state ?? "—"}\n` +
              `  Country: ${countryCode}`,
          );
        }
      }

      return {
        content: [{ type: "text", text: results.join("\n\n") }],
      };
    },
  );
}
