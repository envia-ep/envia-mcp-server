/**
 * Envia MCP server factory.
 *
 * Builds an McpServer with every tool and resource registered, decorated for
 * logging and for the catalog the HTTP listing requires. `index.ts` owns the
 * transports; this module owns what a server contains, so tests can register
 * the real catalog without starting one.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { decorateToolCatalog, publishToolSecuritySchemes } from './auth/tool-catalog.js';
import { loadConfig, type LoadConfigOptions } from './config.js';
import { EnviaApiClient } from './utils/api-client.js';
import { decorateServerWithLogging } from './utils/server-logger.js';

const pkg = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8'),
) as { version: string };


// Tools
import { registerValidateAddress } from './tools/validate-address.js';
import { registerListCarriers } from './tools/list-carriers.js';
import { registerGetShippingRates } from './tools/get-shipping-rates.js';
import { registerCreateLabel } from './tools/create-label.js';
import { registerTrackPackage } from './tools/track-package.js';
import { registerCancelShipment } from './tools/cancel-shipment.js';
import { registerSchedulePickup } from './tools/schedule-pickup.js';
import { registerGetShipmentHistory } from './tools/get-shipment-history.js';
import { registerClassifyHscode } from './tools/classify-hscode.js';
// NOTE(sprint-0): registerCreateCommercialInvoice removed from portal agent — generated
// automatically inside create_label for intl shipments. Kept as internal helper.
import { registerGetEcommerceOrder } from './tools/get-ecommerce-order.js';
import { registerListAdditionalServices } from './tools/list-additional-services.js';
import { registerGetAdditionalServicePrices } from './tools/get-additional-service-prices.js';
import { registerGetCarrierConstraints } from './tools/get-carrier-constraints.js';

// Shipment query tools
import {
    registerListShipments,
    registerGetShipmentDetail,
    registerGetShipmentsStatus,
    registerGetShipmentsCod,
    registerGetCodCounters,
    registerGetShipmentsSurcharges,
    registerGetShipmentsNdr,
    registerGetShipmentInvoices,
} from './tools/shipments/index.js';

// Address tools — Pase 2 cluster 5 (2026-04-29) consolidated 6 → 4.
//   - registerListAddresses: surfaces `is_default` flag via ★ marker, so
//     "what is my default origin?" can be answered without a dedicated tool.
//   - registerCreateAddress / registerUpdateAddress / registerDeleteAddress:
//     primary CRUD, kept LLM-visible.
//   - registerGetDefaultAddress: reclassified to internal — derivable from
//     list_addresses (filter by is_default=true).
//   - registerSetDefaultAddress: reclassified to internal — rare admin-flavour
//     action; users typically configure defaults during onboarding.
import {
    registerListAddresses,
    registerCreateAddress,
    registerUpdateAddress,
    registerDeleteAddress,
} from './tools/addresses/index.js';

// Package tools
import {
    registerListPackages,
    registerCreatePackage,
    registerDeletePackage,
} from './tools/packages/index.js';

// Client tools — Pase 2 cluster 6 (2026-04-29) consolidated 6 → 4.
//   - registerListClients: list with filters, surfaces totals counts.
//   - registerCreateClient / registerUpdateClient / registerDeleteClient:
//     primary CRUD.
//   - registerGetClientDetail: reclassified to internal — list_clients already
//     returns enough fields for common chat answers; deep-detail view is rare.
//   - registerGetClientsSummary: reclassified to internal — aggregate counters
//     are admin/analytics flavour, not a typical chat-user question.
import {
    registerListClients,
    registerCreateClient,
    registerUpdateClient,
    registerDeleteClient,
} from './tools/clients/index.js';

// Order tools
import {
    registerListOrders,
    registerGetOrdersCount,
    registerListShops,
    registerUpdateOrderAddress,
    registerUpdateOrderPackages,
    registerSelectOrderService,
    registerFulfillOrder,
    registerGetOrderFilterOptions,
    registerManageOrderTags,
    registerGeneratePackingSlip,
    registerGeneratePickingList,
    registerGetOrdersAnalytics,
} from './tools/orders/index.js';

// Ticket tools
import {
    registerListTickets,
    registerGetTicketDetail,
    registerGetTicketComments,
    registerCreateTicket,
    registerAddTicketComment,
    registerRateTicket,
    registerGetTicketTypes,
} from './tools/tickets/index.js';

// Branch tools
// Branches tools — Pase 2 cluster 1 (2026-04-29) consolidated 4 → 2.
//   - registerFindDropOff: now the canonical branches-search tool (super-set
//     of search_branches + capacity / package-dimension filters).
//   - registerGetBranchesCatalog: distinct intent — returns the hierarchical
//     state → localities map for coverage discovery, not concrete branches.
//   - registerSearchBranches: reclassified to internal — overlaps with
//     find_drop_off, which is strictly more capable.
//   - registerSearchBranchesBulk: reclassified to internal — its compact
//     output format is a perf optimisation that is not chat-relevant.
// Module exports retained so internal callers can still use them.
import {
    registerGetBranchesCatalog,
    registerFindDropOff,
} from './tools/branches/index.js';

// Config tools
// NOTE(sprint-0): Webhook CRUD and Checkout Rule CRUD removed from portal agent.
// Webhooks are a dev/admin task (1-time setup). Checkout rules have no UI in v1 or v2
// and are B2B/integrations only. Files are kept for future use — just not registered.
//
// NOTE(sprint-4a): registerListCheckoutRules also removed. Even the read-only list of
// checkout rules has no V1/V2 UI; portal users cannot see, edit, or act on these
// rules from the portal, so a "list my checkout rules" question is not a typical
// portal-user request (L-S2). Module export stays for potential internal use.
// Config tools — only `getNotificationSettings` stays LLM-visible. The rest of
// the config module is reclassified to internal-only by the Tool Consolidation
// audit (Pase 1, 2026-04-29):
//   - registerListCompanyUsers: team-roster lookup is admin/setup territory.
//   - registerListCompanyShops: duplicate of `list_shops` from orders module.
//   - registerGetCarrierConfig: per-company carrier credentials, admin/onboarding.
//   - registerListApiTokens: developer-integration setup, not a chat-user task.
//   - registerListWebhooks: webhook CRUD already reclassified (Sprint 0); the
//     read-only list is also admin-territory by L-S2 / L-S6.
// All five remain importable from the module barrel so other internal helpers
// can call them; they are simply not registered with the MCP server.
import {
    registerGetNotificationSettings,
} from './tools/config/index.js';

// Analytics tools — Pase 2 cluster 4 (2026-04-29) consolidated 5 → 3.
//   - registerGetMonthlyAnalytics: monthly volume + revenue per carrier — the
//     canonical KPI dashboard.
//   - registerGetIssuesAnalytics: issue-type / carrier issue rate — distinct
//     problem-focused intent.
//   - registerGetShipmentsByStatus: status-bucket counts for a date range —
//     distinct status-focused intent.
//   - registerGetCarriersStats: reclassified to internal — carrier comparison
//     (volume / delivery time / top regions) overlaps with monthly_analytics.
//   - registerGetPackagesModule: reclassified to internal — per-carrier
//     performance metrics overlap with monthly_analytics.
import {
    registerGetMonthlyAnalytics,
    registerGetIssuesAnalytics,
    registerGetShipmentsByStatus,
} from './tools/analytics/index.js';

// Notification tools — Pase 2 cluster 9 (2026-04-29) consolidated 4 → 2.
//   - registerListNotifications: user-facing inbox feed grouped by category.
//   - registerGetNotificationSettings (imported above from config): channel
//     toggles (email/SMS/WhatsApp/COD/POD).
//   - registerGetNotificationConfig: reclassified to internal — overlaps with
//     list_notifications (both return notification feeds grouped by category).
//   - registerGetNotificationPrices: reclassified to internal — pricing per
//     channel is admin/billing curiosity, not a typical chat-user question.
import {
    registerListNotifications,
} from './tools/notifications/index.js';

// Products & Billing tools.
// Pase 1 (2026-04-29) reclassified two helpers to internal-only:
//   - registerCheckBillingInfo: lightweight presence check duplicates the
//     "is anything missing?" signal already surfaced by registerGetBillingInfo
//     when the company has not configured billing.
//   - registerGetDceStatus: Brazil-only DCe (Declaração de Conteúdo eletrônica)
//     compliance check — niche operational lookup, not a typical portal-user
//     question (L-S2). Module exports retained for internal reuse.
import {
    registerListProducts,
    registerGetBillingInfo,
} from './tools/products/index.js';

// Account tools (portal agent — reads own user/company context)
import {
    registerGetCompanyInfo,
    registerGetMySalesman,
    registerGetBalanceInfo,
} from './tools/account/index.js';

// AI Shipping tools — NLP address parsing + international address requirements.
// Pase 2 cluster 2 (2026-04-29) reclassified `registerAiRate` to internal-only:
// its multi-carrier comparison is already the default behaviour of
// `envia_quote_shipment` (returns services sorted by price across all carriers).
// The only unique capability of ai_rate was an optional `carriers: string[]`
// filter — that capability is currently DEFERRED (see
// _docs/TOOL_CONSOLIDATION_BREAKING_CHANGES.md). Module export retained.
import {
    registerAiParseAddress,
    registerAiAddressRequirements,
} from './tools/ai-shipping/index.js';

// Wizards — composed multi-step tools (Pase 3 of the Tool Consolidation Audit).
// `envia_create_international_shipment` runs a single pre-flight pass that
// fetches address requirements + auto-classifies HS codes, returning a
// ready-to-call payload for envia_create_shipment so the LLM does not iterate.
import {
    registerCreateInternationalShipment,
} from './tools/wizards/index.js';

// Carriers advanced tools
// NOTE(sprint-0): Removed from portal agent:
//   - registerTrackAuthenticated: duplicate of track_package, confused LLM agent.
//     File deleted (was toxic). If advanced tracking is needed later, extend
//     track_package internally.
//   - registerLocateCity: /locate is CO DANE resolver — an internal helper, not a
//     user-facing tool. User never asks "locate Bogota" — the agent resolves it
//     automatically while building addresses.
//
// NOTE(sprint-4a): registerGenerateBillOfLading reclassified as 🟣 INTERNAL helper.
// The carriers backend auto-generates BOLs as a side-effect of /ship/generate for
// FedEx intl + UPS BR routes. A typical portal user does not ask "generate a BOL
// for tracking X" — they get the BOL back from create_label. Module export stays
// for potential internal regeneration helpers.
import {
    registerGenerateManifest,
    registerCancelPickup,
    registerSubmitNdReport,
    registerTrackPickup,
    registerGenerateComplement,
} from './tools/carriers-advanced/index.js';

// Queue tools
import { registerCheckBalance } from './tools/queue/index.js';

// Resources
import { registerResources } from './resources/api-docs.js';

/**
 * Build a fully-configured McpServer with all Envia tools and resources.
 *
 * The optional `logContext` is used to attach a correlation ID (HTTP)
 * or a session ID (stdio) to every `tool_call_*` event the server
 * emits. All registered tools inherit this context automatically via
 * `decorateServerWithLogging`. Pass an empty object when context is
 * not yet known — the decorator still runs and produces useful events
 * with just the tool name + duration.
 *
 * @param logContext - Correlation or session identifiers attached to tool_call events
 * @param apiKey - Per-request Envia credential. Empty string with `allowMissingApiKey` skips ENVIA_API_KEY.
 * @param options - `loadConfig` flags plus `httpCatalog`, which strips `api_key`
 *   from advertised schemas (OpenAI listing).
 * @returns Configured MCP server with every Envia tool registered
 * @throws When no API key is available and `allowMissingApiKey` is not set
 */
export function createEnviaServer(
    logContext: { correlationId?: string; sessionId?: string } = {},
    apiKey?: string,
    options: LoadConfigOptions & { httpCatalog?: boolean } = {},
): McpServer {
    const config = loadConfig(apiKey, options);
    const client = new EnviaApiClient(config);

    const server = new McpServer(
        {
            name: 'envia',
            version: pkg.version,
        },
        {
            capabilities: {
                tools: { listChanged: true },
            },
        },
    );

    // Decorate BEFORE any register*() call so every tool gets logged.
    decorateServerWithLogging(server, logContext);
    decorateToolCatalog(server, { omitApiKeyFromSchema: options.httpCatalog === true });

    registerValidateAddress(server, client, config);
    registerListCarriers(server, client, config);
    registerGetShippingRates(server, client, config);
    registerCreateLabel(server, client, config);
    registerTrackPackage(server, client, config);
    registerCancelShipment(server, client, config);
    registerSchedulePickup(server, client, config);
    registerGetShipmentHistory(server, client, config);
    registerClassifyHscode(server, client, config);
    // registerCreateCommercialInvoice — moved to internal helper (auto-generated in create_label for intl).
    registerGetEcommerceOrder(server, client, config);
    registerListAdditionalServices(server, client, config);
    registerGetAdditionalServicePrices(server, client, config);
    registerGetCarrierConstraints(server, client, config);

    // Shipment query tools
    registerListShipments(server, client, config);
    registerGetShipmentDetail(server, client, config);
    registerGetShipmentsStatus(server, client, config);
    registerGetShipmentsCod(server, client, config);
    registerGetCodCounters(server, client, config);
    registerGetShipmentsSurcharges(server, client, config);
    registerGetShipmentsNdr(server, client, config);
    registerGetShipmentInvoices(server, client, config);

    // Address tools — see header comment for cluster 5 consolidation.
    registerListAddresses(server, client, config);
    registerCreateAddress(server, client, config);
    registerUpdateAddress(server, client, config);
    registerDeleteAddress(server, client, config);

    // Package tools
    registerListPackages(server, client, config);
    registerCreatePackage(server, client, config);
    registerDeletePackage(server, client, config);

    // Client tools — see header comment for cluster 6 consolidation.
    registerListClients(server, client, config);
    registerCreateClient(server, client, config);
    registerUpdateClient(server, client, config);
    registerDeleteClient(server, client, config);

    // Order tools
    registerListOrders(server, client, config);
    registerGetOrdersCount(server, client, config);
    registerListShops(server, client, config);
    registerUpdateOrderAddress(server, client, config);
    registerUpdateOrderPackages(server, client, config);
    registerSelectOrderService(server, client, config);
    registerFulfillOrder(server, client, config);
    registerGetOrderFilterOptions(server, client, config);
    registerManageOrderTags(server, client, config);
    registerGeneratePackingSlip(server, client, config);
    registerGeneratePickingList(server, client, config);
    registerGetOrdersAnalytics(server, client, config);

    // Ticket tools
    registerListTickets(server, client, config);
    registerGetTicketDetail(server, client, config);
    registerGetTicketComments(server, client, config);
    registerCreateTicket(server, client, config);
    registerAddTicketComment(server, client, config);
    registerRateTicket(server, client, config);
    registerGetTicketTypes(server, client, config);

    // Branch tools — see header comment for cluster 1 consolidation.
    registerGetBranchesCatalog(server, client, config);
    registerFindDropOff(server, client, config);

    // Config tools — see header comment on config imports for which calls are
    // LLM-visible vs internal-only after the Pase 1 consolidation.
    registerGetNotificationSettings(server, client, config);

    // Analytics tools — see header comment for cluster 4 consolidation.
    registerGetMonthlyAnalytics(server, client, config);
    registerGetIssuesAnalytics(server, client, config);
    registerGetShipmentsByStatus(server, client, config);

    // Notification tools — see header comment for cluster 9 consolidation.
    registerListNotifications(server, client, config);

    // Products & Billing tools — see header comment for what's LLM-visible.
    registerListProducts(server, client, config);
    registerGetBillingInfo(server, client, config);

    // Account tools — share a single GET /user-information call under the hood.
    registerGetCompanyInfo(server, client, config);
    registerGetMySalesman(server, client, config);
    registerGetBalanceInfo(server, client, config);

    // Queue / balance tools
    registerCheckBalance(server, client, config);

    // AI Shipping tools — see header comment for ai_rate reclassification.
    registerAiParseAddress(server, client, config);
    registerAiAddressRequirements(server, client, config);

    // Wizards — composed multi-step tools (Pase 3 of the Tool Consolidation Audit).
    registerCreateInternationalShipment(server, client, config);

    // Carriers advanced tools (track-authenticated removed; locate-city + generate-bill-of-lading
    // reclassified as internal helpers — see header comment on carriers-advanced imports).
    registerGenerateManifest(server, client, config);
    registerCancelPickup(server, client, config);
    registerSubmitNdReport(server, client, config);
    registerTrackPickup(server, client, config);
    registerGenerateComplement(server, client, config);

    registerResources(server, config);

    publishToolSecuritySchemes(server);

    return server;
}
