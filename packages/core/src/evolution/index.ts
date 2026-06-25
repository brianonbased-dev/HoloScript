/**
 * `@holoscript/core/evolution` — the browser-safe gated self-improvement slice.
 *
 * The deployed edge AgentRunner imports THIS subpath (never the main `.` barrel,
 * which drags storage/codebase/node-dependent modules through one file) to grow
 * its training corpus IN-PROCESS on idle — the I.023 executor last mile. The whole
 * slice is Web Crypto (`globalThis.crypto.subtle`) + `fetch` + the pure parser:
 * zero `node:fs`. The agent owns the file IO; {@link dedupRows} is the pure
 * cross-run dedup it applies before persisting, so a fixed portfolio re-run accrues
 * only NEW candidates.
 *
 * @packageDocumentation
 */
export {
  runEvolution,
  makeOllamaProposer,
  toGradedTraceRow,
  type EvolvePolicy,
  type EvolveCandidate,
  type Proposer,
  type Gate,
  type EvolveIO,
  type EvolveOutcome,
  type EvolveReceipt,
  type EvolveResult,
  type EvolveTraceRecord,
  type GradedTraceRow,
} from './EvolveProgramBackend';

export {
  CORPUS_PORTFOLIO,
  parsesClean,
  makeSeedGate,
  accrueOneStep,
  dedupRows,
  type SeedFormat,
  type EvolveSeed,
  type AccrueStepResult,
} from './corpusPortfolio';
