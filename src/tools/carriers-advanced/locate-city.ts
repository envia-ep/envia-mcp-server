/**
 * Tool: envia_locate_city
 *
 * Looks up the official DANE city code for a Colombian city/state.
 * Used when generating shipments to Colombia where a numeric DANE code
 * is required instead of a postal code.
 *
 * NOTE: This endpoint is public — no Authorization header is sent to the API.
 * Only Colombia (country="CO") is currently supported by the backend.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import type { LocateCityResponse, LocateErrorResponse } from '../../types/carriers-advanced.js';

/**
 * Register the envia_locate_city tool on the MCP server.
 */
export function registerLocateCity(
    server: McpServer,
    _client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_locate_city',
        {
            description:
                'Look up the official DANE city code for a Colombian city/state combination. ' +
                'Required when creating shipments to Colombia — carriers need the numeric DANE code. ' +
                'Only Colombia (CO) is currently supported. ' +
                "Example: city='Bogota', state='DC' → DANE code '11001000'.",
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                city: z.string().describe("City name in Spanish (e.g. 'Bogota', 'Medellin', 'Cali')"),
                state: z.string().describe("State/department code (e.g. 'DC', 'ANT', 'VAC')"),
                country: z.string().length(2).default('CO')
                    .describe("Country code — currently only 'CO' (Colombia) is supported"),
            }),
        },
        async (args) => {
            // /locate is a public endpoint — do NOT send an Authorization header
            const url = `${config.shippingBase}/locate`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    city: (args.city as string).trim(),
                    state: (args.state as string).trim(),
                    country: (args.country as string).trim().toUpperCase(),
                }),
            });

            if (!res.ok) {
                return textResponse(`City lookup failed: HTTP ${res.status}`);
            }

            const data = await res.json() as LocateCityResponse | LocateErrorResponse;

            if ('meta' in data && data.meta === 'error') {
                const errData = data as LocateErrorResponse;
                return textResponse(
                    `City not found: ${errData.error.message}\n\n` +
                    'Note: Only Colombian (CO) cities are supported by this endpoint.',
                );
            }

            const city = data as LocateCityResponse;
            const lines = [
                'City code lookup result:',
                '',
                `  DANE code: ${city.city}`,
                `  Name:      ${city.name}`,
                `  State:     ${city.state}`,
                '',
                'Use this DANE code as the postal_code when creating shipments to Colombia.',
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
