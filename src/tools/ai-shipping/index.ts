/**
 * AI Shipping Tools — barrel export.
 *
 * Exposes the two AI-assisted shipping capabilities:
 *   - `envia_ai_parse_address` — natural-language → structured address
 *   - `envia_ai_rate`          — multi-carrier rate comparison
 */

export { registerAiParseAddress } from './parse-address.js';
export { registerAiRate } from './rate.js';
