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

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { mcpAuthRouter, createOAuthMetadata } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

import { createEnviaOAuthProvider } from './auth/provider.js';
import { optionalBearerAuth } from './auth/optional-bearer.js';
import { createMcpAuthGate } from './auth/mcp-auth-gate.js';
import { resolveHttpEnviaApiKey } from './auth/http-credentials.js';
import { mcpResourceUris } from './auth/mcp-resource.js';
import { createEnviaServer } from './server.js';
import { buildWwwAuthenticateHeader } from './auth/www-authenticate.js';
import { loadConfig } from './config.js';
import { EnviaApiClient } from './utils/api-client.js';
import { childLogger, getLogger } from './utils/logger.js';
import { decorateServerWithLogging } from './utils/server-logger.js';

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
 * Start the MCP server in HTTP mode with an Express app.
 *
 * Each POST /mcp request gets an isolated server + transport pair.
 * OAuth 2.0 + RFC 7591 DCR is provided by mcpAuthRouter. Bearer tokens are
 * optional: unauthenticated requests can initialize, list tools, and call
 * public tools (`envia_track_package`). Invalid tokens still receive 401.
 */
function startHttpMode(): void {
    const oauthProvider = createEnviaOAuthProvider();

    // The MCP server's own public URL — used in OAuth discovery metadata.
    // OAUTH_SERVER_URL should be set to where this MCP server is reachable
    // (e.g. https://mcp.envia.com). Falls back to localhost for local dev.
    const issuerUrl = new URL(
        process.env.OAUTH_SERVER_URL ?? `http://${HOST}:${PORT}`,
    );

    // Pass HOST to createMcpExpressApp so its host-header validation matches our bind address.
    // When HOST=127.0.0.1 (local dev), DNS-rebinding protection is enabled automatically.
    // When HOST=0.0.0.0 (Heroku / deployed), the SDK disables localhost-only validation,
    // allowing the Heroku router to forward requests with external Host headers.
    const app = createMcpExpressApp({ host: HOST });

    // Heroku and Cloudflare sit in front of the dyno, so trust the first proxy hop
    // for correct IP resolution in express-rate-limit.
    app.set('trust proxy', 1);

    // OAuth 2.0 relay endpoints — mcpAuthRouter wires /.well-known/*, /oauth/*.
    // The ProxyOAuthServerProvider delegates all auth to the queries OAuth AS.
    const mcpScopes = [
        'mcp:read',
        'mcp:ship',
        'shipments:read',
        'shipments:write',
        'shipments:cancel',
        'rates:read',
        'labels:read',
        'company:read',
        'orders:read',
        'orders:write',
        'pickups:read',
        'pickups:write',
        'addresses:read',
        'addresses:write',
        'packages:read',
        'packages:write',
        'tickets:read',
        'tickets:write',
    ];

    // Override the SDK's default metadata which advertises client_secret_post.
    // queries only supports public PKCE clients (token_endpoint_auth_method=none),
    // so advertising client_secret_post causes clients like Claude to register as
    // confidential clients and then fail. Serve corrected metadata first so the
    // mcpAuthRouter route below never gets a chance to serve the wrong value.
    const authRouterOptions = {
        provider: oauthProvider,
        issuerUrl,
        serviceDocumentationUrl: new URL('https://docs.envia.com/docs/mcp-overview'),
        scopesSupported: mcpScopes,
        resourceName: 'Envia Shipping MCP',
    };
    const correctedMetadata = {
        ...createOAuthMetadata(authRouterOptions),
        token_endpoint_auth_methods_supported: ['none'],
    };
    app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
        res.json(correctedMetadata);
    });

    const resourceUri = issuerUrl.href.replace(/\/$/, '');
    const { origin: mcpOrigin, resource: mcpResource } = mcpResourceUris(resourceUri);
    const resourceMetadataUrl = `${mcpOrigin}/.well-known/oauth-protected-resource`;

    // The authorization server is this MCP, not queries: `mcpAuthRouter` proxies
    // /authorize, /token and /register. Advertising queries directly would send
    // clients past the proxy and expose the backend as a public issuer.
    // The issuer goes out verbatim so it matches the metadata a client fetches next.
    const sendProtectedResourceMetadata = (_req: Request, res: Response): void => {
        res.json({
            resource: mcpResource,
            authorization_servers: [issuerUrl.href],
            bearer_methods_supported: ['header'],
            scopes_supported: mcpScopes,
        });
    };

    // Before `mcpAuthRouter`, which serves the root PRM path itself and advertises
    // the origin as `resource` instead of the canonical /mcp URI.
    app.get('/.well-known/oauth-protected-resource', sendProtectedResourceMetadata);
    app.get('/.well-known/oauth-protected-resource/mcp', sendProtectedResourceMetadata);

    app.use(mcpAuthRouter(authRouterOptions));

    app.use((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, Authorization, x-api-key, x-correlation-id, x-request-id');
        res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, WWW-Authenticate');
        next();
    });

    app.options('/mcp', (_req: Request, res: Response) => {
        res.status(204).end();
    });

    // Bearer-auth middleware — validates OAuth access tokens and populates req.auth.
    // Optional so ChatGPT can track shipments without signing in.
    const bearerAuth = optionalBearerAuth(requireBearerAuth({ verifier: oauthProvider }));
    const mcpAuthGate = createMcpAuthGate({ resourceMetadataUrl });

    app.use('/mcp', (_req: Request, res: Response, next: NextFunction) => {
        const originalStatus = res.status.bind(res);
        res.status = ((code: number) => {
            if (code === 401 && !res.getHeader('WWW-Authenticate')) {
                res.setHeader(
                    'WWW-Authenticate',
                    buildWwwAuthenticateHeader({
                        resourceMetadataUrl,
                        error: 'invalid_token',
                        errorDescription: 'Authentication required',
                        scope: 'mcp:read',
                    }),
                );
            }
            return originalStatus(code);
        }) as Response['status'];
        next();
    });

    app.post('/mcp', bearerAuth, mcpAuthGate, async (req: Request, res: Response) => {
        // Honour an upstream-provided correlation ID (portal embedding,
        // load balancer, etc.) so traces stitch across services. Fall
        // back to a fresh UUID per request when absent.
        const incoming = req.header('x-correlation-id') ?? req.header('x-request-id');
        const correlationId = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
        res.setHeader('x-correlation-id', correlationId);

        const reqLog = childLogger({ correlationId, transport: 'http' });
        const startedAt = Date.now();
        reqLog.debug({ event: 'mcp_request_received' }, 'POST /mcp received');

        try {
            // OAuth token verified when present. Unauthenticated requests get an empty
            // key so they cannot inherit ENVIA_API_KEY and call protected Envia APIs.
            const enviaApiKey = resolveHttpEnviaApiKey(req);

            // The MCP SDK transport requires Accept to include text/event-stream.
            // Some clients (e.g. ChatGPT) omit it — patch the header so the SDK
            // doesn't return 406 before the request is processed.
            if (!req.headers['accept']?.includes('text/event-stream')) {
                req.headers['accept'] = 'application/json, text/event-stream';
            }

            const server = createEnviaServer(
                { correlationId },
                enviaApiKey,
                { allowMissingApiKey: !enviaApiKey, httpCatalog: true },
            );
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });

            res.on('close', () => {
                reqLog.debug(
                    { event: 'mcp_request_closed', duration_ms: Date.now() - startedAt },
                    'POST /mcp closed',
                );
                transport.close().catch(() => {});
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Internal server error';
            reqLog.error(
                {
                    event: 'mcp_request_error',
                    error_message: message,
                    duration_ms: Date.now() - startedAt,
                },
                'POST /mcp failed',
            );
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

    // Domain verification for the app submission. An empty 200 would read as a
    // verified domain serving the wrong token, so an unset variable 404s instead.
    app.get('/.well-known/openai-apps-challenge', (_req: Request, res: Response) => {
        const challengeToken = process.env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();
        if (!challengeToken) {
            res.status(404).type('text/plain').send('Not Found');
            return;
        }
        res.type('text/plain').send(challengeToken);
    });

    app.delete('/mcp', (_req: Request, res: Response) => {
        res.status(405).set('Allow', 'POST').send('Method Not Allowed');
    });

    app.get('/', serveChatFile);
    app.get('/*path', serveChatFile);

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
