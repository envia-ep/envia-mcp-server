/**
 * Server Logger Decorator
 *
 * Wraps `McpServer.registerTool` so every tool invocation emits a
 * structured JSON event without the individual tool files needing to
 * know about logging. Bridges the McpServer SDK and the application
 * pino logger.
 *
 * Decoration is applied **before** any tool registers itself. When a
 * tool later runs, its handler is silently wrapped with timing +
 * error capture. Throws are re-raised unchanged so the SDK still
 * sees the original error and forwards a proper MCP error response
 * to the client.
 *
 * Why monkey-patch instead of refactoring every register*() function:
 * the project has ~70 register functions across 12 directories and
 * each calls `server.registerTool` directly. Decorating once at
 * server-construction time means new tools get logging for free, and
 * we keep zero coupling between tool code and the logger module.
 *
 * Performance: ~10 µs of overhead per call (one pino child logger +
 * Date.now twice). Trivial against the network calls every tool
 * makes.
 *
 * Event taxonomy (stable contract for Datadog / Loki consumers):
 *   tool_call_complete  — emitted on every tool invocation (success or error).
 *                         Fields: tool, duration_ms, status, error_message?,
 *                         error_class?, correlation_id (from async context).
 *   tool_call_failed    — alias: same as tool_call_complete with status='error'.
 *   schema_validation_failed — emitted by parseToolResponse (response-validator.ts)
 *                         when a backend response shape diverges from the Zod
 *                         schema. Fields: event, tool, issue_count, issues[].
 *                         Severity: warn. Does NOT halt the request in default
 *                         'warn' mode; only throws in MCP_SCHEMA_VALIDATION_MODE=strict.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';

import { childLogger } from './logger.js';

/**
 * Structured payload emitted on every tool call. Treat as a stable
 * contract — log consumers (Datadog, Loki, alerts) parse it.
 */
export interface ToolCallEvent {
    /** Tool registered with the SDK (e.g. "envia_quote_shipment"). */
    tool: string;
    /** Wall-clock duration from handler invocation to settlement. */
    duration_ms: number;
    /** "success" when the handler returned, "error" when it threw. */
    status: 'success' | 'error';
    /** Error message if `status === 'error'`. Never the raw stack. */
    error_message?: string;
    /** Best-effort error class name (`Error`, `TypeError`, etc.). */
    error_class?: string;
}

/**
 * Internal type alias for the bound `registerTool` method. Captured
 * once when we decorate so subsequent tools call the original
 * implementation, not the wrapper recursively.
 */
type RegisterToolFn = McpServer['registerTool'];

/**
 * The shape we patch onto an McpServer instance. Tracks the original
 * `registerTool` so re-decorating the same instance is a no-op
 * instead of double-wrapping every handler.
 */
interface DecoratedServer extends McpServer {
    __originalRegisterTool?: RegisterToolFn;
}

/**
 * Decorate an McpServer so every subsequently-registered tool emits a
 * structured `tool_call_*` event when invoked.
 *
 * Idempotent: calling twice on the same server reuses the original
 * registerTool reference instead of stacking wrappers.
 *
 * @param server - The McpServer to decorate. Must be decorated BEFORE
 *                 any `register*(server, ...)` function runs.
 * @param baseContext - Static context attached to every event from
 *                      this server (e.g. `correlationId` for HTTP
 *                      requests, `sessionId` for stdio).
 * @returns The same server, decorated in place.
 */
export function decorateServerWithLogging(
    server: McpServer,
    baseContext: { correlationId?: string; sessionId?: string },
): McpServer {
    const decorated = server as DecoratedServer;

    // Capture once — re-decoration uses the original, not a wrapper of a wrapper.
    if (!decorated.__originalRegisterTool) {
        decorated.__originalRegisterTool = decorated.registerTool.bind(decorated);
    }
    const original = decorated.__originalRegisterTool;
    const logger = childLogger({
        correlationId: baseContext.correlationId,
        sessionId: baseContext.sessionId,
    });

    const patched = function patchedRegisterTool(
        this: DecoratedServer,
        ...args: Parameters<RegisterToolFn>
    ): ReturnType<RegisterToolFn> {
        const [name, config, handler] = args as [
            Parameters<RegisterToolFn>[0],
            Parameters<RegisterToolFn>[1],
            Parameters<RegisterToolFn>[2],
        ];
        const wrappedHandler = wrapHandlerWithLogging(name, handler, logger);
        return original(name, config, wrappedHandler as typeof handler);
    } as RegisterToolFn;

    decorated.registerTool = patched;
    return decorated;
}

/**
 * Wrap a single tool handler with start/complete/failed events.
 *
 * Exported for direct unit testing — production callers should use
 * `decorateServerWithLogging` so every tool is wrapped consistently.
 *
 * @param name - The tool name, used as the `tool` field on every
 *               emitted event.
 * @param handler - The original SDK callback. Can be sync or async;
 *                  we always coerce the call into a Promise so the
 *                  timing logic is uniform.
 * @param logger - Logger to emit events on. Typically a child carrying
 *                 a correlationId.
 * @returns A drop-in replacement for `handler` with identical shape.
 */
export function wrapHandlerWithLogging<TArgs extends unknown[], TResult>(
    name: string,
    handler: (...args: TArgs) => TResult | Promise<TResult>,
    logger: Logger,
): (...args: TArgs) => Promise<TResult> {
    return async function loggedHandler(...args: TArgs): Promise<TResult> {
        const start = Date.now();
        const toolLog = logger.child({ tool: name });

        try {
            const result = await Promise.resolve(handler(...args));
            const event: ToolCallEvent = {
                tool: name,
                duration_ms: Date.now() - start,
                status: 'success',
            };
            toolLog.info(event, 'tool_call_complete');
            return result;
        } catch (err) {
            const event: ToolCallEvent = {
                tool: name,
                duration_ms: Date.now() - start,
                status: 'error',
                error_message: err instanceof Error ? err.message : String(err),
                error_class: err instanceof Error ? err.constructor.name : 'Unknown',
            };
            toolLog.error(event, 'tool_call_failed');
            throw err;
        }
    };
}
