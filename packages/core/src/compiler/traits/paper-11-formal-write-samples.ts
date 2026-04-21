/**
 * Incremental formal **property-write** samples for paper-11 (HS+ ECOOP).
 *
 * The shipped trait tree has thousands of handlers; this module anchors the
 * annotation model with a growing, reviewable subset. Each entry lists logical
 * property keys a trait implementation may write during composition / tick.
 *
 * @see packages/core/src/compiler/__tests__/paper-11-imperative-baseline.bench.test.ts
 */

export interface FormalTraitWrites {
  readonly trait: string;
  /** Dot-path style keys relative to handler state / ECS binding surface. */
  readonly writes: readonly string[];
}

/**
 * Curated batch (expand via PRs). Not exhaustive — targets paper-11 limitation text.
 */
export const PAPER11_FORMAL_WRITE_SAMPLES: readonly FormalTraitWrites[] = [
  { trait: 'gaussian_splat', writes: ['splatCount', 'visibleSplats', 'gaussianBudgetUsed', 'needsSort'] },
  { trait: 'grabbable', writes: ['grabState', 'constraintHandle', 'lastInteractorId'] },
  { trait: 'rigid_body', writes: ['linearVelocity', 'angularVelocity', 'sleeping'] },
  { trait: 'animation_graph', writes: ['activeState', 'blendWeights', 'normalizedTime'] },
  { trait: 'networked', writes: ['replicaId', 'lastSeq', 'ownershipEpoch'] },
  { trait: 'audio_source', writes: ['playheadSec', 'gainDb', 'spatialBlend'] },
  { trait: 'ui_button', writes: ['hovered', 'pressed', 'focusToken'] },
  { trait: 'nav_mesh_agent', writes: ['pathVersion', 'cornerIndex', 'desiredVelocity'] },
  { trait: 'particle_system', writes: ['aliveCount', 'emitterSeed', 'boundsHash'] },
  { trait: 'skinning', writes: ['bonePaletteVersion', 'morphWeightInfluence'] },
  { trait: 'reflection_probe', writes: ['convolutionMip', 'captureDirty'] },
  { trait: 'destruction', writes: ['fractureSeed', 'chunkLodMask'] },
  { trait: 'rope', writes: ['segmentStrain', 'solverIterationsUsed'] },
  { trait: 'cloth', writes: ['solverResidual', 'windPhase'] },
  { trait: 'inventory', writes: ['slots', 'equipPointer', 'weightKg'] },
  { trait: 'dialogue', writes: ['cutsceneToken', 'barkCooldownLeft'] },
  { trait: 'consensus', writes: ['ballotEpoch', 'commitProof'] },
  { trait: 'haptics', writes: ['motorEnvelope', 'thermalEstimate'] },
  { trait: 'eye_tracking', writes: ['calibrationId', 'gazeQuality'] },
  { trait: 'hand_tracking', writes: ['jointConfidence', 'predictedGrip'] },
  { trait: 'passthrough', writes: ['exposureComp', 'privacyRedactRegions'] },
  { trait: 'geospatial_anchor', writes: ['enuHint', 'accuracyMeters'] },
  { trait: 'marketplace', writes: ['listingHash', 'checkoutState'] },
] as const;

export const PAPER11_FORMAL_WRITE_SAMPLE_COUNT = PAPER11_FORMAL_WRITE_SAMPLES.length;
