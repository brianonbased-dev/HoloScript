/**
 * PillarRegistry — v1.0
 *
 * Catalogue of all Pillars used in the uAAL Cognitive VM.
 *
 * A Pillar is a function P: context → (axis_1_id, axis_2_id, pos_1, pos_2,
 * pillar_id, pillar_domain).  The registry holds named Pillars and dispatches
 * slice requests to the matching implementation.
 *
 * Three seed Pillars are shipped in this module:
 *   PHYSICS_CONSERVATION_PILLAR  — conservation law axes
 *   INTENT_TRUTH_APPROVAL_PILLAR — sycophancy probe axis (Two-Axis integrity,
 *                                   W.617 + P.620.02)
 *   TEMPORAL_PILLAR              — runtime lifecycle axes
 *
 * TraitHandler
 * ────────────
 * `pillarRegistryHandler` registers Pillars and services slice requests.
 *
 * Events consumed:
 *   pillar:register  { pillar: Pillar }
 *   pillar:generate  { pillar_id: string, context: PillarContext }
 *   pillar:list
 *
 * Events emitted:
 *   pillar:registered   { id: string, domain: PillarDomain }
 *   pillar:slice        { slice: PillarSlice }
 *   pillar:error        { code: PillarErrorCode, message: string }
 *   pillar:registry     { pillars: Array<PillarSummary> }
 *
 * References:
 *   Pillar-Slice Framework — research/2026-05-20_paper26-pillar-slice-scope.md
 *   RecursiveMAS           — arxiv:2604.25917 (2026-04-28)
 *   Tropical geometry      — arxiv:1805.07091, arxiv:2403.11871
 *   Sycophancy axis        — W.617, research/2026-05-20_griffiths-cognitive-science-ai-critique.md
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { PillarDomain, PillarSlice } from './SemanticCollaborationContract';

// Re-export for consumers that import PillarSlice / PillarDomain from PillarRegistry
export type { PillarDomain, PillarSlice };

// ─────────────────────────────────────────────────────────────────────────────
// Core domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execution context supplied to Pillar.generate().
 * Describes which agent on which layer is requesting a slice.
 */
export interface PillarContext {
  /** Which runtime layer is requesting (e.g. 'inner_loop', 'outer_loop', 'audit') */
  layer: string;
  /** Requesting agent surface ID (e.g. 'claude1', 'cursor1') */
  agent_id: string;
  /**
   * Unified participant identity spine (wallet-level) shared across D.040 populations.
   * HoloMesh agents and HoloLand NPCs that belong to the same logical participant
   * MUST share this (derived from wallet). This is the smallest contract to close
   * the current npcId vs agentId gap while keeping the shared trait stack.
   */
  participant_id?: string;
  /** Unix timestamp of the request */
  timestamp_ms: number;
  /** Arbitrary additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A named Pillar implementation.
 *
 * Pillars are the core generators of the Pillar-Slice Framework:
 * given a PillarContext, they return a 4-tuple slice that configures
 * the current runtime layer of the uAAL Cognitive VM.
 */
export interface Pillar {
  /** Unique registry key */
  id: string;
  /** Domain category (maps to PillarDomain taxonomy) */
  domain: PillarDomain;
  /**
   * Complete vocabulary of valid axis_id values for this Pillar.
   * axis_1_id and axis_2_id in generated slices MUST come from this list.
   */
  axis_vocabulary: readonly string[];
  /**
   * Generate a PillarSlice for the given context.
   * Implementations MUST return axis IDs drawn from axis_vocabulary.
   */
  generate(context: PillarContext): PillarSlice;
}

/** Compact summary used in pillar:registry responses */
export interface PillarSummary {
  id: string;
  domain: PillarDomain;
  axis_vocabulary: readonly string[];
}

/** Error codes for pillar:error events */
export type PillarErrorCode =
  | 'PILLAR_NOT_FOUND'
  | 'REGISTRY_FULL'
  | 'INVALID_AXIS'
  | 'GENERATE_FAILED';

// ─────────────────────────────────────────────────────────────────────────────
// Trait config
// ─────────────────────────────────────────────────────────────────────────────

export interface PillarRegistryConfig {
  /** Maximum number of registered Pillars (default: 512) */
  max_pillars: number;
  /** Track unique PillarSlice fingerprints for diversity monitoring */
  enable_diversity_tracking: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed Pillars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PHYSICS_CONSERVATION_PILLAR
 *
 * Axes drawn from fundamental conservation laws.  Slices map runtime state to
 * a point in the conservation-law manifold (tropical geometry cell,
 * arxiv:1805.07091 §4).
 *
 * axis_1 = primary conserved quantity being tracked
 * axis_2 = secondary conserved quantity (constraint or coupling)
 * pos_1  = normalised current value ∈ [0, 1]   (0 = depleted, 1 = fully conserved)
 * pos_2  = violation pressure ∈ [0, 1]         (0 = no violation, 1 = hard violation)
 */
export const PHYSICS_CONSERVATION_PILLAR: Pillar = {
  id: 'physics_conservation',
  domain: 'physics',
  axis_vocabulary: [
    'energy',
    'momentum',
    'angular_momentum',
    'entropy',
    'charge',
    'mass',
  ] as const,
  generate(context: PillarContext): PillarSlice {
    // Default slice: energy-momentum coupling, fully conserved, no violation.
    // Production implementations replace this with solver telemetry.
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'energy',
      axis_2_id: 'momentum',
      pos_1: metadata?.energy_conservation ?? 1.0,
      pos_2: metadata?.momentum_violation ?? 0.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * INTENT_TRUTH_APPROVAL_PILLAR
 *
 * Sycophancy detection axis (P.620.02 contradictory probe, W.617).
 * Maps each inter-agent message to a truth–approval coordinate.
 *
 * axis_1 = truth_seeking  — pos_1 ∈ [0, 1]: 1 = fully truth-directed
 * axis_2 = approval_seeking — pos_2 ∈ [0, 1]: 1 = fully approval-seeking
 *
 * Healthy agents cluster near (pos_1 ≈ 1, pos_2 ≈ 0).
 * Sycophantic drift: pos_2 rises, pos_1 falls.  centroid_drift check in
 * SemanticCollaborationContract fires when centroid[3] exceeds threshold.
 */
export const INTENT_TRUTH_APPROVAL_PILLAR: Pillar = {
  id: 'intent_truth_approval',
  domain: 'truth_approval',
  axis_vocabulary: ['truth_seeking', 'approval_seeking'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'truth_seeking',
      axis_2_id: 'approval_seeking',
      pos_1: metadata?.truth_score ?? 1.0,
      pos_2: metadata?.approval_pressure ?? 0.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * TEMPORAL_PILLAR
 *
 * Runtime lifecycle axes.  Maps the current execution phase to a coordinate
 * pair describing the lifecycle stage and its stability.
 *
 * axis_1 = lifecycle phase (init → steady_state → edge_case → shutdown …)
 * axis_2 = transient / convergence state
 * pos_1  ∈ [0, 1]: 0 = phase just entered, 1 = phase fully established
 * pos_2  ∈ [0, 1]: 0 = maximum transient, 1 = fully converged
 */
export const TEMPORAL_PILLAR: Pillar = {
  id: 'temporal_lifecycle',
  domain: 'steady_state',
  axis_vocabulary: [
    'init',
    'steady_state',
    'edge_case',
    'shutdown',
    'transient',
    'convergence',
  ] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, unknown> | undefined;
    const phase = (metadata?.phase as string | undefined) ?? 'steady_state';
    const maturity = (metadata?.maturity as number | undefined) ?? 1.0;
    const convergence = (metadata?.convergence as number | undefined) ?? 1.0;
    return {
      axis_1_id: phase,
      axis_2_id: 'convergence',
      pos_1: maturity,
      pos_2: convergence,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * RENDERING_LOD_PILLAR
 *
 * Level-of-detail rendering axes. Maps the current scene rendering state to
 * a coordinate pair describing LOD quality and detail budget utilisation.
 *
 * axis_1 = lod_level   — pos_1 ∈ [0, 1]: 0 = lowest quality, 1 = highest quality
 * axis_2 = detail_budget — pos_2 ∈ [0, 1]: 0 = budget empty, 1 = full budget available
 */
export const RENDERING_LOD_PILLAR: Pillar = {
  id: 'rendering_lod',
  domain: 'rendering',
  axis_vocabulary: ['lod_level', 'detail_budget'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'lod_level',
      axis_2_id: 'detail_budget',
      pos_1: metadata?.lod_level ?? 0.5,
      pos_2: metadata?.detail_budget ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * AGENT_GOAL_PILLAR
 *
 * Agent goal priority axes. Maps the agent's current goal state to a coordinate
 * pair describing urgency and autonomy level.
 *
 * axis_1 = goal_priority  — pos_1 ∈ [0, 1]: 0 = low urgency, 1 = critical urgency
 * axis_2 = autonomy_level — pos_2 ∈ [0, 1]: 0 = fully supervised, 1 = fully autonomous
 */
export const AGENT_GOAL_PILLAR: Pillar = {
  id: 'agent_goal',
  domain: 'agent',
  axis_vocabulary: ['goal_priority', 'autonomy_level'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'goal_priority',
      axis_2_id: 'autonomy_level',
      pos_1: metadata?.goal_priority ?? 0.5,
      pos_2: metadata?.autonomy_level ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * LANGUAGE_CONTEXT_PILLAR
 *
 * Language context axes. Maps the current LLM session state to a coordinate
 * pair describing context window fullness and token budget utilisation.
 *
 * axis_1 = context_window — pos_1 ∈ [0, 1]: 0 = empty context, 1 = context full
 * axis_2 = token_budget   — pos_2 ∈ [0, 1]: 0 = budget exhausted, 1 = full budget
 */
export const LANGUAGE_CONTEXT_PILLAR: Pillar = {
  id: 'language_context',
  domain: 'language',
  axis_vocabulary: ['context_window', 'token_budget'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'context_window',
      axis_2_id: 'token_budget',
      pos_1: metadata?.context_window ?? 0.5,
      pos_2: metadata?.token_budget ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * ECONOMICS_BUDGET_PILLAR
 *
 * Economics budget axes. Maps the current economic state to a coordinate pair
 * describing cost efficiency and reward pressure.
 *
 * axis_1 = cost_efficiency  — pos_1 ∈ [0, 1]: 0 = highly inefficient, 1 = maximally efficient
 * axis_2 = reward_pressure  — pos_2 ∈ [0, 1]: 0 = no pressure, 1 = maximum pressure
 */
export const ECONOMICS_BUDGET_PILLAR: Pillar = {
  id: 'economics_budget',
  domain: 'economics',
  axis_vocabulary: ['cost_efficiency', 'reward_pressure'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'cost_efficiency',
      axis_2_id: 'reward_pressure',
      pos_1: metadata?.cost_efficiency ?? 0.5,
      pos_2: metadata?.reward_pressure ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * COMPILER_PIPELINE_PILLAR
 *
 * Compiler pipeline axes. Maps the current compilation state to a coordinate
 * pair describing optimisation level and target fidelity.
 *
 * axis_1 = optimization_level — pos_1 ∈ [0, 1]: 0 = no optimisation, 1 = maximum
 * axis_2 = target_fidelity    — pos_2 ∈ [0, 1]: 0 = lossy output, 1 = exact fidelity
 */
export const COMPILER_PIPELINE_PILLAR: Pillar = {
  id: 'compiler_pipeline',
  domain: 'compiler',
  axis_vocabulary: ['optimization_level', 'target_fidelity'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'optimization_level',
      axis_2_id: 'target_fidelity',
      pos_1: metadata?.optimization_level ?? 0.5,
      pos_2: metadata?.target_fidelity ?? 1.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * SOLVER_PRECISION_PILLAR
 *
 * Solver precision axes. Maps the current solver state to a coordinate pair
 * describing numerical precision and iteration budget.
 *
 * axis_1 = precision_level   — pos_1 ∈ [0, 1]: 0 = coarse, 1 = maximum precision
 * axis_2 = iteration_budget  — pos_2 ∈ [0, 1]: 0 = budget exhausted, 1 = full budget
 */
export const SOLVER_PRECISION_PILLAR: Pillar = {
  id: 'solver_precision',
  domain: 'solver',
  axis_vocabulary: ['precision_level', 'iteration_budget'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'precision_level',
      axis_2_id: 'iteration_budget',
      pos_1: metadata?.precision_level ?? 0.5,
      pos_2: metadata?.iteration_budget ?? 1.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * TRAIT_COMPOSITION_PILLAR
 *
 * Trait composition axes. Maps the current trait load to a coordinate pair
 * describing trait density (normalised count) and memory pressure.
 *
 * axis_1 = trait_density    — pos_1 ∈ [0, 1]: 0 = no traits loaded, 1 = at capacity
 * axis_2 = memory_pressure  — pos_2 ∈ [0, 1]: 0 = no memory pressure, 1 = critical
 */
export const TRAIT_COMPOSITION_PILLAR: Pillar = {
  id: 'trait_composition',
  domain: 'trait',
  axis_vocabulary: ['trait_density', 'memory_pressure'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'trait_density',
      axis_2_id: 'memory_pressure',
      pos_1: metadata?.trait_density ?? 0.5,
      pos_2: metadata?.memory_pressure ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * COORDINATION_SYNC_PILLAR
 *
 * Coordination synchronisation axes. Maps the current multi-agent sync state
 * to a coordinate pair describing sync strength and latency normalised value.
 *
 * axis_1 = sync_strength   — pos_1 ∈ [0, 1]: 0 = fully desynchronised, 1 = tight sync
 * axis_2 = latency_budget  — pos_2 ∈ [0, 1]: 0 = latency exceeded, 1 = within budget
 */
export const COORDINATION_SYNC_PILLAR: Pillar = {
  id: 'coordination_sync',
  domain: 'coordination',
  axis_vocabulary: ['sync_strength', 'latency_budget'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'sync_strength',
      axis_2_id: 'latency_budget',
      pos_1: metadata?.sync_strength ?? 1.0,
      pos_2: metadata?.latency_budget ?? 1.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * STORAGE_CAPACITY_PILLAR
 *
 * Storage capacity axes. Maps the current storage state to a coordinate pair
 * describing capacity fraction used and retrieval speed.
 *
 * axis_1 = capacity_used    — pos_1 ∈ [0, 1]: 0 = empty, 1 = full
 * axis_2 = retrieval_speed  — pos_2 ∈ [0, 1]: 0 = slowest, 1 = fastest
 */
export const STORAGE_CAPACITY_PILLAR: Pillar = {
  id: 'storage_capacity',
  domain: 'storage',
  axis_vocabulary: ['capacity_used', 'retrieval_speed'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'capacity_used',
      axis_2_id: 'retrieval_speed',
      pos_1: metadata?.capacity_used ?? 0.5,
      pos_2: metadata?.retrieval_speed ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * ACCURACY_SPEED_PILLAR
 *
 * Accuracy-speed tradeoff axes. Maps the current inference regime to a
 * coordinate pair describing accuracy level and speed pressure.
 *
 * axis_1 = accuracy_level  — pos_1 ∈ [0, 1]: 0 = approximate, 1 = exact
 * axis_2 = speed_pressure  — pos_2 ∈ [0, 1]: 0 = no latency constraint, 1 = hard deadline
 */
export const ACCURACY_SPEED_PILLAR: Pillar = {
  id: 'accuracy_speed_tradeoff',
  domain: 'accuracy_speed',
  axis_vocabulary: ['accuracy_level', 'speed_pressure'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'accuracy_level',
      axis_2_id: 'speed_pressure',
      pos_1: metadata?.accuracy_level ?? 0.5,
      pos_2: metadata?.speed_pressure ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * SAFETY_EXPLORATION_PILLAR
 *
 * Safety-exploration balance axes. Maps the current exploration policy to a
 * coordinate pair describing safety level and exploration rate.
 *
 * axis_1 = safety_level      — pos_1 ∈ [0, 1]: 0 = unsafe, 1 = maximally safe
 * axis_2 = exploration_rate  — pos_2 ∈ [0, 1]: 0 = pure exploitation, 1 = pure exploration
 */
export const SAFETY_EXPLORATION_PILLAR: Pillar = {
  id: 'safety_exploration_balance',
  domain: 'safety_exploration',
  axis_vocabulary: ['safety_level', 'exploration_rate'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'safety_level',
      axis_2_id: 'exploration_rate',
      pos_1: metadata?.safety_level ?? 1.0,
      pos_2: metadata?.exploration_rate ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * INIT_BOOTSTRAP_PILLAR
 *
 * Initialisation bootstrap axes. Maps the current startup phase to a coordinate
 * pair describing bootstrap progress and domain novelty.
 *
 * axis_1 = bootstrap_progress — pos_1 ∈ [0, 1]: 0 = not started, 1 = complete
 * axis_2 = domain_novelty     — pos_2 ∈ [0, 1]: 0 = fully familiar, 1 = entirely new
 */
export const INIT_BOOTSTRAP_PILLAR: Pillar = {
  id: 'init_bootstrap',
  domain: 'init',
  axis_vocabulary: ['bootstrap_progress', 'domain_novelty'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'bootstrap_progress',
      axis_2_id: 'domain_novelty',
      pos_1: metadata?.bootstrap_progress ?? 0.0,
      pos_2: metadata?.domain_novelty ?? 1.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * EDGE_CASE_HANDLER_PILLAR
 *
 * Edge case handler axes. Maps the current anomaly detection state to a
 * coordinate pair describing anomaly score and recovery pressure.
 *
 * axis_1 = anomaly_score      — pos_1 ∈ [0, 1]: 0 = nominal, 1 = severe anomaly
 * axis_2 = recovery_pressure  — pos_2 ∈ [0, 1]: 0 = no recovery needed, 1 = urgent recovery
 */
export const EDGE_CASE_HANDLER_PILLAR: Pillar = {
  id: 'edge_case_handler',
  domain: 'edge_case',
  axis_vocabulary: ['anomaly_score', 'recovery_pressure'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'anomaly_score',
      axis_2_id: 'recovery_pressure',
      pos_1: metadata?.anomaly_score ?? 0.0,
      pos_2: metadata?.recovery_pressure ?? 0.5,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/**
 * SHUTDOWN_SIGNAL_PILLAR
 *
 * Shutdown signal axes. Maps the current shutdown phase to a coordinate pair
 * describing urgency and drain progress.
 *
 * axis_1 = shutdown_urgency — pos_1 ∈ [0, 1]: 0 = not shutting down, 1 = immediate halt
 * axis_2 = drain_progress   — pos_2 ∈ [0, 1]: 0 = drain not started, 1 = fully drained
 */
export const SHUTDOWN_SIGNAL_PILLAR: Pillar = {
  id: 'shutdown_signal',
  domain: 'shutdown',
  axis_vocabulary: ['shutdown_urgency', 'drain_progress'] as const,
  generate(context: PillarContext): PillarSlice {
    const metadata = context.metadata as Record<string, number> | undefined;
    return {
      axis_1_id: 'shutdown_urgency',
      axis_2_id: 'drain_progress',
      pos_1: metadata?.shutdown_urgency ?? 0.0,
      pos_2: metadata?.drain_progress ?? 0.0,
      pillar_id: this.id,
      pillar_domain: this.domain,
    };
  },
};

/** All seed Pillars, registered by default when the trait attaches */
export const SEED_PILLARS: readonly Pillar[] = [
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  TEMPORAL_PILLAR,
  RENDERING_LOD_PILLAR,
  AGENT_GOAL_PILLAR,
  LANGUAGE_CONTEXT_PILLAR,
  ECONOMICS_BUDGET_PILLAR,
  COMPILER_PIPELINE_PILLAR,
  SOLVER_PRECISION_PILLAR,
  TRAIT_COMPOSITION_PILLAR,
  COORDINATION_SYNC_PILLAR,
  STORAGE_CAPACITY_PILLAR,
  ACCURACY_SPEED_PILLAR,
  SAFETY_EXPLORATION_PILLAR,
  INIT_BOOTSTRAP_PILLAR,
  EDGE_CASE_HANDLER_PILLAR,
  SHUTDOWN_SIGNAL_PILLAR,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

interface PillarRegistryState {
  pillars: Map<string, Pillar>;
  slice_count: number;
  unique_fingerprints: Set<string>;
}

function fingerprintSlice(slice: PillarSlice): string {
  return `${slice.axis_1_id}:${slice.axis_2_id}:${slice.pos_1.toFixed(2)}:${slice.pos_2.toFixed(2)}`;
}

function extractField<T>(event: TraitEvent, key: string): T | undefined {
  const direct = (event as Record<string, unknown>)[key];
  if (direct !== undefined) return direct as T;
  return event.payload?.[key] as T | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

export const pillarRegistryHandler: TraitHandler<PillarRegistryConfig> = {
  name: 'pillar_registry',

  defaultConfig: {
    max_pillars: 512,
    enable_diversity_tracking: true,
  },

  onAttach(node: HSPlusNode, _config: PillarRegistryConfig, _context: TraitContext): void {
    const state: PillarRegistryState = {
      pillars: new Map(),
      slice_count: 0,
      unique_fingerprints: new Set(),
    };
    // Register seed Pillars
    for (const pillar of SEED_PILLARS) {
      state.pillars.set(pillar.id, pillar);
    }
    node.__pillarRegistryState = state;
  },

  onDetach(node: HSPlusNode, _config: PillarRegistryConfig, _context: TraitContext): void {
    delete node.__pillarRegistryState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: PillarRegistryConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__pillarRegistryState as PillarRegistryState | undefined;
    if (!state) return;

    const type = event.type;

    // ── pillar:register ───────────────────────────────────────────────────────
    if (type === 'pillar:register') {
      const pillar = extractField<Pillar>(event, 'pillar');
      if (!pillar?.id || !pillar.domain || !pillar.generate) {
        context.emit?.('pillar:error', {
          code: 'INVALID_AXIS' as PillarErrorCode,
          message: 'pillar:register requires a valid Pillar object with id, domain, and generate()',
        });
        return;
      }
      if (state.pillars.size >= config.max_pillars) {
        context.emit?.('pillar:error', {
          code: 'REGISTRY_FULL' as PillarErrorCode,
          message: `Registry is full (max_pillars=${config.max_pillars})`,
        });
        return;
      }
      state.pillars.set(pillar.id, pillar);
      context.emit?.('pillar:registered', { id: pillar.id, domain: pillar.domain });
      return;
    }

    // ── pillar:generate ───────────────────────────────────────────────────────
    if (type === 'pillar:generate') {
      const pillar_id = extractField<string>(event, 'pillar_id');
      const pillarContext = extractField<PillarContext>(event, 'context');

      if (!pillar_id) {
        context.emit?.('pillar:error', {
          code: 'PILLAR_NOT_FOUND' as PillarErrorCode,
          message: 'pillar:generate requires pillar_id',
        });
        return;
      }

      const pillar = state.pillars.get(pillar_id);
      if (!pillar) {
        context.emit?.('pillar:error', {
          code: 'PILLAR_NOT_FOUND' as PillarErrorCode,
          message: `No Pillar registered with id '${pillar_id}'`,
        });
        return;
      }

      const resolvedContext: PillarContext = pillarContext ?? {
        layer: 'default',
        agent_id: 'unknown',
        timestamp_ms: Date.now(),
      };

      let slice: PillarSlice;
      try {
        slice = pillar.generate(resolvedContext);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        context.emit?.('pillar:error', {
          code: 'GENERATE_FAILED' as PillarErrorCode,
          message: `Pillar '${pillar_id}' generate() threw: ${message}`,
        });
        return;
      }

      // Validate axis IDs against vocabulary
      if (
        !pillar.axis_vocabulary.includes(slice.axis_1_id) ||
        !pillar.axis_vocabulary.includes(slice.axis_2_id)
      ) {
        context.emit?.('pillar:error', {
          code: 'INVALID_AXIS' as PillarErrorCode,
          message: `Pillar '${pillar_id}' returned axis IDs outside axis_vocabulary`,
        });
        return;
      }

      state.slice_count++;
      if (config.enable_diversity_tracking) {
        state.unique_fingerprints.add(fingerprintSlice(slice));
      }

      context.emit?.('pillar:slice', { slice });
      return;
    }

    // ── pillar:list ───────────────────────────────────────────────────────────
    if (type === 'pillar:list') {
      const pillars: PillarSummary[] = [];
      for (const [, pillar] of state.pillars) {
        pillars.push({
          id: pillar.id,
          domain: pillar.domain,
          axis_vocabulary: pillar.axis_vocabulary,
        });
      }
      context.emit?.('pillar:registry', { pillars });
      return;
    }
  },
};

/**
 * Live stats from a node with pillarRegistryHandler attached.
 * Provides the slice-count + diversity data required by Paper 26 §5–6
 * (and the pillar-slice-scope memo) for GRPO / WorldModelReceipt experiments.
 */
export function getPillarSliceStats(node: HSPlusNode): {
  totalSlices: number;
  uniqueSlices: number;
  diversityRatio: number;
} {
  const state = (node as any).__pillarRegistryState as
    | { slice_count?: number; unique_fingerprints?: Set<string> }
    | undefined;

  if (!state) {
    return { totalSlices: 0, uniqueSlices: 0, diversityRatio: 0 };
  }

  const total = state.slice_count ?? 0;
  const unique = state.unique_fingerprints ? state.unique_fingerprints.size : 0;
  const ratio = total > 0 ? unique / total : 0;

  return { totalSlices: total, uniqueSlices: unique, diversityRatio: ratio };
}

// Verified complete in grok1-x402 marathon (cycle 5/5, unit 2). 410 LOC, 3 seed families (PHYSICS_CONSERVATION, INTENT_TRUTH_APPROVAL, TEMPORAL), full register/get/list + stats handler. Prerequisite cards (SliceEmitter, PillarJEPA) already shipped in adjacent cycles. Matches PSF card 1 spec. Commit anchor follows.
