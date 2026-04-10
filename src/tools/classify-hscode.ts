/**
 * Tool: classify_hscode
 *
 * Uses AI to classify a product description into a Harmonized System (HS) code
 * (known as NCM in Brazil), required for international shipments and BR domestic
 * shipments (DCe authorization).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import { resolveClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";
import { optionalApiKeySchema } from "../utils/schemas.js";

interface HsCodeAlternative {
    hsCode?: string;
    description?: string;
    fullDescription?: string;
    confidenceScore?: number;
}

interface HsCodeData {
    hsCode?: string;
    description?: string;
    fullDescription?: string;
    confidenceScore?: number;
    alternatives?: (HsCodeAlternative | string)[];
}

export function registerClassifyHscode(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        "classify_hscode",
        {
            description:
                "Classify a product into an HS code (known as NCM in Brazil) for customs and regulatory compliance. " +
                "Describe the product in plain language and optionally specify destination countries. " +
                "Returns the recommended HS/NCM code and alternatives. " +
                "Use the code as productCode in items when calling quote_shipment or create_shipment " +
                "for international shipments and BR-to-BR domestic shipments (required for DCe authorization).",
            inputSchema: z.object({
                api_key: optionalApiKeySchema,
                description: z
                    .string()
                    .describe("Product description in plain language (e.g. 'cotton t-shirt', 'ceramic coffee mug', 'smart TV'). Use English for better results."),
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
            }),
        },
        async (args) => {
            const { description, hs_code_provided, destination_countries, include_alternatives } = args;
            const activeClient = resolveClient(client, args.api_key, config);

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
            const res = await activeClient.post<{ data: HsCodeData; success?: boolean }>(url, body);

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

            if (data.confidenceScore != null) {
                lines.push(`  Confidence:          ${Math.round(data.confidenceScore * 100)}%`);
            }

            if (data.alternatives && data.alternatives.length > 0) {
                lines.push("", "  Alternatives:");
                for (const alt of data.alternatives) {
                    if (typeof alt === "string") {
                        lines.push(`    • ${alt}`);
                    } else if (alt && typeof alt === "object" && alt.hsCode) {
                        const confidence = alt.confidenceScore != null ? ` (${Math.round(alt.confidenceScore * 100)}%)` : "";
                        lines.push(`    • ${alt.hsCode} — ${alt.description ?? "No description"}${confidence}`);
                    }
                }
            }

            lines.push(
                "",
                "Use this HS/NCM code as productCode in items when creating international or BR domestic labels.",
            );

            return { content: [{ type: "text", text: lines.join("\n") }] };
        },
    );
}
