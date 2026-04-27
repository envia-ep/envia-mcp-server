/**
 * Tool: envia_get_shipment_invoices
 *
 * Lists shipping invoices for the authenticated company.
 * Filter by month, year, and invoice status. Returns invoice amounts,
 * PDF URLs, and shipment counts.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { queryShipmentsApi, formatCurrency } from '../../services/shipments.js';
import type { InvoiceListResponse } from '../../types/shipments.js';

/**
 * Register the envia_get_shipment_invoices tool on the MCP server.
 */
export function registerGetShipmentInvoices(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_shipment_invoices',
        {
            description:
                'List shipping invoices for your company. ' +
                'Filter by month, year, and invoice status (invoiced or not). ' +
                'Returns invoice totals, PDF download URLs, shipment counts, and billing details.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                month: z.number().int().min(1).max(12).optional().describe('Filter by month (1-12)'),
                year: z.number().int().min(2020).optional().describe('Filter by year (e.g. 2026)'),
                invoiced: z.number().int().min(0).max(1).optional().describe('Filter: 0=Not invoiced, 1=Invoiced'),
                limit: z.number().int().min(1).max(100).default(20).describe('Results per page (max 100)'),
                page: z.number().int().min(1).default(1).describe('Page number'),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const params: Record<string, unknown> = {
                limit: args.limit,
                page: args.page,
            };
            if (args.month !== undefined) params.month = args.month;
            if (args.year !== undefined) params.year = args.year;
            if (args.invoiced !== undefined) params.invoiced = args.invoiced;

            const res = await queryShipmentsApi<InvoiceListResponse>(
                activeClient, config, '/shipments/invoices', params,
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to list invoices: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const records = Array.isArray(res.data?.data) ? res.data.data : [];
            if (records.length === 0) {
                return textResponse('No invoices found matching the specified filters.');
            }

            // Backend uses DataTables-style fields (recordsTotal, recordsFiltered)
            // rather than the { data, total } convention. Read recordsTotal for the
            // absolute count, with recordsFiltered + records.length as fallbacks.
            const totalCount = res.data?.recordsTotal ?? res.data?.recordsFiltered ?? records.length;

            const lines: string[] = [
                `Found ${totalCount} invoice(s) (page ${args.page}):`,
                '',
            ];

            for (const inv of records) {
                const period = inv.month && inv.year ? `${inv.month}/${inv.year}` : '—';
                // Field is `total_shipments` on the live API. The deprecated
                // `shipments_amount` alias is kept only as a defensive fallback
                // for any older mock or fixture that might still surface.
                const shipmentsCount = inv.total_shipments ?? inv.shipments_amount ?? '—';
                lines.push(`• Invoice #${inv.invoice_id ?? inv.id} — ${period}`);
                lines.push(`  Total: ${formatCurrency(inv.total)}  |  Shipments: ${shipmentsCount}`);
                lines.push(`  Status: ${inv.status ?? '—'}  |  Invoiced by: ${inv.invoiced_by ?? '—'}`);
                if (inv.invoice_url) lines.push(`  PDF: ${inv.invoice_url}`);
                lines.push('');
            }

            lines.push('Use envia_list_shipments with date filters for shipment details within an invoice period.');

            return textResponse(lines.join('\n'));
        },
    );
}
