/**
 * Tool: envia_ai_address_requirements
 *
 * Returns the required and optional address fields for a given country.
 * Uses the queries AI shipping layer which delegates to the carriers MCP
 * `get_address_requirements` tool so the rules are authoritative and always
 * in sync with carrier-side validation.
 *
 * Data source: GET /ai/shipping/address-requirements/{country} (queries service).
 * Verified 2026-04-27 via ai_shipping.routes.js:86 + shipping.service.js:55-58.
 *
 * SANDBOX LIMITATION: this endpoint chains through the carriers MCP server
 * running in the queries service. In sandbox environments where the carriers
 * MCP is not running, the endpoint may return an error — use production tokens
 * if the sandbox result is empty.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { countrySchema, requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';

/**
 * Register the envia_ai_address_requirements tool on the MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerAiAddressRequirements(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_ai_address_requirements',
        {
            description:
                'Get the required and optional address fields for shipping to or from a country. ' +
                'Returns which fields (street, number, neighborhood, postal code, etc.) are mandatory ' +
                'for the selected country, helping pre-validate addresses before creating a shipment. ' +
                'Results are authoritative — sourced from the same rules the carriers API enforces. ' +
                'SANDBOX LIMITATION: chains through the carriers MCP; may return an error in sandbox.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                country: countrySchema.describe(
                    'ISO 3166-1 alpha-2 country code (e.g. "MX", "CO", "BR", "US").',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);
            const country = args.country.toUpperCase();
            const url = `${config.queriesBase}/ai/shipping/address-requirements/${encodeURIComponent(country)}`;
            const res = await activeClient.get<unknown>(url);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            if (!res.data) {
                return textResponse(
                    `No address requirements returned for country "${country}". ` +
                    'Check that the country code is valid and try a production token if in sandbox.',
                );
            }

            const output = typeof res.data === 'string'
                ? res.data
                : JSON.stringify(res.data, null, 2);

            return textResponse(
                `Address requirements for ${country}:\n\n${output}`,
            );
        },
    );
}
