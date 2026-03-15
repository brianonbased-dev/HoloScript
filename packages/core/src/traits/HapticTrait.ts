/**
 * Haptic Trait
 *
 * Implements advanced haptic feedback for HoloScript+ objects:
 * - Custom haptic patterns and sequences
 * - Proximity-based haptic intensity
 * - Collision haptics with material-aware feedback
 * - Continuous haptic effects
 *
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface HapticPattern {
  /** Pattern name */
  name: string;
  /** Sequence of [intensity, duration_ms] pairs */
  sequence: [number, number][];
  /** Loop the pattern */
  loop: boolean;
}

export interface HapticTrait {
  /** Base haptic intensity (0-1) */
  intensity: number;
  /** Enable proximity-based haptics */
  proximity_enabled: boolean;
  /** Distance at which proximity haptics start */
  proximity_distance: number;
  /** Haptic pattern to play on collision */
  collision_pattern: 'soft' | 'hard' | 'metal' | 'glass' | 'custom';
  /** Custom haptic pattern */
  custom_pattern?: HapticPattern;
  /** Which hands to vibrate: 'both', 'left', 'right', 'dominant' */
  hands: 'both' | 'left' | 'right' | 'dominant';
  /** Duration of haptic pulse in ms */
  duration: number;
}

interface HapticState {
  isPlaying: boolean;
  currentPattern: HapticPattern | null;
  patternIndex: number;
  patternTimer: number;
  proximityIntensity: number;
}

// =============================================================================
// BUILT-IN PATTERNS
// =============================================================================

const builtInPatterns: Record<string, HapticPattern> = {
  soft: {
    name: 'soft',
    sequence: [
      [0.2, 50],
      [0.1, 50],
    ],
    loop: false,
  },
  hard: {
    name: 'hard',
    sequence: [
      [0.8, 30],
      [0.4, 20],
      [0.2, 20],
    ],
    loop: false,
  },
  metal: {
    name: 'metal',
    sequence: [
      [1.0, 10],
      [0.6, 40],
      [0.3, 60],
      [0.1, 100],
    ],
    loop: false,
  },
  glass: {
    name: 'glass',
    sequence: [
      [0.5, 20],
      [0.2, 80],
      [0.1, 100],
    ],
    loop: false,
  },
  heartbeat: {
    name: 'heartbeat',
    sequence: [
      [0.6, 100],
      [0, 100],
      [0.6, 100],
      [0, 500],
    ],
    loop: true,
  },
  rumble: {
    name: 'rumble',
    sequence: [
      [0.5, 50],
      [0.3, 50],
    ],
    loop: true,
  },
};

// =============================================================================
// HANDLER
// =============================================================================

export const hapticHandler: TraitHandler<HapticTrait> = {
  name: 'haptic',

  defaultConfig: {
    intensity: 0.5,
    proximity_enabled: false,
    proximity_distance: 0.5,
    collision_pattern: 'soft',
    hands: 'dominant',
    duration: 100,
  },

  onAttach(node, _config, _context) {
    const state: HapticState = {
      isPlaying: false,
      currentPattern: null,
      patternIndex: 0,
      patternTimer: 0,
      proximityIntensity: 0,
    };
    (node as any).__hapticState = state;
  },

  onDetach(node) {
    delete (node as any).__hapticState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__hapticState as HapticState;
    if (!state) return;

    // Handle proximity haptics
    if (config.proximity_enabled && node.properties) {
      const pos = (node.properties as any).position || [0, 0, 0];
      const dominantHand = context.vr.getDominantHand();

      if (dominantHand) {
        const handPos = dominantHand.position;
        const distance = Math.sqrt(
          Math.pow((handPos as any)[0] - pos[0], 2) +
            Math.pow((handPos as any)[1] - pos[1], 2) +
            Math.pow((handPos as any)[2] - pos[2], 2)
        );

        const maxDist = config.proximity_distance * context.getScaleMultiplier();
        if (distance < maxDist) {
          const normalizedDist = 1 - distance / maxDist;
          state.proximityIntensity = normalizedDist * config.intensity;

          // Apply gentle rumble based on proximity
          pulseHands(config.hands, state.proximityIntensity * 0.3, context);
        } else {
          state.proximityIntensity = 0;
        }
      }
    }

    // Handle pattern playback
    if (state.isPlaying && state.currentPattern) {
      state.patternTimer += delta * 1000; // delta is in seconds

      const step = state.currentPattern.sequence[state.patternIndex];
      if (state.patternTimer >= step[1]) {
        state.patternTimer = 0;
        state.patternIndex++;

        if (state.patternIndex >= state.currentPattern.sequence.length) {
          if (state.currentPattern.loop) {
            state.patternIndex = 0;
          } else {
            state.isPlaying = false;
            state.currentPattern = null;
          }
        }

        // Play next step
        if (state.isPlaying && state.currentPattern) {
          const nextStep = state.currentPattern.sequence[state.patternIndex];
          pulseHands(config.hands, nextStep[0] * config.intensity, context);
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__hapticState as HapticState;
    if (!state) return;

    // Handle collision haptics
    if (event.type === 'collision') {
      const pattern =
        config.collision_pattern === 'custom'
          ? config.custom_pattern
          : builtInPatterns[config.collision_pattern];

      if (pattern) {
        playPattern(state, pattern, config, context);
      } else {
        // Simple pulse on collision
        pulseHands(config.hands, config.intensity, context, config.duration);
      }
    }

    // Handle grab haptics
    if ((event as any).type === 'grab_start') {
      pulseHands(config.hands, config.intensity * 0.7, context, 50);
    }

    // Handle custom pattern trigger
    if ((event as any).type === 'play_pattern') {
      const patternName = (event as any).pattern || config.collision_pattern;
      const pattern = builtInPatterns[patternName] || config.custom_pattern;
      if (pattern) {
        playPattern(state, pattern, config, context);
      }
    }

    // Handle stop pattern
    if ((event as any).type === 'stop_pattern') {
      state.isPlaying = false;
      state.currentPattern = null;
    }
  },
};

// =============================================================================
// HELPERS
// =============================================================================

function pulseHands(
  hands: HapticTrait['hands'],
  intensity: number,
  context: TraitContext,
  duration: number = 50
): void {
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  switch (hands) {
    case 'left':
      context.haptics.pulse('left', clampedIntensity, duration);
      break;
    case 'right':
      context.haptics.pulse('right', clampedIntensity, duration);
      break;
    case 'dominant':
      const dominant = context.vr.getDominantHand();
      if (dominant) {
        context.haptics.pulse((dominant as any).id as 'left' | 'right', clampedIntensity, duration);
      }
      break;
    case 'both':
    default:
      context.haptics.pulse('left', clampedIntensity, duration);
      context.haptics.pulse('right', clampedIntensity, duration);
      break;
  }
}

function playPattern(
  state: HapticState,
  pattern: HapticPattern,
  config: HapticTrait,
  context: TraitContext
): void {
  state.isPlaying = true;
  state.currentPattern = pattern;
  state.patternIndex = 0;
  state.patternTimer = 0;

  // Start first step immediately
  const firstStep = pattern.sequence[0];
  pulseHands(config.hands, firstStep[0] * config.intensity, context);
}

export default hapticHandler;
