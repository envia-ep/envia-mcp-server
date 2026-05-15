/**
 * Tickets Tools — barrel export.
 *
 * Registers all support ticket management tools on the MCP server.
 *
 * NOTE: v1 tools are kept for reference but are no longer registered.
 * The v2 tools use a cache-backed pattern and replace them gradually.
 */

// v1 tools — deprecated, kept for reference only (not registered)
/*export { registerListTickets } from './list-tickets.js';
export { registerGetTicketDetail } from './get-ticket-detail.js';
export { registerGetTicketComments } from './get-ticket-comments.js';
export { registerCreateTicket } from './create-ticket.js';
export { registerAddTicketComment } from './add-ticket-comment.js';
export { registerRateTicket } from './rate-ticket.js';
export { registerGetTicketTypes } from './get-ticket-types.js';*/

// v2 tools — cache-backed, actively registered
export { registerGetTicketTypesV2 } from './get-ticket-types-v2.js';
export { registerCreateTicketV2 } from './create-ticket-v2.js';
export { registerListTicketsV2 } from './list-tickets-v2.js';
export { registerAddTicketCommentV2 } from './add-ticket-comment-v2.js';
export { registerRateTicketV2 } from './rate-ticket-v2.js';

