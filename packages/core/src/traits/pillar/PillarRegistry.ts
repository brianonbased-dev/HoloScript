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

/** All seed Pillars, registered by default when the trait attaches */
export const SEED_PILLARS: readonly Pillar[] = [
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  TEMPORAL_PILLAR,
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
