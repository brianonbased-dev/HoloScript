/**
 * Pillar-Slice Framework — barrel export.
 *
 * Exports the complete pillar layer as a single import surface:
 *   import { pillarJepaHandler, parallelPillarHandler, ... } from '@holoscript/core/traits/pillar';
 *
 * Layer structure:
 *   SemanticCollaborationContract  — message protocol + PillarSlice type
 *   PillarRegistry                 — single Pillars + seed registry
 *   ParallelPillar                 — bilateral hemisphere pairs + bounding box
 *   PillarJEPA                     — JEPA world-model objective with physics priors
 *   SliceEmitter                   — GRPO reward signal emission
 *   LatentIntegrityLayer           — Byzantine + sycophancy detectors
 *   RecursiveLinkTrait             — latent inter-agent communication (RecursiveMAS port)
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  PillarSlice,
  PillarDomain,
  BrainCoord,
  ReceiptAnchor,
  CRDTDelta,
  TaskState,
  ProvenanceAttestation,
  SemanticCollaborationMessage,
  IntegrityFailReason,
  SemanticCollabConfig,
} from './SemanticCollaborationContract';

export { semanticCollabHandler, createSemanticMessage } from './SemanticCollaborationContract';

// ── Single Pillars ─────────────────────────────────────────────────────────────
export type {
  PillarContext,
  Pillar,
  PillarSummary,
  PillarErrorCode,
  PillarRegistryConfig,
} from './PillarRegistry';

export {
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  TEMPORAL_PILLAR,
  SEED_PILLARS,
  pillarRegistryHandler,
  getPillarSliceStats,
} from './PillarRegistry';

// Also re-export PillarDomain + PillarSlice from PillarRegistry for consumers
// that historically imported from there
export type { PillarDomain as PillarDomainAlias, PillarSlice as PillarSliceAlias } from './PillarRegistry';

// ── Parallel / Bilateral Pillars ───────────────────────────────────────────────
export type {
  Hemisphere,
  ParallelPillarSlice,
  ParallelPillar,
  ParallelPillarSummary,
  ParallelPillarErrorCode,
  ParallelPillarConfig,
} from './ParallelPillar';

export {
  HEMISPHERE_MAP,
  computeParallelBounds,
  makeParallelPillar,
  hemisphereFromMniX,
  mniXForHemisphere,
  LEFT_PHYSICS_PILLAR,
  RIGHT_PHYSICS_PILLAR,
  LEFT_TEMPORAL_PILLAR,
  RIGHT_TEMPORAL_PILLAR,
  ENERGY_ENTROPY_PARALLEL,
  TRUTH_PHYSICS_PARALLEL,
  TEMPORAL_LATERAL_PARALLEL,
  SEED_PARALLEL_PILLARS,
  parallelPillarHandler,
} from './ParallelPillar';

// ── PillarJEPA ─────────────────────────────────────────────────────────────────
export type {
  PillarJEPAConfig,
  PillarJEPALoss,
  PillarJEPAError,
  PillarJEPAErrorCode,
} from './PillarJEPA';

export { pillarJepaHandler } from './PillarJEPA';

// ── SliceEmitter ───────────────────────────────────────────────────────────────
export { sliceEmitterHandler } from './SliceEmitter';

// ── Latent Integrity Layer ─────────────────────────────────────────────────────
export {
  LatentByzantineDetector,
  LatentSycophancyProbe,
  createLatentIntegrityLayer,
} from './LatentIntegrityLayer';

export type {
  LatentByzantineConfig,
  ByzantineAnomalyResult,
  LatentSycophancyConfig,
  SycophancyDriftResult,
  LatentIntegrityLayerConfig,
} from './LatentIntegrityLayer';

// ── RecursiveLinkTrait ────────────────────────────────────────────────────────
export type {
  RecursiveLinkMessage,
  RecursiveLinkConfig,
} from './RecursiveLinkTrait';

export { recursiveLinkHandler } from './RecursiveLinkTrait';

// ── CognitiveVMTrait — uAAL runtime ───────────────────────────────────────────
export type {
  LifecycleState,
  CognitiveVMBehaviour,
  CognitiveVMConfig,
  CognitiveVMSnapshot,
  DispatchHandler,
} from './CognitiveVMTrait';

export {
  cognitiveVMHandler,
  getCognitiveVMSnapshot,
} from './CognitiveVMTrait';
