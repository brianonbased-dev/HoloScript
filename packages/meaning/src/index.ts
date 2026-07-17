/**
 * @holoscript/meaning — HoloMeaning, the stratum-② meaning contract of the HoloScript language.
 *
 * WHY THIS PACKAGE EXISTS (language stratum taxonomy, docs/spec/language-architecture.md §3):
 *   The meaning stratum is defined ONCE, in one upstream home, and IMPORTED by everything that
 *   reads or writes meaning — the compiler (packages/core), the reward layer (absorb-service),
 *   the corpus graders, and the VMs (packages/uaal, packages/holo-vm). It is mirrored nowhere.
 *   Before this package, the resolution record was defined in packages/uaal and structurally
 *   re-declared in core (HSICausalLoop) and absorb-service (UAALResolutionRewards) because core
 *   may not depend on packages/uaal. Those mirrors were the language-design loop's debt; the
 *   `check:language-strata` gate now fails any re-declaration outside the canonical homes.
 *
 * WHAT LIVES HERE (stage 1 — the contract; language-architecture.md §8.2):
 *   The resolution record and its gap taxonomy. Stage 2 moves the family semantics (`resolve*`
 *   bodies) here as well; until then packages/uaal/src remains the resolver home and re-exports
 *   this contract so every existing `@holoscript/uaal` import keeps working unchanged.
 *
 * NAMING (HOLON P7 — migrate by holon, keep the prior name as a working alias):
 *   Native names are Meaning*; the grandfathered UAAL* names are exported as aliases and remain
 *   the published surface of @holoscript/uaal. New code imports the native names from here.
 */

/** The two — and only two — terminal states of a meaning resolution. A gap is a status, never a third enum. */
export type MeaningResolutionStatus = 'resolved' | 'unresolvable';

/** The four generic abstention base buckets. Family-scoped detail rides in {@link MeaningStructuredGap}. */
export type MeaningGapReason =
  | 'underdetermined'
  | 'unprioritized_conflict'
  | 'cyclic_dependency'
  | 'missing_precondition';

/**
 * A structured, family-scoped gap reason (roadmap Wave 0.2). The coarse `reason` (one of the four
 * base buckets) stays for backward compatibility; `gap` additionally carries the FAMILY-SCOPED code
 * plus a pointer to the offending atom, so a gap corpus can teach WHY the abstention fired
 * ('affordance.unstated_precondition') and not merely THAT it did ('missing_precondition'). Collapsing
 * every family's honesty failure into one opaque base bucket is itself a form of confabulation.
 */
export interface MeaningStructuredGap {
  /** Family-scoped code, e.g. 'affordance.unstated_precondition' | 'beneficiary.unstated_impact'. */
  code: string;
  /** The semantic family that produced the abstention. */
  family: string;
  /** Which of the four generic base buckets this maps to (keeps `reason` and `gap` consistent). */
  base: MeaningGapReason;
  /** Optional pointer to the missing/conflicting atom (an id or a short description). */
  evidence?: string;
}

/**
 * The canonical resolution record: a committed answer, or an honest abstention with a typed reason.
 * Every resolver, grader, reward term, and runtime gate reads and writes THIS shape — one definition.
 */
export interface MeaningResolution<A = unknown> {
  query: string;
  status: MeaningResolutionStatus;
  answer?: A;
  reason?: MeaningGapReason;
  /** Structured, family-scoped reason. Present when status==='unresolvable' on an upgraded resolver. */
  gap?: MeaningStructuredGap;
  obstruction?: string;
}

/** Construct a structured gap and its coarse base bucket together, so they can never disagree. */
export function structuredGap(
  family: string,
  code: string,
  base: MeaningGapReason,
  evidence?: string,
): MeaningStructuredGap {
  return { code, family, base, ...(evidence !== undefined ? { evidence } : {}) };
}

// ---------------------------------------------------------------------------------------------------
// Grandfathered aliases (HOLON P7). These are the names the published @holoscript/uaal surface and
// its downstream consumers (gradeByResolver, corpora, GRPO rewards) already use; @holoscript/uaal
// re-exports them from here so the definition exists exactly once. New code uses the Meaning* names.
// ---------------------------------------------------------------------------------------------------
export type UAALGapReason = MeaningGapReason;
export type UAALStructuredGap = MeaningStructuredGap;
export type UAALResolution<A = unknown> = MeaningResolution<A>;
