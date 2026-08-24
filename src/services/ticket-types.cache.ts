/**
 * Ticket Types Cache
 *
 * In-memory TTL cache for the /tickets/types catalog.
 * Fetches once on first use, then serves from memory for 12 hours.
 * Avoids hitting the API on every tool call.
 *
 * Source endpoint: GET /tickets/types (queries service, auth: token_user)
 * Response shape: { data: TicketType[] }
 * Each item: id, name, description, rules (JSON string), type (always null in practice), active
 *
 * The `rules` JSON field is the main source of truth for MCP behavior:
 *   - mcp_context.is_blocked  → whether this type can be used through the MCP
 *   - mcp_context.use_case    → human-readable intent description for the agent
 *   - mcp_context.requires_guide → whether a tracking number is required
 *   - mcp_context.agent_notes → extra guidance for the agent
 *   - reference               → entity to link ('guide', 'credit', 'warehouse-package', 'legal', 'legal-credit')
 *   - inputs                  → dynamic form fields to collect from the user
 *   - files                   → file attachments required to open the ticket
 *   - conditions.avaliable_status → shipment status IDs eligible for this type
 *   - comment_template        → predefined comment templates (string[] or "" when empty)
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { TicketTypesResponse } from '../types/tickets.js';
import { queryTicketsApi } from './tickets.js';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ---------------------------------------------------------------------------
// Domain types — parsed and typed from the actual API response
// ---------------------------------------------------------------------------

/**
 * MCP-specific context embedded in the ticket type rules.
 * Controls agent behavior: availability, intent description, and usage guidance.
 */
export interface McpContext {
    /** Short description of the intended use case — used by the agent to match user intent. */
    use_case: string;
    /** When true, this ticket type must NOT be created through the MCP. */
    is_blocked: boolean;
    /** Whether a tracking number / guide reference is required to open this ticket. */
    requires_guide: boolean;
    /** Additional guidance notes for the AI agent about this ticket type. */
    agent_notes?: string[];
}

/** A single dynamic input field the user must fill when opening a ticket. */
export interface TicketTypeInput {
    name: string;
    el: 'input' | 'select';
    required: boolean;
    type?: string;
    label?: string;
    regex?: string;
    regexMessage?: string;
    [key: string]: unknown;
}

/**
 * A file attachment required to open a ticket of this type.
 * Fields match the actual API response structure.
 */
export interface TicketTypeFile {
    /** Display name of the required file (e.g. "Factura del contenido"). */
    name: string;
    /** Internal upload path prefix. */
    path?: string;
    /** Internal file type identifier (e.g. "OVERWEIGHT", "DAMAGED"). */
    type?: string;
    /** i18n key for the file comment/instructions. */
    comment?: string;
    /** Internal description identifier. */
    description?: string;
    /** When true, this file is considered evidence. */
    evidence?: boolean;
}

/** Eligibility conditions for this ticket type. */
export interface TicketTypeConditions {
    /**
     * Shipment status IDs that are eligible for this ticket type.
     * Note: field name has a typo in the API ("avaliable" vs "available") — kept as-is.
     */
    avaliable_status?: number[];
    validations?: Array<{
        type: string;
        field: string;
        value: string;
        operator: string;
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
}

/**
 * Parsed rules object for a ticket type.
 * Stored as a JSON string in the DB; the cache parses and types it.
 */
export interface TicketTypeRule {
    /**
     * Which entity to link the ticket to.
     * 'guide' = tracking number, 'credit' = credit ID,
     * 'warehouse-package' = warehouse package ID,
     * 'legal' = legal form (physical person),
     * 'legal-credit' = legal form (moral person / credit).
     * May be an empty string when no reference is required.
     */
    reference?: string;
    inputs?: TicketTypeInput[];
    files?: TicketTypeFile[];
    /**
     * Predefined comment templates (i18n keys).
     * The API returns either a string[] or an empty string "" — normalize to string[].
     */
    comment_template?: string[] | string;
    conditions?: TicketTypeConditions;
    error?: string;
    mcp_context?: McpContext;
    [key: string]: unknown;
}

/** A ticket type as stored in the in-memory cache (rules already parsed). */
export interface CachedTicketType {
    id: number;
    name: string;
    description: string;
    /**
     * Extracted from rules->$.type in the DB query.
     * Always null in practice — the actual data has no `type` key inside rules.
     */
    type: string | null;
    /** 0 = inactive, 1 = active. */
    active: number;
    /** Parsed rules. Null when the API returns null (type has no rules configured). */
    rules: TicketTypeRule | null;
}

// ---------------------------------------------------------------------------
// Cache class
// ---------------------------------------------------------------------------

/**
 * In-memory cache for the ticket types catalog.
 *
 * Usage:
 *   const cache = new TicketTypesCache(client, config);
 *   const types = await cache.getAll();
 *   const rules = await cache.getRulesForType(5);
 */
export class TicketTypesCache {
    private cache: CachedTicketType[] = [];
    private lastFetchedAt = 0;

    constructor(
        private readonly client: EnviaApiClient,
        private readonly config: EnviaConfig,
    ) {}

    /**
     * Return all ticket types from cache.
     * Triggers a refresh from the API when the cache is empty or expired.
     */
    async getAll(): Promise<CachedTicketType[]> {
        if (this.cache.length > 0 && Date.now() - this.lastFetchedAt < CACHE_TTL_MS) {
            return this.cache;
        }
        await this.refresh();
        return this.cache;
    }

    /**
     * Return the parsed rules for a specific ticket type ID, or null if not found.
     */
    async getRulesForType(typeId: number): Promise<TicketTypeRule | null> {
        const types = await this.getAll();
        const found = types.find((t) => t.id === typeId);
        return found?.rules ?? null;
    }

    private async refresh(): Promise<void> {
        const res = await queryTicketsApi<TicketTypesResponse>(
            this.client,
            this.config,
            '/tickets/types',
        );

        if (!res.ok || !Array.isArray(res.data?.data)) {
            return;
        }

        this.cache = res.data.data.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            type: item.type ?? null,
            active: item.active,
            rules: parseRules(item.rules),
        }));
        this.lastFetchedAt = Date.now();
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a ticket type's rules field.
 * The API returns it as a JSON string or null; we return a typed object or null.
 */
function parseRules(raw: string | null | unknown): TicketTypeRule | null {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as TicketTypeRule;
        } catch {
            return null;
        }
    }
    if (typeof raw === 'object') {
        return raw as TicketTypeRule;
    }
    return null;
}
