/**
 * NeuralLink Trait
 *
 * Connects HoloScript agents to local GGUF neural model weights.
 * Enables the @trait(neural_link) directive for local model inference.
 *
 * Runtime behavior in onUpdate:
 *   - Inference timeout: if execute was sent but no response arrived within
 *     `inference_timeout_ms`, emits `neural_link_timeout` and resets status.
 *   - Heartbeat keepalive: emits `neural_link_heartbeat` every
 *     `heartbeat_interval_ms` while connected, confirming the link is alive.
 *   - Mesh sync pulse: when `sync === 'mesh'`, emits `neural_link_sync` every
 *     `sync_interval_ms` to broadcast state to mesh peers.
 *
 * Usage in HS+:
 *   @trait(neural_link, model="brittney-v4.gguf", temperature=0.7)
 *
 * @version 1.1.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface NeuralLinkConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  sync: 'local' | 'mesh';
  personality_anchor: string;
  /** Max milliseconds to wait for a response after execute before timing out. */
  inference_timeout_ms: number;
  /** Interval in milliseconds between heartbeat keepalive emissions. */
  heartbeat_interval_ms: number;
  /** Interval in milliseconds between mesh sync pulses (only when sync='mesh'). */
  sync_interval_ms: number;
}

type NeuralLinkStatus = 'connected' | 'inferring' | 'idle' | 'disconnected' | 'error';

interface NeuralLinkState {
  neural_status: NeuralLinkStatus;
  active_model: string;
  last_inference_time: number;
  last_response: string | null;
  /** Timestamp (ms) when inference started; null when not inferring. */
  inference_start: number | null;
  /** Accumulated delta time since last heartbeat emission. */
  heartbeat_elapsed: number;
  /** Accumulated delta time since last mesh sync emission. */
  sync_elapsed: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HEARTBEAT_MS = 5_000;
const DEFAULT_SYNC_MS = 10_000;

// =============================================================================
// HANDLER
// =============================================================================

export const neuralLinkHandler: TraitHandler<NeuralLinkConfig> = {
  name: 'neural_link',

  defaultConfig: {
    model: 'brittney-v4.gguf',
    temperature: 0.7,
    max_tokens: 2048,
    sync: 'local',
    personality_anchor: '',
    inference_timeout_ms: DEFAULT_TIMEOUT_MS,
    heartbeat_interval_ms: DEFAULT_HEARTBEAT_MS,
    sync_interval_ms: DEFAULT_SYNC_MS,
  },

  onAttach(node, config, context) {
    const state: NeuralLinkState = {
      neural_status: 'connected',
      active_model: config.model,
      last_inference_time: 0,
      last_response: null,
      inference_start: null,
      heartbeat_elapsed: 0,
      sync_elapsed: 0,
    };
    node.__neuralLinkState = state;
    context.emit('neural_link_ready', { nodeId: node.id, model: config.model });
  },

  onDetach(node) {
    const state = node.__neuralLinkState as NeuralLinkState | undefined;
    if (state) {
      state.neural_status = 'disconnected';
    }
    delete node.__neuralLinkState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__neuralLinkState as NeuralLinkState | undefined;
    if (!state) return;

    // ── Inference timeout ─────────────────────────────────────────────
    // If we started inference and no response arrived within the timeout,
    // emit a timeout event and reset to idle so the system doesn't stall.
    if (state.neural_status === 'inferring' && state.inference_start !== null) {
      const elapsed = Date.now() - state.inference_start;
      if (elapsed >= config.inference_timeout_ms) {
        context.emit('neural_link_timeout', {
          nodeId: node.id,
          model: config.model,
          elapsedMs: elapsed,
        });
        state.neural_status = 'idle';
        state.inference_start = null;
      }
    }

    // ── Heartbeat keepalive ───────────────────────────────────────────
    state.heartbeat_elapsed += delta * 1000; // delta is in seconds
    if (state.heartbeat_elapsed >= config.heartbeat_interval_ms) {
      context.emit('neural_link_heartbeat', {
        nodeId: node.id,
        model: config.model,
        status: state.neural_status,
      });
      state.heartbeat_elapsed = 0;
    }

    // ── Mesh sync pulse ──────────────────────────────────────────────
    if (config.sync === 'mesh') {
      state.sync_elapsed += delta * 1000;
      if (state.sync_elapsed >= config.sync_interval_ms) {
        context.emit('neural_link_sync', {
          nodeId: node.id,
          model: config.model,
          status: state.neural_status,
          last_inference_time: state.last_inference_time,
        });
        state.sync_elapsed = 0;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__neuralLinkState as NeuralLinkState | undefined;
    if (!state) return;

    const data = (event as Record<string, unknown>).data as Record<string, unknown> | undefined;

    if (event.type === 'neural_link_execute') {
      state.neural_status = 'inferring';
      state.inference_start = Date.now();
      context.emit('on_neural_inference_start', {
        nodeId: node.id,
        model: config.model,
        prompt: data?.prompt,
      });
    }

    if (event.type === 'neural_link_response') {
      state.neural_status = 'idle';
      state.last_response = (data?.text as string) ?? null;
      state.last_inference_time = (data?.generationTime as number) ?? 0;
      state.inference_start = null;
      context.emit('on_neural_response', {
        nodeId: node.id,
        text: data?.text,
      });
    }
  },
};

export default neuralLinkHandler;
