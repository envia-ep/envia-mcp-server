/**
 * Wizards — composed multi-step tools (Pase 3 of the Tool Consolidation Audit).
 *
 * Each wizard wraps a multi-step flow that the LLM repeatedly fails to
 * orchestrate on its own. Wizards prefer a pre-flight pattern (gather +
 * validate) over taking over mutations from the underlying tool — this keeps
 * the wizard implementation small while still cutting tool-selection fatigue.
 */

export { registerCreateInternationalShipment } from './create-international-shipment.js';
