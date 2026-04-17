/**
 * Envia MCP Server — Carrier Error Mapper
 *
 * Maps backend carrier error codes to agent-actionable messages. Instead of
 * raw HTTP errors, the agent receives structured guidance on what went wrong
 * and what to try next.
 *
 * Two mapping layers:
 *   1. Numeric code lookup (ERROR_MAP) — carrier-agnostic codes from the
 *      catalog_carrier_errors table, cross-verified against V1+V2 plan docs.
 *   2. Message pattern matching (CARRIER_PATTERNS) — catches carrier-specific
 *      errors that share generic codes but have distinct text signatures
 *      (e.g. DHL's 45-char street limit, UPS COD caps, Estafeta domestic-only).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MappedCarrierError {
    userMessage: string;
    suggestion: string;
    retryable: boolean;
}

// ---------------------------------------------------------------------------
// Numeric error code map (carrier-agnostic, from catalog_carrier_errors)
// ---------------------------------------------------------------------------

const ERROR_MAP: ReadonlyMap<number, MappedCarrierError> = new Map([
    [1101, {
        userMessage: 'Resource not found or shipment too old (>60 days)',
        suggestion: 'Verify the tracking number or shipment ID is correct and recent.',
        retryable: false,
    }],
    [1105, {
        userMessage: 'Package weight or dimensions exceed carrier limits',
        suggestion: 'Reduce package weight or dimensions, or try a different carrier.',
        retryable: false,
    }],
    [1115, {
        userMessage: 'Shipment not found or cannot be canceled in current status',
        suggestion: 'Check the current shipment status before attempting this operation.',
        retryable: false,
    }],
    [1116, {
        userMessage: 'Shipment does not belong to your company',
        suggestion: 'This tracking number is not associated with your account. Verify the tracking number or check if you are using the correct company credentials.',
        retryable: false,
    }],
    [1125, {
        userMessage: 'Requested service is not available for this route',
        suggestion: 'Use envia_list_carriers to find available carriers and services for this route.',
        retryable: false,
    }],
    [1127, {
        userMessage: 'Field value exceeds maximum length or branch code is required',
        suggestion: 'Shorten the field value or provide the required branch code for drop-off services.',
        retryable: false,
    }],
    [1129, {
        userMessage: 'Required fields are missing for this shipment type',
        suggestion: 'Add the missing fields: identification number for BR/CO, items array for international shipments.',
        retryable: false,
    }],
    [1140, {
        userMessage: 'Pricing plan not found for this carrier and route',
        suggestion: 'Contact Envia support to verify your account pricing configuration.',
        retryable: false,
    }],
    [1145, {
        userMessage: 'This carrier does not support international shipments',
        suggestion: 'Use an international-capable carrier (FedEx, DHL, UPS) for this route.',
        retryable: false,
    }],
    [1147, {
        userMessage: 'Carrier does not support the requested operation',
        suggestion: 'Not all carriers support every action (complement, bill of lading, etc.). Check carrier capabilities before retrying.',
        retryable: false,
    }],
    [1149, {
        userMessage: 'Address cannot be validated',
        suggestion: 'Verify city, state and country match a supported combination. For Colombia, use the DANE code for city.',
        retryable: false,
    }],
    [1220, {
        userMessage: 'Invalid format for identification number or postal code',
        suggestion: 'Check format: CPF=11 digits, CNPJ=14 digits, NIT=7-10 digits. Postal codes must match the country format.',
        retryable: false,
    }],
    [1282, {
        userMessage: 'Selected pickup branch does not support Cash on Delivery',
        suggestion: 'Choose a different branch that supports COD, or remove the COD additional service.',
        retryable: false,
    }],
    [1300, {
        userMessage: 'Coverage not available for this route',
        suggestion: 'This carrier does not serve the origin/destination combination. Use envia_list_carriers to find alternatives.',
        retryable: false,
    }],
    [900, {
        userMessage: 'Invalid action for this carrier',
        suggestion: 'The carrier does not support this operation. Common case: complement only for Mexico SAT-compliant carriers.',
        retryable: false,
    }],
]);

// ---------------------------------------------------------------------------
// Carrier-specific message patterns
//
// Applied only when the numeric code is NOT in ERROR_MAP above. These patterns
// catch carrier-specific quirks that would otherwise fall through to a generic
// "unexpected error" message.
// ---------------------------------------------------------------------------

interface CarrierPattern {
    /** Case-insensitive regex applied to the raw error message. */
    pattern: RegExp;
    error: MappedCarrierError;
}

const CARRIER_PATTERNS: ReadonlyArray<CarrierPattern> = [
    // DHL: street length limit
    {
        pattern: /street.{0,30}(45|max|exceeds|too long)/i,
        error: {
            userMessage: 'DHL requires street address to be 45 characters or fewer',
            suggestion: 'Shorten the street field to 45 characters maximum. Move extra details to the references field.',
            retryable: false,
        },
    },
    // FedEx US: residential flag required
    {
        pattern: /(fedex.{0,20}residential|residential.{0,20}required)/i,
        error: {
            userMessage: 'FedEx requires residential flag for US domestic deliveries',
            suggestion: 'For deliveries to US residential addresses, set fedex_residential=true when creating the label.',
            retryable: false,
        },
    },
    // UPS COD caps
    {
        pattern: /(cod|cash on delivery).{0,40}(max|limit|exceed|5,?000|50,?000)/i,
        error: {
            userMessage: 'COD amount exceeds carrier limit',
            suggestion: 'UPS Mexico caps COD at USD 5,000 (domestic) and USD 50,000 (international). Reduce the COD amount or split the shipment.',
            retryable: false,
        },
    },
    // Estafeta: no international
    {
        pattern: /estafeta.{0,40}(international|intl|internacional)/i,
        error: {
            userMessage: 'Estafeta does not support international shipments',
            suggestion: 'Use FedEx, DHL, or UPS for international routes.',
            retryable: false,
        },
    },
    // Estafeta / Coordinadora / Correios: no pallet
    {
        pattern: /(estafeta|coordinadora|correios).{0,30}(pallet|pallets|LTL)/i,
        error: {
            userMessage: 'This carrier does not support pallet/LTL shipments',
            suggestion: 'For pallet shipments, use FedEx Freight, UPS Freight, Paquetexpress LTL, or Fletes Mexico.',
            retryable: false,
        },
    },
    // Correios: minimum declared value
    {
        pattern: /(correios|brazil).{0,40}(declared value|valor declarado|minimum|25)/i,
        error: {
            userMessage: 'Correios requires a minimum declared value',
            suggestion: 'Brazilian shipments via Correios must have a declared_value of at least BRL 25.63.',
            retryable: false,
        },
    },
    // ES intl non-EU: identification required
    {
        pattern: /(identification|identificacion|nif|nie|dni).{0,40}(required|obligatorio|missing)/i,
        error: {
            userMessage: 'Identification number is required for this route',
            suggestion: 'For Brazil (CPF/CNPJ), Colombia (NIT), or Spain-to-non-EU (DNI/NIE/NIF), include the identification_number in origin and destination addresses.',
            retryable: false,
        },
    },
    // Colombia: DANE code expected
    {
        pattern: /(dane|colombia).{0,40}(code|city|invalid)/i,
        error: {
            userMessage: 'Colombian addresses require a DANE code for city',
            suggestion: 'Use the 5-8 digit DANE code as the city value. Common codes: Bogota=11001, Medellin=05001, Cali=76001.',
            retryable: false,
        },
    },
    // AmPm: no-coverage error codes 260 / 102154
    {
        pattern: /ampm.{0,100}(260|102154)|(260|102154).{0,60}ampm/i,
        error: {
            userMessage: 'AmPm no tiene cobertura para esta ruta. Prueba otra paquetería o valida origen/destino.',
            suggestion: 'Use envia_list_carriers to find carriers that cover this origin/destination combination, or verify the postal codes.',
            retryable: false,
        },
    },
    // Entrega: per-company tracking limit exceeded
    {
        pattern: /entrega.{0,80}(track|rastreo).{0,60}(l[ií]mit|l[ií]mite|exceeded|superado)/i,
        error: {
            userMessage: 'Entrega alcanzó el límite de rastreos contratados para tu cuenta. Contacta soporte para ampliarlo.',
            suggestion: 'Contact Envia support to increase the tracking query limit for your Entrega account.',
            retryable: false,
        },
    },
    // JTExpress: Brazil shipment missing ICMS calculation for state pair
    {
        pattern: /jtexpress.{0,100}(icms|estado|state.{0,10}pair)|(icms|estado.{0,10}par).{0,60}jtexpress/i,
        error: {
            userMessage: 'JTExpress Brasil requiere cálculo de ICMS para este par de estados. Verifica origen, destino y valor declarado.',
            suggestion: 'For JTExpress Brazil shipments, ensure origin/destination state pair is valid and declared_value is set correctly for ICMS calculation.',
            retryable: false,
        },
    },
    // TresGuerras: shipment already canceled (auto-detected via ESTADO_TALON flag)
    {
        pattern: /ESTADO_TALON=CANCELADO/,
        error: {
            userMessage: 'El envío ya fue cancelado en TresGuerras. No es necesario cancelarlo de nuevo.',
            suggestion: 'The shipment is already canceled in TresGuerras. No further action is required.',
            retryable: false,
        },
    },
    // Afimex: declared insurance value exceeds the 10,000 cap
    {
        pattern: /afimex.{0,100}(seguro|insurance).{0,60}(10[,.]?000|l[ií]mit|l[ií]mite|exceed|superado)|(10[,.]?000).{0,60}(seguro|insurance).{0,60}afimex/i,
        error: {
            userMessage: 'Afimex tiene un tope de seguro de $10,000. Reduce el valor asegurado o elige otra paquetería.',
            suggestion: 'Reduce the insurance/declared value to $10,000 or below, or choose a different carrier for higher-value shipments.',
            retryable: false,
        },
    },
];

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Map a numeric carrier error code to a structured, agent-friendly error with
 * a human-readable message, an actionable suggestion, and a retry hint.
 *
 * Lookup precedence:
 *   1. Exact match on numeric code (ERROR_MAP)
 *   2. Regex match on raw message (CARRIER_PATTERNS)
 *   3. Generic fallback (truncated message + retry hint for 5xx)
 *
 * @param code    - Numeric error code from the carrier API response
 * @param message - Raw error message returned by the backend
 * @returns Mapped error with guidance for the calling agent
 */
export function mapCarrierError(code: number, message: string): MappedCarrierError {
    const known = ERROR_MAP.get(code);
    if (known) {
        return known;
    }

    for (const candidate of CARRIER_PATTERNS) {
        if (candidate.pattern.test(message)) {
            return candidate.error;
        }
    }

    return {
        userMessage: message.slice(0, 200) || 'An unexpected error occurred.',
        suggestion: 'Check the request parameters and try again.',
        retryable: code >= 500,
    };
}
