/**
 * Analytics Types — Fase 7
 *
 * Response interfaces for the analytics and reporting API endpoints
 * served by the Queries service (/analytics/*, /reports/dashboard/*).
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** A month entry used in monthly analytics responses. */
export interface MonthEntry {
    year: number;
    month: number;
}

// ---------------------------------------------------------------------------
// Monthly Analytics — GET /analytics/get-monthly-analytics-data
// ---------------------------------------------------------------------------

/** Per-carrier data in the monthly analytics bar chart. */
export interface MonthlyAnalyticsCarrier {
    name: string;
    color: string;
    /** Shipment counts per month, aligned with monthsList. */
    dataShipments: number[];
    /** Revenue totals per month, aligned with monthsList. */
    dataTotal: number[];
    shipmentCountCarrier: number;
    shipmentSumCarrier: number;
}

/** Response from GET /analytics/get-monthly-analytics-data. */
export interface MonthlyAnalyticsResponse {
    barData: MonthlyAnalyticsCarrier[];
    shipmentCount: number;
    shipmentSum: number;
    monthsList: MonthEntry[];
}

// ---------------------------------------------------------------------------
// Carriers Stats — GET /analytics/carriers-stats
// ---------------------------------------------------------------------------

/** A carrier or service ranked by volume. */
export interface CarrierStatEntry {
    primaryName: string;
    image: string;
    value: number;
    percentage: number;
}

/** A service ranked by average delivery time. */
export interface DeliveryTimeEntry {
    primaryName: string;
    image: string;
    deliveredCount: number;
    deliveryDaysSum2: number;
    deliveryDaysSum: number;
    value: number;
    percentage: number;
}

/** A geographic origin or destination ranked by volume. */
export interface LocationStatEntry {
    primaryName: string;
    value: number;
    primaryCode: string;
    postalCode: string;
    percentage: number;
    isCountry: boolean;
    secondaryCode?: string;
    secondaryName?: string;
}

/** A weight range ranked by volume. */
export interface WeightStatEntry {
    primaryName: string;
    rangeWeight: string;
    value: number;
    categoryWeight: string;
    orderCategory: number;
    percentage: number;
}

/** Response from GET /analytics/carriers-stats. */
export interface CarriersStatsResponse {
    sortDataCarrierStats: CarrierStatEntry[];
    sortDataServiceStats: CarrierStatEntry[];
    sortAvgDeliveryTimeByServiceStats: DeliveryTimeEntry[];
    sortOriginPackagesStats: LocationStatEntry[];
    sortDestinationPackagesStats: LocationStatEntry[];
    sortWeightPackagesStats: WeightStatEntry[];
}

// ---------------------------------------------------------------------------
// Packages Module — GET /analytics/packages-module
// ---------------------------------------------------------------------------

/** Performance metrics for a carrier service. */
export interface CarrierServicePerformance {
    name: string;
    shippedCount: number;
    inTransitCount: number;
    outForDeliveryCount: number;
    deliveryCount: number;
    deliverySecondSum: number;
    returnOriginCount: number;
    issuesCount: number;
    total: number;
    pendingCount: number;
    deliveredVsShippedPercentage: number;
    deliveredTimeAvg: number;
    totalAvg: number;
    returnOriginPercentage: number;
    issuePercentage: number;
}

/** Per-carrier performance including breakdown by service. */
export interface CarrierPerformance extends CarrierServicePerformance {
    image: string;
    services: CarrierServicePerformance[];
}

/** Response from GET /analytics/packages-module. */
export interface PackagesModuleResponse {
    data: CarrierPerformance[];
    pendingTotal: number;
    shippedTotal: number;
    inTransitTotal: number;
    outForDeliveryTotal: number;
    deliveryTotal: number;
    deliveredVsShippedAvgTotal: number;
    deliveredTimeAvgTotal: number;
    priceTotal: number;
    priceAvgTotal: number;
    returnedTotal: number;
    returnedPercentageTotal: number;
    issuesTotal: number;
    issuesPercentageTotal: number;
}

// ---------------------------------------------------------------------------
// Issues Module — GET /analytics/issues-module
// ---------------------------------------------------------------------------

/** An issue type ranked by frequency. */
export interface IssueTypeEntry {
    primaryName: string;
    translation_tag: string;
    value: number;
    percentage: number;
}

/** Per-carrier monthly issue counts, aligned with monthsList. */
export interface CarrierMonthlyIssue {
    name: string;
    color: string;
    dataShipments: number[];
}

/** Monthly issue rate as a percentage of shipped. */
export interface IssueRateEntry {
    issueRatePercentage: number;
}

/** Response from GET /analytics/issues-module. */
export interface IssuesModuleResponse {
    monthsList: MonthEntry[];
    sortDataByIssues: IssueTypeEntry[];
    sortDataReturnedCarrierStats: CarrierStatEntry[];
    barDataCarrierMonthlyIssues: CarrierMonthlyIssue[];
    barDataIssueVsShipped: IssueRateEntry[];
    barDataCarrierMonthlyReturnedToOrigin: CarrierMonthlyIssue[];
    barDataReturnedToOriginVsShipped: IssueRateEntry[];
}

// ---------------------------------------------------------------------------
// Guides Per Status — GET /reports/dashboard/guides-per-status/{start}/{end}
// ---------------------------------------------------------------------------

/** Shipment count for a given status. */
export interface StatusCount {
    id: number;
    status: string;
    total: number;
    color: string;
}

/** Response from GET /reports/dashboard/guides-per-status/{start}/{end}. */
export interface GuidesPerStatusResponse {
    data: StatusCount[];
}
