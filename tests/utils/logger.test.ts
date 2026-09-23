/**
 * Tests for the logger module.
 *
 * Validates that level resolution, child context attachment, the test-only
 * reset hook, and credential redaction all behave as the public API documents.
 */

import { Writable } from 'node:stream';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pino from 'pino';

import {
    getLogger,
    childLogger,
    buildLoggerOptions,
    _resetLoggerForTesting,
    LOGGER_REDACT_PATHS,
    type LogLevel,
} from '../../src/utils/logger.js';

const ENV_KEYS = ['LOG_LEVEL', 'LOG_PRETTY', 'NODE_ENV'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

describe('logger', () => {
    let originalEnv: Partial<Record<EnvKey, string | undefined>> = {};

    beforeEach(() => {
        // Arrange — capture env so each test is isolated.
        originalEnv = {
            LOG_LEVEL: process.env.LOG_LEVEL,
            LOG_PRETTY: process.env.LOG_PRETTY,
            NODE_ENV: process.env.NODE_ENV,
        };
        // Disable pretty-printing during tests to avoid worker threads.
        process.env.LOG_PRETTY = 'false';
        _resetLoggerForTesting();
    });

    afterEach(() => {
        // Restore env so subsequent test files see the original values.
        process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
        process.env.LOG_PRETTY = originalEnv.LOG_PRETTY;
        process.env.NODE_ENV = originalEnv.NODE_ENV;
        _resetLoggerForTesting();
    });

    it('should default to debug level when NODE_ENV is not production', () => {
        // Arrange
        process.env.NODE_ENV = 'development';
        delete process.env.LOG_LEVEL;

        // Act
        const log = getLogger();

        // Assert
        expect(log.level).toBe('debug');
    });

    it('should default to info level when NODE_ENV is production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.LOG_LEVEL;

        const log = getLogger();

        expect(log.level).toBe('info');
    });

    it('should respect LOG_LEVEL env var when valid', () => {
        process.env.LOG_LEVEL = 'warn';

        const log = getLogger();

        expect(log.level).toBe('warn');
    });

    it('should fall back to default when LOG_LEVEL is invalid', () => {
        process.env.LOG_LEVEL = 'verbose';
        process.env.NODE_ENV = 'production';

        const log = getLogger();

        expect(log.level).toBe('info');
    });

    it('should normalise LOG_LEVEL casing to lower case before validation', () => {
        process.env.LOG_LEVEL = 'WARN';

        const log = getLogger();

        expect(log.level).toBe('warn');
    });

    it('should return the same root logger instance across calls', () => {
        const first = getLogger();
        const second = getLogger();

        expect(first).toBe(second);
    });

    it('should produce a fresh root logger after _resetLoggerForTesting', () => {
        const before = getLogger();

        _resetLoggerForTesting();
        const after = getLogger();

        expect(after).not.toBe(before);
    });

    it('should attach context to a child logger', () => {
        const child = childLogger({ correlationId: 'corr-123', tool: 'envia_test' });

        // Pino exposes the merged bindings via `.bindings()`.
        const bindings = child.bindings();
        expect(bindings).toMatchObject({
            correlationId: 'corr-123',
            tool: 'envia_test',
        });
    });

    it('should drop undefined values from child context', () => {
        const child = childLogger({
            correlationId: 'corr-456',
            sessionId: undefined,
            tool: undefined,
        });

        const bindings = child.bindings();
        expect(bindings.correlationId).toBe('corr-456');
        expect(bindings).not.toHaveProperty('sessionId');
        expect(bindings).not.toHaveProperty('tool');
    });

    it('should accept all six valid log levels via LOG_LEVEL', () => {
        // DAMP — explicit list is clearer than parametrising over LogLevel.
        const expectations: Array<[LogLevel, LogLevel]> = [
            ['fatal', 'fatal'],
            ['error', 'error'],
            ['warn', 'warn'],
            ['info', 'info'],
            ['debug', 'debug'],
            ['trace', 'trace'],
        ];

        const observed = expectations.map(([input]) => {
            process.env.LOG_LEVEL = input;
            _resetLoggerForTesting();
            return getLogger().level;
        });

        expect(observed).toEqual(expectations.map(([, expected]) => expected));
    });

    it('should redact credential field names in the logger config', () => {
        expect(LOGGER_REDACT_PATHS).toContain('api_key');
        expect(LOGGER_REDACT_PATHS).toContain('enviaApiKey');
        expect(LOGGER_REDACT_PATHS).toContain('headers["x-api-key"]');
        expect(LOGGER_REDACT_PATHS).toContain('headers.authorization');
    });

    it('should redact the credential inside a JSON-RPC body and a verified token', () => {
        expect(LOGGER_REDACT_PATHS).toContain('params.arguments.api_key');
        expect(LOGGER_REDACT_PATHS).toContain('auth.extra.enviaApiKey');
    });
});

describe('logger redaction', () => {
    /**
     * Emits through the real logger options so an unsupported pino path fails
     * here instead of leaking in production.
     */
    function emit(payload: Record<string, unknown>): string {
        const lines: string[] = [];
        const sink = new Writable({
            write(chunk, _encoding, done) {
                lines.push(String(chunk));
                done();
            },
        });
        pino(buildLoggerOptions(), sink).info(payload, 'audit');
        return lines.join('');
    }

    it('should censor the credential inside JSON-RPC arguments', () => {
        const line = emit({ params: { arguments: { api_key: 'super-secret-key' } } });

        expect(line).not.toContain('super-secret-key');
        expect(line).toContain('[REDACTED]');
    });

    it('should censor the credential carried by a verified token', () => {
        const line = emit({ auth: { extra: { enviaApiKey: 'jwt-carried-key' } } });

        expect(line).not.toContain('jwt-carried-key');
        expect(line).toContain('[REDACTED]');
    });

    it('should censor the Authorization header', () => {
        const line = emit({ headers: { authorization: 'Bearer secret-token' } });

        expect(line).not.toContain('secret-token');
    });

    it('should censor the x-api-key header', () => {
        const line = emit({ headers: { 'x-api-key': 'header-secret' } });

        expect(line).not.toContain('header-secret');
    });

    it('should keep the rest of the record readable', () => {
        const line = emit({ tool: 'envia_list_shipments', params: { arguments: { api_key: 'secret' } } });

        expect(line).toContain('envia_list_shipments');
    });
});
