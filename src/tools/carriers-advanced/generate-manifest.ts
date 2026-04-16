/**
 * Tool: envia_generate_manifest
 *
 * Generates a manifest PDF for shipments ready to hand off to a carrier.
 * Shipments must be in "Created" status (status_id=1). The carrier is
 * inferred automatically from the tracking number — do NOT pass a carrier field.
 * Returns PDF URLs grouped by carrier (e.g. estafeta, dhl).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';
import { generateManifest } from '../../services/carriers-advanced.js';

/**
 * Register the envia_generate_manifest tool on the MCP server.
 */
export function registerGenerateManifest(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_generate_manifest',
        {
            description:
                'Generate a manifest PDF for shipments ready to hand off to a carrier. ' +
                'Shipments must be in "Created" status (not yet picked up). ' +
                'The carrier is inferred from the tracking number automatically. ' +
                'Returns PDF URLs grouped by carrier.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                tracking_numbers: z.array(z.string().min(1)).min(1)
                    .describe("List of tracking numbers to include in the manifest. Must be in 'Created' status (not yet shipped)."),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key as string, config);
            const trackingNumbers = args.tracking_numbers as string[];

            const res = await generateManifest(activeClient, config, trackingNumbers);

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Manifest generation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data?.data;
            if (!data) {
                return textResponse('Manifest generated but response contained no data.');
            }

            const lines: string[] = [
                'Manifest generated successfully.',
                '',
                `Company: ${data.company}`,
                '',
                'Manifest PDFs by carrier:',
            ];

            const carrierEntries = Object.entries(data.carriers);
            if (carrierEntries.length === 0) {
                lines.push('  (no carriers in manifest)');
            } else {
                for (const [carrier, url] of carrierEntries) {
                    lines.push(`  ${carrier}: ${url}`);
                }
            }

            lines.push('');
            lines.push(`Total tracking numbers submitted: ${trackingNumbers.length}`);

            return textResponse(lines.join('\n'));
        },
    );
}
