/**
 * Tool: envia_get_carrier_constraints
 *
 * Returns the capabilities and constraints for a specific carrier: pickup
 * window, per-service weight limits, COD configuration, drop-off support,
 * additional (add-on) services available, and any company-level overrides
 * that apply to your account.
 *
 * Use this tool for capability discovery — to answer questions like "Does
 * FedEx support COD?", "What is the max weight for DHL Ground?", or "Which
 * add-on services can I add to UPS?". This is NOT a quoting tool; use
 * envia_quote_shipment for pricing.
 *
 * Note: if the backend returns "Endpoint not yet available", the carriers
 * service hasn't shipped ticket C11 yet. The tool will work automatically
 * once the backend deploys.
 *
 * Data source: GET ${shippingBase}/carrier-constraints/{carrier_id}
 * Spec: _docs/specs/CARRIER_CONSTRAINTS_ENDPOINT_SPEC.md (v2)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../utils/api-client.js';
import { resolveClient } from '../utils/api-client.js';
import type { EnviaConfig } from '../config.js';
import { requiredApiKeySchema } from '../utils/schemas.js';
import { textResponse } from '../utils/mcp-response.js';
import { fetchCarrierConstraints } from '../services/carrier-constraints.js';
import type {
    CarrierConstraintsResponse,
    ServiceConstraint,
    AdditionalServiceRef,
    CompanyOverride,
    CoverageSummary,
    ResponseMeta,
} from '../types/carrier-constraints.js';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format the carrier identity block (name, volumetric factor, pickup window,
 * and tracking URLs).
 *
 * D6: Both envia_track_url_template and carrier_track_url_template are rendered
 * with clear labels so the user can distinguish between the Envia tracking page
 * and the carrier's own tracking page.
 *
 * @param data - Full response data block
 * @returns Formatted markdown section
 */
function formatCarrierHeader(data: CarrierConstraintsResponse['data']): string {
    const { carrier, pickup, tracking } = data;
    const pickupLine = pickup.supported
        ? `${pickup.start_hour}:00–${pickup.end_hour}:00 (span ${pickup.span_minutes} min${pickup.same_day ? ', same-day' : ''})`
        : 'not supported';
    const pickupFee = pickup.fee > 0 ? ` — fee ${pickup.fee}` : ' — free';

    const volFactorId = carrier.volumetric_factor_id != null
        ? ` (catalog id: ${carrier.volumetric_factor_id})`
        : '';

    const lines: string[] = [
        `## ${carrier.display_name} (id: ${carrier.id})`,
        '',
        `Controller: ${carrier.controller}`,
        `Volumetric factor: ${carrier.volumetric_factor}${volFactorId}`,
        `Box weight: ${carrier.box_weight} kg  |  Pallet weight: ${carrier.pallet_weight} kg`,
        `MPS (multi-piece): ${carrier.allows_mps ? 'yes' : 'no'}`,
        `Async label creation: ${carrier.allows_async_create ? 'yes' : 'no'}`,
        '',
        `**Pickup:** ${pickupLine}${pickup.supported ? pickupFee : ''}`,
        `**Tracking pattern:** ${tracking.pattern ?? 'n/a'}  |  track limit: ${tracking.track_limit}`,
        `**Envia tracking:** ${tracking.envia_track_url_template}`,
        `**Carrier tracking:** ${tracking.carrier_track_url_template}`,
    ];

    return lines.join('\n');
}

/**
 * Format the company_override block as a short inline note.
 *
 * @param override - Company override object from the limits block
 * @returns Human-readable override summary or empty string
 */
function formatOverride(override: CompanyOverride): string {
    if (!override.applied) return '(no company override)';
    const min = override.min_weight_kg != null ? `min ${override.min_weight_kg} kg` : null;
    const max = override.max_weight_kg != null ? `max ${override.max_weight_kg} kg` : null;
    const slab = override.half_slab === true ? 'half-slab billing' : null;
    const parts = [min, max, slab].filter(Boolean);
    return `⚠ Company override: ${parts.join(', ')} [${override.source ?? 'company_service_restrictions'}]`;
}

/**
 * Format a single service entry into a compact table row.
 *
 * D4: `international_scope` is rendered instead of just the boolean.
 * Example: "International: import (code 2)" instead of "International: yes".
 *
 * @param svc - Service constraint object
 * @returns Formatted table row string
 */
function formatServiceRow(svc: ServiceConstraint): string {
    const cod = svc.cash_on_delivery.enabled
        ? `COD ✓ (min ${svc.cash_on_delivery.minimum_amount ?? '—'}, ${svc.cash_on_delivery.commission_percentage ?? '—'}%)`
        : 'COD ✗';
    const dropOff = svc.options.drop_off ? 'drop-off ✓' : 'drop-off ✗';
    // D4: render scope label + code for clarity, e.g. "International: import (code 2)"
    const intlLabel = `International: ${svc.international_scope} (code ${svc.international_code})`;
    const override = formatOverride(svc.limits.company_override);

    return [
        `### ${svc.name} (id: ${svc.id}, ${svc.service_code})`,
        `${intlLabel}  |  ${svc.delivery_estimate ?? 'ETA unknown'}`,
        `Weight: ${svc.limits.min_weight_kg ?? 0}–${svc.limits.max_weight_kg} kg  |  vol. factor: ${svc.limits.volumetric_factor}  |  pallets: ${svc.limits.limit_pallets}`,
        `${cod}  |  ${dropOff}`,
        `Operational: cutoff ${svc.operational.hour_limit ?? 'n/a'}  |  timeout ${svc.operational.timeout_seconds}s  |  max ${svc.operational.pickup_package_max} pkgs/pickup`,
        override,
    ].join('\n');
}

/**
 * Format the services list section.
 *
 * D11: when services is empty and meta._note is set, the caller renders the
 * _note prominently instead of a generic "no services" message.
 *
 * @param services - Array of service constraints
 * @returns Formatted markdown section with one sub-section per service
 */
function formatServices(services: ServiceConstraint[]): string {
    if (services.length === 0) {
        return '## Services\n\nNo active services found for this carrier.';
    }

    const rows = services.map(formatServiceRow);
    return `## Services (${services.length})\n\n${rows.join('\n\n')}`;
}

/**
 * Format the additional services catalog as a compact table.
 *
 * @param addons - Array of additional service refs (may be null)
 * @returns Formatted markdown section
 */
function formatAdditionalServices(addons: AdditionalServiceRef[] | null): string {
    if (!addons) {
        return '';
    }
    if (addons.length === 0) {
        return '## Additional Services\n\nNone configured for this carrier.';
    }

    const header = '| ID | Name | Category | For services |';
    const sep = '|---|---|---|---|';
    const rows = addons.map((a) => {
        const svcs = a.available_for_services.length > 0 ? a.available_for_services.join(', ') : '—';
        return `| ${a.id} | ${a.name} | ${a.category_id} | ${svcs} |`;
    });

    return `## Additional Services (${addons.length})\n\n${header}\n${sep}\n${rows.join('\n')}`;
}

/**
 * Format the coverage summary section.
 *
 * D9: when `_unavailable` is set (Phase 1 placeholder), render a clear
 * "pending Phase 2" message instead of an empty or confusing section.
 *
 * @param coverage - Coverage summary object (may be null)
 * @returns Formatted markdown section, or empty string if not present
 */
function formatCoverageSummary(coverage: CoverageSummary | null): string {
    if (!coverage) {
        return '';
    }
    if (coverage._unavailable) {
        return `## Coverage Summary\n\nCoverage summary: pending Phase 2 (${coverage._unavailable})`;
    }
    if (coverage.by_service.length === 0) {
        return '## Coverage Summary\n\nNo coverage data available.';
    }

    const lines: string[] = ['## Coverage Summary'];
    for (const entry of coverage.by_service) {
        const countries = entry.countries
            .map((c) => `${c.country_code}: ${c.postal_code_count.toLocaleString()} postal codes`)
            .join(', ');
        lines.push(`Service ${entry.service_id}: ${countries}`);
    }
    return lines.join('\n');
}

/**
 * Format the response meta footer.
 *
 * D11: `_note` is rendered prominently when present (carrier has no services
 * for this company).
 * D13: `cached` removed from meta — not in the response body.
 *
 * @param meta - Response metadata block
 * @returns Formatted footer string
 */
function formatMeta(meta: ResponseMeta): string {
    const noteSection = meta._note
        ? `\n⚠ Note: ${meta._note}\n`
        : '';
    return `${noteSection}---\n_Company id: ${meta.company_id ?? 'n/a'}  |  generated: ${meta.generated_at}_`;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the envia_get_carrier_constraints tool on the MCP server.
 *
 * @param server - MCP server instance to register the tool on
 * @param client - Envia API client for HTTP requests
 * @param config - Server configuration with API base URLs
 */
export function registerGetCarrierConstraints(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_get_carrier_constraints',
        {
            description:
                'Get the full capability profile for a specific carrier: pickup window, ' +
                'per-service weight limits, COD configuration, drop-off support, optional ' +
                'add-on services available, and any company-level overrides on your account. ' +
                'Use this for capability discovery (not for quoting) — to answer questions like ' +
                '"Does FedEx support COD?", "What is the max weight for DHL Ground?", or ' +
                '"Which additional services can I add to UPS?". ' +
                'Use envia_list_carriers to find carrier IDs. ' +
                'Note: if the backend returns "Endpoint not yet available", backend ticket C11 ' +
                'has not shipped yet — the tool will work automatically once it does.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                carrier_id: z
                    .number()
                    .int()
                    .positive()
                    .describe('Numeric carrier ID. Use envia_list_carriers to find valid IDs.'),
                service_id: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe('Filter response to a single service ID. Omit to get all active services.'),
                include: z
                    .array(z.enum(['additional_services', 'coverage_summary']))
                    .optional()
                    .default(['additional_services'])
                    .describe(
                        'Optional sections to include. ' +
                        '"additional_services" (default) — add-on services catalog. ' +
                        '"coverage_summary" — postal-code coverage aggregated by country (may be slow).',
                    ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            try {
                const response = await fetchCarrierConstraints(
                    activeClient,
                    args.carrier_id,
                    {
                        serviceId: args.service_id,
                        include: args.include as Array<'additional_services' | 'coverage_summary'>,
                    },
                    config,
                );

                const { data, meta } = response;
                const lines: string[] = [];

                lines.push(formatCarrierHeader(data));
                lines.push('');

                // D11: when meta._note is present and services[] is empty, show the note
                // prominently before the services section.
                if (meta._note && data.services.length === 0) {
                    lines.push(`⚠ Note: ${meta._note}`);
                    lines.push('');
                }

                lines.push(formatServices(data.services));
                lines.push('');

                const addonsSection = formatAdditionalServices(data.additional_services);
                if (addonsSection) {
                    lines.push(addonsSection);
                    lines.push('');
                }

                const coverageSection = formatCoverageSummary(data.coverage_summary);
                if (coverageSection) {
                    lines.push(coverageSection);
                    lines.push('');
                }

                lines.push(formatMeta(meta));

                return textResponse(lines.join('\n'));
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return textResponse(
                    `Unable to retrieve carrier constraints for carrier_id ${args.carrier_id}.\n\n${message}`,
                );
            }
        },
    );
}
