import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerFulfillOrder } from '../../../src/tools/orders/fulfill-order.js';

/** Required fields for the tool — the shipment identifier is added per test. */
const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    shop_id: 33,
    order_id: 1009,
    package_id: 5,
};

describe('envia_fulfill_order', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ completed: false }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerFulfillOrder(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_fulfill_order')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return a tool error when neither shipment_id nor tracking_number is given', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS });

        // Assert
        expect(result.isError).toBe(true);
    });

    it('should name both accepted identifiers when neither is given', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS });

        // Assert
        expect(result.content[0].text).toContain('At least one of shipment_id or tracking_number is required.');
    });

    it('should not call the API when neither identifier is given', async () => {
        // Act
        await handler({ ...BASE_ARGS });

        // Assert
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fulfill the package when shipment_id is given', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, shipment_id: 987 });

        // Assert
        expect(result.content[0].text).toContain('Fulfillment created successfully for package 5');
    });

    it('should fulfill the package when only tracking_number is given', async () => {
        // Act
        const result = await handler({ ...BASE_ARGS, tracking_number: 'TRK-123' });

        // Assert
        expect(result.content[0].text).toContain('Fulfillment created successfully for package 5');
    });

    it('should POST the shipment identifier to the fulfillment path', async () => {
        // Act
        await handler({ ...BASE_ARGS, shipment_id: 987 });

        // Assert
        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toContain('/orders/33/1009/fulfillment/order-shipments');
        expect(JSON.parse(String((init as { body: string }).body))).toMatchObject({
            package_id: 5,
            shipment_id: 987,
        });
    });

    it('should warn that the order is completed when the API reports it', async () => {
        // Arrange
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ completed: true }),
        });

        // Act
        const result = await handler({ ...BASE_ARGS, shipment_id: 987 });

        // Assert
        expect(result.content[0].text).toContain('marked as COMPLETED');
    });
});
