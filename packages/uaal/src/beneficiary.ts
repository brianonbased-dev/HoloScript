/**
 * Stage-2 shim (language-architecture.md §8.2, 2026-07-17): the beneficiary family moved to
 * @holoscript/meaning (HoloMeaning). Re-exports the full meaning surface so every existing
 * `./beneficiary` import keeps working unchanged. Definitions exist ONLY in @holoscript/meaning.
 */
export * from '@holoscript/meaning';
