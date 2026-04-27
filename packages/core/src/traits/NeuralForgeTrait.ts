/**
 * Neural Forge Trait
 *
 * Connects NPCs to the uAA2++ Cognitive Engine (Neural Forge).
 * Enables the synthesis of "Shards" (compressed experience) from chat logs.
 * Allows NPCs to absorb these shards to evolve their neural state.
 *
 * idea-run-3 (research/2026-04-26_idea-run-3-neural-locomotion.md) named
 * this trait as a Pattern B candidate. /stub-audit confirmed: outer
 * state-management logic IS real and tested, but the inner synthesis at
 * the auto-trigger path was a hardcoded mock that ALSO emitted
 * `neural_synthesis_request` immediately before — causing a dual-shard
 * bug if a real external synthesizer ever responded with `neural_absorb_shard`.
 *
 * This commit fixes the dual-shard bug + adds an `external` synthesis
 * mode for real LLM-backed synthesis. Default mode is 'mock' so existing
 * 419 LOC of tests continue to pass.
 *
 * @version 1.1.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface NeuralShard {
  id: string;
  sourceId: string;
  timestamp: number;
  type: 'memory' | 'skill' | 'personality';
  data: unknown;
  weight: number; // Influence strength (0.0 - 1.0)
}

/** Hard cap on experienceLog to prevent unbounded growth when external synthesis stalls (per /critic Critical #3). */
export const MAX_EXPERIENCE_LOG_ENTRIES = 256;
/** Default timeout for an in-flight external synthesis request before we give up + reset (per /critic Critical #3). */
export const DEFAULT_EXTERNAL_TIMEOUT_MS = 30_000;

export interface NeuralState {
  shards: NeuralShard[];
  weights: Record<string, number>; // Dynamic personality vectors
  experienceLog: string[];
  lastSynthesis: number;
  /** Whether an external synthesis request is in-flight (waits for neural_absorb_shard). */
  pendingExternalSynthesis: boolean;
  /** Timestamp the in-flight external request was emitted; null when no request pending. */
  pendingSince: number | null;
}

interface NeuralConfig {
  auto_synthesize: boolean;
  synthesis_threshold: number; // Number of interactions before auto-synth
  base_weights: Record<string, number>;
  /**
   * Synthesis mode (default 'mock' for back-compat):
   *   - 'mock': emit neural_synthesis_request + immediately create a hardcoded
   *     summary shard + clear log. The previous behavior; works without an
   *     external listener.
   *   - 'external': emit neural_synthesis_request with experiences + weights
   *     payload, do NOT auto-create a mock shard, wait for the caller to
   *     reply with neural_absorb_shard. Clear log + timestamp on receipt.
   *     Use this when wired to a real LLM synthesizer.
   */
  synthesis_mode?: 'mock' | 'external';
  /**
   * External synthesis watchdog — if no neural_absorb_shard arrives within
   * this many ms of pendingSince, the trait emits 'neural_synthesis_timeout',
   * resets pendingExternalSynthesis, and (per fallback_to_mock_on_timeout)
   * optionally falls through to mock-mode shard creation. Default 30s.
   */
  external_timeout_ms?: number;
  /** When external timeout fires, fall through to mock synthesis (default true). */
  fallback_to_mock_on_timeout?: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const neuralForgeHandler: TraitHandler<NeuralConfig> = {
  name: 'neural_forge',

  defaultConfig: {
    auto_synthesize: true,
    synthesis_threshold: 10,
    base_weights: {
      openness: 0.5,
      conscientiousness: 0.5,
      extroversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    synthesis_mode: 'mock',
  },

  onAttach(node, config, context) {
    const state: NeuralState = {
      shards: [],
      weights: { ...config.base_weights },
      experienceLog: [],
      lastSynthesis: Date.now(),
      pendingExternalSynthesis: false,
      pendingSince: null,
    };
    node.__neuralState = state;

    context.emit?.('neural_forge_connected', { node });
  },

  onDetach(node, _config, _context) {
    delete node.__neuralState;
  },

  /**
   * Watchdog tick — checks for stuck external synthesis requests and times
   * them out (closes /critic Critical #3 silent zombie state). Empty
   * pre-watchdog onUpdate was a smell once async state existed.
   */
  onUpdate(node, config, context, _delta) {
    const state = node.__neuralState as NeuralState | undefined;
    if (!state) return;
    if (!state.pendingExternalSynthesis || state.pendingSince === null) return;

    const timeoutMs = config.external_timeout_ms ?? DEFAULT_EXTERNAL_TIMEOUT_MS;
    const elapsed = Date.now() - state.pendingSince;
    if (elapsed < timeoutMs) return;

    // External listener never responded — emit timeout, reset, optionally fall back.
    context.emit?.('neural_synthesis_timeout', {
      node,
      pendingSince: state.pendingSince,
      elapsedMs: elapsed,
      experienceCount: state.experienceLog.length,
    });
    state.pendingExternalSynthesis = false;
    state.pendingSince = null;

    const fallback = config.fallback_to_mock_on_timeout ?? true;
    if (fallback && state.experienceLog.length > 0) {
      const shard: NeuralShard = {
        id: `shard_timeout_${Date.now()}`,
        sourceId: node.id || 'unknown',
        timestamp: Date.now(),
        type: 'memory',
        data: {
          summary: `Experienced ${state.experienceLog.length} interactions (external synthesis timed out after ${timeoutMs}ms).`,
          fallback: true,
        },
        weight: 0.05, // half weight of normal mock shards — uncertain provenance
      };
      state.shards.push(shard);
      state.experienceLog = [];
      state.lastSynthesis = Date.now();
      context.emit?.('neural_shard_created', { node, shard });
      context.emit?.('neural_cognition_evolved', { node, currentWeights: state.weights });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__neuralState as NeuralState;
    if (!state) return;

    if (event.type === 'npc_ai_response') {
      const text = (event as Record<string, unknown>).text as string;
      state.experienceLog.push(text);

      // /critic Critical #3 leak fix: bound the log so a stalled external
      // listener can't cause unbounded memory growth. Drop oldest entries.
      if (state.experienceLog.length > MAX_EXPERIENCE_LOG_ENTRIES) {
        state.experienceLog.splice(0, state.experienceLog.length - MAX_EXPERIENCE_LOG_ENTRIES);
      }

      // Auto-Synthesis Check
      if (config.auto_synthesize && state.experienceLog.length >= config.synthesis_threshold) {
        const mode = config.synthesis_mode ?? 'mock';

        if (mode === 'external') {
          // Skip if a request is already in-flight (avoid storming the synthesizer)
          if (state.pendingExternalSynthesis) return;
          state.pendingExternalSynthesis = true;
          state.pendingSince = Date.now();

          // Emit request with experiences + current weights so a real LLM can
          // produce a shard. Caller is responsible for replying with
          // neural_absorb_shard. Log + timestamp clear on receipt, not now.
          context.emit?.('neural_synthesis_request', {
            node,
            mode: 'external',
            experiences: [...state.experienceLog],
            currentWeights: { ...state.weights },
          });
        } else {
          // 'mock' mode (default, back-compat with v1.0.0).
          //
          // /critic Annoying #10 fix (2026-04-27): previously emitted
          // 'neural_synthesis_request' AND created a hardcoded shard
          // locally — the dual-emit trap. Any future listener for
          // neural_synthesis_request would receive a request that the
          // trait already self-fulfilled, and replying with
          // neural_absorb_shard would create a DUPLICATE shard.
          //
          // Now: mock mode just creates the shard locally and emits
          // neural_shard_created. No fake request emit. If a caller
          // wants real synthesis, set synthesis_mode: 'external' which
          // routes through the request/absorb pair without the
          // self-fulfilled mock fallback.
          const shard: NeuralShard = {
            id: `shard_${Date.now()}`,
            sourceId: node.id || 'unknown',
            timestamp: Date.now(),
            type: 'memory',
            data: { summary: `Experienced ${state.experienceLog.length} interactions.` },
            weight: 0.1,
          };

          // Self-Absorb
          state.shards.push(shard);
          state.experienceLog = []; // Clear log after synthesis
          state.lastSynthesis = Date.now();

          context.emit?.('neural_shard_created', { node, shard });
          context.emit?.('neural_cognition_evolved', { node, currentWeights: state.weights });
        }
      }
    } else if (event.type === 'neural_absorb_shard') {
      const shard = (event as Record<string, unknown>).shard as NeuralShard;
      state.shards.push(shard);

      // Simple personality modulation based on shard type (mock logic)
      if (shard.type === 'personality') {
        // @ts-expect-error
        const modifiers = shard.data.modifiers as Record<string, number>;
        for (const [key, mod] of Object.entries(modifiers)) {
          if (state.weights[key] !== undefined) {
            state.weights[key] = Math.max(0, Math.min(1, state.weights[key] + mod * shard.weight));
          }
        }
      }

      // External-mode bookkeeping: response received → clear log + timestamp +
      // unblock next synthesis request + reset pendingSince watchdog.
      if (state.pendingExternalSynthesis) {
        state.experienceLog = [];
        state.lastSynthesis = Date.now();
        state.pendingExternalSynthesis = false;
        state.pendingSince = null;
      }

      context.emit?.('neural_cognition_evolved', { node, currentWeights: state.weights });
    }
  },
};

export default neuralForgeHandler;
