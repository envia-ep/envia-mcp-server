/**
 * Tool: envia_cancel_pickup
 *
 * Cancels a previously scheduled carrier pickup using its confirmation number.
 * Uses the /ship/pickupcancel route (not /ship/pickup).
 * confirmation is a STRING (not an array — unlike pickuptrack).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';
import { cancelPickup } from '../../services/carriers-advanced.js';

/**
 * Register the envia_cancel_pickup tool on the MCP server.
 */
export function registerCancelPickup(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_cancel_pickup',
        {
            description:
                'Cancel a previously scheduled carrier pickup by confirmation number. ' +
                'Use this when a pickup was scheduled but is no longer needed. ' +
                'Requires the carrier code and the confirmation number from the original pickup schedule.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier: z.string().describe("Carrier code (e.g. 'fedex', 'dhl', 'estafeta')"),
                confirmation: z.string().describe('Pickup confirmation number to cancel'),
                locale: z.number().int().default(1).describe('Locale/region ID (1=MX, 2=US)'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key as string, config);

            const res = await cancelPickup(
                activeClient,
                config,
                (args.carrier as string).toLowerCase(),
                args.confirmation as string,
                args.locale as number,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Pickup cancellation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data?.data;
            const lines: string[] = ['Pickup cancelled successfully.'];

            if (data) {
                lines.push('');
                lines.push(`  Carrier:      ${data.carrier}`);
                lines.push(`  Confirmation: ${data.confirmation}`);
            }

            return textResponse(lines.join('\n'));
        },
    );
}
