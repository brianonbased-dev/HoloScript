/**
 * ContentPolicyGate — the CONTENT axis of the ecosystem's legal/illegal system.
 *
 * "What may be SAID" — a provider-agnostic, jurisdiction-aware content-moderation
 * gate with a pure-data ruleset. Compose it with the Twin Earth safety envelopes
 * ("what may be DONE") and the conformance/founder gates ("where is it LAWFUL");
 * all three write to the shared AuditLogger ledger.
 *
 * See research/2026-06-13 surface map + integration proposal.
 */

export * from './types';
export * from './jsonLogic';
export * from './blocklist';
export * from './defaults';
export * from './ContentPolicyGate';
export * from './PolicyPack';
