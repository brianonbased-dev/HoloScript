/**
 * Formal Verification / Concurrency Traits
 * @version 1.0.0
 */
export const CONCURRENCY_TRAITS = [
  'actor', // Actor model message passing
  'csp_channel', // CSP channel communication
  'temporal_guard', // Temporal logic guard
  'deadlock_free', // Deadlock-free guarantee marker
] as const;

export type ConcurrencyTraitName = (typeof CONCURRENCY_TRAITS)[number];
