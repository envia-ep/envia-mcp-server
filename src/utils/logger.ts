/**
 * Logger
 *
 * Structured logging for the Envia MCP server. Wraps pino with a small
 * factory so other modules can grab the root logger or a child with
 * additional context (correlation IDs, tool names, etc.).
 *
 * Why pino: zero-dependency JSON logging, fastest in the Node ecosystem,
 * works the same in development and production. Heroku/Datadog ingest the
 * JSON lines directly without further transformation.
 *
 * Configuration is environment-driven so we can keep `index.ts` tidy:
 *
 *   LOG_LEVEL    — 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
 *                  (default: 'info' — 'debug' in non-production)
 *   LOG_PRETTY   — when set to 'true', pipes through pino-pretty so a
 *                  human can read the output. Default off in production.
 *   NODE_ENV     — production / staging / development. Used as a default
 *                  hint for LOG_PRETTY.
 *
 * The MCP runs in two transports:
 *   - HTTP mode (default) — every incoming POST /mcp gets its own
 *     correlation ID. The id flows through child loggers attached to
 *     each tool invocation.
 *   - stdio mode — single long-lived process; one base correlation ID
 *     is generated at startup and reused.
 *
 * Tests should reset the cached root logger via `_resetLoggerForTesting()`
 * before each run that mocks transports or env vars.
 */

import pino, { type Logger, type LoggerOptions, type DestinationStream } from 'pino';

/**
 * Allowed log levels — keeps the surface explicit instead of accepting
 * any string. Matches pino's `Level` type but exported here so callers
 * outside this module don't have to import pino directly.
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const VALID_LEVELS: ReadonlySet<LogLevel> = new Set([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
]);

/**
 * Per-call context attached to a child logger.
 *
 * Always include a `correlationId` for HTTP-mode tool calls so SREs can
 * filter logs across one MCP request end-to-end. Other fields are tool
 * specific (e.g. `tool` for tool-call events).
 */
export interface LoggerContext {
    correlationId?: string;
    sessionId?: string;
    tool?: string;
    [key: string]: unknown;
}

let cachedRoot: Logger | null = null;

/**
 * Resolve the configured log level, defaulting based on NODE_ENV.
 *
 * @returns A valid pino log level string.
 */
function resolveLogLevel(): LogLevel {
    const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
    if (VALID_LEVELS.has(raw as LogLevel)) return raw as LogLevel;

    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Build the pino destination stream.
 *
 * Returns `undefined` when no transport is needed (pino writes JSON to
 * stdout by default). When LOG_PRETTY is requested AND pino-pretty is
 * available, returns a pretty-print stream for local development.
 *
 * pino-pretty is intentionally a soft dependency — production deploys
 * never need it and importing it lazily keeps cold-start tiny.
 */
function buildDestination(): DestinationStream | undefined {
    const wantsPretty =
        process.env.LOG_PRETTY === 'true' ||
        (process.env.LOG_PRETTY === undefined && process.env.NODE_ENV !== 'production');
    if (!wantsPretty) return undefined;

    return pino.transport({
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
        },
    });
}

/**
 * Build the pino logger options object.
 *
 * @returns Options with a sensible base context and ISO timestamps.
 */
function buildOptions(): LoggerOptions {
    return {
        level: resolveLogLevel(),
        base: {
            service: 'envia-mcp-server',
            env: process.env.NODE_ENV ?? 'development',
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            // Emit "level" as a string ("info") instead of pino's default
            // numeric value (30). Datadog, Loki, and most JSON log
            // viewers expect the string form.
            level(label) {
                return { level: label };
            },
        },
    };
}

/**
 * Get (or lazily construct) the process-wide root logger.
 *
 * Cached so child loggers share a single underlying transport.
 *
 * @returns The root pino Logger.
 */
export function getLogger(): Logger {
    if (cachedRoot) return cachedRoot;

    const destination = buildDestination();
    cachedRoot = destination ? pino(buildOptions(), destination) : pino(buildOptions());
    return cachedRoot;
}

/**
 * Build a child logger with extra context.
 *
 * Pino's child loggers are cheap — instantiate one per request, tool
 * invocation, or background job to keep correlation context attached
 * without manually passing it everywhere.
 *
 * @param context - Fields to merge into every log line emitted by the
 *                  child. Keys with `undefined` values are dropped to
 *                  avoid noisy `"foo": null` output.
 * @returns A child logger inheriting the root configuration.
 */
export function childLogger(context: LoggerContext): Logger {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) cleaned[key] = value;
    }
    return getLogger().child(cleaned);
}

/**
 * Reset the cached root logger. **Test-only** — production code never
 * needs to drop the singleton. Tests use this when they mock env vars
 * or want a fresh logger per test.
 */
export function _resetLoggerForTesting(): void {
    cachedRoot = null;
}
