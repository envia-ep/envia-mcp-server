import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncFulfillment } from '../../src/services/ecommerce-sync.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import { MOCK_CONFIG } from '../helpers/fixtures.js';

const CONFIG_WITH_ECART = { ...MOCK_CONFIG, ecartApiBase: 'https://api.ecart.io' };
const CONFIG_WITHOUT_ECART = { ...MOCK_CONFIG, ecartApiBase: undefined };

const MINIMAL_INPUT = {
    shopId: 42,
    orderIdentifier: 'order-123',
    trackingNumber: 'TRK001',
    carrier: 'dhl',
    service: 'express',
    trackUrl: 'https://envia.com/tracking?label=TRK001',
    items: [{ id: '111', quantity: '1' }],
};

describe('syncFulfillment', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let client: EnviaApiClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
        });
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(CONFIG_WITH_ECART);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return ok:false when ecartApiBase is not configured', async () => {
        const clientNoEcart = new EnviaApiClient(CONFIG_WITHOUT_ECART);
        const result = await syncFulfillment(MINIMAL_INPUT, clientNoEcart, CONFIG_WITHOUT_ECART);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('ENVIA_ECART_HOSTNAME');
    });

    it('should POST to tmp-fulfillment endpoint with correct shop_id and order_identifier', async () => {
        await syncFulfillment(MINIMAL_INPUT, client, CONFIG_WITH_ECART);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(`/tmp-fulfillment/${MINIMAL_INPUT.shopId}/${MINIMAL_INPUT.orderIdentifier}`);
    });

    it('should include tracking number in the fulfillment payload', async () => {
        await syncFulfillment(MINIMAL_INPUT, client, CONFIG_WITH_ECART);

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.fulfillment.tracking.number).toBe(MINIMAL_INPUT.trackingNumber);
    });

    it('should include ecartAPI fulfillment URL in the payload', async () => {
        await syncFulfillment(MINIMAL_INPUT, client, CONFIG_WITH_ECART);

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.url).toBe(
            `${CONFIG_WITH_ECART.ecartApiBase}/api/v2/orders/${MINIMAL_INPUT.orderIdentifier}/fulfillments`,
        );
    });

    it('should return ok:true on successful sync', async () => {
        const result = await syncFulfillment(MINIMAL_INPUT, client, CONFIG_WITH_ECART);

        expect(result.ok).toBe(true);
    });

    it('should return ok:false when queries service returns an error status', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Internal error' }),
        });

        const result = await syncFulfillment(MINIMAL_INPUT, client, CONFIG_WITH_ECART);

        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should generate a tracking URL when trackUrl is not provided', async () => {
        const inputWithoutUrl = { ...MINIMAL_INPUT, trackUrl: undefined };
        await syncFulfillment(inputWithoutUrl, client, CONFIG_WITH_ECART);

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.fulfillment.tracking.url).toContain(MINIMAL_INPUT.trackingNumber);
    });

    it('should return ok:false on fetch network error without throwing', async () => {
        mockFetch.mockRejectedValue(new Error('Network failure'));

        const result = await syncFulfillment(MINIMAL_INPUT, client, CONFIG_WITH_ECART);

        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
    });
});
