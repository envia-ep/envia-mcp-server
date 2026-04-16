/**
 * Envia MCP Server — Package Types
 *
 * TypeScript interfaces for saved-package API responses
 * from the Envia Queries service.
 */

/** A saved package record from GET /all-packages. */
export interface PackageRecord {
    id: number;
    name?: string;
    content?: string;
    package_type_id?: number;
    weight?: number;
    weight_unit?: string;
    height?: number;
    length?: number;
    width?: number;
    length_unit?: string;
    declared_value?: number;
    amount?: number;
    is_favorite?: number;
    is_default?: number;
}

/** Response shape for GET /all-packages. */
export interface PackageListResponse {
    data: PackageRecord[];
    total: number;
    emptyState: number;
}

/** Response shape for POST /packages. */
export interface CreatePackageResponse {
    id: number;
}

/** Response shape for PUT/DELETE operations. */
export interface PackageMutationResponse {
    data: boolean;
}
