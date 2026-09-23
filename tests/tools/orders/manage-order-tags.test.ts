import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerManageOrderTags } from '../../../src/tools/orders/manage-order-tags.js';

const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    order_ids: [1009],
};

describe('envia_manage_order_tags', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ inserted: 1, tags: [{ tag: 'priority' }], deleted: 1 }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerManageOrderTags(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_manage_order_tags')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return a tool error when action is add and tags is missing', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, action: 'add' });

        // Assert
        expect(result.isError).toBe(true);
    });

    it('should return a tool error when action is add and tags is empty', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, action: 'add', tags: [] });

        // Assert
        expect(result.isError).toBe(true);
    });

    it('should return a tool error when action is remove and tag_ids is missing', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, action: 'remove' });

        // Assert
        expect(result.isError).toBe(true);
    });

    it('should return a tool error when action is remove and tag_ids is empty', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, action: 'remove', tag_ids: [] });

        // Assert
        expect(result.isError).toBe(true);
    });

    it('should not call the API when the required field for the action is missing', async () => {
        // Act
        await handler({ ...BASE_ARGS, action: 'add' });

        // Assert
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should add tags when action is add and tags are given', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, action: 'add', tags: ['priority'] });

        // Assert
        expect(result.content[0].text).toContain('Tags added successfully');
    });

    it('should POST the tags to the orders tag path', async () => {
        // Act
        await handler({ ...BASE_ARGS, action: 'add', tags: ['priority'] });

        // Assert
        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toContain('/orders/tags');
        expect(JSON.parse(String((init as { body: string }).body))).toEqual({
            order_ids: [1009],
            tags: ['priority'],
        });
    });

    it('should remove tags when action is remove and tag_ids are given', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, action: 'remove', tag_ids: [7] });

        // Assert
        expect(result.content[0].text).toContain('Tags removed successfully');
    });

    it('should DELETE the tag ids from the orders tag path', async () => {
        // Act
        await handler({ ...BASE_ARGS, action: 'remove', tag_ids: [7] });

        // Assert
        const [, init] = mockFetch.mock.calls[0];
        expect((init as { method: string }).method).toBe('DELETE');
        expect(JSON.parse(String((init as { body: string }).body))).toEqual({
            order_ids: [1009],
            tag_ids: [7],
        });
    });
});
