/**
 * @holoscript/core
 *
 * HoloScript+ - VR language with declarative syntax, state management, and VR interactions.
 * Enhanced version of HoloScript with:
 * - VR interaction traits (@grabbable, @throwable, @hoverable, etc.)
 * - Reactive state management (@state { ... })
 * - Control flow (@for, @if directives)
 * - TypeScript companion imports
 * - Expression interpolation ${...}
 *
 * Fully backward compatible with original HoloScript syntax.
 *
 * @example
 * ```typescript
 * import { HoloScriptPlusParser, HoloScriptPlusRuntime } from '@holoscript/core';
 *
 * const parser = new HoloScriptPlusParser();
 * const result = parser.parse(`
 *   orb#myOrb {
 *     position: [0, 0, 0]
 *     @grabbable(snap_to_hand: true)
 *     @throwable(bounce: true)
 *   }
 * `);
 *
 * const runtime = new HoloScriptPlusRuntime(result.ast);
 * await runtime.mount(document.body);
 * ```
 *
 * @packageDocumentation
 */

export * from './barrel';

// Evolution — the gated self-improvement primitive (`@evolve_program` backend + autonomous
// corpus accrual). Browser-safe (Web Crypto, no node:fs); the deployed edge AgentRunner imports
// these to grow its training corpus in-process on idle (I.023 executor gap). File IO stays in the
// node runner — `dedupRows` is the pure cross-run dedup it applies before persisting.
export {
  runEvolution,
  makeOllamaProposer,
  toGradedTraceRow,
  type Proposer,
  type Gate,
  type EvolvePolicy,
  type EvolveIO,
  type EvolveResult,
  type EvolveReceipt,
  type EvolveTraceRecord,
  type GradedTraceRow,
} from './evolution/EvolveProgramBackend';
export {
  accrueOneStep,
  dedupRows,
  makeSeedGate,
  parsesClean,
  CORPUS_PORTFOLIO,
  type EvolveSeed,
  type SeedFormat,
  type AccrueStepResult,
} from './evolution/corpusPortfolio';

// Perceptual color science (non-Riemannian). Sovereign primitive; see ./color.
export * from './color';
