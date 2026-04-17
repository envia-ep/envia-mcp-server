#!/usr/bin/env node

/**
 * Envia MCP Server
 *
 * Exposes Envia shipping APIs as MCP tools so AI assistants can quote rates,
 * create labels, track packages, schedule pickups, and more.
 *
 * Two transport modes (controlled by MCP_TRANSPORT env var):
 *
 *  - **http** (default) — Stateless Streamable HTTP on an Express server.
 *    Includes a browser chat UI at the root path (/). Works with any
 *    HTTP-capable MCP client.
 *
 *  - **stdio** — Standard input/output transport. The server reads JSON-RPC
 *    messages from stdin and writes responses to stdout. Used by CLI-based
 *    MCP hosts (e.g. Claude Desktop, Cursor).
 *
 * Required env:
 *   ENVIA_API_KEY          — your Envia JWT token
 *
 * Optional env:
 *   ENVIA_ENVIRONMENT      — "sandbox" (default) | "production"
 *   MCP_TRANSPORT          — "http" (default) | "stdio"
 *   PORT                   — HTTP port (default 3000, http mode only)
 *   HOST                   — Bind address (default 127.0.0.1, http mode only)
 */

import 'dotenv/config';

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, normalize, resolve } from 'node:path';

import type { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

import { loadConfig } from './config.js';
import { EnviaApiClient } from './utils/api-client.js';

// Tools
import { registerValidateAddress } from './tools/validate-address.js';
import { registerListCarriers } from './tools/list-carriers.js';
import { registerGetShippingRates } from './tools/get-shipping-rates.js';
import { registerCreateLabel } from './tools/create-label.js';
import { registerTrackPackage } from './tools/track-package.js';
import { registerCancelShipment } from './tools/cancel-shipment.js';
import { registerSchedulePickup } from './tools/schedule-pickup.js';
import { registerGetShipmentHistory } from './tools/get-shipment-history.js';
import { registerClassifyHscode } from './tools/classify-hscode.js';
// NOTE(sprint-0): registerCreateCommercialInvoice removed from portal agent — generated
// automatically inside create_label for intl shipments. Kept as internal helper.
import { registerGetEcommerceOrder } from './tools/get-ecommerce-order.js';
import { registerListAdditionalServices } from './tools/list-additional-services.js';

// Shipment query tools
import {
    registerListShipments,
    registerGetShipmentDetail,
    registerGetShipmentsStatus,
    registerGetShipmentsCod,
    registerGetCodCounters,
    registerGetShipmentsSurcharges,
    registerGetShipmentsNdr,
    registerGetShipmentInvoices,
} from './tools/shipments/index.js';

// Address tools
import {
    registerListAddresses,
    registerCreateAddress,
    registerUpdateAddress,
    registerDeleteAddress,
    registerSetDefaultAddress,
    registerGetDefaultAddress,
} from './tools/addresses/index.js';

// Package tools
import {
    registerListPackages,
    registerCreatePackage,
    registerDeletePackage,
} from './tools/packages/index.js';

// Client tools
import {
    registerListClients,
    registerGetClientDetail,
    registerCreateClient,
    registerUpdateClient,
    registerDeleteClient,
    registerGetClientsSummary,
} from './tools/clients/index.js';

// Order tools
import {
    registerListOrders,
    registerGetOrdersCount,
    registerListShops,
    registerUpdateOrderAddress,
    registerUpdateOrderPackages,
    registerSelectOrderService,
    registerFulfillOrder,
    registerGetOrderFilterOptions,
    registerManageOrderTags,
    registerGeneratePackingSlip,
    registerGeneratePickingList,
    registerGetOrdersAnalytics,
} from './tools/orders/index.js';

// Ticket tools
import {
    registerListTickets,
    registerGetTicketDetail,
    registerGetTicketComments,
    registerCreateTicket,
    registerAddTicketComment,
    registerRateTicket,
    registerGetTicketTypes,
} from './tools/tickets/index.js';

// Branch tools
import {
    registerSearchBranches,
    registerGetBranchesCatalog,
    registerSearchBranchesBulk,
} from './tools/branches/index.js';

// Config tools
// NOTE(sprint-0): Webhook CRUD and Checkout Rule CRUD removed from portal agent.
// Webhooks are a dev/admin task (1-time setup). Checkout rules have no UI in v1 or v2
// and are B2B/integrations only. Files are kept for future use — just not registered.
import {
    registerListCompanyUsers,
    registerListCompanyShops,
    registerGetCarrierConfig,
    registerGetNotificationSettings,
    registerListApiTokens,
    registerListCheckoutRules,
    registerListWebhooks,
} from './tools/config/index.js';

// Analytics tools
import {
    registerGetMonthlyAnalytics,
    registerGetCarriersStats,
    registerGetPackagesModule,
    registerGetIssuesAnalytics,
    registerGetShipmentsByStatus,
} from './tools/analytics/index.js';

// Notification tools
import {
    registerGetNotificationPrices,
    registerListNotifications,
    registerGetNotificationConfig,
} from './tools/notifications/index.js';

// Products, Billing & DCe tools
import {
    registerListProducts,
    registerGetBillingInfo,
    registerCheckBillingInfo,
    registerGetDceStatus,
} from './tools/products/index.js';

// Account tools (portal agent — reads own user/company context)
import {
    registerGetCompanyInfo,
    registerGetMySalesman,
    registerGetBalanceInfo,
} from './tools/account/index.js';

// AI Shipping tools — NLP + multi-carrier rate comparison
import {
    registerAiParseAddress,
    registerAiRate,
} from './tools/ai-shipping/index.js';

// Carriers advanced tools
// NOTE(sprint-0): Removed from portal agent:
//   - registerTrackAuthenticated: duplicate of track_package, confused LLM agent.
//     File deleted (was toxic). If advanced tracking is needed later, extend
//     track_package internally.
//   - registerLocateCity: /locate is CO DANE resolver — an internal helper, not a
//     user-facing tool. User never asks "locate Bogota" — the agent resolves it
//     automatically while building addresses.
import {
    registerGenerateManifest,
    registerGenerateBillOfLading,
    registerCancelPickup,
    registerSubmitNdReport,
    registerTrackPickup,
    registerGenerateComplement,
} from './tools/carriers-advanced/index.js';

// Queue tools
import { registerCheckBalance } from './tools/queue/index.js';

// Resources
import { registerResources } from './resources/api-docs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '127.0.0.1';

/**
 * Compiled JS lives in dist/ but index.html lives in src/chat/.
 * Resolve both directories so we can serve compiled JS and static HTML.
 */
const DIST_CHAT_DIR = resolve(__dirname, 'chat');
const SRC_CHAT_DIR = resolve(__dirname, '..', 'src', 'chat');

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

/**
 * Build a fully-configured McpServer with all Envia tools and resources.
 */
function createEnviaServer(): McpServer {
    const config = loadConfig();
    const client = new EnviaApiClient(config);

    const server = new McpServer(
        {
            name: 'envia',
            version: pkg.version,
        },
        {
            capabilities: {
                tools: { listChanged: true },
            },
        },
    );

    registerValidateAddress(server, client, config);
    registerListCarriers(server, client, config);
    registerGetShippingRates(server, client, config);
    registerCreateLabel(server, client, config);
    registerTrackPackage(server, client, config);
    registerCancelShipment(server, client, config);
    registerSchedulePickup(server, client, config);
    registerGetShipmentHistory(server, client, config);
    registerClassifyHscode(server, client, config);
    // registerCreateCommercialInvoice — moved to internal helper (auto-generated in create_label for intl).
    registerGetEcommerceOrder(server, client, config);
    registerListAdditionalServices(server, client, config);

    // Shipment query tools
    registerListShipments(server, client, config);
    registerGetShipmentDetail(server, client, config);
    registerGetShipmentsStatus(server, client, config);
    registerGetShipmentsCod(server, client, config);
    registerGetCodCounters(server, client, config);
    registerGetShipmentsSurcharges(server, client, config);
    registerGetShipmentsNdr(server, client, config);
    registerGetShipmentInvoices(server, client, config);

    // Address tools
    registerListAddresses(server, client, config);
    registerCreateAddress(server, client, config);
    registerUpdateAddress(server, client, config);
    registerDeleteAddress(server, client, config);
    registerSetDefaultAddress(server, client, config);
    registerGetDefaultAddress(server, client, config);

    // Package tools
    registerListPackages(server, client, config);
    registerCreatePackage(server, client, config);
    registerDeletePackage(server, client, config);

    // Client tools
    registerListClients(server, client, config);
    registerGetClientDetail(server, client, config);
    registerCreateClient(server, client, config);
    registerUpdateClient(server, client, config);
    registerDeleteClient(server, client, config);
    registerGetClientsSummary(server, client, config);

    // Order tools
    registerListOrders(server, client, config);
    registerGetOrdersCount(server, client, config);
    registerListShops(server, client, config);
    registerUpdateOrderAddress(server, client, config);
    registerUpdateOrderPackages(server, client, config);
    registerSelectOrderService(server, client, config);
    registerFulfillOrder(server, client, config);
    registerGetOrderFilterOptions(server, client, config);
    registerManageOrderTags(server, client, config);
    registerGeneratePackingSlip(server, client, config);
    registerGeneratePickingList(server, client, config);
    registerGetOrdersAnalytics(server, client, config);

    // Ticket tools
    registerListTickets(server, client, config);
    registerGetTicketDetail(server, client, config);
    registerGetTicketComments(server, client, config);
    registerCreateTicket(server, client, config);
    registerAddTicketComment(server, client, config);
    registerRateTicket(server, client, config);
    registerGetTicketTypes(server, client, config);

    // Branch tools
    registerSearchBranches(server, client, config);
    registerGetBranchesCatalog(server, client, config);
    registerSearchBranchesBulk(server, client, config);

    // Config tools (read-only for portal agent; CRUD kept as internal helpers only).
    registerListCompanyUsers(server, client, config);
    registerListCompanyShops(server, client, config);
    registerGetCarrierConfig(server, client, config);
    registerGetNotificationSettings(server, client, config);
    registerListApiTokens(server, client, config);
    registerListCheckoutRules(server, client, config);
    registerListWebhooks(server, client, config);
    // Webhook CRUD + Checkout Rule CRUD removed — see header comment on config imports.

    // Analytics tools
    registerGetMonthlyAnalytics(server, client, config);
    registerGetCarriersStats(server, client, config);
    registerGetPackagesModule(server, client, config);
    registerGetIssuesAnalytics(server, client, config);
    registerGetShipmentsByStatus(server, client, config);

    // Notification tools
    registerGetNotificationPrices(server, client, config);
    registerListNotifications(server, client, config);
    registerGetNotificationConfig(server, client, config);

    // Products, Billing & DCe tools
    registerListProducts(server, client, config);
    registerGetBillingInfo(server, client, config);
    registerCheckBillingInfo(server, client, config);
    registerGetDceStatus(server, client, config);

    // Account tools — share a single GET /user-information call under the hood.
    registerGetCompanyInfo(server, client, config);
    registerGetMySalesman(server, client, config);
    registerGetBalanceInfo(server, client, config);

    // Queue / balance tools
    registerCheckBalance(server, client, config);

    // AI Shipping tools
    registerAiParseAddress(server, client, config);
    registerAiRate(server, client, config);

    // Carriers advanced tools (track-authenticated removed; locate-city moved to internal helper).
    registerGenerateManifest(server, client, config);
    registerGenerateBillOfLading(server, client, config);
    registerCancelPickup(server, client, config);
    registerSubmitNdReport(server, client, config);
    registerTrackPickup(server, client, config);
    registerGenerateComplement(server, client, config);

    registerResources(server, config);

    return server;
}

// ---------------------------------------------------------------------------
// Bootstrap — transport selection
// ---------------------------------------------------------------------------

const TRANSPORT = (process.env.MCP_TRANSPORT ?? 'http').toLowerCase();

if (TRANSPORT === 'stdio') {
    startStdioMode().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Fatal: stdio mode failed to start: ${message}`);
        process.exit(1);
    });
} else {
    startHttpMode();
}

// ---------------------------------------------------------------------------
// stdio mode — JSON-RPC over stdin/stdout
// ---------------------------------------------------------------------------

/**
 * Start the MCP server in stdio mode.
 *
 * Creates a single server instance connected to a StdioServerTransport.
 * Used by CLI-based MCP hosts (Claude Desktop, Cursor, etc.).
 */
async function startStdioMode(): Promise<void> {
    const server = createEnviaServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error('Envia MCP server running in stdio mode');
}

// ---------------------------------------------------------------------------
// HTTP mode — Streamable HTTP on Express
// ---------------------------------------------------------------------------

/**
 * Start the MCP server in HTTP mode with an Express app.
 *
 * Each POST /mcp request gets an isolated server + transport pair.
 * Also serves a browser chat UI at the root path.
 */
function startHttpMode(): void {
    const app = createMcpExpressApp();

    app.use((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id');
        res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
        next();
    });

    app.options('/mcp', (_req: Request, res: Response) => {
        res.status(204).end();
    });

    app.post('/mcp', async (req: Request, res: Response) => {
        try {
            const server = createEnviaServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });

            res.on('close', () => {
                transport.close().catch(() => {});
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Internal server error';
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message },
                    id: null,
                });
            }
        }
    });

    app.get('/mcp', (_req: Request, res: Response) => {
        res.status(405).set('Allow', 'POST').send('Method Not Allowed');
    });

    app.delete('/mcp', (_req: Request, res: Response) => {
        res.status(405).set('Allow', 'POST').send('Method Not Allowed');
    });

    app.get('/', serveChatFile);
    app.get('/*path', serveChatFile);

    app.listen(PORT, HOST, () => {
        console.error(`Envia MCP server listening on http://${HOST}:${PORT}/mcp`);
        console.error(`  Chat UI: http://${HOST}:${PORT}/`);
    });
}

// ---------------------------------------------------------------------------
// Chat UI — static files from dist/chat/ and src/chat/
// ---------------------------------------------------------------------------

/**
 * Resolve a request path to a static file from the chat directories.
 * Looks in dist/chat/ first (compiled JS), then src/chat/ (HTML source).
 */
function serveChatFile(req: Request, res: Response): void {
    let filePath = req.path;
    if (filePath === '/') filePath = '/index.html';

    const ext = filePath.slice(filePath.lastIndexOf('.'));
    const mime = MIME[ext];
    if (!mime) {
        res.status(404).send('Not Found');
        return;
    }

    const relativePath = normalize(filePath.slice(1));

    for (const root of [DIST_CHAT_DIR, SRC_CHAT_DIR]) {
        const candidate = resolve(root, relativePath);
        if (!candidate.startsWith(root + '/') && candidate !== root) continue;

        if (existsSync(candidate)) {
            const content = readFileSync(candidate, 'utf-8');
            res.type(mime).send(content);
            return;
        }
    }

    res.status(404).send('Not Found');
}
