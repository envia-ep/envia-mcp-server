/**
 * HTTP transport wiring.
 *
 * Builds the Express app: OAuth relay and discovery routes, the optional Bearer
 * layer, the auth gate, `POST /mcp`, and the chat UI. `index.ts` owns the
 * bootstrap; keeping the app here lets tests drive the real middleware chain.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { Express, Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
import { childLogger, getLogger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PORT = parseInt(process.env.PORT ?? '3000', 10);
export const HOST = process.env.HOST ?? '127.0.0.1';

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
 * Build the Express app that serves MCP over HTTP.
 *
 * Each POST /mcp request gets an isolated server + transport pair.
 * OAuth 2.0 + RFC 7591 DCR is provided by mcpAuthRouter. Bearer tokens are
 * optional: unauthenticated requests can initialize, list tools, and call
 * public tools (`envia_track_package`). Invalid tokens still receive 401.
 */
export function createHttpApp(): Express {
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
                {
                    allowMissingApiKey: !enviaApiKey,
                    httpCatalog: true,
                    // A credential resolved from the transport must not pick the
                    // backend; ENVIA_ENVIRONMENT alone decides, as it did before
                    // the body `api_key` reached loadConfig.
                    keepDefaultEnvironment: true,
                },
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

    return app;
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
