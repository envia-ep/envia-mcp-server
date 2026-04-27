/**
 * Tests for the logger module.
 *
 * Validates that level resolution, child context attachment, and the
 * test-only reset hook all behave as the public API documents.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    getLogger,
    childLogger,
    _resetLoggerForTesting,
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
});
