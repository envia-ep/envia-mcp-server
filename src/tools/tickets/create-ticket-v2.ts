/**
 * Tool: envia_create_ticket_v2
 *
 * Creates a new support ticket using the in-memory TicketTypesCache for
 * pre-flight validation. This avoids an extra API round-trip to check type
 * availability and required fields before the actual creation call.
 *
 * Pre-flight validations (fail fast before hitting the API):
 *   1. Ticket type must be available through the MCP (mcp_context exists and is_blocked === false).
 *   2. Required reference field must be present:
 *      - reference="guide"             → tracking_number OR shipment_id
 *      - reference="credit"            → credit_id
 *   3. Required inputs (from rules.inputs) must be present in `variables`.
 *
 * When tracking_number is provided for a 'guide' type:
 *   - Resolves to internal shipment_id via GET /guide/{tracking}.
 *   - Validates the shipment's current status against eligible_shipment_status_ids when defined.
 *
 * Handles 409 Conflict when an active ticket already exists for the same
 * shipment + type combination.
 *
 * Recommended workflow:
 *   1. envia_get_ticket_types_v2 (no args) → find type by use_case.
 *   2. envia_get_ticket_types_v2 (type_id) → get required_variables, required_files, agent_notes.
 *   3. Collect fields from user → call envia_create_ticket_v2.
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryShipmentsApi } from '../../services/shipments.js';
import { mutateTicketApi } from '../../services/tickets.js';
import { parseToolResponse } from '../../utils/response-validator.js';
import { ShipmentDetailResponseSchema } from '../../schemas/shipments.js';
import { CreateTicketResponseSchema } from '../../schemas/tickets.js';
import type { TicketTypesCache, TicketTypeRule } from '../../services/ticket-types.cache.js';
import type { ShipmentStatusesCache } from '../../services/shipment-statuses.cache.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
    type_id: z
        .number()
        .int()
        .positive()
        .describe(
            'Ticket type ID. Call envia_get_ticket_types_v2 without arguments to see all available types.',
        ),
    comments: z
        .string()
        .min(1)
        .describe('Initial description of the issue. Required.'),
    tracking_number: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Tracking number ("guía") of the related shipment. ' +
            'Preferred over shipment_id — pass this whenever the user references a shipment. ' +
            'Required when the ticket type has reference="guide" and shipment_id is not provided. ' +
            'The tool resolves it to the internal shipment_id automatically and validates the shipment status.',
        ),
    shipment_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Internal shipment ID. Use only when you already have the resolved ID; ' +
            'otherwise pass tracking_number and the tool resolves it.',
        ),
    credit_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Credit ID. Required when the ticket type has reference="credit".'),
    carrier_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Carrier ID associated with the issue.'),
    variables: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            'Type-specific input variables as a key-value object. ' +
            'Use the field names from required_variables / optional_variables returned by envia_get_ticket_types_v2. ' +
            'Example: { "payment_method_id": "3", "bank_account": "123456789" }',
        ),
});

type CreateTicketV2Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// Pre-flight validation
// ---------------------------------------------------------------------------

/**
 * Validate reference field and required inputs before hitting the API.
 * Throws McpError on the first missing required field.
 */
function validateRules(rules: TicketTypeRule, input: CreateTicketV2Input): void {
    if (rules.reference) {
        if (rules.reference === 'guide' && !input.shipment_id && !input.tracking_number) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'This ticket type requires a shipment reference. Provide tracking_number or shipment_id.',
            );
        }

        if (rules.reference === 'credit' && !input.credit_id) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'This ticket type requires a credit reference. Provide credit_id.',
            );
        }
    }

    if (Array.isArray(rules.inputs)) {
        for (const field of rules.inputs) {
            if (!field.required) continue;
            if (!field.name || field.name === 'undefined') continue;
            const value = input.variables?.[field.name];
            if (value === undefined || value === null || value === '') {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Field "${field.name}" is required for this ticket type. Add it to the variables object.`,
                );
            }
        }
    }
}

/**
 * Resolve tracking_number → shipment_id via GET /guide/{tracking}.
 * Also validates the shipment status against eligible_shipment_status_ids when defined.
 * Uses ShipmentStatusesCache to show human-readable status names in error messages.
 * Returns the resolved internal shipment ID or throws McpError on failure.
 */
export async function resolveAndValidateShipment(
    trackingNumber: string,
    rules: TicketTypeRule | null,
    client: EnviaApiClient,
    config: EnviaConfig,
    statusesCache: ShipmentStatusesCache,
): Promise<number> {
    const tracking = encodeURIComponent(trackingNumber.trim());
    const lookup = await queryShipmentsApi<unknown>(client, config, `/guide/${tracking}`, {});

    if (!lookup.ok) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `Shipment with tracking number "${trackingNumber}" was not found. ` +
            'Verify the tracking number is correct and belongs to the authenticated account.',
        );
    }

    const validated = parseToolResponse(ShipmentDetailResponseSchema, lookup.data, 'envia_create_ticket_v2');
    const shipment = validated.data?.[0];

    if (!shipment?.id) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `Shipment with tracking number "${trackingNumber}" was not found. ` +
            'Verify the tracking number is correct and belongs to the authenticated account.',
        );
    }

    const eligibleStatuses = rules?.conditions?.avaliable_status;
    if (Array.isArray(eligibleStatuses) && eligibleStatuses.length > 0) {
        if (!eligibleStatuses.includes(shipment.status_id)) {
            const allStatuses = await statusesCache.getAll();
            const statusMap = new Map(allStatuses.map((s) => [s.id, s.name]));

            const currentName = statusMap.get(shipment.status_id) ?? `ID ${shipment.status_id}`;
            const allowedNames = eligibleStatuses
                .map((id) => statusMap.get(id) ?? `ID ${id}`)
                .join(', ');

            throw new McpError(
                ErrorCode.InvalidParams,
                `Cannot create this ticket type: shipment is currently in status "${currentName}". ` +
                `This ticket type is only available when the shipment is in one of these statuses: ${allowedNames}. ` +
                'Use envia_track_package to check the current shipment status.',
            );
        }
    }

    return shipment.id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core logic for envia_create_ticket_v2.
 * Separated from registration for testability.
 */
export async function handleCreateTicketV2(
    input: CreateTicketV2Input,
    cache: TicketTypesCache,
    client: EnviaApiClient,
    config: EnviaConfig,
    statusesCache: ShipmentStatusesCache,
): Promise<string> {
    // Step 1: Pre-flight validation via cache
    const rules = await cache.getRulesForType(input.type_id);

    if (!rules?.mcp_context || rules.mcp_context.is_blocked) {
        throw new McpError(
            ErrorCode.InvalidParams,
            `Ticket type ${input.type_id} is not available through the MCP. ` +
            'Call envia_get_ticket_types_v2 without arguments to see all available types.',
        );
    }

    validateRules(rules, input);

    // Step 2: Resolve tracking_number → shipment_id when the type requires a guide reference
    let resolvedShipmentId = input.shipment_id;

    if (rules.reference === 'guide' && !resolvedShipmentId && input.tracking_number) {
        resolvedShipmentId = await resolveAndValidateShipment(
            input.tracking_number,
            rules,
            client,
            config,
            statusesCache,
        );
    }

    // Step 3: Build request payload
    const body: Record<string, unknown> = {
        type_id: input.type_id,
        comments: input.comments,
    };

    if (resolvedShipmentId !== undefined) body.shipment_id = resolvedShipmentId;
    if (input.credit_id !== undefined) body.credit_id = input.credit_id;
    if (input.carrier_id !== undefined) body.carrier_id = input.carrier_id;
    if (input.variables && Object.keys(input.variables).length > 0) {
        body.data = JSON.stringify(input.variables);
    }

    // Step 4: Create ticket
    const res = await mutateTicketApi<unknown>(client, config, '/company/tickets', body);

    if (!res.ok) {
        if (res.status === 409) {
            return (
                'Cannot create ticket: an active ticket already exists for this shipment and type. ' +
                'Use envia_list_tickets with the tracking number to find the existing ticket, ' +
                'or use envia_add_ticket_comment to add more information.'
            );
        }
        const mapped = mapCarrierError(res.status, res.error ?? '');
        return `Failed to create ticket: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`;
    }

    const validated = parseToolResponse(CreateTicketResponseSchema, res.data, 'envia_create_ticket_v2');
    const ticketId = validated.id;

    const linkLine = resolvedShipmentId !== undefined
        ? `  Linked to shipment_id: ${resolvedShipmentId}` +
            (input.tracking_number ? ` (tracking: ${input.tracking_number})` : '')
        : '  Not linked to any shipment.';

    return [
        'Ticket created successfully.',
        `  Ticket ID: ${ticketId}`,
        linkLine,
        '',
        'Use envia_get_ticket_detail to view full details or envia_add_ticket_comment to add more information.',
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_create_ticket_v2 tool on the MCP server.
 *
 * @param server        - MCP server instance
 * @param cache         - Shared TicketTypesCache instance (created once per server lifecycle)
 * @param client        - Envia API client
 * @param config        - Envia configuration
 * @param statusesCache - Shared ShipmentStatusesCache for human-readable status names in errors
 */
export function registerCreateTicketV2(
    server: McpServer,
    cache: TicketTypesCache,
    client: EnviaApiClient,
    config: EnviaConfig,
    statusesCache: ShipmentStatusesCache,
): void {
    server.registerTool(
        'envia_create_ticket_v2',
        {
            description:
                'Creates a new support ticket after pre-flight validation via the ticket types cache. ' +
                'STEP 1 — Call envia_get_ticket_types_v2 (no args) to identify the correct type by use_case. ' +
                'STEP 2 — Call envia_get_ticket_types_v2 (type_id) to get required_variables and agent_notes. ' +
                'STEP 3 — Collect fields from the user and call this tool. ' +
                'When the ticket relates to a shipment, ALWAYS pass tracking_number — ' +
                'the tool resolves it to shipment_id automatically and validates the shipment status. ' +
                'Tickets without a tracking number become orphaned and cannot be found by shipment search later.',
            inputSchema,
        },
        async (args) => {
            const result = await handleCreateTicketV2(args, cache, client, config, statusesCache);
            return textResponse(result);
        },
    );
}
