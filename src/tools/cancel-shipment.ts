/**
 * Tool: envia_cancel_shipment
 *
 * Cancels (voids) a previously created shipment label. If the carrier allows
 * cancellation, the balance is returned to the Envia account.
 *
 * Note: Not all carriers support cancellation, and there may be time windows
 * after which cancellation is no longer possible.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";
import { carrierSchema } from "../utils/schemas.js";

interface CancelData {
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  balanceReturned?: boolean;
  balanceReturnDate?: string;
}

export function registerCancelShipment(
  server: McpServer,
  client: EnviaApiClient,
  config: EnviaConfig,
): void {
  server.tool(
    "envia_cancel_shipment",
    "Cancel a shipment and void its label. " +
      "If successful, the label cost is returned to your Envia balance. " +
      "Not all carriers support cancellation — check within the first 24 hours for best results.",
    {
      carrier: carrierSchema.describe("Carrier code (e.g. 'dhl', 'fedex')"),
      tracking_number: z.string().describe("Tracking number of the shipment to cancel"),
    },
    async ({ carrier, tracking_number }) => {
      const url = `${config.shippingBase}/ship/cancel/`;
      const res = await client.post<{ data: CancelData }>(url, {
        carrier: carrier.trim().toLowerCase(),
        trackingNumber: tracking_number.trim(),
      });

      if (!res.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Cancellation failed: ${res.error}\n\nNote: Some carriers do not allow cancellation, or the cancellation window may have expired.`,
            },
          ],
        };
      }

      const data = res.data?.data;
      const lines: string[] = ["Shipment cancelled successfully.", ""];

      if (data) {
        lines.push(`  Carrier:          ${data.carrier ?? carrier}`);
        lines.push(`  Tracking number:  ${data.trackingNumber ?? tracking_number}`);

        if (data.balanceReturned !== undefined) {
          lines.push(
            `  Balance returned: ${data.balanceReturned ? "Yes" : "No (pending)"}`,
          );
        }
        if (data.balanceReturnDate) {
          lines.push(`  Return date:      ${data.balanceReturnDate}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
