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
 * WHAT LIVES HERE:
 *   The resolution record and its gap taxonomy — the contract every family resolver returns.
 *   Since §8.2 stage 2 (2026-07-17) the family semantics themselves (semantic / beneficiary /
 *   vibe / affective-harm) live beside it in this package; @holoscript/uaal re-exports the full
 *   surface via shims so every existing import keeps working unchanged.
 *
 * NAMING (HOLON P7 — migrate by holon, keep the prior name as a working alias):
 *   Native names are Meaning*; the grandfathered UAAL* names are exported as aliases and remain
 *   the published surface of @holoscript/uaal. New code imports the native names from here.
 */

/** The two — and only two — terminal states of a meaning resolution. A gap is a status, never a third enum. */
export type MeaningResolutionStatus = 'resolved' | 'unresolvable';

/**
 * The four generic EPISTEMIC (reducible) abstention base buckets. Each implies a *resolvable_if*: some
 * fact the IR does not yet state (a container's opacity, a norm precedence, a broken discharge cycle, a
 * supplied precondition) would collapse the gap to a definite answer. These are the four founding
 * reasons, kept intact. Family-scoped detail rides in {@link MeaningEpistemicGap}.
 */
export type MeaningEpistemicReason =
  | 'underdetermined'
  | 'unprioritized_conflict'
  | 'cyclic_dependency'
  | 'missing_precondition';

/**
 * The ALEATORIC (irreducible) abstention class. Unlike the four epistemic buckets it carries NO
 * resolvable_if: the outcome is genuinely stochastic, so no additional information collapses the gap —
 * abstaining is the calibrated terminal answer, not a placeholder for missing knowledge. Modelling a
 * genuinely random outcome as a reducible missing-info gap is a silent miscalibration in the substrate
 * everything grades against; this class exists to make that distinction typed and gradeable.
 */
export type MeaningAleatoricReason = 'irreducible_stochastic';

/**
 * Every terminal abstention reason: one of the four reducible {@link MeaningEpistemicReason} buckets, or
 * the irreducible {@link MeaningAleatoricReason}. Widened from the four founding epistemic reasons
 * (which remain intact under {@link MeaningEpistemicReason}); `structuredGap`'s `base` stays
 * epistemic-only, while the aleatoric class rides {@link MeaningAleatoricGap}.
 */
export type MeaningGapReason = MeaningEpistemicReason | MeaningAleatoricReason;

/**
 * A structured, family-scoped EPISTEMIC gap (roadmap Wave 0.2). The coarse `reason` (one of the four
 * base buckets) stays for backward compatibility; `gap` additionally carries the FAMILY-SCOPED code
 * plus a pointer to the offending atom, so a gap corpus can teach WHY the abstention fired
 * ('affordance.unstated_precondition') and not merely THAT it did ('missing_precondition'). Collapsing
 * every family's honesty failure into one opaque base bucket is itself a form of confabulation.
 *
 * The presence of `base` (a reducible bucket) is the type-level marker that this gap is EPISTEMIC —
 * some stated fact would resolve it. The aleatoric class ({@link MeaningAleatoricGap}) structurally
 * omits `base` precisely because no such fact exists.
 */
export interface MeaningEpistemicGap {
  /** Family-scoped code, e.g. 'affordance.unstated_precondition' | 'beneficiary.unstated_impact'. */
  code: string;
  /** The semantic family that produced the abstention. */
  family: string;
  /** Which of the four reducible base buckets this maps to (keeps `reason` and `gap` consistent). */
  base: MeaningEpistemicReason;
  /** Discriminant: an epistemic gap is never aleatoric. Optional/absent, so existing literals stay valid. */
  aleatoric?: false;
  /** Optional pointer to the missing/conflicting atom (an id or a short description). */
  evidence?: string;
}

/**
 * A structured, family-scoped ALEATORIC gap. The outcome is irreducibly stochastic, so this gap
 * structurally carries NO epistemic `base` bucket (`base?: undefined`) — there is no resolvable_if to
 * name. The `aleatoric: true` discriminant lets a grader tell a genuinely-random abstention apart from
 * a missing-info one without inspecting the family code, and `reason` is always the single aleatoric
 * class. This is the type-level guarantee that a stochastic outcome can never be mis-recorded as a
 * reducible missing-precondition/underdetermined gap.
 */
export interface MeaningAleatoricGap {
  /** Family-scoped code, e.g. 'counterfactual.irreducible_chance'. */
  code: string;
  /** The semantic family that produced the abstention. */
  family: string;
  /** Discriminant: this gap is irreducibly stochastic (aleatoric), not a reducible epistemic gap. */
  aleatoric: true;
  /** Always the single aleatoric class; distinct from the four epistemic base buckets. */
  reason: MeaningAleatoricReason;
  /** Structurally absent — an aleatoric gap cannot be reduced to an epistemic base bucket. */
  base?: undefined;
  /** Optional pointer to the stochastic atom (an id or a short description). */
  evidence?: string;
}

/**
 * A structured, family-scoped gap: either an EPISTEMIC (reducible) gap that names a resolvable_if via
 * its `base` bucket, or an ALEATORIC (irreducible) gap that structurally carries none. The union is
 * discriminated by the `aleatoric` flag; `.base` reads as `MeaningEpistemicReason | undefined` on the
 * union, so every existing reader keeps compiling.
 */
export type MeaningStructuredGap = MeaningEpistemicGap | MeaningAleatoricGap;

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

/** Construct an EPISTEMIC structured gap and its coarse base bucket together, so they can never disagree. */
export function structuredGap(
  family: string,
  code: string,
  base: MeaningEpistemicReason,
  evidence?: string,
): MeaningEpistemicGap {
  return { code, family, base, ...(evidence !== undefined ? { evidence } : {}) };
}

/**
 * Construct an ALEATORIC structured gap — the outcome is irreducibly stochastic. Carries the
 * `aleatoric: true` discriminant and the single aleatoric reason, and (by construction) NO epistemic
 * `base` bucket, so a random outcome can never be recorded as a reducible missing-info gap.
 */
export function aleatoricGap(family: string, code: string, evidence?: string): MeaningAleatoricGap {
  return {
    code,
    family,
    aleatoric: true,
    reason: 'irreducible_stochastic',
    ...(evidence !== undefined ? { evidence } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------
// Grandfathered aliases (HOLON P7). These are the names the published @holoscript/uaal surface and
// its downstream consumers (gradeByResolver, corpora, GRPO rewards) already use; @holoscript/uaal
// re-exports them from here so the definition exists exactly once. New code uses the Meaning* names.
// ---------------------------------------------------------------------------------------------------
export type UAALGapReason = MeaningGapReason;
export type UAALEpistemicReason = MeaningEpistemicReason;
export type UAALAleatoricReason = MeaningAleatoricReason;
export type UAALStructuredGap = MeaningStructuredGap;
export type UAALEpistemicGap = MeaningEpistemicGap;
export type UAALAleatoricGap = MeaningAleatoricGap;
export type UAALResolution<A = unknown> = MeaningResolution<A>;
