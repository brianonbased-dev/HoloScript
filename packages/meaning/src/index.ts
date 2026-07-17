/**
 * @holoscript/meaning — HoloMeaning, the stratum-② meaning home of the HoloScript language.
 * docs/spec/language-architecture.md §3: defined once, imported everywhere, mirrored nowhere.
 *
 *   contract        — the resolution record, status union, gap taxonomy, structuredGap
 *   semantic        — the family IRs, recognizers (recover*), and resolvers (resolve*)
 *   beneficiary     — the beneficiary family (human-floor semantics)
 *   vibe            — the affective family
 *   affective-harm  — valence→harm derivation over beneficiary + vibe
 *
 * The verifier dispatch (gradeByResolver) and the execution VM remain in @holoscript/uaal
 * (stratum ③ + ABI), which re-exports this surface via shims for backward compatibility.
 * `check:language-strata --strict` fails any re-declaration of this surface elsewhere.
 */
export * from './contract';
export * from './semantic';
export * from './beneficiary';
export * from './vibe';
export * from './affective-harm';
