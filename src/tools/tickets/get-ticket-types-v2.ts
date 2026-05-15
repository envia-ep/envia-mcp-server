/**
 * Tool: envia_get_ticket_types_v2
 *
 * Returns ticket type information from the in-memory cache.
 * The catalog is fetched from GET /tickets/types on first use and refreshed every 12 hours.
 *
 * Two modes of operation:
 *
 * MODE 1 — No arguments: returns a summary of all ticket types available through the MCP.
 *   A type is available when: mcp_context exists AND mcp_context.is_blocked === false.
 *   Returns: id, name, description, use_case, requires_guide, and the reference entity needed.
 *   Use this to explore available types and match the user's intent to one.
 *
 * MODE 2 — Pass type_id or type_name: returns the full requirements for that specific type.
 *   Returns: required_variables (fields to collect), optional_variables, required_files,
 *   eligible_shipment_status_ids, agent_notes, and comment_template.
 *   Use this once the user's intent has been matched to a type from MODE 1.
 *
 * Recommended workflow before envia_create_ticket:
 *   1. Unclear type → call with no args to list available types, match user intent to use_case.
 *   2. Type identified → call with type_id or type_name to get exact field requirements.
 *   3. Collect fields from the user → call envia_create_ticket.
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResponse } from '../../utils/mcp-response.js';
import type {
    TicketTypesCache,
    TicketTypeRule,
    CachedTicketType,
} from '../../services/ticket-types.cache.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
    type_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Numeric ticket type ID — returns full requirements for this specific type'),
    type_name: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Keyword to search by name, description, or use_case (e.g. "overweight", "lost", "delay"). ' +
            'Case-insensitive partial match.',
        ),
});

type GetTicketTypesV2Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

/**
 * A ticket type is available through the MCP when it has an mcp_context and is not blocked.
 * Types without mcp_context (e.g. "carrier", "rating_tickets") are internal and not exposed.
 */
function isAvailable(type: CachedTicketType): boolean {
    return Boolean(type.rules?.mcp_context && !type.rules.mcp_context.is_blocked);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface VariableSummary {
    name: string;
    type: string;
    required: boolean;
    label?: string;
}

/**
 * Derive required and optional input variable summaries from a ticket type's rules.
 * Skips inputs with missing or literally "undefined" names.
 */
function deriveInputVariables(rules: TicketTypeRule | null): {
    required_variables: VariableSummary[];
    optional_variables: VariableSummary[];
} {
    const required: VariableSummary[] = [];
    const optional: VariableSummary[] = [];

    if (!rules?.inputs) {
        return { required_variables: required, optional_variables: optional };
    }

    for (const input of rules.inputs) {
        if (!input.name || input.name === 'undefined') continue;

        const normalizedType =
            input.type === 'source' ? 'string (select)' :
            input.type === 'values' ? 'string (select)' :
            input.type === 'email' ? 'string (email)' :
            (input.type ?? 'string');

        const entry: VariableSummary = {
            name: input.name,
            type: normalizedType,
            required: input.required,
            ...(input.label ? { label: input.label } : {}),
        };

        if (input.required) {
            required.push(entry);
        } else {
            optional.push(entry);
        }
    }

    return { required_variables: required, optional_variables: optional };
}

/**
 * Normalize comment_template: the API returns either a string[] or an empty string "".
 * Returns undefined when there's nothing to show.
 */
function normalizeCommentTemplate(value: string[] | string | undefined): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.length > 0 ? value : undefined;
    return undefined;
}

/**
 * Map the reference field to a human-readable description for the agent.
 * Returns null when there is no reference or it's an empty string.
 */
function describeReference(reference: string | undefined): string | null {
    if (!reference) return null;
    const map: Record<string, string> = {
        'guide': 'tracking number (guide)',
        'credit': 'credit ID',
    };
    return map[reference] ?? reference;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core logic for envia_get_ticket_types_v2.
 * Separated from the registration function for testability.
 */
export async function handleGetTicketTypesV2(
    input: GetTicketTypesV2Input,
    cache: TicketTypesCache,
): Promise<string> {
    const allTypes = await cache.getAll();
    const available = allTypes.filter(isAvailable);

    // MODE 1 — no arguments: return summary of all MCP-available types
    if (input.type_id === undefined && !input.type_name) {
        const summary = available.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            use_case: t.rules!.mcp_context!.use_case,
            requires_guide: t.rules!.mcp_context!.requires_guide,
            requires: describeReference(t.rules?.reference),
        }));
        return JSON.stringify(summary, null, 2);
    }

    // MODE 2 — match by type_id or type_name
    let matched: CachedTicketType | undefined;

    if (input.type_id !== undefined) {
        // Search all types (including inactive) when filtering by ID
        matched = allTypes.find((t) => t.id === input.type_id);
    }

    if (!matched && input.type_name) {
        const keyword = input.type_name.toLowerCase();
        matched = available.find(
            (t) =>
                t.name.toLowerCase().includes(keyword) ||
                t.description.toLowerCase().includes(keyword) ||
                t.rules?.mcp_context?.use_case?.toLowerCase().includes(keyword),
        );
    }

    if (!matched) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `No ticket type found matching "${input.type_id ?? input.type_name}". ` +
            'Call envia_get_ticket_types_v2 without arguments to see all available types.',
        );
    }

    if (!isAvailable(matched)) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `Ticket type "${matched.description}" (id: ${matched.id}) is not available through the MCP. ` +
            'Call envia_get_ticket_types_v2 without arguments to see all available types.',
        );
    }

    const ctx = matched.rules!.mcp_context!;
    const { required_variables, optional_variables } = deriveInputVariables(matched.rules);
    const commentTemplate = normalizeCommentTemplate(matched.rules?.comment_template);

    const detail = {
        id: matched.id,
        name: matched.name,
        description: matched.description,
        use_case: ctx.use_case,
        requires_guide: ctx.requires_guide,
        requires: describeReference(matched.rules?.reference),
        required_variables,
        optional_variables,
        ...(matched.rules?.files?.length
            ? { required_files: matched.rules.files.map((f) => ({ name: f.name, description: f.description })) }
            : {}),
        ...(matched.rules?.conditions?.avaliable_status?.length
            ? { eligible_shipment_status_ids: matched.rules.conditions.avaliable_status }
            : {}),
        ...(ctx.agent_notes?.length ? { agent_notes: ctx.agent_notes } : {}),
        ...(commentTemplate ? { comment_template: commentTemplate } : {}),
    };

    return JSON.stringify(detail, null, 2);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_get_ticket_types_v2 tool on the MCP server.
 *
 * @param server - MCP server instance
 * @param cache  - Shared TicketTypesCache instance (created once per server lifecycle)
 */
export function registerGetTicketTypesV2(
    server: McpServer,
    cache: TicketTypesCache,
): void {
    server.registerTool(
        'envia_get_ticket_types_v2',
        {
            description:
                'Returns ticket type catalog from cache (refreshed every 12 hours from GET /tickets/types). ' +
                'Only returns types that are available through the MCP (have mcp_context and are not blocked). ' +
                'MODE 1 — no args: returns all available types with id, name, description, use_case, ' +
                'requires_guide, and the reference entity required (e.g. guide = tracking number, credit = credit ID). ' +
                'Use this to match the user\'s intent to the correct type. ' +
                'MODE 2 — pass type_id or type_name: returns full requirements for that type including ' +
                'required_variables (fields to collect from user), optional_variables, required_files, ' +
                'eligible_shipment_status_ids, agent_notes, and comment_template. ' +
                'Workflow: (1) call without args → match user intent to use_case, ' +
                '(2) call with type_id or type_name → get exact requirements, ' +
                '(3) collect fields from user → call envia_create_ticket.',
            inputSchema,
        },
        async (args) => {
            const result = await handleGetTicketTypesV2(args, cache);
            return textResponse(result);
        },
    );
}
