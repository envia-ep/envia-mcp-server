#!/usr/bin/env node

/**
 * Envia MCP Server
 *
 * Exposes Envia shipping APIs as MCP tools so AI assistants can quote rates,
 * create labels, track packages, schedule pickups, and more.
 *
 * Transport: stdio (works with Claude Desktop, Cursor, VS Code, etc.)
 *
 * Required env:
 *   ENVIA_API_KEY          — your Envia JWT token
 *
 * Optional env:
 *   ENVIA_ENVIRONMENT      — "sandbox" (default) | "production"
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { EnviaApiClient } from "./utils/api-client.js";

// Tools
import { registerValidateAddress } from "./tools/validate-address.js";
import { registerListCarriers } from "./tools/list-carriers.js";
import { registerGetShippingRates } from "./tools/get-shipping-rates.js";
import { registerCreateLabel } from "./tools/create-label.js";
import { registerTrackPackage } from "./tools/track-package.js";
import { registerCancelShipment } from "./tools/cancel-shipment.js";
import { registerSchedulePickup } from "./tools/schedule-pickup.js";
import { registerGetShipmentHistory } from "./tools/get-shipment-history.js";
import { registerClassifyHscode } from "./tools/classify-hscode.js";
import { registerCreateCommercialInvoice } from "./tools/create-commercial-invoice.js";

// Resources
import { registerResources } from "./resources/api-docs.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const client = new EnviaApiClient(config);

  const server = new McpServer({
    name: "envia",
    version: "0.1.0",
  });

  // Register all tools
  registerValidateAddress(server, client, config);
  registerListCarriers(server, client, config);
  registerGetShippingRates(server, client, config);
  registerCreateLabel(server, client, config);
  registerTrackPackage(server, client, config);
  registerCancelShipment(server, client, config);
  registerSchedulePickup(server, client, config);
  registerGetShipmentHistory(server, client, config);
  registerClassifyHscode(server, client, config);
  registerCreateCommercialInvoice(server, client, config);

  // Register resources
  registerResources(server, config);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
