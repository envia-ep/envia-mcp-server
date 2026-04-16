/**
 * Envia MCP Server — Analytics Service
 *
 * Provides query helpers and text formatters for the analytics API.
 * All endpoints are served by the Queries service (queriesBase).
 * Reuses buildQueryUrl from shipments.ts for query-param endpoints.
 * guides-per-status uses path params and builds the URL directly.
 */

import type { EnviaApiClient, ApiResponse } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { buildQueryUrl } from './shipments.js';
import { formatCurrency } from './shipments.js';
import type {
    MonthlyAnalyticsResponse,
    MonthlyAnalyticsCarrier,
    CarriersStatsResponse,
    CarrierStatEntry,
    DeliveryTimeEntry,
    LocationStatEntry,
    WeightStatEntry,
    PackagesModuleResponse,
    CarrierPerformance,
    IssuesModuleResponse,
    IssueTypeEntry,
    GuidesPerStatusResponse,
    StatusCount,
} from '../types/analytics.js';

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Execute a GET request against the analytics API with query parameters.
 */
export async function queryAnalyticsApi<T = unknown>(
    client: EnviaApiClient,
    config: EnviaConfig,
    path: string,
    params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
    const url = buildQueryUrl(config.queriesBase, path, params);
    return client.get<T>(url);
}

/**
 * Execute a GET request for guides-per-status using path parameters.
 * This endpoint does NOT accept query params — dates are embedded in the URL path.
 */
export async function queryGuidesPerStatus(
    client: EnviaApiClient,
    config: EnviaConfig,
    startDate: string,
    endDate: string,
): Promise<ApiResponse<GuidesPerStatusResponse>> {
    const url = `${config.queriesBase}/reports/dashboard/guides-per-status/${startDate}/${endDate}`;
    return client.get<GuidesPerStatusResponse>(url);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format a month entry as "Jan 2026" style label.
 */
export function formatMonthLabel(year: number, month: number): string {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fullYear = year < 100 ? 2000 + year : year;
    return `${MONTHS[month - 1] ?? month} ${fullYear}`;
}

/**
 * Format a monthly analytics carrier summary line.
 */
export function formatMonthlyCarrier(carrier: MonthlyAnalyticsCarrier, totalCount: number): string {
    const pct = totalCount > 0 ? ((carrier.shipmentCountCarrier / totalCount) * 100).toFixed(1) : '0.0';
    return (
        `  ${carrier.name.trim().padEnd(20)} ${carrier.shipmentCountCarrier} shipments` +
        `  ${formatCurrency(carrier.shipmentSumCarrier, 'MXN')}  (${pct}% of total)`
    );
}

/**
 * Format a monthly analytics response into readable text.
 */
export function formatMonthlyAnalytics(data: MonthlyAnalyticsResponse): string {
    if (!data.barData || data.barData.length === 0) {
        return 'No analytics data found for the specified date range.';
    }

    const lines: string[] = [
        `Monthly Analytics — ${data.shipmentCount} total shipments  ${formatCurrency(data.shipmentSum, 'MXN')}`,
        '',
        'Carrier breakdown:',
    ];

    for (const carrier of data.barData) {
        lines.push(formatMonthlyCarrier(carrier, data.shipmentCount));
    }

    return lines.join('\n');
}

/**
 * Format a CarrierStatEntry list section.
 */
export function formatStatSection(title: string, entries: CarrierStatEntry[], maxItems = 10): string {
    if (entries.length === 0) return `${title}: No data`;
    const top = entries.slice(0, maxItems);
    const rows = top.map((e) => `  ${e.primaryName.trim().padEnd(25)} ${e.value}  (${e.percentage.toFixed(1)}%)`);
    const extra = entries.length > maxItems ? `  ... and ${entries.length - maxItems} more` : '';
    return [title, ...rows, extra].filter(Boolean).join('\n');
}

/**
 * Format a DeliveryTimeEntry list section.
 */
export function formatDeliveryTimeSection(entries: DeliveryTimeEntry[], maxItems = 10): string {
    if (entries.length === 0) return 'Avg Delivery Time: No data';
    const top = entries.slice(0, maxItems);
    const rows = top.map((e) => `  ${e.primaryName.trim().padEnd(25)} ${e.value.toFixed(2)} days  (${e.percentage.toFixed(1)}%)`);
    return ['Avg Delivery Time by Service', ...rows].join('\n');
}

/**
 * Format a LocationStatEntry list section.
 */
export function formatLocationSection(title: string, entries: LocationStatEntry[], maxItems = 10): string {
    if (entries.length === 0) return `${title}: No data`;
    const countries = entries.filter((e) => e.isCountry).slice(0, maxItems);
    const rows = countries.map((e) => `  ${e.primaryName.padEnd(20)} ${e.value}  (${e.percentage.toFixed(1)}%)`);
    return [title, ...rows].join('\n');
}

/**
 * Format a WeightStatEntry list section.
 */
export function formatWeightSection(entries: WeightStatEntry[], maxItems = 10): string {
    if (entries.length === 0) return 'Weight Distribution: No data';
    const top = entries.slice(0, maxItems);
    const rows = top.map((e) => `  ${e.categoryWeight.padEnd(20)} ${e.value}  (${e.percentage.toFixed(1)}%)`);
    return ['Weight Distribution', ...rows].join('\n');
}

/**
 * Format the full carriers stats response.
 */
export function formatCarriersStats(data: CarriersStatsResponse): string {
    if (
        data.sortDataCarrierStats.length === 0 &&
        data.sortDataServiceStats.length === 0
    ) {
        return 'No carrier stats data found for the specified date range.';
    }

    return [
        formatStatSection('Top Carriers', data.sortDataCarrierStats),
        '',
        formatStatSection('Top Services', data.sortDataServiceStats),
        '',
        formatDeliveryTimeSection(data.sortAvgDeliveryTimeByServiceStats),
        '',
        formatLocationSection('Top Origins', data.sortOriginPackagesStats),
        '',
        formatLocationSection('Top Destinations', data.sortDestinationPackagesStats),
        '',
        formatWeightSection(data.sortWeightPackagesStats),
    ].join('\n');
}

/**
 * Format a single carrier performance row.
 */
export function formatCarrierPerformance(carrier: CarrierPerformance): string {
    return (
        `  ${carrier.name.trim().padEnd(20)} ` +
        `Shipped: ${carrier.shippedCount}  Delivered: ${carrier.deliveryCount}  ` +
        `Issues: ${carrier.issuesCount}  ` +
        `Delivery%: ${carrier.deliveredVsShippedPercentage.toFixed(1)}%  ` +
        `Issue%: ${carrier.issuePercentage.toFixed(1)}%  ` +
        `Avg: ${formatCurrency(carrier.totalAvg, 'MXN')}`
    );
}

/**
 * Format the full packages module response.
 */
export function formatPackagesModule(data: PackagesModuleResponse): string {
    if (!data.data || data.data.length === 0) {
        return 'No packages performance data found for the specified date range.';
    }

    const lines: string[] = [
        `Packages Performance — Total: ${data.shippedTotal} shipped  ${data.deliveryTotal} delivered  ${data.issuesTotal} issues`,
        `  Overall delivery rate: ${data.deliveredVsShippedAvgTotal.toFixed(1)}%  Issue rate: ${data.issuesPercentageTotal.toFixed(1)}%`,
        `  Total revenue: ${formatCurrency(data.priceTotal, 'MXN')}  Avg per shipment: ${formatCurrency(data.priceAvgTotal, 'MXN')}`,
        '',
        'Carrier breakdown:',
    ];

    for (const carrier of data.data) {
        lines.push(formatCarrierPerformance(carrier));
    }

    return lines.join('\n');
}

/**
 * Format an issue type entry.
 */
export function formatIssueType(entry: IssueTypeEntry): string {
    return `  ${entry.primaryName.padEnd(30)} ${entry.value}  (${entry.percentage.toFixed(1)}%)`;
}

/**
 * Format the full issues module response.
 */
export function formatIssuesModule(data: IssuesModuleResponse): string {
    if (data.sortDataByIssues.length === 0 && data.barDataCarrierMonthlyIssues.length === 0) {
        return 'No issues data found for the specified date range.';
    }

    const lines: string[] = ['Issues Analysis'];

    if (data.sortDataByIssues.length > 0) {
        lines.push('', 'Issues by type:');
        for (const entry of data.sortDataByIssues) {
            lines.push(formatIssueType(entry));
        }
    }

    if (data.barDataCarrierMonthlyIssues.length > 0) {
        lines.push('', 'Carriers with issues:');
        for (const carrier of data.barDataCarrierMonthlyIssues) {
            const total = carrier.dataShipments.reduce((s, v) => s + v, 0);
            lines.push(`  ${carrier.name.padEnd(20)} ${total} issues`);
        }
    }

    if (data.barDataIssueVsShipped.length > 0) {
        const rates = data.barDataIssueVsShipped
            .map((e) => `${e.issueRatePercentage.toFixed(1)}%`)
            .join(', ');
        lines.push('', `Monthly issue rates: ${rates}`);
    }

    return lines.join('\n');
}

/**
 * Format a single status count line.
 */
export function formatStatusCount(entry: StatusCount): string {
    return `  ${entry.status.padEnd(25)} ${entry.total.toLocaleString()}`;
}

/**
 * Format the guides-per-status response.
 */
export function formatGuidesPerStatus(data: GuidesPerStatusResponse): string {
    const active = (data.data ?? []).filter((e) => e.total > 0);
    if (active.length === 0) {
        return 'No shipments found for the specified date range.';
    }

    const sorted = [...active].sort((a, b) => b.total - a.total);
    const grandTotal = sorted.reduce((s, e) => s + e.total, 0);

    const lines: string[] = [
        `Shipments by Status — ${grandTotal.toLocaleString()} total`,
        '',
    ];

    for (const entry of sorted) {
        lines.push(formatStatusCount(entry));
    }

    return lines.join('\n');
}
