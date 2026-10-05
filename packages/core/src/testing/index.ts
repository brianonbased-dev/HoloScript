/**
 * @holoscript/core/testing — narrow empirical test utilities.
 *
 * Determinism probes, twin (differential) testing, and the back-translation
 * proof helpers. Type declarations for this subpath are hand-written in
 * scripts/generate-types.mjs (testingDTS) — keep both in step.
 */
export * from './DeterminismHarness';
export * from './TwinTestHarness';
export * from './backtranslation';
