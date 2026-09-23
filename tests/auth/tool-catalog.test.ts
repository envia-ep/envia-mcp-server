import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
    applyCatalogConfig,
    omitApiKeyFromSchema,
    publishToolSecuritySchemes,
    titleFromToolName,
} from '../../src/auth/tool-catalog.js';
import { AUTHENTICATED_TOOL_SECURITY_SCHEMES, PUBLIC_CATALOG_SECURITY_SCHEMES } from '../../src/auth/tool-access.js';

describe('titleFromToolName', () => {
    it('should turn envia_list_shipments into a human title', () => {
        expect(titleFromToolName('envia_list_shipments')).toBe('List shipments');
    });

    it('should stay within 64 characters', () => {
        const longName = `envia_${'word_'.repeat(20)}end`;
        expect(titleFromToolName(longName).length).toBeLessThanOrEqual(64);
    });
});

describe('omitApiKeyFromSchema', () => {
    it('should drop api_key from a Zod object schema', () => {
        const schema = z.object({
            api_key: z.string().optional(),
            country: z.string(),
        });

        const omitted = omitApiKeyFromSchema(schema) as z.ZodObject<{ country: z.ZodString }>;
        const parsed = omitted.parse({ country: 'MX', api_key: 'should-be-stripped' });

        expect(parsed).toEqual({ country: 'MX' });
        expect(() => omitted.parse({ api_key: 'only' })).toThrow();
    });

    it('should leave non-object schemas unchanged', () => {
        expect(omitApiKeyFromSchema('not-zod')).toBe('not-zod');
    });

    it('should throw with the tool name when a refined schema cannot drop api_key', () => {
        const refined = z.object({
            api_key: z.string(),
            shipment_id: z.number().optional(),
            tracking_number: z.string().optional(),
        }).refine(
            (data) => data.shipment_id !== undefined || data.tracking_number !== undefined,
            { message: 'At least one of shipment_id or tracking_number is required.' },
        );

        expect(() => omitApiKeyFromSchema(refined, 'envia_fulfill_order'))
            .toThrow(/envia_fulfill_order/);
    });
});

describe('applyCatalogConfig', () => {
    it('should add a title and authenticated schemes when they are missing', () => {
        const config = applyCatalogConfig(
            'envia_list_shipments',
            { description: 'List shipments', inputSchema: z.object({ api_key: z.string().optional() }) },
            { omitApiKeyFromSchema: false },
        ) as Record<string, unknown>;

        expect(config['title']).toBe('List shipments');
        expect(config['securitySchemes']).toEqual(AUTHENTICATED_TOOL_SECURITY_SCHEMES);
    });

    it('should keep existing public securitySchemes', () => {
        const config = applyCatalogConfig(
            'envia_list_carriers',
            {
                description: 'List carriers',
                securitySchemes: PUBLIC_CATALOG_SECURITY_SCHEMES,
                _meta: { securitySchemes: PUBLIC_CATALOG_SECURITY_SCHEMES },
            },
            { omitApiKeyFromSchema: false },
        ) as Record<string, unknown>;

        expect(config['securitySchemes']).toEqual(PUBLIC_CATALOG_SECURITY_SCHEMES);
    });

    it('should omit api_key from the HTTP catalog schema', () => {
        const schema = z.object({
            api_key: z.string().optional(),
            limit: z.number(),
        });
        const config = applyCatalogConfig(
            'envia_list_shipments',
            { description: 'List', inputSchema: schema },
            { omitApiKeyFromSchema: true },
        ) as { inputSchema: z.ZodObject<{ limit: z.ZodNumber }> };

        expect(config.inputSchema.parse({ limit: 1, api_key: 'extra' })).toEqual({ limit: 1 });
    });
});

describe('publishToolSecuritySchemes', () => {
    type ListToolsHandler = (request: unknown, extra: unknown) => Promise<{ tools: Array<Record<string, unknown>> }>;

    function listToolsHandler(server: McpServer): ListToolsHandler {
        const protocol = server.server as unknown as { _requestHandlers: Map<string, ListToolsHandler> };
        return protocol._requestHandlers.get('tools/list') as ListToolsHandler;
    }

    it('should advertise securitySchemes as a top-level field', async () => {
        const server = new McpServer({ name: 'test', version: '1.0.0' });
        server.registerTool(
            'envia_demo',
            {
                description: 'Demo tool',
                inputSchema: z.object({}),
                _meta: { securitySchemes: AUTHENTICATED_TOOL_SECURITY_SCHEMES },
            },
            async () => ({ content: [] }),
        );

        publishToolSecuritySchemes(server);
        const result = await listToolsHandler(server)({ method: 'tools/list' }, {});

        expect(result.tools[0]!['securitySchemes']).toEqual(AUTHENTICATED_TOOL_SECURITY_SCHEMES);
    });

    it('should leave a tool without _meta schemes untouched', async () => {
        const server = new McpServer({ name: 'test', version: '1.0.0' });
        server.registerTool(
            'envia_plain',
            { description: 'Plain tool', inputSchema: z.object({}) },
            async () => ({ content: [] }),
        );

        publishToolSecuritySchemes(server);
        const result = await listToolsHandler(server)({ method: 'tools/list' }, {});

        expect(result.tools[0]!['securitySchemes']).toBeUndefined();
    });

    it('should throw when no tool has been registered yet', () => {
        const server = new McpServer({ name: 'test', version: '1.0.0' });

        expect(() => publishToolSecuritySchemes(server)).toThrow(/tools\/list/);
    });
});
