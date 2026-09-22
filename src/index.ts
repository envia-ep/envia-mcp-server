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
 * HTTP mixed-auth:
 *   ENVIA_API_KEY is required for public catalog tools (carriers, add-ons,
 *   address validation, quotes). Tracking works without it. Account tools
 *   (labels, orders, cancellations) need a user OAuth token and do not
 *   inherit ENVIA_API_KEY on anonymous requests.
 *   See documentation/tool-access.md.
 *
 * stdio:
 *   ENVIA_API_KEY is required at startup.
 *
 * Optional env:
 *   ENVIA_ENVIRONMENT      — "sandbox" (default) | "production"
 *   MCP_TRANSPORT          — "http" (default) | "stdio"
 *   PORT                   — HTTP port (default 3000, http mode only)
 *   HOST                   — Bind address (default 127.0.0.1, http mode only)
 */

import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createEnviaServer } from './server.js';
import { createHttpApp, HOST, PORT } from './http-app.js';
import { childLogger, getLogger } from './utils/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };



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
 *
 * Generates one process-wide sessionId so all tool-call events from
 * this stdio session can be grouped in log aggregators.
 */
async function startStdioMode(): Promise<void> {
    const sessionId = randomUUID();
    const log = childLogger({ sessionId, transport: 'stdio' });

    const server = createEnviaServer({ sessionId });
    const transport = new StdioServerTransport();

    await server.connect(transport);

    log.info({ event: 'mcp_ready', version: pkg.version }, 'Envia MCP server running in stdio mode');
}

// ---------------------------------------------------------------------------
// HTTP mode — Streamable HTTP on Express
// ---------------------------------------------------------------------------

/**
 * Start the MCP server in HTTP mode.
 *
 * The app itself is built in `http-app.ts` so tests can drive the real
 * middleware chain — gate, challenge, discovery routes — without a port.
 */
function startHttpMode(): void {
    const app = createHttpApp();

    app.listen(PORT, HOST, () => {
        getLogger().info(
            {
                event: 'mcp_listening',
                transport: 'http',
                host: HOST,
                port: PORT,
                version: pkg.version,
                mcp_url: `http://${HOST}:${PORT}/mcp`,
                chat_url: `http://${HOST}:${PORT}/`,
            },
            'Envia MCP server listening',
        );
    });
}
