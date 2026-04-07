/**
 * Tool: envia_track_package
 *
 * Retrieves the current tracking status and event history for one or more
 * shipments. Works with any carrier tracked through Envia.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";

interface TrackEvent {
    timestamp?: string;
    location?: string;
    description?: string;
}

interface TrackData {
    trackingNumber: string;
    status?: string;
    carrier?: string;
    carrierDescription?: string;
    trackUrl?: string;
    trackUrlSite?: string;
    estimatedDelivery?: string;
    /** API returns event history under "eventHistory", not "events". */
    eventHistory?: TrackEvent[];
}

export function registerTrackPackage(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        "envia_track_package",
        {
            description:
                "Track one or more packages by their tracking numbers. " +
                "Returns the current status and event history for each shipment.",
            inputSchema: z.object({
                tracking_numbers: z
                    .string()
                    .describe(
                        "One or more tracking numbers, comma-separated (e.g. '7520610403' or '7520610403,7520610404')",
                    ),
            }),
        },
        async ({ tracking_numbers }) => {
            const numbers = tracking_numbers
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

            if (numbers.length === 0) {
                return {
                    content: [{ type: "text", text: "Error: Provide at least one tracking number." }],
                };
            }

            const url = `${config.shippingBase}/ship/generaltrack/`;
            const res = await client.post<{ data: TrackData[] }>(url, {
                trackingNumbers: numbers,
            });

            if (!res.ok) {
                return {
                    content: [{ type: "text", text: `Tracking failed: ${res.error}` }],
                };
            }

            const trackings = Array.isArray(res.data?.data) ? res.data.data : [];

            if (trackings.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No tracking information found. The tracking number may be invalid or not yet registered with the carrier.",
                        },
                    ],
                };
            }

            const lines: string[] = [];

            for (const t of trackings) {
                lines.push(`Tracking: ${t.trackingNumber}`);
                lines.push(`  Status:  ${t.status ?? "Unknown"}`);
                if (t.carrierDescription || t.carrier) {
                    lines.push(`  Carrier: ${t.carrierDescription ?? t.carrier}`);
                }
                if (t.estimatedDelivery) {
                    lines.push(`  ETA:     ${t.estimatedDelivery}`);
                }
                if (t.trackUrl) {
                    lines.push(`  Track:   ${t.trackUrl}`);
                }

                const events = t.eventHistory ?? [];
                if (events.length > 0) {
                    lines.push("  Events:");
                    // Show most recent events first (limit 10)
                    const recent = events.slice(0, 10);
                    for (const e of recent) {
                        const time = e.timestamp ?? "—";
                        const loc = e.location ? ` [${e.location}]` : "";
                        lines.push(`    ${time}${loc}: ${e.description ?? "—"}`);
                    }
                    if (events.length > 10) {
                        lines.push(`    ... and ${events.length - 10} more events`);
                    }
                }

                lines.push("");
            }

            return { content: [{ type: "text", text: lines.join("\n") }] };
        },
    );
}
