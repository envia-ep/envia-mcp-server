/**
 * Envia MCP Server — Tax Rules
 *
 * Determines whether taxes apply for a given shipping route. This affects
 * whether items[] are required in packages (international/non-tax routes
 * require detailed item declarations for customs).
 *
 * Rules are based on the carriers backend's shouldApplyTaxes() logic.
 */

import { EU_COUNTRIES, EXCEPTIONAL_TERRITORIES } from './country-rules.js';

/**
 * Determine whether taxes apply for a given shipping route.
 *
 * Returns `true` when taxes apply (domestic or combined-territory shipments),
 * `false` when they do not (international or territorial exceptions). When
 * `false`, items[] are required in packages for customs declarations.
 *
 * This function mirrors the sequential-override logic of the carriers backend
 * (`CarrierUtil::shouldApplyTaxes`). The evaluation is NOT short-circuit —
 * later rules can override earlier ones:
 *
 *   1. Start with `inter = true` (taxes apply by default).
 *   2. If different countries → `inter = false`.
 *   3. If both in US/PR set → `inter = true` (US↔PR treated as domestic).
 *   4. If both in EU → `inter = true` (intra-EU VAT applies).
 *   5. If states differ and exactly one is an exceptional territory → `inter = false`.
 *
 * NOTE — Canarias detection is split across two layers and this function
 * only covers HALF of it. State-based detection (`ES-CN`/`ES-TF`/`ES-GC`,
 * plus `ES-CE`/`ES-ML`) lives here via `EXCEPTIONAL_TERRITORIES`. Postal-code
 * detection (35xxx/38xxx → country override `IC`) lives in
 * `geocodes-helpers.applyCanaryIslandsOverride`, which runs BEFORE this
 * function on the request path. If you change Canarias logic, audit BOTH
 * sites — the state list here will not see a `country='ES'` request whose
 * Canarian nature is encoded only in the postal code.
 *
 * @param originCountry - ISO 3166-1 alpha-2 origin country code.
 * @param originState - Origin state or province code.
 * @param destCountry - ISO 3166-1 alpha-2 destination country code.
 * @param destState - Destination state or province code.
 * @returns `true` if taxes apply, `false` otherwise.
 */
export function shouldApplyTaxes(
    originCountry: string,
    originState: string,
    destCountry: string,
    destState: string,
): boolean {
    const oc = originCountry.toUpperCase().trim();
    const dc = destCountry.toUpperCase().trim();
    const os = `${oc}-${originState.toUpperCase().trim()}`;
    const ds = `${dc}-${destState.toUpperCase().trim()}`;
    const usPr = new Set(['US', 'PR']);

    // Sequential override logic — mirrors PHP backend exactly
    let inter = true;

    // Step 1: Different country → no taxes (international)
    if (oc !== dc) {
        inter = false;
    }

    // Step 2: Both in US/PR → override to taxes (combined territory = domestic)
    if (usPr.has(oc) && usPr.has(dc)) {
        inter = true;
    }

    // Step 3: Both in EU → override to taxes (intra-EU VAT)
    if (EU_COUNTRIES.has(oc) && EU_COUNTRIES.has(dc)) {
        inter = true;
    }

    // Step 4: If states differ and exactly one is exceptional → no taxes
    if (os !== ds) {
        const originIsExc = EXCEPTIONAL_TERRITORIES.has(os);
        const destIsExc = EXCEPTIONAL_TERRITORIES.has(ds);

        if ((originIsExc && !destIsExc) || (!originIsExc && destIsExc)) {
            inter = false;
        }
    }

    return inter;
}

/**
 * Determine whether a route is intra-EU (both origin and destination in the EU).
 *
 * @param originCountry - ISO 3166-1 alpha-2 origin country code.
 * @param destCountry - ISO 3166-1 alpha-2 destination country code.
 * @returns `true` if both countries are EU member states.
 */
export function isIntraEU(originCountry: string, destCountry: string): boolean {
    return EU_COUNTRIES.has(originCountry.toUpperCase().trim())
        && EU_COUNTRIES.has(destCountry.toUpperCase().trim());
}
