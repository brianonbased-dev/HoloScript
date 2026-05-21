/**
 * ParallelPillar — bilateral hemisphere structure for the Pillar-Slice Framework.
 *
 * The brain processes information in two hemispheres simultaneously:
 *   Left  — sequential, analytical, language, logic, detail (Broca / Wernicke)
 *   Right — spatial, holistic, pattern, social, geometry (parietal / occipital)
 *
 * A ParallelPillar pairs a LEFT and RIGHT Pillar instance.  When called, both
 * generate a slice from the same context.  Their combined output is a
 * ParallelPillarSlice — a tropical geometry bounding box defined by the two
 * 2D points (L.pos_1, L.pos_2) and (R.pos_1, R.pos_2):
 *
 *   bounds = {
 *     pos_1_min: min(L.pos_1, R.pos_1),   pos_1_max: max(L.pos_1, R.pos_1),
 *     pos_2_min: min(L.pos_2, R.pos_2),   pos_2_max: max(L.pos_2, R.pos_2),
 *   }
 *
 * The box degenerates to a point when both hemispheres agree (agreement = 1).
 * A large box signals disagreement — the agent must reconcile perspectives
 * before acting.
 *
 * Brain anatomy mapping (MNI152 x-axis convention: x > 0 = left, x < 0 = right):
 *   Left hemisphere domains  : language, compiler, accuracy_speed, economics
 *   Right hemisphere domains : physics, rendering, coordination, truth_approval,
 *                              safety_exploration
 *   Bilateral domains        : steady_state, solver, trait, storage, agent,
 *                              init, edge_case, shutdown
 *
 * Loop structure alignment (RecursiveMAS arxiv:2604.25917 dual-loop):
 *   Left  → Inner loop  (fast, detail-oriented, Domain / Layer Pillars)
 *   Right → Outer loop  (slow, holistic,         Intent / Temporal Pillars)
 *
 * Seed parallel pillars shipped here:
 *   ENERGY_ENTROPY_PARALLEL   — physics left (energy/momentum) × physics right (entropy/mass)
 *   TRUTH_PHYSICS_PARALLEL    — intent left (truth-seeking)    × physics right (conservation)
 *   TEMPORAL_LATERAL_PARALLEL — temporal left (lifecycle seq)  × temporal right (convergence)
 *
 * TraitHandler: `parallelPillarHandler`
 *   Events consumed:
 *     pillar:register_parallel  { parallel: ParallelPillar }
 *     pillar:generate_parallel  { parallel_id: string, context: PillarContext }
 *     pillar:list_parallel
 *   Events emitted:
 *     pillar:parallel_registered { id: string }
 *     pillar:parallel_slice      { slice: ParallelPillarSlice }
 *     pillar:parallel_error      { code: ParallelPillarErrorCode, message: string }
 *     pillar:parallel_registry   { parallels: ParallelPillarSummary[] }
 *
 * References:
 *   Tropical geometry — arxiv:1805.07091 (tropical convex hull ≡ bounding box)
 *   Brain lateralization — Broca 1861; Wernicke 1874; modern fMRI meta-analyses
 *   RecursiveMAS — arxiv:2604.25917 (UIUC/Stanford/NVIDIA/MIT, 2026-04)
 *   SemanticCollaborationContract — BrainCoord.mni_x sign = hemisphere tag
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { PillarDomain } from './SemanticCollaborationContract';
import type { Pillar, PillarContext } from './PillarRegistry';
import type { PillarSlice } from './SemanticCollaborationContract';
import {
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  TEMPORAL_PILLAR,
} from './PillarRegistry';

// ─────────────────────────────────────────────────────────────────────────────
// Hemisphere taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which brain hemisphere a Pillar domain is lateralised to.
 * Derives from canonical neuroanatomy:
 *   left  → MNI x > 0   (language, sequence, analysis)
 *   right → MNI x < 0   (spatial, holistic, pattern)
 *   bilateral → |MNI x| ≈ 0  (shared processing)
 */
export type Hemisphere = 'left' | 'right' | 'bilateral';

/** Canonical hemisphere assignment per PillarDomain. */
export const HEMISPHERE_MAP: Readonly<Record<PillarDomain, Hemisphere>> = {
  // Left hemisphere (sequential / analytical)
  language:         'left',
  compiler:         'left',
  accuracy_speed:   'left',
  economics:        'left',
  // Right hemisphere (spatial / holistic)
  physics:          'right',
  rendering:        'right',
  coordination:     'right',
  truth_approval:   'right',
  safety_exploration: 'right',
  // Bilateral (shared)
  steady_state:     'bilateral',
  solver:           'bilateral',
  trait:            'bilateral',
  storage:          'bilateral',
  agent:            'bilateral',
  init:             'bilateral',
  edge_case:        'bilateral',
  shutdown:         'bilateral',
};

// ─────────────────────────────────────────────────────────────────────────────
// Parallel slice — the tropical geometry bounding box
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tropical geometry bounding box produced by two parallel Pillar hemispheres.
 *
 * The box encloses the two 2D slice points in (pos_1, pos_2) space.
 * In tropical (max-plus) geometry, the tropical convex hull of two points is
 * exactly this axis-aligned bounding box (arxiv:1805.07091 §2).
 *
 * hemisphere_agreement ∈ [0, 1]:
 *   1 = both hemispheres produced identical slices (box degenerates to a point)
 *   0 = maximal divergence (box spans the full [0,1]² unit square)
 */
export interface ParallelPillarSlice {
  /** Left-hemisphere slice */
  left: PillarSlice;
  /** Right-hemisphere slice */
  right: PillarSlice;
  /** Tropical geometry bounding box */
  bounds: {
    pos_1_min: number;
    pos_1_max: number;
    pos_2_min: number;
    pos_2_max: number;
  };
  /** Area of the bounding box ∈ [0, 1] (0 = agreement, 1 = max divergence) */
  box_area: number;
  /** Agreement score ∈ [0, 1] (1 − box_area) */
  hemisphere_agreement: number;
  /** Parallel pillar identifier */
  parallel_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ParallelPillar interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ParallelPillar pairs a LEFT and RIGHT Pillar.
 * Both hemispheres run on the same PillarContext and their outputs are
 * combined into a ParallelPillarSlice bounding box.
 */
export interface ParallelPillar {
  /** Unique registry key */
  id: string;
  /** Left hemisphere Pillar (analytical, sequential) */
  left: Pillar;
  /** Right hemisphere Pillar (spatial, holistic) */
  right: Pillar;
  /**
   * Generate a ParallelPillarSlice for the given context.
   * Calls left.generate(ctx) and right.generate(ctx) in parallel and
   * computes the tropical geometry bounding box.
   */
  generateParallel(context: PillarContext): ParallelPillarSlice;
}

export interface ParallelPillarSummary {
  id: string;
  left_id: string;
  right_id: string;
  left_domain: PillarDomain;
  right_domain: PillarDomain;
}

export type ParallelPillarErrorCode =
  | 'PARALLEL_NOT_FOUND'
  | 'REGISTRY_FULL'
  | 'GENERATE_FAILED'
  | 'INVALID_PARALLEL';

// ─────────────────────────────────────────────────────────────────────────────
// Bounding-box computation
// ─────────────────────────────────────────────────────────────────────────────

/** Compute the tropical geometry bounding box from two PillarSlices. */
export function computeParallelBounds(
  left: PillarSlice,
  right: PillarSlice,
): Pick<ParallelPillarSlice, 'bounds' | 'box_area' | 'hemisphere_agreement'> {
  const pos_1_min = Math.min(left.pos_1, right.pos_1);
  const pos_1_max = Math.max(left.pos_1, right.pos_1);
  const pos_2_min = Math.min(left.pos_2, right.pos_2);
  const pos_2_max = Math.max(left.pos_2, right.pos_2);

  // Area of the bounding box in the unit square
  const width  = pos_1_max - pos_1_min;  // ∈ [0, 1]
  const height = pos_2_max - pos_2_min;  // ∈ [0, 1]
  const box_area = width * height;        // ∈ [0, 1]

  return {
    bounds: { pos_1_min, pos_1_max, pos_2_min, pos_2_max },
    box_area,
    hemisphere_agreement: 1 - box_area,
  };
}

/** Factory to create a concrete ParallelPillar from two Pillar instances. */
export function makeParallelPillar(
  id: string,
  left: Pillar,
  right: Pillar,
): ParallelPillar {
  return {
    id,
    left,
    right,
    generateParallel(context: PillarContext): ParallelPillarSlice {
      const leftSlice  = left.generate(context);
      const rightSlice = right.generate(context);
      const { bounds, box_area, hemisphere_agreement } = computeParallelBounds(leftSlice, rightSlice);
      return {
        left:  leftSlice,
        right: rightSlice,
        bounds,
        box_area,
        hemisphere_agreement,
        parallel_id: id,
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Left / Right hemisphere variants of existing seed pillars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LEFT_PHYSICS_PILLAR — energy + momentum (sequential conservation tracking).
 * Left hemisphere: analytical, counts quantities step-by-step.
 * axis_1 = energy  (primary conserved quantity)
 * axis_2 = momentum (secondary coupling)
 */
export const LEFT_PHYSICS_PILLAR: Pillar = {
  id: 'physics_conservation_left',
  domain: 'physics',
  axis_vocabulary: ['energy', 'momentum', 'charge'] as const,
  generate(context: PillarContext): PillarSlice {
    const meta = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'energy',
      axis_2_id: 'momentum',
      pos_1: meta?.energy_conservation ?? 1.0,
      pos_2: meta?.momentum_violation   ?? 0.0,
      pillar_id:     this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * RIGHT_PHYSICS_PILLAR — entropy + angular_momentum (holistic spatial pattern).
 * Right hemisphere: spatial, holistic thermodynamic overview.
 * axis_1 = entropy          (holistic disorder measure)
 * axis_2 = angular_momentum (rotational / geometric coupling)
 */
export const RIGHT_PHYSICS_PILLAR: Pillar = {
  id: 'physics_conservation_right',
  domain: 'physics',
  axis_vocabulary: ['entropy', 'angular_momentum', 'mass'] as const,
  generate(context: PillarContext): PillarSlice {
    const meta = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'entropy',
      axis_2_id: 'angular_momentum',
      pos_1: meta?.entropy_level            ?? 0.5,
      pos_2: meta?.angular_momentum_pressure ?? 0.0,
      pillar_id:     this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * LEFT_TEMPORAL_PILLAR — lifecycle phase (sequential time ordering).
 * Left hemisphere: sequential, step-by-step lifecycle tracking.
 * axis_1 = current lifecycle phase (init → steady_state → edge_case → shutdown)
 * axis_2 = phase maturity ∈ [0, 1]
 */
export const LEFT_TEMPORAL_PILLAR: Pillar = {
  id: 'temporal_lifecycle_left',
  domain: 'steady_state',
  axis_vocabulary: ['init', 'steady_state', 'edge_case', 'shutdown', 'transient'] as const,
  generate(context: PillarContext): PillarSlice {
    const meta = context.metadata as Record<string, unknown> | undefined;
    const phase   = (meta?.phase   as string | undefined) ?? 'steady_state';
    const maturity = (meta?.maturity as number | undefined) ?? 1.0;
    return {
      axis_1_id: phase,
      axis_2_id: 'transient',
      pos_1: maturity,
      pos_2: 1.0 - maturity,  // inverse of maturity = transience
      pillar_id:     this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * RIGHT_TEMPORAL_PILLAR — convergence state (holistic stability assessment).
 * Right hemisphere: holistic overview of how settled the system is.
 * axis_1 = convergence ∈ [0, 1]  (0 = new/unstable, 1 = fully converged)
 * axis_2 = steady_state indicator
 */
export const RIGHT_TEMPORAL_PILLAR: Pillar = {
  id: 'temporal_lifecycle_right',
  domain: 'steady_state',
  axis_vocabulary: ['convergence', 'steady_state', 'init'] as const,
  generate(context: PillarContext): PillarSlice {
    const meta = context.metadata as Record<string, unknown> | undefined;
    const convergence = (meta?.convergence as number | undefined) ?? 1.0;
    return {
      axis_1_id: 'convergence',
      axis_2_id: 'steady_state',
      pos_1: convergence,
      pos_2: convergence,
      pillar_id:     this.id,
      pillar_domain: this.domain,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Seed ParallelPillars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ENERGY_ENTROPY_PARALLEL
 *
 * Left  (analytical): energy conservation + momentum tracking
 * Right (holistic):   entropy + angular momentum pattern
 *
 * Box area interpretation:
 *   Small → both hemispheres agree on physical state (well-characterised)
 *   Large → left brain sees conservation while right brain sees disorder (needs reconciliation)
 */
export const ENERGY_ENTROPY_PARALLEL: ParallelPillar = makeParallelPillar(
  'energy_entropy_parallel',
  LEFT_PHYSICS_PILLAR,
  RIGHT_PHYSICS_PILLAR,
);

/**
 * TRUTH_PHYSICS_PARALLEL
 *
 * Left  (analytical): truth-seeking intent axis (is this agent truthful?)
 * Right (holistic):   physics conservation axis (is physical reality respected?)
 *
 * Together these form the Two-Axis integrity bounding box:
 *   - Agreement = both truth and physics are being honoured → small box
 *   - Divergence = agent is truthful but physics is violated (or vice versa) → large box
 *
 * Directly supports Paper 22 (Two-Axis Agent Integrity): the parallel slice
 * IS the integrity bounding box.
 */
export const TRUTH_PHYSICS_PARALLEL: ParallelPillar = makeParallelPillar(
  'truth_physics_parallel',
  INTENT_TRUTH_APPROVAL_PILLAR,   // left: analytical truth axis
  PHYSICS_CONSERVATION_PILLAR,    // right: spatial conservation axis
);

/**
 * TEMPORAL_LATERAL_PARALLEL
 *
 * Left  (sequential): lifecycle phase ordering (where am I in the timeline?)
 * Right (holistic):   convergence state (how settled is the overall system?)
 *
 * Box interpretation:
 *   Small → timeline and stability agree (system is exactly as mature as expected)
 *   Large → early in lifecycle but already converged, or late but still unstable
 */
export const TEMPORAL_LATERAL_PARALLEL: ParallelPillar = makeParallelPillar(
  'temporal_lateral_parallel',
  LEFT_TEMPORAL_PILLAR,
  RIGHT_TEMPORAL_PILLAR,
);

/** All seed ParallelPillars registered by default on attach. */
export const SEED_PARALLEL_PILLARS: readonly ParallelPillar[] = [
  ENERGY_ENTROPY_PARALLEL,
  TRUTH_PHYSICS_PARALLEL,
  TEMPORAL_LATERAL_PARALLEL,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Trait config
// ─────────────────────────────────────────────────────────────────────────────

export interface ParallelPillarConfig {
  /** Maximum number of registered ParallelPillars (default: 256) */
  max_parallel_pillars: number;
  /** Include box_area in emitted slices (default: true) */
  emit_box_area: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

interface ParallelPillarRegistryState {
  parallels: Map<string, ParallelPillar>;
  slice_count: number;
}

function extractField<T>(event: TraitEvent, key: string): T | undefined {
  const direct = (event as Record<string, unknown>)[key];
  if (direct !== undefined) return direct as T;
  return (event.payload as Record<string, unknown> | undefined)?.[key] as T | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

export const parallelPillarHandler: TraitHandler<ParallelPillarConfig> = {
  name: 'parallel_pillar',

  defaultConfig: {
    max_parallel_pillars: 256,
    emit_box_area: true,
  },

  onAttach(node: HSPlusNode, _config: ParallelPillarConfig, _context: TraitContext): void {
    const state: ParallelPillarRegistryState = {
      parallels: new Map(),
      slice_count: 0,
    };
    for (const pp of SEED_PARALLEL_PILLARS) {
      state.parallels.set(pp.id, pp);
    }
    node.__parallelPillarState = state;
  },

  onDetach(node: HSPlusNode, _config: ParallelPillarConfig, _context: TraitContext): void {
    delete node.__parallelPillarState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: ParallelPillarConfig,
    context: TraitContext,
    event: TraitEvent,
  ): void {
    const state = node.__parallelPillarState as ParallelPillarRegistryState | undefined;
    if (!state) return;

    // ── pillar:register_parallel ──────────────────────────────────────────────
    if (event.type === 'pillar:register_parallel') {
      const parallel = extractField<ParallelPillar>(event, 'parallel');
      if (!parallel?.id || !parallel.left || !parallel.right || !parallel.generateParallel) {
        context.emit?.('pillar:parallel_error', {
          code: 'INVALID_PARALLEL' as ParallelPillarErrorCode,
          message: 'pillar:register_parallel requires a valid ParallelPillar with id, left, right, generateParallel()',
        });
        return;
      }
      if (state.parallels.size >= config.max_parallel_pillars) {
        context.emit?.('pillar:parallel_error', {
          code: 'REGISTRY_FULL' as ParallelPillarErrorCode,
          message: `ParallelPillar registry is full (max=${config.max_parallel_pillars})`,
        });
        return;
      }
      state.parallels.set(parallel.id, parallel);
      context.emit?.('pillar:parallel_registered', { id: parallel.id });
      return;
    }

    // ── pillar:generate_parallel ──────────────────────────────────────────────
    if (event.type === 'pillar:generate_parallel') {
      const parallel_id = extractField<string>(event, 'parallel_id');
      const pillarContext = extractField<PillarContext>(event, 'context');

      if (!parallel_id) {
        context.emit?.('pillar:parallel_error', {
          code: 'PARALLEL_NOT_FOUND' as ParallelPillarErrorCode,
          message: 'pillar:generate_parallel requires parallel_id',
        });
        return;
      }

      const parallel = state.parallels.get(parallel_id);
      if (!parallel) {
        context.emit?.('pillar:parallel_error', {
          code: 'PARALLEL_NOT_FOUND' as ParallelPillarErrorCode,
          message: `No ParallelPillar registered with id '${parallel_id}'`,
        });
        return;
      }

      const resolvedCtx: PillarContext = pillarContext ?? {
        layer: 'default',
        agent_id: 'unknown',
        timestamp_ms: Date.now(),
      };

      let slice: ParallelPillarSlice;
      try {
        slice = parallel.generateParallel(resolvedCtx);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        context.emit?.('pillar:parallel_error', {
          code: 'GENERATE_FAILED' as ParallelPillarErrorCode,
          message: `ParallelPillar '${parallel_id}' generateParallel() threw: ${message}`,
        });
        return;
      }

      state.slice_count++;
      context.emit?.('pillar:parallel_slice', { slice });
      return;
    }

    // ── pillar:list_parallel ──────────────────────────────────────────────────
    if (event.type === 'pillar:list_parallel') {
      const summaries: ParallelPillarSummary[] = [];
      for (const [, pp] of state.parallels) {
        summaries.push({
          id:           pp.id,
          left_id:      pp.left.id,
          right_id:     pp.right.id,
          left_domain:  pp.left.domain,
          right_domain: pp.right.domain,
        });
      }
      context.emit?.('pillar:parallel_registry', { parallels: summaries });
      return;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility: hemisphere tag from MNI x-coordinate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given an MNI x-coordinate, return the corresponding hemisphere.
 * Matches the convention in SemanticCollaborationContract.BrainCoord:
 *   x > +10mm  → left
 *   x < -10mm  → right
 *   |x| ≤ 10mm → bilateral (midline)
 */
export function hemisphereFromMniX(mni_x: number): Hemisphere {
  if (mni_x >  10) return 'left';
  if (mni_x < -10) return 'right';
  return 'bilateral';
}

/**
 * Canonical MNI x-coordinate for a given hemisphere (centroid).
 *   left     → +45mm (lateral prefrontal / Broca BA44 centroid)
 *   right    → -45mm (right parietal / spatial processing centroid)
 *   bilateral → 0mm (corpus callosum midline)
 */
export function mniXForHemisphere(h: Hemisphere): number {
  if (h === 'left')     return  45;
  if (h === 'right')    return -45;
  return 0;
}
