#!/usr/bin/env node

/**
 * Envia MCP Server
 *
 * Exposes Envia shipping APIs as MCP tools so AI assistants can quote rates,
 * create labels, track packages, schedule pickups, and more.
 *
 * Transport: Stateless Streamable HTTP (spec-compliant, works with any MCP client)
 *
 * Also serves a browser-based chat UI at the root path (/) for interactive
 * testing with an LLM provider (Anthropic / OpenAI).
 *
 * Required env:
 *   ENVIA_API_KEY          — your Envia JWT token
 *
 * Optional env:
 *   ENVIA_ENVIRONMENT      — "sandbox" (default) | "production"
 *   PORT                   — HTTP port (default 3000)
 */

import 'dotenv/config';

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, normalize, resolve } from 'node:path';

import type { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

    registerResources(server, config);

    return server;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const app = createMcpExpressApp();

/** CORS — allows the browser chat client to reach /mcp from the same origin */
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

// ── POST /mcp — fully isolated per request (server + transport) ─────────

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

// ── GET /mcp — not supported in stateless mode ──────────────────────────

app.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
});

// ── DELETE /mcp — not supported in stateless mode ───────────────────────

app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
});

// ── Chat UI — static files served from dist/chat/ and src/chat/ ─────────

/**
 * Resolve a request path to a static file from the chat directories.
 * Looks in dist/chat/ first (compiled JS), then src/chat/ (HTML).
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

app.get('/', serveChatFile);
app.get('/*path', serveChatFile);

// ── Start ───────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
    console.error(`Envia MCP server listening on http://${HOST}:${PORT}/mcp`);
    console.error(`  Chat UI: http://${HOST}:${PORT}/`);
});
