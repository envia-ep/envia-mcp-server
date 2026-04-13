/**
 * Tests for the DCe authorization service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_CONFIG } from '../helpers/fixtures.js';
import { EnviaApiClient } from '../../src/utils/api-client.js';
import {
    stripNonDigits,
    detectDocumentType,
    buildDcePayload,
    authorizeDce,
    buildXmlDataFromResponse,
} from '../../src/services/dce.js';
import type { GenerateAddress, PackageItem } from '../../src/types/carriers-api.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeBrAddress(overrides: Partial<GenerateAddress> = {}): GenerateAddress {
    return {
        name: 'João Silva',
        street: 'Rua Augusta',
        number: '100',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR',
        postalCode: '01310-100',
        phone: '+5511999990000',
        district: 'Consolação',
        identificationNumber: '123.456.789-09',
        ...overrides,
    };
}

function makeBrItem(overrides: Partial<PackageItem> = {}): PackageItem {
    return {
        description: 'Smart TV AIWA 32',
        quantity: 1,
        price: 150,
        productCode: '8528.72.00',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// stripNonDigits
// ---------------------------------------------------------------------------

describe('stripNonDigits', () => {
    it('should remove dots, dashes, and slashes from CPF', () => {
        expect(stripNonDigits('123.456.789-09')).toBe('12345678909');
    });

    it('should remove formatting from CNPJ', () => {
        expect(stripNonDigits('40.728.044/0001-57')).toBe('40728044000157');
    });

    it('should return digits unchanged when already clean', () => {
        expect(stripNonDigits('12345678909')).toBe('12345678909');
    });

    it('should return empty string for empty input', () => {
        expect(stripNonDigits('')).toBe('');
    });
});

// ---------------------------------------------------------------------------
// detectDocumentType
// ---------------------------------------------------------------------------

describe('detectDocumentType', () => {
    it('should return CPF for 11 digits', () => {
        expect(detectDocumentType('12345678909')).toBe('CPF');
    });

    it('should return CNPJ for 14 digits', () => {
        expect(detectDocumentType('40728044000157')).toBe('CNPJ');
    });

    it('should return null for other lengths', () => {
        expect(detectDocumentType('12345')).toBeNull();
        expect(detectDocumentType('')).toBeNull();
        expect(detectDocumentType('1234567890123456')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// buildDcePayload
// ---------------------------------------------------------------------------

describe('buildDcePayload', () => {
    it('should map origin address to emit with CPF', () => {
        const origin = makeBrAddress({ identificationNumber: '123.456.789-09' });
        const dest = makeBrAddress({ identificationNumber: '40.728.044/0001-57', name: 'Maria Santos' });
        const items = [makeBrItem()];

        const result = buildDcePayload(origin, dest, items, 'correios');

        expect(result.emit.CPF).toBe('12345678909');
        expect(result.emit.CNPJ).toBeUndefined();
        expect(result.emit.xNome).toBe('João Silva');
        expect(result.emit.endereco.logradouro).toBe('Rua Augusta');
        expect(result.emit.endereco.numero).toBe('100');
        expect(result.emit.endereco.bairro).toBe('Consolação');
        expect(result.emit.endereco.municipio).toBe('São Paulo');
        expect(result.emit.endereco.uf).toBe('SP');
        expect(result.emit.endereco.cep).toBe('01310100');
    });

    it('should map destination address to dest with CNPJ', () => {
        const origin = makeBrAddress();
        const dest = makeBrAddress({ identificationNumber: '40.728.044/0001-57', name: 'Empresa XYZ' });
        const items = [makeBrItem()];

        const result = buildDcePayload(origin, dest, items, 'correios');

        expect(result.dest.CNPJ).toBe('40728044000157');
        expect(result.dest.CPF).toBeUndefined();
        expect(result.dest.xNome).toBe('Empresa XYZ');
    });

    it('should set ide.uf from origin state', () => {
        const origin = makeBrAddress({ state: 'RJ' });
        const dest = makeBrAddress();

        const result = buildDcePayload(origin, dest, [makeBrItem()], 'jadlog');

        expect(result.ide.uf).toBe('RJ');
    });

    it('should map items to produtos format', () => {
        const items: PackageItem[] = [
            { description: 'TV LED', quantity: 2, price: 500.5, productCode: '8528.72.00' },
            { description: 'Cable', quantity: 3, price: 10, productCode: '8544.42.00' },
        ];

        const result = buildDcePayload(makeBrAddress(), makeBrAddress(), items, 'correios');

        expect(result.produtos).toHaveLength(2);
        expect(result.produtos[0]).toEqual({
            xProd: 'TV LED',
            NCM: '85287200',
            qCom: '2',
            vUnCom: '500.50',
            vProd: '1001.00',
        });
        expect(result.produtos[1]).toEqual({
            xProd: 'Cable',
            NCM: '85444200',
            qCom: '3',
            vUnCom: '10.00',
            vProd: '30.00',
        });
    });

    it('should strip dots from NCM productCode', () => {
        const items = [makeBrItem({ productCode: '8528.72.00' })];

        const result = buildDcePayload(makeBrAddress(), makeBrAddress(), items, 'correios');

        expect(result.produtos[0].NCM).toBe('85287200');
    });

    it('should set transp.carrierName', () => {
        const result = buildDcePayload(makeBrAddress(), makeBrAddress(), [makeBrItem()], 'jadlog');

        expect(result.transp.carrierName).toBe('jadlog');
    });

    it('should default bairro to N/A when district is missing', () => {
        const origin = makeBrAddress({ district: undefined });

        const result = buildDcePayload(origin, makeBrAddress(), [makeBrItem()], 'correios');

        expect(result.emit.endereco.bairro).toBe('N/A');
    });

    it('should default description to Merchandise when item description is missing', () => {
        const items = [makeBrItem({ description: undefined })];

        const result = buildDcePayload(makeBrAddress(), makeBrAddress(), items, 'correios');

        expect(result.produtos[0].xProd).toBe('Merchandise');
    });

    it('should include telefone when phone is provided', () => {
        const origin = makeBrAddress({ phone: '+5511999990000' });

        const result = buildDcePayload(origin, makeBrAddress(), [makeBrItem()], 'correios');

        expect(result.emit.endereco.telefone).toBe('+5511999990000');
    });
});

// ---------------------------------------------------------------------------
// authorizeDce
// ---------------------------------------------------------------------------

describe('authorizeDce', () => {
    let client: EnviaApiClient;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        client = new EnviaApiClient(MOCK_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return success response when SEFAZ authorizes', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                success: true,
                cStat: '100',
                xMotivo: 'Autorizado o uso da DC-e',
                documentType: 'dce',
                dceNumber: '8330',
                dceSerie: '1',
                dceDate: '2026-04-10T03:10:44-03:00',
                dceKey: '35260440728044000157990010000083301102065683',
                dceValue: '150.00',
                nProt: '135260000012345',
                xml: '<DCe>...</DCe>',
            }),
        });

        const payload = buildDcePayload(makeBrAddress(), makeBrAddress(), [makeBrItem()], 'correios');
        const result = await authorizeDce(payload, client, MOCK_CONFIG);

        expect(result.success).toBe(true);
        expect(result.dceKey).toBe('35260440728044000157990010000083301102065683');
        expect(result.dceNumber).toBe('8330');
    });

    it('should call the correct URL', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
        });

        const payload = buildDcePayload(makeBrAddress(), makeBrAddress(), [makeBrItem()], 'correios');
        await authorizeDce(payload, client, MOCK_CONFIG);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('https://queries-test.envia.com/dce/autorizar');
    });

    it('should return failure when API returns error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ message: 'Bad request' }),
        });

        const payload = buildDcePayload(makeBrAddress(), makeBrAddress(), [makeBrItem()], 'correios');
        const result = await authorizeDce(payload, client, MOCK_CONFIG);

        expect(result.success).toBe(false);
        expect(result.xMotivo).toBeDefined();
    });

    it('should return failure when SEFAZ rejects', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                success: false,
                cStat: '215',
                xMotivo: 'Rejeição: Chave de Acesso inválida',
            }),
        });

        const payload = buildDcePayload(makeBrAddress(), makeBrAddress(), [makeBrItem()], 'correios');
        const result = await authorizeDce(payload, client, MOCK_CONFIG);

        expect(result.success).toBe(false);
        expect(result.cStat).toBe('215');
    });
});

// ---------------------------------------------------------------------------
// buildXmlDataFromResponse
// ---------------------------------------------------------------------------

describe('buildXmlDataFromResponse', () => {
    it('should extract xmlData entry from successful response', () => {
        const response = {
            success: true,
            documentType: 'dce',
            dceNumber: '8330',
            dceSerie: '1',
            dceDate: '2026-04-10T03:10:44-03:00',
            dceKey: '35260440728044000157990010000083301102065683',
            dceValue: '150.00',
        };

        const result = buildXmlDataFromResponse(response);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            documentType: 'dce',
            dceNumber: '8330',
            dceSerie: '1',
            dceDate: '2026-04-10T03:10:44-03:00',
            dceKey: '35260440728044000157990010000083301102065683',
            dceValue: '150.00',
        });
    });

    it('should default documentType to dce when missing', () => {
        const response = { success: true, dceNumber: '100' };

        const result = buildXmlDataFromResponse(response);

        expect(result[0].documentType).toBe('dce');
    });
});
