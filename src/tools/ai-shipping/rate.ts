/**
 * Tool: envia_ai_rate
 *
 * Multi-carrier rate quoting through the Envia AI shipping layer. Unlike
 * `envia_quote_shipment`, this tool always fans out across every active
 * carrier for the route in parallel, returning a compact comparison sorted
 * by price. Ideal for user questions like "¿cuál es la opción más barata
 * para enviar esto a Monterrey?".
 *
 * Data source: `POST /ai/shipping/rate` (queries service).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { aiRateApi, summariseRateResult, formatRateSummaries } from '../../services/ai-shipping.js';
import type { RateSummary } from '../../types/ai-shipping.js';

/**
 * Build the multi-carrier rate body from the tool arguments. Keeps the
 * wire format aligned with the sandbox-verified schema.
 */
function buildRateBody(args: {
    origin_zip: string;
    destination_zip: string;
    weight: number;
    origin_country: string;
    destination_country: string;
    carriers?: string[];
}): Record<string, unknown> {
    const body: Record<string, unknown> = {
        origin_zip: args.origin_zip.trim(),
        destination_zip: args.destination_zip.trim(),
        weight: args.weight,
        origin_country: args.origin_country.toUpperCase(),
        destination_country: args.destination_country.toUpperCase(),
    };
    if (args.carriers && args.carriers.length > 0) {
        body.carriers = args.carriers.map((c) => c.trim().toLowerCase());
    }
    return body;
}

/** Register the envia_ai_rate tool on the MCP server. */
export function registerAiRate(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_ai_rate',
        {
            description:
                'Run a multi-carrier rate quote in parallel and return a compact comparison '
                + 'sorted by price (cheapest first). Use when the user wants to compare options '
                + 'or find the cheapest rate. For a single specific carrier, use envia_quote_shipment.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                origin_zip: z.string().min(1).describe('Origin postal/ZIP code.'),
                destination_zip: z.string().min(1).describe('Destination postal/ZIP code.'),
                weight: z.number().positive().describe('Package weight in kilograms.'),
                origin_country: z.string().length(2).describe('Origin ISO country code (e.g. "MX").'),
                destination_country: z.string().length(2).describe('Destination ISO country code (e.g. "US").'),
                carriers: z.array(z.string().min(1)).optional().describe(
                    'Restrict to specific carriers (e.g. ["fedex", "dhl"]). Omit to compare all.',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const res = await aiRateApi(activeClient, config, buildRateBody(args));

            if (!res.ok || !res.data) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to run multi-carrier rate: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const { results, carriers_considered } = res.data;
            const summaries: RateSummary[] = results
                .map(summariseRateResult)
                .filter((s): s is RateSummary => s !== null);

            const header = `Rate comparison across ${carriers_considered.length} carriers `
                + `(${summaries.length} returned valid rates):`;

            return textResponse(`${header}\n\n${formatRateSummaries(summaries)}`);
        },
    );
}

// Export the body builder for isolated testing.
export { buildRateBody };
