/**
 * Runtime response validation for MCP tools.
 *
 * Wraps a backend response in a Zod parse step. When validation fails,
 * the helper either returns the data anyway (default, "warn" mode) or
 * throws (when MCP_SCHEMA_VALIDATION_MODE=strict).
 *
 * Mode is read once at module load. Tools call `parseToolResponse(schema,
 * data, toolName)` and forget about the rest.
 *
 * See _docs/specs/RUNTIME_ZOD_VALIDATION_SPEC.md for design rationale.
 */

import type { ZodTypeAny, z } from 'zod';
import { logger } from './logger.js';

type ValidationMode = 'warn' | 'strict';

/**
 * Module-level configuration. Read once at first import.
 *
 * - 'warn'   (default): log + return data anyway.
 * - 'strict': throw SchemaValidationError on mismatch.
 */
const MODE: ValidationMode =
    process.env.MCP_SCHEMA_VALIDATION_MODE === 'strict' ? 'strict' : 'warn';

/**
 * Thrown only when MODE === 'strict'. The chat agent / portal sees this as
 * a 500-class error from the MCP. Production should never run in strict
 * mode; this is meant for CI and local dev.
 */
export class SchemaValidationError extends Error {
    public readonly tool: string;
    public readonly issues: z.ZodIssue[];

    constructor(tool: string, issues: z.ZodIssue[]) {
        super(`Response validation failed for tool "${tool}": ${issues.length} issue(s)`);
        this.name = 'SchemaValidationError';
        this.tool = tool;
        this.issues = issues;
    }
}

/**
 * Parse a backend response against a Zod schema.
 *
 * @param schema   - Zod schema describing the expected shape.
 * @param data     - Raw response data (typically `res.data` from an
 *                   EnviaApiClient call).
 * @param toolName - Name of the tool calling this helper, used as the
 *                   `tool` field in the warning log.
 * @returns        - The parsed data on success. On failure in 'warn' mode,
 *                   returns the original `data` cast to the inferred type
 *                   (since downstream code expects that shape). On failure
 *                   in 'strict' mode, throws SchemaValidationError.
 *
 * NOTE: 'warn' mode returns the ORIGINAL `data`, not Zod's coerced result.
 * This is deliberate — if the schema is wrong, we want the formatter to
 * see what the backend actually sent, not a half-coerced version.
 */
export function parseToolResponse<S extends ZodTypeAny>(
    schema: S,
    data: unknown,
    toolName: string,
): z.infer<S> {
    const result = schema.safeParse(data);

    if (result.success) {
        return result.data;
    }

    // Validation failed. Log structured event regardless of mode so
    // Datadog always captures the drift signal.
    //
    // SECURITY (§3.10 S1, S2): we emit ONLY path / code / message.
    // Zod's default error formatting can include `received` values
    // — those are PII risk (customer names, phones, addresses,
    // tracking numbers, COD amounts). NEVER add `received` here.
    // NEVER stringify `data` here. NEVER raise the slice(0, 5) cap.
    logger.warn(
        {
            event: 'schema_validation_failed',
            tool: toolName,
            issue_count: result.error.issues.length,
            issues: result.error.issues.slice(0, 5).map((i) => ({
                path: i.path.join('.'),
                code: i.code,
                message: i.message,
                // DO NOT add `received: i` or anything that surfaces
                // the actual value at the failed path.
            })),
        },
        `[schema] Response shape mismatch for ${toolName}`,
    );

    if (MODE === 'strict') {
        throw new SchemaValidationError(toolName, result.error.issues);
    }

    // 'warn' mode: return raw data so the formatter sees backend reality,
    // not a half-coerced Zod object.
    return data as z.infer<S>;
}
