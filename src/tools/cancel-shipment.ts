/**
 * Tool: envia_cancel_shipment
 *
 * Cancels (voids) a previously created shipment label. When the carrier
 * allows cancellation, the label cost is returned to the Envia balance via
 * the internal TMS refund flow.
 *
 * Plan V2 §2 enrichment:
 *   - Expose refund amount (if returned by backend) so the user knows
 *     exactly how much was credited back.
 *   - Detect and surface daily-limit refusals (some companies are capped at
 *     5 refunds/day for parcels, 2/day for pallets).
 *   - Surface COD chargeback hints when the shipment had COD.
 *
 * The backend response is authoritative — we never compute these values
 * client-side. If a field is absent, we hide that row instead of inventing
 * a placeholder.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { carrierSchema, requiredApiKeySchema } from '../utils/schemas.js';
import { mapCarrierError } from '../utils/error-mapper.js';
import { textResponse } from '../utils/mcp-response.js';

/**
 * Response fields we know the backend may return on a successful cancel.
 *
 * Kept intentionally permissive: Envia's PHP carrier controllers vary in
 * what they populate and the schema evolves as TMS integrations improve.
 * Callers must null-check each field — absence is expected, not an error.
 */
interface CancelData {
    carrier?: string;
    service?: string;
    trackingNumber?: string;

    // Refund flow
    balanceReturned?: boolean;
    balanceReturnDate?: string;
    refundAmount?: number | string;
    refundCurrency?: string;

    // Daily limit (plan V2 §2)
    dailyLimitExceeded?: boolean;
    dailyLimitReason?: string;

    // COD handling — set when the cancelled shipment had COD
    codChargeback?: boolean;
    codAmount?: number | string;
}

/**
 * Format the refund amount with its currency, falling back to "pending"
 * when the backend has not yet posted the amount.
 */
function formatRefund(data: CancelData): string {
    if (typeof data.refundAmount === 'number' || typeof data.refundAmount === 'string') {
        const amount = typeof data.refundAmount === 'number'
            ? data.refundAmount.toFixed(2)
            : data.refundAmount;
        return `${amount} ${data.refundCurrency ?? ''}`.trim();
    }
    if (data.balanceReturned === true) return 'Yes (amount not yet posted)';
    if (data.balanceReturned === false) return 'Pending';
    return '—';
}

/**
 * Format a successful cancellation response into a compact chat block.
 *
 * Shows only the rows that the backend populated. Always includes the
 * cancellation confirmation header so users get a clear success signal.
 */
function formatCancelResult(data: CancelData, fallbackCarrier: string, fallbackTracking: string): string {
    const lines: string[] = ['Shipment cancelled successfully.', ''];

    lines.push(`  Carrier:          ${data.carrier ?? fallbackCarrier}`);
    lines.push(`  Tracking number:  ${data.trackingNumber ?? fallbackTracking}`);

    const refundText = formatRefund(data);
    if (refundText !== '—') {
        lines.push(`  Refund:           ${refundText}`);
    }

    if (data.balanceReturnDate) {
        lines.push(`  Refund date:      ${data.balanceReturnDate}`);
    }

    if (data.dailyLimitExceeded === true) {
        lines.push('');
        lines.push('  ⚠️ Daily refund limit reached — the shipment was cancelled but no refund was issued.');
        if (data.dailyLimitReason) {
            lines.push(`     ${data.dailyLimitReason}`);
        }
    }

    if (data.codChargeback === true) {
        const codAmount = typeof data.codAmount === 'number'
            ? data.codAmount.toFixed(2)
            : data.codAmount;
        lines.push('');
        lines.push(`  💳 COD chargeback triggered${codAmount ? ` for ${codAmount}` : ''}.`);
    }

    return lines.join('\n');
}

/** Register the envia_cancel_shipment tool on the MCP server. */
export function registerCancelShipment(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_cancel_shipment',
        {
            description:
                'Cancel a shipment and void its label. On success, reports the refund amount '
                + '(when posted), refund date, and any daily-limit or COD chargeback information. '
                + 'Not all carriers support cancellation — best results within the first 24 hours '
                + 'after label generation.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier: carrierSchema.describe("Carrier code (e.g. 'dhl', 'fedex')"),
                tracking_number: z.string().describe('Tracking number of the shipment to cancel'),
            }),
        },
        async (args) => {
            const carrier = args.carrier.trim().toLowerCase();
            const trackingNumber = args.tracking_number.trim();
            const activeClient = resolveClient(client, args.api_key, config);
            const url = `${config.shippingBase}/ship/cancel/`;

            const res = await activeClient.post<{ data: CancelData }>(url, {
                carrier,
                trackingNumber,
            });

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(`Cancellation failed: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`);
            }

            const data = res.data?.data ?? {};
            return textResponse(formatCancelResult(data, carrier, trackingNumber));
        },
    );
}

// Export the formatter for isolated testing.
export { formatCancelResult, formatRefund };
