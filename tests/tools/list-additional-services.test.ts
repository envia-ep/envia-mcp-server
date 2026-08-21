/**
 * Tests for envia_list_additional_services optional auth and anonymous disclaimer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../helpers/mock-server.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { registerListAdditionalServices } from '../../src/tools/list-additional-services.js';
import {
    ANONYMOUS_FALLBACK_DISCLAIMER,
    PUBLIC_CATALOG_SECURITY_SCHEMES,
} from '../../src/auth/tool-access.js';

const anonymousConfig = {
    ...MOCK_CONFIG,
    apiKey: '',
    serverApiKey: 'server-catalog-key',
};

const MOCK_SERVICES_RESPONSE = {
    data: [
        {
            name: 'insurance',
            description: 'Insurance options',
            label: 'insurance.label',
            child_type: 'form',
            childs: [
                {
                    id: 14,
                    category_id: 1,
                    name: 'envia_insurance',
                    description: 'Envia platform insurance',
                    label: 'envia_insurance.label',
                    tooltip_amount: 3000,
                    tooltip: null,
                    json_structure: '{"amount":{"type":"number"}}',
                    front_order_index: 1,
                },
            ],
        },
    ],
};

describe('envia_list_additional_services', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(MOCK_SERVICES_RESPONSE),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerListAdditionalServices(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_list_additional_services')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should advertise noauth so additional services work without OAuth', () => {
        const { server, toolConfigs } = createMockServer();
        registerListAdditionalServices(server, new EnviaApiClient(MOCK_CONFIG), MOCK_CONFIG);
        const config = toolConfigs.get('envia_list_additional_services');

        expect(config?.securitySchemes).toEqual(PUBLIC_CATALOG_SECURITY_SCHEMES);
    });

    it('should inherit ENVIA_API_KEY when the request has no user credential', async () => {
        const { server, handlers } = createMockServer();
        registerListAdditionalServices(server, new EnviaApiClient(anonymousConfig), anonymousConfig);
        const anonymousHandler = handlers.get('envia_list_additional_services')!;

        await anonymousHandler({ origin_country: 'MX', shipment_type: 1 });

        const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer server-catalog-key');
    });

    it('should include the assigned-rates disclaimer when no auth is provided', async () => {
        const { server, handlers } = createMockServer();
        registerListAdditionalServices(server, new EnviaApiClient(anonymousConfig), anonymousConfig);
        const anonymousHandler = handlers.get('envia_list_additional_services')!;

        const result = await anonymousHandler({ origin_country: 'MX', shipment_type: 1 });

        expect(result.content[0].text.startsWith(ANONYMOUS_FALLBACK_DISCLAIMER)).toBe(true);
    });

    it('should omit the disclaimer when the request has a user credential', async () => {
        const result = await handler({ origin_country: 'MX', shipment_type: 1 });

        expect(result.content[0].text).not.toContain(ANONYMOUS_FALLBACK_DISCLAIMER);
    });

    it('should omit the disclaimer when the user sends an api_key override', async () => {
        const { server, handlers } = createMockServer();
        registerListAdditionalServices(server, new EnviaApiClient(anonymousConfig), anonymousConfig);
        const anonymousHandler = handlers.get('envia_list_additional_services')!;

        const result = await anonymousHandler({
            origin_country: 'MX',
            shipment_type: 1,
            api_key: 'user-override-key',
        });

        expect(result.content[0].text).not.toContain(ANONYMOUS_FALLBACK_DISCLAIMER);
    });
});
