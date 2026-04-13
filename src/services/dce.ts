/**
 * DCe Authorization Service
 *
 * Handles pre-authorization of Brazil's Declaracao de Conteudo Eletronica (DCe)
 * with SEFAZ via the Envia Queries API. Required for BR-to-BR shipments before
 * label generation.
 *
 * Flow: build payload from MCP addresses/items -> POST /dce/autorizar -> extract xmlData
 */

import type { EnviaApiClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import type { GenerateAddress, PackageItem, XmlDataEntry } from '../types/carriers-api.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Address section for the DCe authorization payload (emit / dest). */
interface DcePartyAddress {
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    telefone?: string;
}

/** Sender or recipient party in the DCe payload. */
interface DceParty {
    CPF?: string;
    CNPJ?: string;
    xNome: string;
    endereco: DcePartyAddress;
}

/** Product entry for the DCe authorization payload. */
interface DceProduto {
    xProd: string;
    NCM: string;
    qCom: string;
    vUnCom: string;
    vProd: string;
}

/** Full payload for POST /dce/autorizar. */
export interface DceAuthorizationPayload {
    ide: { uf: string };
    emit: DceParty;
    dest: DceParty;
    produtos: DceProduto[];
    transp: { carrierName: string };
}

/** Successful response from POST /dce/autorizar. */
export interface DceAuthorizationResponse {
    success: boolean;
    cStat?: string;
    xMotivo?: string;
    documentType?: string;
    dceNumber?: string;
    dceSerie?: string;
    dceDate?: string;
    dceKey?: string;
    dceValue?: string;
    nProt?: string;
    dhRecbto?: string;
    xml?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip non-digit characters from an identification number.
 *
 * @param raw - Raw CPF/CNPJ string (may contain dots, dashes, slashes)
 * @returns Digits-only string
 */
export function stripNonDigits(raw: string): string {
    return raw.replace(/\D/g, '');
}

/**
 * Determine whether an identification number is a CPF or CNPJ based on digit count.
 *
 * @param digits - Digits-only identification string
 * @returns 'CPF' for 11 digits, 'CNPJ' for 14 digits, null otherwise
 */
export function detectDocumentType(digits: string): 'CPF' | 'CNPJ' | null {
    if (digits.length === 11) return 'CPF';
    if (digits.length === 14) return 'CNPJ';
    return null;
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

/**
 * Build the DCe authorization payload from MCP generate addresses, items, and carrier.
 *
 * Maps the Envia MCP address/item structures to the format expected by the
 * queries service `POST /dce/autorizar` endpoint.
 *
 * @param origin - Sender address (must include identificationNumber)
 * @param destination - Recipient address (must include identificationNumber)
 * @param items - Package items (each must include productCode as NCM)
 * @param carrierName - Carrier slug (e.g. "correios", "jadlog")
 * @returns Typed payload ready for the DCe authorization API
 */
export function buildDcePayload(
    origin: GenerateAddress,
    destination: GenerateAddress,
    items: PackageItem[],
    carrierName: string,
): DceAuthorizationPayload {
    return {
        ide: { uf: origin.state },
        emit: buildDceParty(origin),
        dest: buildDceParty(destination),
        produtos: items.map(mapItemToProduto),
        transp: { carrierName },
    };
}

/**
 * Build a DCe party (emit or dest) from a generate address.
 *
 * @param addr - Generate address with identificationNumber
 * @returns DCe party object with CPF or CNPJ set appropriately
 */
function buildDceParty(addr: GenerateAddress): DceParty {
    const digits = stripNonDigits(addr.identificationNumber ?? '');
    const docType = detectDocumentType(digits);

    const party: DceParty = {
        xNome: addr.name,
        endereco: {
            logradouro: addr.street,
            numero: addr.number || '',
            bairro: addr.district || 'N/A',
            municipio: addr.city,
            uf: addr.state,
            cep: stripNonDigits(addr.postalCode),
        },
    };

    if (addr.phone) party.endereco.telefone = addr.phone;

    if (docType === 'CPF') {
        party.CPF = digits;
    } else if (docType === 'CNPJ') {
        party.CNPJ = digits;
    }

    return party;
}

/**
 * Map a PackageItem to the DCe produto format.
 *
 * @param item - Package item with productCode (NCM)
 * @returns DCe produto entry
 */
function mapItemToProduto(item: PackageItem): DceProduto {
    const quantity = item.quantity ?? 1;
    const unitPrice = item.price ?? 0;

    return {
        xProd: item.description || 'Merchandise',
        NCM: (item.productCode || '').replace(/\./g, ''),
        qCom: String(quantity),
        vUnCom: unitPrice.toFixed(2),
        vProd: (quantity * unitPrice).toFixed(2),
    };
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

/**
 * Call the DCe authorization endpoint to obtain SEFAZ approval.
 *
 * @param payload - DCe authorization payload built by {@link buildDcePayload}
 * @param client - Envia API client (authenticated)
 * @param config - Server configuration with queriesBase URL
 * @returns DCe authorization response with success status and document metadata
 */
export async function authorizeDce(
    payload: DceAuthorizationPayload,
    client: EnviaApiClient,
    config: EnviaConfig,
): Promise<DceAuthorizationResponse> {
    const url = `${config.queriesBase}/dce/autorizar`;
    const res = await client.post<DceAuthorizationResponse>(url, payload as unknown as Record<string, unknown>);

    if (!res.ok) {
        return {
            success: false,
            xMotivo: res.error || 'DCe authorization request failed',
        };
    }

    return res.data;
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

/**
 * Extract an xmlData entry array from a successful DCe authorization response.
 *
 * The returned array is ready to be injected into `ShipmentPackage.xmlData`.
 *
 * @param response - Successful DCe authorization response
 * @returns Single-element array with the DCe document metadata
 */
export function buildXmlDataFromResponse(response: DceAuthorizationResponse): XmlDataEntry[] {
    return [
        {
            documentType: response.documentType || 'dce',
            dceNumber: response.dceNumber,
            dceSerie: response.dceSerie,
            dceDate: response.dceDate,
            dceKey: response.dceKey,
            dceValue: response.dceValue,
        },
    ];
}
