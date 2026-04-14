import type { Vector3 } from '../types';
/**
 * HapticCue Trait
 *
 * Non-visual haptic feedback for interactions and accessibility.
 * Supports various patterns and spatial haptic feedback.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type HapticPattern =
  | 'pulse'
  | 'buzz'
  | 'click'
  | 'double_click'
  | 'long_press'
  | 'success'
  | 'warning'
  | 'error'
  | 'custom';

interface HapticCueState {
  isPlaying: boolean;
  currentRepeat: number;
  repeatTimer: number;
  lastTriggerTime: number;
}

interface HapticCueConfig {
  pattern: HapticPattern;
  intensity: number; // 0-1
  duration: number; // ms
  repeat: number; // 0 = no repeat
  repeat_delay: number; // ms between repeats
  spatial_direction: boolean; // Encode direction in haptic
  trigger_on: string; // Event to trigger on
  custom_pattern: number[]; // For custom pattern: [intensity, duration, ...]
}

// =============================================================================
// PATTERN DEFINITIONS
// =============================================================================

const HAPTIC_PATTERNS: Record<HapticPattern, Array<{ intensity: number; duration: number }>> = {
  pulse: [{ intensity: 1.0, duration: 50 }],
  buzz: [{ intensity: 0.5, duration: 200 }],
  click: [{ intensity: 1.0, duration: 10 }],
  double_click: [
    { intensity: 1.0, duration: 10 },
    { intensity: 0, duration: 50 },
    { intensity: 1.0, duration: 10 },
  ],
  long_press: [
    { intensity: 0.3, duration: 50 },
    { intensity: 0.6, duration: 100 },
    { intensity: 1.0, duration: 200 },
  ],
  success: [
    { intensity: 0.5, duration: 50 },
    { intensity: 1.0, duration: 100 },
  ],
  warning: [
    { intensity: 0.8, duration: 100 },
    { intensity: 0, duration: 50 },
    { intensity: 0.8, duration: 100 },
  ],
  error: [
    { intensity: 1.0, duration: 50 },
    { intensity: 0, duration: 30 },
    { intensity: 1.0, duration: 50 },
    { intensity: 0, duration: 30 },
    { intensity: 1.0, duration: 100 },
  ],
  custom: [],
};

// =============================================================================
// HANDLER
// =============================================================================

export const hapticCueHandler: TraitHandler<HapticCueConfig> = {
  name: 'haptic_cue',

  defaultConfig: {
    pattern: 'pulse',
    intensity: 0.5,
    duration: 100,
    repeat: 0,
    repeat_delay: 200,
    spatial_direction: false,
    trigger_on: 'interact',
    custom_pattern: [],
  },

  onAttach(node, config, context) {
    const state: HapticCueState = {
      isPlaying: false,
      currentRepeat: 0,
      repeatTimer: 0,
      lastTriggerTime: 0,
    };
    node.__hapticCueState = state;

    context.emit?.('haptic_cue_register', {
      node,
      pattern: config.pattern,
      triggerEvent: config.trigger_on,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('haptic_cue_stop', { node });
    delete node.__hapticCueState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__hapticCueState as HapticCueState;
    if (!state || !state.isPlaying) return;

    // Handle repeat logic
    if (state.currentRepeat < config.repeat) {
      state.repeatTimer += delta * 1000;

      if (state.repeatTimer >= config.repeat_delay) {
        state.repeatTimer = 0;
        state.currentRepeat++;

        // Trigger another haptic
        context.emit?.('haptic_play', {
          node,
          pattern: config.pattern,
          intensity: config.intensity,
          duration: config.duration,
        });
      }
    } else {
      state.isPlaying = false;
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__hapticCueState as HapticCueState;
    if (!state) return;

    // Match trigger event
    if (event.type === config.trigger_on || event.type === 'haptic_trigger') {
      state.isPlaying = true;
      state.currentRepeat = 0;
      state.repeatTimer = 0;
      state.lastTriggerTime = Date.now();

      // Get pattern to play
      let pattern = HAPTIC_PATTERNS[config.pattern];

      if (config.pattern === 'custom' && config.custom_pattern.length >= 2) {
        pattern = [];
        for (let i = 0; i < config.custom_pattern.length; i += 2) {
          pattern.push({
            intensity: config.custom_pattern[i],
            duration: config.custom_pattern[i + 1],
          });
        }
      }

      // Calculate spatial direction if enabled
      let direction: Vector3 | undefined;
      if (config.spatial_direction && node.position) {
        const pos = node.position;
        const len = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
        if (len > 0) {
          direction = [pos[0] / len, pos[1] / len, pos[2] / len ];
        }
      }

      context.emit?.('haptic_play', {
        node,
        pattern,
        intensity: config.intensity,
        duration: config.duration,
        direction,
      });

      context.emit?.('on_haptic_start', { node, pattern: config.pattern });
    } else if (event.type === 'haptic_stop') {
      state.isPlaying = false;
      context.emit?.('haptic_cancel', { node });
    } else if (event.type === 'haptic_set_intensity') {
      // Dynamic intensity adjustment
      context.emit?.('haptic_update_intensity', {
        node,
        intensity: event.intensity as number,
      });
    }
  },
};

export default hapticCueHandler;
