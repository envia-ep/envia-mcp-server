/**
 * Account Tools — barrel export.
 *
 * Read-only tools exposing the caller's account context (company profile,
 * assigned salesman, balance). All three are thin wrappers over the
 * `GET /user-information` JWT payload — the backend packs every relevant
 * field into a single call, so we avoid N extra round-trips.
 */

export { registerGetCompanyInfo } from './get-company-info.js';
export { registerGetMySalesman } from './get-my-salesman.js';
export { registerGetBalanceInfo } from './get-balance-info.js';
