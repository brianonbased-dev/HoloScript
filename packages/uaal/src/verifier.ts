/**
 * Stage-3 shim (language-architecture.md §8.2/§8.3, 2026-07-17): the verifier of record
 * (gradeByResolver — the stratum-② checking dispatch) moved to @holoscript/meaning
 * (HoloMeaning) beside the resolvers it dispatches. Re-exports the full meaning surface so
 * every existing `./verifier` / `@holoscript/uaal` import (incl. absorb-service's
 * gradeByResolver) keeps working unchanged. Definitions exist ONLY in @holoscript/meaning.
 */
export * from '@holoscript/meaning';
