/**
 * Envia MCP Server — Carriers Advanced Types
 *
 * TypeScript interfaces for manifest, bill of lading, city lookup,
 * pickup management, ND reports, and SAT complement endpoints.
 */

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** Response from POST /ship/manifest */
export interface ManifestResponse {
    meta: string;
    data: {
        company: string;
        carriers: Record<string, string>;  // carrier name -> PDF URL
    };
}

// ---------------------------------------------------------------------------
// Bill of Lading
// ---------------------------------------------------------------------------

/** Address object used in bill of lading */
export interface BolAddress {
    name: string;
    street: string;
    number: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    district?: string;
    taxId?: string;
}

/** Single item inside a BOL package */
export interface BolItem {
    description: string;
    quantity: number;
    price: number;
}

/**
 * Package entry in a bill of lading.
 * NOTE: declaredValue is required by the PHP runtime (BOLPackage.php:25)
 * even though it does not appear in the API JSON schema.
 */
export interface BolPackage {
    amount: number;
    cost: number;
    declaredValue: number;
    currency: string;
    cubicMeters: number;
    totalWeight: number;
    items: BolItem[];
    observations?: string;
    insurance?: number;
}

/** Response from POST /ship/billoflading */
export interface BillOfLadingResponse {
    meta: string;
    data: {
        carrier: string;
        trackingNumber: string;
        billOfLading: string;  // PDF URL
    };
}

// ---------------------------------------------------------------------------
// Locate city (Colombia DANE codes)
// ---------------------------------------------------------------------------

/** Successful response from POST /locate */
export interface LocateCityResponse {
    city: string;   // DANE code e.g. "11001000"
    name: string;   // Canonical city name e.g. "BOGOTA"
    state: string;  // State code e.g. "DC"
}

/** Error envelope returned by /locate for unsupported countries or bad input */
export interface LocateErrorResponse {
    meta: 'error';
    error: {
        code: number;
        description: string;
        message: string;
    };
}

// ---------------------------------------------------------------------------
// Pickup cancel
// ---------------------------------------------------------------------------

/** Response from POST /ship/pickupcancel */
export interface PickupCancelResponse {
    meta?: string;
    data?: {
        carrier: string;
        confirmation: string;
    };
    error?: {
        code: number;
        description: string;
        message: string;
    };
}

// ---------------------------------------------------------------------------
// Track (authenticated)
// ---------------------------------------------------------------------------

/** Single tracking event from POST /ship/track */
export interface TrackEvent {
    description: string;
    location?: string;
    date?: string;
}

/** Single shipment entry in the authenticated track response */
export interface TrackEntry {
    trackingNumber: string;
    carrier: string;
    status: string;
    events?: TrackEvent[];
}

/** Response from POST /ship/track */
export interface TrackResponse {
    meta: string;
    data: TrackEntry[];
}

// ---------------------------------------------------------------------------
// ND report
// ---------------------------------------------------------------------------

/** Response from POST /ship/ndreport */
export interface NdReportResponse {
    meta?: string;
    data?: {
        carrier: string;
        trackingNumber: string;
        actionCode?: string;
    };
    error?: {
        code: number;
        description: string;
        message: string;
    };
}

// ---------------------------------------------------------------------------
// Pickup track
// ---------------------------------------------------------------------------

/** Response from POST /ship/pickuptrack */
export interface PickupTrackResponse {
    meta?: string;
    data?: unknown;
    error?: {
        code: number;
        description: string;
        message: string;
    };
}

// ---------------------------------------------------------------------------
// SAT Complement (Carta Porte)
// ---------------------------------------------------------------------------

/** Single BOL complement line item for SAT Carta Porte */
export interface BolComplementItem {
    productDescription: string | null;
    productCode: string | null;
    weightUnit: string | null;
    packagingType: string | null;
    quantity: number | null;
    unitPrice: number | null;
}

/**
 * A single complement entry for one shipment.
 * The API body is an ARRAY of these (not wrapped in an object).
 */
export interface ComplementEntry {
    shipmentId: number;
    bolComplement: BolComplementItem[];
}

/** Response from POST /ship/complement */
export interface ComplementResponse {
    meta?: string;
    data?: unknown;
    error?: {
        code: number;
        description: string;
        message: string;
    };
}
