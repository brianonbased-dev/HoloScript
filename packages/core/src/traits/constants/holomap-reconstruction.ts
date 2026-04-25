/**
 * HoloMap — native WebGPU reconstruction trait family (Sprint 1 stubs).
 *
 * Declares HoloScript-owned reconstruction sessions (vs platform `scene_reconstruction`).
 * See `packages/core/src/reconstruction/RFC-HoloMap.md`.
 *
 * Sprint 3 (2026-04-25) added decorator-to-trait resolution: composition-level
 * `@<decorator>` syntax sugar that resolves to one or more underlying traits at
 * parse time. Decorators are the user-facing API; traits are the runtime contract.
 * This split mirrors the `@npc` / `@llm_agent` decorator pattern used elsewhere
 * in the program (see paper-2 `\subsubsection{Embodied AI Agent}` for the
 * pattern's empirical use case).
 */

export const HOLOMAP_RECONSTRUCTION_TRAITS = [
  'holomap_reconstruct',
  'holomap_camera_trajectory',
  'holomap_anchor_context',
  'holomap_drift_correction',
  'holomap_splat_output',
] as const;

export type HolomapReconstructionTraitName = (typeof HOLOMAP_RECONSTRUCTION_TRAITS)[number];

// ---------------------------------------------------------------------------
// Sprint 3 — Decorator-to-trait mapping
// ---------------------------------------------------------------------------

/**
 * Decorator names users write in `.holo` compositions. Each decorator resolves
 * to one or more underlying HoloMap traits via {@link HOLOMAP_RECONSTRUCTION_DECORATORS}.
 *
 * The mapping is intentionally *additive* — applying multiple decorators to the
 * same node unions their resolved traits via `getReconstructionTraitsFromDecorators`.
 */
export const HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES = [
  'reconstruction_source',
  'acceptance_video',
  'drift_corrected',
] as const;

export type HolomapReconstructionDecoratorName =
  (typeof HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES)[number];

/**
 * Decorator → underlying-trait list mapping.
 *
 * - `reconstruction_source`: declares a full reconstruction-pipeline input (video
 *   stream that feeds frames through the runtime). Resolves to the trio of
 *   reconstruct + trajectory + anchor-context traits because a source needs all
 *   three to be a complete reconstruction session.
 * - `acceptance_video`: declares an acceptance-validated reconstruction (the
 *   video and splat output are linked, e.g. for replay/regression-fingerprinting
 *   in CI). Resolves to reconstruct + splat-output traits.
 * - `drift_corrected`: declares that drift correction has been applied to the
 *   trajectory. Resolves to the single drift-correction trait (composes with
 *   any other decorators applied to the same node).
 */
export const HOLOMAP_RECONSTRUCTION_DECORATORS: Readonly<
  Record<HolomapReconstructionDecoratorName, readonly HolomapReconstructionTraitName[]>
> = Object.freeze({
  reconstruction_source: [
    'holomap_reconstruct',
    'holomap_camera_trajectory',
    'holomap_anchor_context',
  ],
  acceptance_video: ['holomap_reconstruct', 'holomap_splat_output'],
  drift_corrected: ['holomap_drift_correction'],
});

/**
 * Predicate: is the given decorator name a HoloMap reconstruction decorator?
 *
 * Parsers accept decorators with or without leading `@` — strip before testing.
 */
export function isReconstructionDecorator(
  name: string
): name is HolomapReconstructionDecoratorName {
  const stripped = name.startsWith('@') ? name.slice(1) : name;
  return (HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES as readonly string[]).includes(stripped);
}

/**
 * Resolver: given a list of decorator names, return the unioned set of
 * underlying HoloMap traits in the original decorator order.
 *
 * Unknown decorators are silently skipped (they may belong to other trait
 * families or be Sprint-N decorators not yet shipped). Caller is responsible
 * for filtering with {@link isReconstructionDecorator} first if strict
 * "is-this-only-HoloMap" semantics are required.
 *
 * Returned traits are deduplicated while preserving first-seen order, so a
 * caller emitting trait metadata gets a stable order regardless of decorator
 * application order.
 *
 * @example
 *   getReconstructionTraitsFromDecorators(['reconstruction_source', 'drift_corrected'])
 *   // returns ['holomap_reconstruct', 'holomap_camera_trajectory',
 *   //          'holomap_anchor_context', 'holomap_drift_correction']
 */
export function getReconstructionTraitsFromDecorators(
  decoratorNames: readonly string[]
): HolomapReconstructionTraitName[] {
  const seen = new Set<HolomapReconstructionTraitName>();
  const out: HolomapReconstructionTraitName[] = [];
  for (const raw of decoratorNames) {
    const stripped = raw.startsWith('@') ? raw.slice(1) : raw;
    if (!isReconstructionDecorator(stripped)) continue;
    for (const trait of HOLOMAP_RECONSTRUCTION_DECORATORS[stripped]) {
      if (seen.has(trait)) continue;
      seen.add(trait);
      out.push(trait);
    }
  }
  return out;
}
