/**
 * Tool: envia_track_pickup
 *
 * Tracks one or more scheduled pickups by confirmation number.
 * Uses the /ship/pickuptrack route (not /ship/pickup).
 * confirmation is an ARRAY of strings (unlike pickupcancel which uses a single string).
 * locale is required by the PHP runtime.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';
import { trackPickup } from '../../services/carriers-advanced.js';

/**
 * Register the envia_track_pickup tool on the MCP server.
 */
export function registerTrackPickup(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_track_pickup',
        {
            description:
                'Track the status of one or more scheduled carrier pickups by confirmation number. ' +
                'Use the confirmation numbers returned when the pickup was originally scheduled. ' +
                'Returns current pickup status and details from the carrier.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier: z.string().describe("Carrier code (e.g. 'dhl', 'fedex', 'estafeta')"),
                confirmations: z.array(z.string()).min(1)
                    .describe('One or more pickup confirmation numbers to track'),
                locale: z.number().int().default(1).describe('Locale/region ID (1=MX, 2=US)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key as string, config);

            const res = await trackPickup(
                activeClient,
                config,
                (args.carrier as string).toLowerCase(),
                args.confirmations as string[],
                args.locale as number,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Pickup tracking failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data?.data;
            if (!data) {
                return textResponse('Pickup tracking request succeeded but no data was returned.');
            }

            const lines: string[] = [
                'Pickup tracking result:',
                '',
                JSON.stringify(data, null, 2),
            ];

            return textResponse(lines.join('\n'));
        },
    );
}
