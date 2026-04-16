/**
 * Branches Types — Fase 5
 *
 * Response interfaces for the branch/pickup-point API endpoints
 * served by the Queries service (/branches/*, /branches-bulk/*).
 *
 * NOTE: All branch endpoints return a RAW JSON ARRAY, not a wrapped
 * { data: [...] } object. The `ApiResponse.data` field will be the array itself.
 */

// ---------------------------------------------------------------------------
// Branch Address
// ---------------------------------------------------------------------------

/** Address block embedded in a BranchRecord. */
export interface BranchAddress {
    city: string | null;
    state: string | null;
    number: string | null;
    street: string | null;
    country: string;
    /** Whether the branch supports delivery. */
    delivery: boolean;
    /** GPS latitude as a string (e.g. "25.674113"). */
    latitude: string | null;
    locality: string | null;
    /** Whether the branch accepts shipment admission/pickup. */
    admission: boolean;
    /** GPS longitude as a string (e.g. "-100.319496"). */
    longitude: string | null;
    postalCode: string | null;
}

// ---------------------------------------------------------------------------
// Branch Record
// ---------------------------------------------------------------------------

/** A single pickup/dropoff branch returned by the branches API. */
export interface BranchRecord {
    /** Distance from the search point in kilometres. */
    distance: number | null;
    /** Carrier's internal branch identifier (e.g. "YMU"). */
    branch_id: string;
    /** Branch code used when creating a shipment (e.g. "MTY"). */
    branch_code: string;
    /** Branch type: 1=pickup, 2=dropoff. */
    branch_type: number;
    /** Human-readable name (e.g. "MTY - ALAMEDA"). */
    reference: string;
    /**
     * JSON string with package weight/dimension limits.
     * Null when the carrier has no branch-level package rules.
     */
    branch_rules: string | null;
    address: BranchAddress;
    /** Operating hours — often empty even when the branch is open. */
    hours: unknown[];
    /**
     * GPS latitude duplicated at root level (only present in bulk endpoint).
     * Use address.latitude when this field is absent.
     */
    latitude?: string | null;
    /**
     * GPS longitude duplicated at root level (only present in bulk endpoint).
     * Use address.longitude when this field is absent.
     */
    longitude?: string | null;
}

// ---------------------------------------------------------------------------
// Branch Catalog
// ---------------------------------------------------------------------------

/** Hierarchical state → locality catalog for a carrier's branches. */
export interface BranchCatalog {
    /** Alphabetically sorted list of state names. */
    states: string[];
    /** Map from state name to sorted list of locality names. */
    localities: Record<string, string[]>;
}
