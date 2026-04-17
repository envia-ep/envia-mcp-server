import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockServer, type ToolHandler } from '../../helpers/mock-server.js';
import { MOCK_CONFIG } from '../../helpers/fixtures.js';
import { EnviaApiClient } from '../../../src/utils/api-client.js';
import { registerUpdateOrderAddress } from '../../../src/tools/orders/update-order-address.js';
import { clearFormCache } from '../../../src/services/generic-form.js';

/**
 * Default mock: generic-form returns empty fields (validation no-op),
 * mutation PUT returns a successful response.
 *
 * Note: update-order-address ALWAYS calls generic-form because country_code
 * is a required field in the tool schema.
 */
function defaultMockResponse(url: string) {
    if (url.includes('/generic-form')) {
        return { ok: true, status: 200, json: () => Promise.resolve({ data: [] }) };
    }
    return { ok: true, status: 200, json: () => Promise.resolve({ data: true }) };
}

/** All required fields for the tool — reused across tests via spread. */
const BASE_ARGS = {
    api_key: MOCK_CONFIG.apiKey,
    shop_id: 33,
    order_id: 1009,
    address_type_id: 2,
    first_name: 'Erick',
    last_name: 'Ameida',
    address1: 'Av Centenario 100',
    address2: '',
    address3: '',
    country_code: 'MX',
    state_code: 'CX',
    city: 'Azcapotzalco',
    postal_code: '02070',
    phone: '5512345678',
    phone_code: '',
    identification_number: '',
    references: '',
};

describe('envia_update_order_address', () => {
    let handler: ToolHandler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        clearFormCache();
        mockFetch = vi.fn().mockImplementation((url: string) => Promise.resolve(defaultMockResponse(url)));
        vi.stubGlobal('fetch', mockFetch);

        const { server, handlers } = createMockServer();
        const client = new EnviaApiClient(MOCK_CONFIG);
        registerUpdateOrderAddress(server, client, MOCK_CONFIG);
        handler = handlers.get('envia_update_order_address')!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should update shipping address and return success with order and shop IDs', async () => {
        // Arrange — address_type_id=2 maps to Shipping
        // Act
        const result = await handler({ ...BASE_ARGS, address_type_id: 2 });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain('Shipping address updated successfully');
        expect(text).toContain('1009');
        expect(text).toContain('33');
    });

    it('should PUT to /orders/{shop_id}/{order_id}/address with correct body', async () => {
        // Arrange — full required fields
        // Act
        await handler({ ...BASE_ARGS });

        // Assert — mutation is PUT to the correct path with all fields
        const mutationCall = mockFetch.mock.calls.find((call) => !call[0].includes('/generic-form'));
        expect(mutationCall).toBeDefined();
        expect(mutationCall![0]).toContain('/orders/33/1009/address');
        expect(mutationCall![1].method).toBe('PUT');
        const body = JSON.parse(mutationCall![1].body);
        expect(body.address_type_id).toBe(2);
        expect(body.first_name).toBe('Erick');
        expect(body.country_code).toBe('MX');
    });

    it('should always call generic-form GET for country_code before mutation', async () => {
        // Arrange — country_code is always required, so form validation always fires
        // Act
        await handler({ ...BASE_ARGS, country_code: 'BR' });

        // Assert — generic-form called with the correct country
        const formCall = mockFetch.mock.calls.find((call) => call[0].includes('/generic-form'));
        expect(formCall).toBeDefined();
        expect(formCall![0]).toContain('country_code=BR');
    });

    it('should proceed with mutation when generic-form returns empty fields', async () => {
        // Arrange — empty data array means no required fields — graceful degradation
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: true }) });
        });

        // Act
        const result = await handler({ ...BASE_ARGS, country_code: 'CO' });

        // Assert — update succeeded despite empty form response
        expect(result.content[0].text).toContain('address updated successfully');
    });

    it('should return mapped error message when mutation API call fails', async () => {
        // Arrange — PUT endpoint responds with 422
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/generic-form')) {
                return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({
                ok: false,
                status: 422,
                json: () => Promise.resolve({ message: 'Order not found' }),
            });
        });

        // Act
        const result = await handler({ ...BASE_ARGS, order_id: 9999 });

        // Assert — error text returned, not thrown
        expect(result.content[0].text).toContain('Failed to update order address');
    });

    it('should return Billing label when address_type_id is 1', async () => {
        // Arrange — address_type_id=1 maps to Billing
        // Act
        const result = await handler({ ...BASE_ARGS, address_type_id: 1 });

        // Assert
        expect(result.content[0].text).toContain('Billing address updated successfully');
    });

    it('should return Origin label when address_type_id is 3', async () => {
        // Arrange — address_type_id=3 maps to Origin
        // Act
        const result = await handler({ ...BASE_ARGS, address_type_id: 3 });

        // Assert
        expect(result.content[0].text).toContain('Origin address updated successfully');
    });
});
