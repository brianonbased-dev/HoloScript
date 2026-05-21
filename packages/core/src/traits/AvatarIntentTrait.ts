/**
 * AvatarIntentTrait
 *
 * Abstraction layer between raw input devices (controllers, hand tracking,
 * eye tracking, voice commands, brain-computer interfaces) and high-level
 * avatar control intents (move, grab, emote, speak, rest).
 *
 * Design goals:
 * - Decouple device-specific signals from avatar animation / physics.
 * - Provide smoothing and dead-zones so noisy inputs don't jitter the avatar.
 * - Support multi-modal fusion (e.g. gaze + pinch = "select at distance").
 *
 * Pre-condition for prone-bed v3: the "rest" intent maps to a lying pose
 * that the AvatarEmbodimentTrait (AvatarEmbodimentTrait.ts) can consume.
 *
 * @version 0.1.0-skeleton
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';
import type { Pillar, PillarContext, PillarSlice } from './pillar/PillarRegistry';

// =============================================================================
// TYPES
// =============================================================================

export type InputDevice =
  | 'controller_left'
  | 'controller_right'
  | 'hand_tracking_left'
  | 'hand_tracking_right'
  | 'eye_tracking'
  | 'voice'
  | 'keyboard'
  | 'bci';

export type AvatarIntentKind =
  | 'idle'
  | 'move'
  | 'rotate'
  | 'grab'
  | 'release'
  | 'point'
  | 'select'
  | 'emote'
  | 'speak'
  | 'rest';

export interface RawInputSample {
  device: InputDevice;
  timestamp: number;
  /** Normalized 0-1 axis values or button pressures. */
  axes: Record<string, number>;
  /** Discrete button/ gesture triggers. */
  buttons: Record<string, boolean>;
}

export interface ResolvedIntent {
  intent: AvatarIntentKind;
  confidence: number;
  /** Device that contributed most to this intent. */
  primaryDevice: InputDevice;
  /** All devices that contributed. */
  contributingDevices: InputDevice[];
  /** Smoothed, normalized parameter vector (e.g. direction, magnitude). */
  params: Record<string, number>;
}

export interface IntentMappingRule {
  /** Required devices that must be present for this rule to fire. */
  devices: InputDevice[];
  /** Button/gesture predicate: key = device:buttonName, value = required state. */
  predicate: Record<string, boolean>;
  /** Resulting intent when predicate matches. */
  intent: AvatarIntentKind;
  /** Weight when multiple rules match (highest weight wins). */
  weight: number;
}

export interface AvatarIntentConfig {
  /** Ordered list of mapping rules. First match wins unless overridden by weight. */
  intent_mapping: IntentMappingRule[];
  /** Smoothing window in milliseconds. */
  smoothing_window_ms: number;
  /** Axis dead-zone: inputs below this magnitude are treated as zero. */
  dead_zone: number;
  /** Maximum number of raw samples to retain for smoothing. */
  max_sample_buffer: number;
}

export interface AvatarIntentState {
  samples: RawInputSample[];
  lastResolved: ResolvedIntent | null;
  activeDevices: Set<InputDevice>;
}

function getState(node: HSPlusNode): AvatarIntentState | undefined {
  return node.__avatarIntentState as AvatarIntentState | undefined;
}

// =============================================================================
// HELPERS
// =============================================================================

function evaluatePredicate(
  sample: RawInputSample,
  predicate: Record<string, boolean>
): boolean {
  for (const [key, required] of Object.entries(predicate)) {
    const [device, button] = key.split(':');
    if (sample.device === device) {
      const actual = sample.buttons[button] ?? false;
      if (actual !== required) return false;
    }
  }
  return true;
}

function smoothParams(samples: RawInputSample[]): Record<string, number> {
  if (samples.length === 0) return {};
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const s of samples) {
    for (const [k, v] of Object.entries(s.axes)) {
      sums[k] = (sums[k] ?? 0) + v;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(sums)) {
    out[k] = counts[k] ? sums[k] / counts[k] : 0;
  }
  return out;
}

// =============================================================================
// HANDLER
// =============================================================================

export const avatarIntentHandler: TraitHandler<AvatarIntentConfig> = {
  name: 'avatar_intent',

  defaultConfig: {
    intent_mapping: [
      {
        devices: ['controller_left'],
        predicate: { 'controller_left:thumbstick_press': true },
        intent: 'rest',
        weight: 1.0,
      },
      {
        devices: ['controller_right', 'eye_tracking'],
        predicate: { 'controller_right:trigger': true },
        intent: 'select',
        weight: 1.2,
      },
      {
        devices: ['hand_tracking_right'],
        predicate: { 'hand_tracking_right:pinch': true },
        intent: 'grab',
        weight: 1.0,
      },
    ],
    smoothing_window_ms: 150,
    dead_zone: 0.05,
    max_sample_buffer: 20,
  },

  onAttach(node, config, context) {
    const state: AvatarIntentState = {
      samples: [],
      lastResolved: null,
      activeDevices: new Set(),
    };
    node.__avatarIntentState = state;

    context.emit?.('avatar_intent_ready', {
      node,
      mappingRuleCount: config.intent_mapping.length,
      smoothingWindowMs: config.smoothing_window_ms,
      deadZone: config.dead_zone,
    });

    // PSF-3 WIRE (D.040): register AvatarIntent as Pillar axis (behavioral + structural)
    // Note: per task, needs multi-modal fusion; this is the coordinate skeleton.
    const avatarIntentPillar: Pillar = {
      id: 'avatar_intent',
      domain: 'agent',
      axis_vocabulary: ['intent_clarity', 'multi_modal_fusion'] as const,
      generate(ctx: PillarContext): PillarSlice {
        const meta = (ctx.metadata || {}) as Record<string, number>;
        return {
          axis_1_id: 'intent_clarity',
          axis_2_id: 'multi_modal_fusion',
          pos_1: meta.intent_clarity ?? 0.8,
          pos_2: meta.multi_modal_fusion ?? 0.5,
          pillar_id: this.id,
          pillar_domain: this.domain,
        };
      },
    };
    context.emit?.('pillar:register', { pillar: avatarIntentPillar });
  },

  onDetach(node) {
    delete node.__avatarIntentState;
  },

  onUpdate(node, config, context, delta) {
    const state = getState(node);
    if (!state) return;

    // Prune old samples outside smoothing window
    const cutoff = Date.now() - config.smoothing_window_ms;
    state.samples = state.samples.filter((s) => s.timestamp >= cutoff);
    if (state.samples.length > config.max_sample_buffer) {
      state.samples = state.samples.slice(-config.max_sample_buffer);
    }

    // Recalculate active device set
    state.activeDevices = new Set(state.samples.map((s) => s.device));

    // Resolve intent from mapping rules
    let best: ResolvedIntent | null = null;
    for (const rule of config.intent_mapping) {
      const present = rule.devices.every((d) => state.activeDevices.has(d));
      if (!present) continue;

      const matchingSamples = state.samples.filter((s) =>
        rule.devices.includes(s.device)
      );
      const allMatch = matchingSamples.length > 0 && matchingSamples.every((s) =>
        evaluatePredicate(s, rule.predicate)
      );
      if (!allMatch) continue;

      const params = smoothParams(matchingSamples);
      // Apply dead-zone
      for (const k of Object.keys(params)) {
        if (Math.abs(params[k]) < config.dead_zone) params[k] = 0;
      }

      const resolved: ResolvedIntent = {
        intent: rule.intent,
        confidence: rule.weight,
        primaryDevice: rule.devices[0],
        contributingDevices: [...new Set(matchingSamples.map((s) => s.device))],
        params,
      };

      if (!best || resolved.confidence > best.confidence) {
        best = resolved;
      }
    }

    if (best) {
      state.lastResolved = best;
      context.emit?.('intent_mapped', {
        node,
        intent: best.intent,
        confidence: best.confidence,
        primaryDevice: best.primaryDevice,
        params: best.params,
      });
    } else if (state.lastResolved?.intent !== 'idle') {
      const idle: ResolvedIntent = {
        intent: 'idle',
        confidence: 1.0,
        primaryDevice: 'controller_left',
        contributingDevices: [],
        params: {},
      };
      state.lastResolved = idle;
      context.emit?.('intent_mapped', {
        node,
        intent: 'idle',
        confidence: 1.0,
        primaryDevice: 'controller_left',
        params: {},
      });
    }

    // PSF-3 WIRE (D.040) — live Pillar-Slice from real avatar intent state (replaces skeleton).
    // intent_clarity from resolved confidence; multi_modal_fusion from active device count (fusion signal).
    // Feeds the Pillar-Slice runtime primitive for training and dispatch.
    const clarity = state.lastResolved ? state.lastResolved.confidence : 0.5;
    const fusion = Math.min(1, Math.max(0.2, (state.activeDevices.size || 1) / 3));
    context.emit?.('pillar:slice', {
      slice: {
        axis_1_id: 'intent_clarity',
        axis_2_id: 'multi_modal_fusion',
        pos_1: clarity,
        pos_2: fusion,
        pillar_id: 'avatar_intent',
        pillar_domain: 'agent' as const,
      },
      agent_id: (context as any).agentId ?? 'local',
      sim_step: Date.now(),
    });
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'avatar_input_sample') {
      const payload = extractPayload(event);
      const device = String(payload.device ?? 'controller_left') as InputDevice;
      const sample: RawInputSample = {
        device,
        timestamp: Date.now(),
        axes: (payload.axes && typeof payload.axes === 'object'
          ? payload.axes
          : {}) as Record<string, number>,
        buttons: (payload.buttons && typeof payload.buttons === 'object'
          ? payload.buttons
          : {}) as Record<string, boolean>,
      };
      state.samples.push(sample);
      state.activeDevices.add(device);
      context.emit?.('avatar_input_received', {
        node,
        device,
        timestamp: sample.timestamp,
      });
      return;
    }

    if (event.type === 'avatar_intent_query') {
      context.emit?.('avatar_intent_state', {
        queryId: extractPayload(event).queryId,
        node,
        lastResolved: state.lastResolved,
        activeDevices: Array.from(state.activeDevices),
        sampleCount: state.samples.length,
      });
      return;
    }
  },
};

export default avatarIntentHandler;
