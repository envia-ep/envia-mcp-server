/**
 * Tool: envia_classify_hscode
 *
 * Uses AI to classify a product description into a Harmonized System (HS) code,
 * which is required for international shipments to clear customs.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";

interface HsCodeData {
  hsCode?: string;
  description?: string;
  alternatives?: string[];
}

export function registerClassifyHscode(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_classify_hscode",
    "Classify a product into an HS code for international customs. " +
      "Describe the product in plain language and optionally specify destination countries. " +
      "Returns the recommended HS code and alternatives. " +
      "Use the HS code in the package items when calling envia_get_shipping_rates or envia_create_label for international shipments.",
    {
      description: z
        .string()
        .describe("Product description in plain language (e.g. 'cotton t-shirt', 'ceramic coffee mug')"),
      hs_code_provided: z
        .string()
        .optional()
        .describe("Optional: an HS code you already have, to validate or refine"),
      destination_countries: z
        .string()
        .optional()
        .describe("Optional: comma-separated destination countries (ISO codes) for region-specific classification"),
      include_alternatives: z
        .boolean()
        .default(true)
        .describe("Include alternative HS code suggestions (default: true)"),
    },
    async ({ description, hs_code_provided, destination_countries, include_alternatives }) => {
      const body: Record<string, unknown> = {
        description,
        includeAlternatives: include_alternatives,
      };

      if (hs_code_provided) {
        body.hsCodeProvided = hs_code_provided.trim();
      }

      if (destination_countries) {
        body.shipToCountries = destination_countries
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);
      }

      const url = `${config.shippingBase}/utils/classify-hscode`;
      const res = await client.post<{ data: HsCodeData; success?: boolean }>(url, body);

      if (!res.ok) {
        return {
          content: [{ type: "text", text: `HS code classification failed: ${res.error}` }],
        };
      }

      const data = res.data?.data;
      if (!data?.hsCode) {
        return {
          content: [
            {
              type: "text",
              text: "Could not classify the product. Try a more specific description (include material, use case, and category).",
            },
          ],
        };
      }

      const lines: string[] = [
        `HS Code classification for: "${description}"`,
        "",
        `  Recommended HS code: ${data.hsCode}`,
      ];

      if (data.description) {
        lines.push(`  Description:         ${data.description}`);
      }

      if (data.alternatives && data.alternatives.length > 0) {
        lines.push("", "  Alternatives:");
        for (const alt of data.alternatives) {
          lines.push(`    • ${alt}`);
        }
      }

      lines.push(
        "",
        "Use this HS code in the package items when creating an international label.",
      );

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
