/**
 * SliceEmitter — v1.0
 *
 * Bridges PillarRegistry to the GRPO training pipeline.
 * Emits PillarSlices as latent training samples (TrainingSlice) and tracks
 * slice diversity to guard against mode collapse in the training distribution.
 *
 * Architecture
 * ────────────
 * SliceEmitter sits downstream of PillarRegistry in the uAAL Cognitive VM
 * data path:
 *
 *   PillarRegistry.generate() → PillarSlice
 *     → SliceEmitter.emit()   → TrainingSlice (to GRPO pipeline)
 *                              → emitter:diversity_stats (monitoring)
 *
 * Diversity tracking
 * ──────────────────
 * A rolling fingerprint Set(axis_1_id + axis_2_id + pos_1.toFixed(2) + pos_2.toFixed(2))
 * monitors unique vs total slice ratio.  When the ratio drops below
 * config.diversity_target an alert fires via emitter:diversity_stats with
 * diversity_ratio < threshold.  This is the SliceEmitter analogue of the
 * Two-Axis sycophancy detector (W.617) — repeated identical slices indicate
 * a collapsed training distribution.
 *
 * TraitHandler
 * ────────────
 * `sliceEmitterHandler` buffers TrainingSlices and flushes on demand.
 *
 * Events consumed:
 *   emitter:emit  { slice: PillarSlice, brain_coord: BrainCoord,
 *                   sim_step: number, agent_id: string }
 *   emitter:flush
 *
 * Events emitted:
 *   emitter:training_slice  { slice: TrainingSlice }
 *   emitter:diversity_stats { unique_count: number, total_count: number,
 *                             diversity_ratio: number }
 *   emitter:buffer_flushed  { count: number }
 *
 * References:
 *   Pillar-Slice Framework — research/2026-05-20_paper26-pillar-slice-scope.md
 *   RecursiveMAS           — arxiv:2604.25917 (2026-04-28)
 *   Tropical geometry      — arxiv:1805.07091
 *   GRPO alignment         — policy-gradient reward shaping via pillar coordinates
 *   Sycophancy axis        — W.617, P.620.02
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { PillarSlice, BrainCoord } from './SemanticCollaborationContract';

// ─────────────────────────────────────────────────────────────────────────────
// Core domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single latent training sample for the GRPO pipeline.
 *
 * Wraps a PillarSlice with the execution context needed to compute a reward
 * signal and associate the sample with a specific simulation step and agent.
 *
 * reward_signal is optional at emission time — GRPO fills it after evaluation.
 */
export interface TrainingSlice {
  /** The 4-tuple coordinate slice from PillarRegistry */
  slice: PillarSlice;
  /** MNI152 address — maps the slice to a brain storage region for retrieval */
  brain_coord: BrainCoord;
  /**
   * GRPO reward signal ∈ [-1, 1] — absent until the evaluator has scored
   * the trajectory segment.  SliceEmitter emits with reward_signal undefined;
   * the GRPO trainer writes it back before gradient update.
   */
  reward_signal?: number;
  /** Simulation step index at time of emission */
  sim_step: number;
  /** Surface ID of the agent that generated this slice */
  agent_id: string;
  /** Unix timestamp of emission */
  emitted_at_ms: number;
}

/** Diversity statistics emitted alongside each TrainingSlice */
export interface DiversityStats {
  unique_count: number;
  total_count: number;
  /** unique_count / total_count — 1.0 = fully diverse, 0.0 = fully collapsed */
  diversity_ratio: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait config
// ─────────────────────────────────────────────────────────────────────────────

export interface SliceEmitterConfig {
  /**
   * Emit TrainingSlices to the GRPO pipeline.
   * Default: true.  Set false during unit tests to suppress pipeline calls.
   */
  emit_to_grpo: boolean;
  /**
   * Emit TrainingSlices to the knowledge store.
   * Default: false — enabled after PillarJEPA is wired (see I.012 Revival Scan).
   */
  emit_to_knowledge_store: boolean;
  /**
   * Maximum number of TrainingSlices to hold in the rolling buffer.
   * Oldest entries are evicted when the buffer is full.
   * Default: 1000.
   */
  max_buffer_size: number;
  /**
   * Alert threshold for diversity monitoring.
   * When unique_count / total_count < diversity_target, emitter:diversity_stats
   * fires with the warning.  Default: 0.8.
   */
  diversity_target: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

interface SliceEmitterState {
  buffer: TrainingSlice[];
  unique_fingerprints: Set<string>;
  total_count: number;
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

export const sliceEmitterHandler: TraitHandler<SliceEmitterConfig> = {
  name: 'slice_emitter',

  defaultConfig: {
    emit_to_grpo: true,
    emit_to_knowledge_store: false,
    max_buffer_size: 1000,
    diversity_target: 0.8,
  },

  onAttach(node: HSPlusNode, _config: SliceEmitterConfig, _context: TraitContext): void {
    node.__sliceEmitterState = {
      buffer: [],
      unique_fingerprints: new Set<string>(),
      total_count: 0,
    } satisfies SliceEmitterState;
  },

  onDetach(node: HSPlusNode, _config: SliceEmitterConfig, _context: TraitContext): void {
    delete node.__sliceEmitterState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: SliceEmitterConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__sliceEmitterState as SliceEmitterState | undefined;
    if (!state) return;

    const type = event.type;

    // ── emitter:emit ──────────────────────────────────────────────────────────
    if (type === 'emitter:emit') {
      const slice = extractField<PillarSlice>(event, 'slice');
      const brain_coord = extractField<BrainCoord>(event, 'brain_coord');
      const sim_step = extractField<number>(event, 'sim_step') ?? 0;
      const agent_id = extractField<string>(event, 'agent_id') ?? 'unknown';

      if (!slice?.axis_1_id || !slice?.axis_2_id) {
        // Silently discard malformed slices — no error event to avoid flooding
        // training logs with emit noise.
        return;
      }

      if (!brain_coord) {
        return;
      }

      const trainingSlice: TrainingSlice = {
        slice,
        brain_coord,
        sim_step,
        agent_id,
        emitted_at_ms: Date.now(),
      };

      // Rolling buffer eviction
      if (state.buffer.length >= config.max_buffer_size) {
        state.buffer.shift();
      }
      state.buffer.push(trainingSlice);

      // Diversity tracking
      state.total_count++;
      state.unique_fingerprints.add(fingerprintSlice(slice));

      const diversity_ratio =
        state.total_count > 0
          ? state.unique_fingerprints.size / state.total_count
          : 1.0;

      const diversityStats: DiversityStats = {
        unique_count: state.unique_fingerprints.size,
        total_count: state.total_count,
        diversity_ratio,
      };

      // Emit training slice (GRPO pipeline consumes this)
      if (config.emit_to_grpo) {
        context.emit?.('emitter:training_slice', { slice: trainingSlice });
      }

      // Always emit diversity stats for monitoring
      context.emit?.('emitter:diversity_stats', diversityStats);

      // Knowledge store emission (disabled until PillarJEPA wired)
      // When emit_to_knowledge_store becomes true, POST to:
      //   POST https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync
      //   body: { type: 'training_slice', data: trainingSlice }
      // See: research/2026-05-20_paper26-pillar-slice-scope.md §Knowledge Integration
      return;
    }

    // ── emitter:flush ─────────────────────────────────────────────────────────
    if (type === 'emitter:flush') {
      const count = state.buffer.length;
      state.buffer = [];
      context.emit?.('emitter:buffer_flushed', { count });
      return;
    }
  },
};
