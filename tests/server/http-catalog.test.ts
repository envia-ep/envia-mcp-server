import { describe, it, expect, beforeAll } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createEnviaServer } from '../../src/server.js';

import { _resetLoggerForTesting } from '../../src/utils/logger.js';

/**
 * Exercises the real registration path. The unit suite calls handlers directly,
 * so it stayed green through two defects that only surfaced on `tools/list`:
 * a schema that could not drop `api_key`, and `securitySchemes` never leaving
 * `_meta`. These assertions are the listing requirements, measured end to end.
 */

interface ListedTool {
    name: string;
    title?: string;
    description?: string;
    annotations?: Record<string, unknown>;
    securitySchemes?: Array<{ type: string; scopes?: string[] }>;
    inputSchema?: { properties?: Record<string, unknown> };
}

type ListToolsHandler = (request: unknown, extra: unknown) => Promise<{ tools: ListedTool[] }>;

async function listTools(server: McpServer): Promise<ListedTool[]> {
    const protocol = server.server as unknown as { _requestHandlers: Map<string, ListToolsHandler> };
    const handler = protocol._requestHandlers.get('tools/list')!;
    const result = await handler({ method: 'tools/list' }, {});
    return result.tools;
}

describe('HTTP catalog', () => {
    let tools: ListedTool[];

    beforeAll(async () => {
        process.env.LOG_LEVEL = 'fatal';
        process.env.LOG_PRETTY = 'false';
        _resetLoggerForTesting();
        tools = await listTools(createEnviaServer({}, 'test-key', { httpCatalog: true }));
    });

    it('should register every tool without throwing', () => {
        expect(tools.length).toBeGreaterThan(0);
    });

    it('should not advertise api_key in any input schema', () => {
        const leaking = tools.filter((tool) => tool.inputSchema?.properties?.['api_key'] !== undefined);

        expect(leaking.map((tool) => tool.name)).toEqual([]);
    });

    it('should not mention the credential in any description', () => {
        const mentioning = tools.filter((tool) => /api_key|ENVIA_API_KEY/.test(tool.description ?? ''));

        expect(mentioning.map((tool) => tool.name)).toEqual([]);
    });

    it('should give every tool a title of at most 64 characters', () => {
        const invalid = tools.filter((tool) => !tool.title || tool.title.length > 64);

        expect(invalid.map((tool) => tool.name)).toEqual([]);
    });

    it('should advertise securitySchemes on every tool as a top-level field', () => {
        const missing = tools.filter((tool) => !Array.isArray(tool.securitySchemes) || tool.securitySchemes.length === 0);

        expect(missing.map((tool) => tool.name)).toEqual([]);
    });

    it('should only use security scheme types ChatGPT understands', () => {
        const types = new Set(tools.flatMap((tool) => (tool.securitySchemes ?? []).map((scheme) => scheme.type)));

        expect([...types].sort()).toEqual(['noauth', 'oauth2']);
    });

    it('should require oauth2 on every tool that is not a public catalog tool', () => {
        const anonymous = tools.filter((tool) => (tool.securitySchemes ?? []).some((scheme) => scheme.type === 'noauth'));

        expect(anonymous.map((tool) => tool.name).sort()).toEqual([
            'envia_ai_address_requirements',
            'envia_classify_hscode',
            'envia_find_drop_off',
            'envia_get_additional_service_prices',
            'envia_get_branches_catalog',
            'envia_get_carrier_constraints',
            'envia_list_additional_services',
            'envia_list_carriers',
            'envia_quote_shipment',
            'envia_track_package',
            'envia_validate_address',
        ]);
    });

    it('should carry the three safety annotations on every tool', () => {
        const incomplete = tools.filter((tool) =>
            typeof tool.annotations?.['readOnlyHint'] !== 'boolean' ||
            typeof tool.annotations?.['openWorldHint'] !== 'boolean' ||
            typeof tool.annotations?.['destructiveHint'] !== 'boolean');

        expect(incomplete.map((tool) => tool.name)).toEqual([]);
    });

    it('should never mark a read-only tool as destructive', () => {
        const contradictory = tools.filter((tool) =>
            tool.annotations?.['readOnlyHint'] === true && tool.annotations?.['destructiveHint'] === true);

        expect(contradictory.map((tool) => tool.name)).toEqual([]);
    });
});

describe('stdio catalog', () => {
    it('should keep api_key so developers can pass their own key', async () => {
        process.env.LOG_LEVEL = 'fatal';
        process.env.LOG_PRETTY = 'false';
        _resetLoggerForTesting();
        const tools = await listTools(createEnviaServer({}, 'test-key'));
        const withApiKey = tools.filter((tool) => tool.inputSchema?.properties?.['api_key'] !== undefined);

        expect(withApiKey.length).toBe(tools.length);
    });
});
