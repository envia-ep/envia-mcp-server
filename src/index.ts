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
import { registerCreateCommercialInvoice } from './tools/create-commercial-invoice.js';
import { registerGetEcommerceOrder } from './tools/get-ecommerce-order.js';
import { registerListAdditionalServices } from './tools/list-additional-services.js';

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

    const server = new McpServer({
        name: 'envia',
        version: pkg.version,
    });

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
    registerGetEcommerceOrder(server, client, config);
    registerListAdditionalServices(server, client, config);

    registerResources(server, config);

    return server;
}

// ---------------------------------------------------------------------------
// Bootstrap — transport selection
// ---------------------------------------------------------------------------

const TRANSPORT = (process.env.MCP_TRANSPORT ?? 'http').toLowerCase();

if (TRANSPORT === 'stdio') {
    startStdioMode();
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
