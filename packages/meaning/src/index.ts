/**
 * @holoscript/meaning — HoloMeaning, the stratum-② meaning home of the HoloScript language.
 * docs/spec/language-architecture.md §3: defined once, imported everywhere, mirrored nowhere.
 *
 *   contract        — the resolution record, status union, gap taxonomy, structuredGap
 *   semantic        — the family IRs, recognizers (recover*), and resolvers (resolve*)
 *   beneficiary     — the beneficiary family (human-floor semantics)
 *   vibe            — the affective family
 *   affective-harm  — valence→harm derivation over beneficiary + vibe
 *   verifier        — the verifier of record (gradeByResolver — family → resolver dispatch)
 *   uq              — split-conformal coverage (Mondrian) wrapped around the verifier V
 *
 * The execution VM (stratum ③) and its ABI remain in @holoscript/uaal, which re-exports
 * this surface via shims for backward compatibility.
 * `check:language-strata --strict` fails any re-declaration of this surface elsewhere.
 */
export * from './contract';
export * from './semantic';
export * from './beneficiary';
export * from './vibe';
export * from './affective-harm';
export * from './verifier';
export * from './uq';
export * from './consistency';
export * from './uncertain';
export * from './lower-unknown';
