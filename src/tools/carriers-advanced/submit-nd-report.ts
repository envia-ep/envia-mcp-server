/**
 * Tool: envia_submit_nd_report
 *
 * Submits a non-delivery report (NDR) action for a shipment that has a
 * delivery exception. Common action codes: RD (reschedule), DM (damaged),
 * RE (return to sender), AC (address correction), CP (pickup at branch).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { textResponse } from '../../utils/mcp-response.js';
import { submitNdReport } from '../../services/carriers-advanced.js';

/**
 * Register the envia_submit_nd_report tool on the MCP server.
 */
export function registerSubmitNdReport(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_submit_nd_report',
        {
            description:
                'Submit a non-delivery report (NDR) action for a shipment with a delivery exception. ' +
                "Action codes: 'RD' (reschedule delivery), 'DM' (damaged), 'RE' (return to sender), " +
                "'AC' (address correction), 'CP' (customer pickup at branch). " +
                'Shipment must be in an NDR/exception status for this to succeed.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier: z.string().describe("Carrier code (e.g. 'dhl', 'fedex', 'estafeta')"),
                tracking_number: z.string().describe('Tracking number of the shipment with a delivery exception'),
                action_code: z.string().describe(
                    "NDR action code: 'RD' (reschedule), 'DM' (damaged), 'RE' (return to sender), " +
                    "'AC' (address correction), 'CP' (pickup at branch)",
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key as string, config);

            const res = await submitNdReport(
                activeClient,
                config,
                (args.carrier as string).toLowerCase(),
                args.tracking_number as string,
                (args.action_code as string).toUpperCase(),
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `ND report submission failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const data = res.data?.data;
            const lines: string[] = ['ND report submitted successfully.'];

            if (data) {
                lines.push('');
                lines.push(`  Carrier:         ${data.carrier}`);
                lines.push(`  Tracking number: ${data.trackingNumber}`);
                if (data.actionCode) {
                    lines.push(`  Action code:     ${data.actionCode}`);
                }
            }

            return textResponse(lines.join('\n'));
        },
    );
}
