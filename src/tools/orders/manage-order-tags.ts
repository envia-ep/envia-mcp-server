/**
 * Tool: envia_manage_order_tags
 *
 * Add or remove tags on ecommerce orders.
 * Use action='add' with tags[] to label orders for filtering and grouping.
 * Use action='remove' with tag_ids[] to remove previously added tags.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EnviaApiClient } from '../../utils/api-client.js';
import { resolveClient } from '../../utils/api-client.js';
import type { EnviaConfig } from '../../config.js';
import { requiredApiKeySchema } from '../../utils/schemas.js';
import { textResponse } from '../../utils/mcp-response.js';
import { mapCarrierError } from '../../utils/error-mapper.js';
import { mutateOrderApi, deleteOrderApi } from '../../services/orders.js';
import type { TagAddResponse, TagRemoveResponse } from '../../types/orders.js';

/**
 * Register the envia_manage_order_tags tool on the MCP server.
 */
export function registerManageOrderTags(
    server: McpServer,
    client: EnviaApiClient,
    config: EnviaConfig,
): void {
    server.registerTool(
        'envia_manage_order_tags',
        {
            description:
                'Add or remove tags on ecommerce orders for labeling and grouping. ' +
                'action="add": provide order_ids and tags (strings) to assign new labels. ' +
                'action="remove": provide order_ids and tag_ids (numbers) to remove existing tags. ' +
                'Tags appear in envia_list_orders results and can be used for filtering.',
            inputSchema: z.object({
                api_key: requiredApiKeySchema,
                action: z.enum(['add', 'remove']).describe('Action to perform: add or remove tags'),
                order_ids: z.array(z.number().int().min(1)).min(1)
                    .describe('Order IDs to modify tags on'),
                tags: z.array(z.string().min(1)).optional()
                    .describe('Tag strings to add (required when action="add")'),
                tag_ids: z.array(z.number().int().min(1)).optional()
                    .describe('Tag IDs to remove (required when action="remove"; get IDs from order tag records)'),
            }).refine(
                (data) => {
                    if (data.action === 'add') return Array.isArray(data.tags) && data.tags.length > 0;
                    if (data.action === 'remove') return Array.isArray(data.tag_ids) && data.tag_ids.length > 0;
                    return false;
                },
                {
                    message: 'tags is required for action="add"; tag_ids is required for action="remove".',
                },
            ),
        },
        async (args) => {
            const activeClient = resolveClient(client, args.api_key, config);

            if (args.action === 'add') {
                const res = await mutateOrderApi<TagAddResponse>(
                    activeClient, config, '/orders/tags', {
                        order_ids: args.order_ids,
                        tags: args.tags,
                    },
                );

                if (!res.ok) {
                    const mapped = mapCarrierError(res.status, res.error ?? '');
                    return textResponse(
                        `Failed to add tags: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                    );
                }

                const inserted = res.data?.inserted ?? 0;
                const tagNames = (res.data?.tags ?? []).map((t) => t.tag).join(', ');
                return textResponse(
                    `Tags added successfully.\n` +
                    `  Orders: ${args.order_ids.join(', ')}\n` +
                    `  Inserted: ${inserted} tag(s)\n` +
                    `  Tags: ${tagNames || (args.tags ?? []).join(', ')}`,
                );
            }

            // action === 'remove'
            const res = await deleteOrderApi<TagRemoveResponse>(
                activeClient, config, '/orders/tags', {
                    order_ids: args.order_ids,
                    tag_ids: args.tag_ids,
                },
            );

            if (!res.ok) {
                const mapped = mapCarrierError(res.status, res.error ?? '');
                return textResponse(
                    `Failed to remove tags: ${mapped.userMessage}\n\nSuggestion: ${mapped.suggestion}`,
                );
            }

            const deleted = res.data?.deleted ?? 0;
            return textResponse(
                `Tags removed successfully.\n` +
                `  Orders: ${args.order_ids.join(', ')}\n` +
                `  Removed: ${deleted} tag(s)`,
            );
        },
    );
}
