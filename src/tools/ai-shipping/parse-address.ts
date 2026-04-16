/**
 * Tool: envia_ai_parse_address
 *
 * Converts a free-form address string (anything a human would write on a
 * packing slip) into structured fields ready for `envia_quote_shipment` or
 * `envia_create_address`. Useful when the user pastes an address copied
 * from an email, chat, or spreadsheet.
 *
 * Data source: `POST /ai/shipping/parse-address` (queries service).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { parseAddressApi } from '../../services/ai-shipping.js';
import type { ParsedAddress } from '../../types/ai-shipping.js';

/**
 * Format a parsed address as a compact readable block. Keeps rows that were
 * actually populated — hides empty fields to reduce noise in the chat.
 */
function formatParsedAddress(address: ParsedAddress): string {
    const lines: string[] = ['Parsed address:', ''];
    if (address.name) lines.push(`  Name:             ${address.name}`);
    if (address.company) lines.push(`  Company:          ${address.company}`);
    if (address.street) lines.push(`  Street:           ${address.street}`);
    if (address.number) lines.push(`  Number:           ${address.number}`);
    if (address.district) lines.push(`  District/Colony:  ${address.district}`);
    if (address.city) lines.push(`  City:             ${address.city}`);
    if (address.state) lines.push(`  State:            ${address.state}`);
    if (address.postal_code) lines.push(`  Postal code:      ${address.postal_code}`);
    if (address.country) lines.push(`  Country:          ${address.country}`);
    if (address.phone) lines.push(`  Phone:            ${address.phone_code ?? ''}${address.phone}`);
    if (address.email) lines.push(`  Email:            ${address.email}`);
    if (address.identification_number) lines.push(`  ID number:        ${address.identification_number}`);
    if (address.reference) lines.push(`  Reference:        ${address.reference}`);

    if (address.suburbs && address.suburbs.length > 1) {
        lines.push('', `  Suggested districts: ${address.suburbs.slice(0, 5).join(', ')}`);
    }

    return lines.join('\n');
}

/** Register the envia_ai_parse_address tool on the MCP server. */
export function registerAiParseAddress(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_ai_parse_address',
        {
            description:
                'Parse a free-form address string into structured fields (name, street, number, '
                + 'city, state, postal code, country, etc.) using Envia\'s AI extraction service. '
                + 'Use when the user pastes a raw address or provides it in natural language.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                text: z.string().min(1).describe('Raw address text to parse, in any human-readable format.'),
                country: z.string().length(2).optional().describe(
                    'ISO 3166-1 alpha-2 country hint to improve parsing accuracy (e.g. "MX", "BR", "CO").',
                ),
            }),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            const body: { text: string; country?: string } = { text: args.text.trim() };
            if (args.country) body.country = args.country.toUpperCase();

            const res = await parseAddressApi(activeClient, config, body);

            if (!res.ok || !res.data?.success) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to parse address: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            return textResponse(formatParsedAddress(res.data.data));
        },
    );
}

// Export the formatter for isolated testing.
export { formatParsedAddress };
