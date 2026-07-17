/**
 * Stage-2 shim (language-architecture.md §8.2, 2026-07-17): the meaning stratum — the family IRs,
 * recognizers, resolvers, and the resolution contract formerly defined in this file — lives in
 * @holoscript/meaning (HoloMeaning). This path re-exports the full meaning surface so every
 * existing import — the published `@holoscript/uaal` / `@holoscript/uaal/semantic` surfaces and
 * this package's own verifier/merge/query/tests — keeps working unchanged.
 * Definitions exist ONLY in @holoscript/meaning; `check:language-strata --strict` enforces it.
 */
export * from '@holoscript/meaning';
