/**
 * Tool: envia_schedule_pickup
 *
 * Schedules a carrier pickup for one or more shipments at a given address
 * and date/time window.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnviaApiClient } from "../utils/api-client.js";
import type { EnviaConfig } from "../config.js";
import { countrySchema, carrierSchema, dateSchema } from "../utils/schemas.js";
import { buildGenerateAddress } from "../builders/address.js";

interface PickupData {
    carrier?: string;
    confirmation?: string;
    status?: string;
    date?: string;
    timeFrom?: number;
    timeTo?: number;
}

export function registerSchedulePickup(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        "envia_schedule_pickup",
        {
            description:
                "Schedule a carrier pickup at a specific address and date/time window. " +
                "You must have already created labels with envia_create_label — provide the tracking numbers. " +
                "The carrier will arrive between time_from and time_to on the chosen date.",
            inputSchema: z.object({
                // Origin address for pickup
                origin_name: z.string().describe("Contact name at pickup location"),
                origin_phone: z.string().describe("Contact phone at pickup location"),
                origin_street: z.string().describe("Pickup street address"),
                origin_city: z.string().describe("Pickup city"),
                origin_state: z.string().describe("Pickup state / province code"),
                origin_country: countrySchema.describe("Pickup country (ISO 3166-1 alpha-2, e.g. MX)"),
                origin_postal_code: z.string().describe("Pickup postal / ZIP code"),

                // Pickup details
                carrier: carrierSchema.describe("Carrier code (e.g. 'dhl', 'fedex')"),
                tracking_numbers: z
                    .string()
                    .describe("Comma-separated tracking numbers for the pickup (e.g. '752061,752062')"),
                date: dateSchema.describe("Pickup date in YYYY-MM-DD format (e.g. '2026-03-05')"),
                time_from: z
                    .number()
                    .min(0)
                    .max(23)
                    .default(9)
                    .describe("Earliest pickup hour (0-23, default 9)"),
                time_to: z
                    .number()
                    .min(0)
                    .max(23)
                    .default(17)
                    .describe("Latest pickup hour (0-23, default 17)"),
                total_weight: z.number().positive().describe("Total weight of all packages in KG"),
                total_packages: z.number().int().positive().describe("Total number of packages"),
                instructions: z
                    .string()
                    .optional()
                    .describe("Special instructions for the driver (e.g. 'Loading dock B, ring bell')"),
            }),
        },
        async (args) => {
            const trackingNumbers = args.tracking_numbers
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

            if (trackingNumbers.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: Provide at least one tracking number. Create labels first with envia_create_label.",
                        },
                    ],
                };
            }

            const body = {
                origin: buildGenerateAddress({
                    name: args.origin_name,
                    street: args.origin_street,
                    city: args.origin_city,
                    state: args.origin_state,
                    country: args.origin_country,
                    postalCode: args.origin_postal_code,
                    phone: args.origin_phone,
                }),
                shipment: {
                    type: 1,
                    carrier: args.carrier.trim().toLowerCase(),
                    pickup: {
                        weightUnit: "KG",
                        totalWeight: args.total_weight,
                        totalPackages: args.total_packages,
                        date: args.date,
                        timeFrom: args.time_from,
                        timeTo: args.time_to,
                        trackingNumbers,
                        ...(args.instructions ? { instructions: args.instructions } : {}),
                    },
                },
            };

            const url = `${config.shippingBase}/ship/pickup/`;
            const res = await client.post<{ data: PickupData }>(url, body);

            if (!res.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Pickup scheduling failed: ${res.error}\n\nTip: Verify the date is a future business day and that the carrier supports pickup in this area.`,
                        },
                    ],
                };
            }

            const data = res.data?.data;
            const lines: string[] = ["Pickup scheduled successfully!", ""];

            if (data) {
                if (data.confirmation) lines.push(`  Confirmation: ${data.confirmation}`);
                lines.push(`  Carrier:      ${data.carrier ?? args.carrier}`);
                lines.push(`  Date:         ${data.date ?? args.date}`);
                lines.push(`  Window:       ${data.timeFrom ?? args.time_from}:00 — ${data.timeTo ?? args.time_to}:00`);
                if (data.status) lines.push(`  Status:       ${data.status}`);
            }

            lines.push(`  Packages:     ${args.total_packages}`);
            lines.push(`  Weight:       ${args.total_weight} KG`);

            return { content: [{ type: "text", text: lines.join("\n") }] };
        },
    );
}
