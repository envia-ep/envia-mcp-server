/**
 * Tool: envia_validate_address
 *
 * Validates a postal code or looks up a city to get normalised address data.
 * Always call this before requesting rates — it prevents label failures caused
 * by invalid or mismatched address fields.
 *
 * NOTE: The Geocodes API returns a raw JSON array (not wrapped in { data: ... })
 * and is only available as a production endpoint — there is no sandbox version.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import { resolveClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";
import { countrySchema, optionalApiKeySchema } from "../utils/schemas.js";
import { fetchGenericForm, getRequiredFields } from "../services/generic-form.js";
import { textResponse } from '../utils/mcp-response.js';
import { transformPostalCode } from "../utils/address-resolver.js";

/** Shape of a single zipcode result from GET /zipcode/{country}/{code}. */
interface ZipcodeEntry {
    zip_code?: string;
    country?: { name?: string; code?: string };
    state?: { name?: string; code?: { "2digit"?: string; "3digit"?: string } };
    locality?: string;
    suburbs?: string[];
    coordinates?: { latitude?: string; longitude?: string };
}

/** Shape of a single city-locate result from GET /locate/{country}/{city}. */
interface LocateEntry {
    country?: { name?: string; code?: string };
    state?: { name?: string; code?: { "2digit"?: string; "3digit"?: string } };
    zip_codes?: { zip_code?: string; locality?: string }[];
}

export function registerValidateAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        "envia_validate_address",
        {
            description:
                "Validate a postal code or look up a city to get the correct city, state, and country values. " +
                "Use this before creating labels to prevent address-related errors. " +
                "Provide either postal_code or city (or both). Country is always required (2-letter ISO code, e.g. MX, US, CO).",
            inputSchema: z.object({
                api_key: optionalApiKeySchema,
                country: countrySchema.describe("ISO 3166-1 alpha-2 country code (e.g. MX, US, CO, BR)"),
                postal_code: z
                    .string()
                    .optional()
                    .describe("Postal / ZIP code to validate (e.g. 03100, 90210)"),
                city: z
                    .string()
                    .optional()
                    .describe("City name to look up (e.g. Monterrey, Bogota). Used when postal code is unknown."),
            }),
        },
        async (args) => {
            const { country, postal_code, city } = args;
            const activeClient = resolveClient(client, args.api_key, config);

            const countryCode = country.trim().toUpperCase();

            // At least one of postal_code or city is required
            if (!postal_code && !city) {
                return textResponse('Error: Provide at least one of postal_code or city to validate.');
            }

            const results: string[] = [];

            // 1. Validate postal code
            if (postal_code) {
                const pc = postal_code.trim();
                const normalizedPc = transformPostalCode(countryCode, pc);
                // URL-encode both path segments to prevent path traversal
                const url = `${config.geocodesBase}/zipcode/${encodeURIComponent(countryCode)}/${encodeURIComponent(normalizedPc)}`;
                const res = await activeClient.get<ZipcodeEntry[]>(url);

                if (!res.ok) {
                    results.push(`Postal code validation failed: ${res.error}`);
                } else {
                    // Geocodes API returns a raw array — not wrapped in { data: ... }
                    const entries = Array.isArray(res.data) ? res.data : [];

                    if (entries.length === 0) {
                        results.push(
                            `Postal code "${pc}" was not found in ${countryCode}. Double-check the code or try envia_validate_address with the city name instead.`,
                        );
                    } else {
                        const d = entries[0];
                        const stateName = d.state?.name ?? "—";
                        const stateCode = d.state?.code?.["2digit"] ?? "";
                        const stateDisplay = stateCode ? `${stateName} (${stateCode})` : stateName;

                        const pcDisplay = normalizedPc !== pc
                            ? `Postal code ${pc} (normalized to ${normalizedPc}) is valid.`
                            : `Postal code ${pc} is valid.`;
                        const lines = [
                            pcDisplay,
                            `  City:    ${d.locality ?? "—"}`,
                            `  State:   ${stateDisplay}`,
                            `  Country: ${countryCode}`,
                        ];

                        if (d.suburbs && d.suburbs.length > 0) {
                            const shown = d.suburbs.slice(0, 10);
                            lines.push(`  Suburbs: ${shown.join(", ")}${d.suburbs.length > 10 ? ` (+${d.suburbs.length - 10} more)` : ""}`);
                        }

                        results.push(lines.join("\n"));
                    }
                }
            }

            // 2. Look up city
            if (city) {
                const cityName = city.trim();
                const url = `${config.geocodesBase}/locate/${encodeURIComponent(countryCode)}/${encodeURIComponent(cityName)}`;
                const res = await activeClient.get<LocateEntry[]>(url);

                if (!res.ok) {
                    results.push(`City lookup failed: ${res.error}`);
                } else {
                    // Geocodes API returns a raw array — not wrapped in { data: ... }
                    const entries = Array.isArray(res.data) ? res.data : [];

                    if (entries.length === 0) {
                        results.push(`City "${cityName}" was not found in ${countryCode}.`);
                    } else {
                        const lines: string[] = [`City lookup results for "${cityName}":`, ""];

                        for (const entry of entries.slice(0, 10)) {
                            const stateName = entry.state?.name ?? "—";
                            const stateCode = entry.state?.code?.["2digit"] ?? "";
                            const zips = entry.zip_codes?.map((z) => z.zip_code).filter(Boolean).join(", ") ?? "—";
                            lines.push(`  • ${cityName}, ${stateCode || stateName} — ZIP: ${zips}`);
                        }

                        if (entries.length > 10) {
                            lines.push(`  ... and ${entries.length - 10} more matches`);
                        }

                        results.push(lines.join("\n"));
                    }
                }
            }

            // 3. Surface required fields from generic-form
            const formFields = await fetchGenericForm(countryCode, activeClient, config);
            if (formFields.length > 0) {
                const required = getRequiredFields(formFields);
                if (required.length > 0) {
                    const fieldLines = required.map(
                        (f) => `  - ${f.fieldLabel} (${f.toolParam})`,
                    );
                    results.push(
                        `Required fields for ${countryCode}:\n` + fieldLines.join("\n"),
                    );
                }
            }

            return textResponse(results.join("\n\n"));
        },
    );
}
