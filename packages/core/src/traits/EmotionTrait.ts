/**
 * Emotion Trait
 *
 * Emotional state model using the PAD (Pleasure-Arousal-Dominance) model.
 * Emotions decay over time, blend with new stimuli, and can spread via contagion.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type EmotionName =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'
  | 'neutral';

interface PAD {
  pleasure: number; // -1 to 1
  arousal: number; // -1 to 1
  dominance: number; // -1 to 1
}

interface EmotionSnapshot {
  emotion: EmotionName;
  pad: PAD;
  intensity: number;
  timestamp: number;
}

interface EmotionState {
  pad: PAD;
  currentEmotion: EmotionName;
  intensity: number;
  history: EmotionSnapshot[];
  targetPad: PAD;
  blendSpeed: number;
}

interface EmotionConfig {
  model: 'basic' | 'pad';
  default_mood: EmotionName;
  reactivity: number; // 0-1, how quickly emotions change
  decay_rate: number; // How fast emotions decay to neutral
  expression_mapping: Partial<Record<EmotionName, string>>; // Emotion -> animation name
  influence_behavior: boolean;
  social_contagion: boolean;
  contagion_radius: number;
  history_limit: number;
}

// PAD values for basic emotions (Mehrabian's emotion space)
const EMOTION_PAD: Record<EmotionName, PAD> = {
  joy: { pleasure: 0.8, arousal: 0.5, dominance: 0.6 },
  sadness: { pleasure: -0.7, arousal: -0.4, dominance: -0.5 },
  anger: { pleasure: -0.6, arousal: 0.8, dominance: 0.6 },
  fear: { pleasure: -0.8, arousal: 0.6, dominance: -0.7 },
  surprise: { pleasure: 0.2, arousal: 0.8, dominance: 0.0 },
  disgust: { pleasure: -0.7, arousal: 0.2, dominance: 0.3 },
  trust: { pleasure: 0.6, arousal: 0.0, dominance: 0.3 },
  anticipation: { pleasure: 0.3, arousal: 0.5, dominance: 0.2 },
  neutral: { pleasure: 0, arousal: 0, dominance: 0 },
};

function padDistance(a: PAD, b: PAD): number {
  return Math.sqrt(
    Math.pow(a.pleasure - b.pleasure, 2) +
      Math.pow(a.arousal - b.arousal, 2) +
      Math.pow(a.dominance - b.dominance, 2)
  );
}

function classifyEmotion(pad: PAD): EmotionName {
  let closest: EmotionName = 'neutral';
  let minDist = Infinity;

  for (const [emotion, emotionPad] of Object.entries(EMOTION_PAD)) {
    const dist = padDistance(pad, emotionPad);
    if (dist < minDist) {
      minDist = dist;
      closest = emotion as EmotionName;
    }
  }
  return closest;
}

function lerpPad(a: PAD, b: PAD, t: number): PAD {
  return {
    pleasure: a.pleasure + (b.pleasure - a.pleasure) * t,
    arousal: a.arousal + (b.arousal - a.arousal) * t,
    dominance: a.dominance + (b.dominance - a.dominance) * t,
  };
}

function clampPad(pad: PAD): PAD {
  return {
    pleasure: Math.max(-1, Math.min(1, pad.pleasure)),
    arousal: Math.max(-1, Math.min(1, pad.arousal)),
    dominance: Math.max(-1, Math.min(1, pad.dominance)),
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const emotionHandler: TraitHandler<EmotionConfig> = {
  name: 'emotion',

  defaultConfig: {
    model: 'pad',
    default_mood: 'neutral',
    reactivity: 0.5,
    decay_rate: 0.1,
    expression_mapping: {},
    influence_behavior: true,
    social_contagion: false,
    contagion_radius: 5,
    history_limit: 50,
  },

  onAttach(node, config, _context) {
    const defaultPad = EMOTION_PAD[config.default_mood] || EMOTION_PAD.neutral;
    const state: EmotionState = {
      pad: { ...defaultPad },
      currentEmotion: config.default_mood,
      intensity: 0,
      history: [],
      targetPad: { ...defaultPad },
      blendSpeed: 1,
    };
    node.__emotionState = state;
  },

  onDetach(node) {
    delete node.__emotionState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__emotionState as EmotionState;
    if (!state) return;

    const previousEmotion = state.currentEmotion;

    // Blend toward target
    const blendRate = config.reactivity * state.blendSpeed * delta;
    state.pad = lerpPad(state.pad, state.targetPad, blendRate);

    // Decay toward neutral
    const neutralPad = EMOTION_PAD.neutral;
    const decayRate = config.decay_rate * delta;
    state.targetPad = lerpPad(state.targetPad, neutralPad, decayRate);

    // Classify current emotion
    state.currentEmotion = classifyEmotion(state.pad);
    state.intensity = padDistance(state.pad, neutralPad) / Math.sqrt(3); // Normalize to 0-1

    // Emit on emotion change
    if (state.currentEmotion !== previousEmotion) {
      const snapshot: EmotionSnapshot = {
        emotion: state.currentEmotion,
        pad: { ...state.pad },
        intensity: state.intensity,
        timestamp: Date.now(),
      };
      state.history.push(snapshot);
      if (state.history.length > config.history_limit) {
        state.history.shift();
      }

      context.emit?.('emotion_changed', {
        node,
        from: previousEmotion,
        to: state.currentEmotion,
        intensity: state.intensity,
        pad: state.pad,
      });

      // Trigger expression
      const animation = config.expression_mapping[state.currentEmotion];
      if (animation) {
        context.emit?.('play_animation', { node, animation });
      }
    }

    // Social contagion
    if (config.social_contagion && state.intensity > 0.3) {
      context.emit?.('emotion_broadcast', {
        source: node,
        emotion: state.currentEmotion,
        intensity: state.intensity * 0.5,
        radius: config.contagion_radius,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__emotionState as EmotionState;
    if (!state) return;

    if (event.type === 'feel') {
      // Trigger a specific emotion
      const emotion = event.emotion as EmotionName;
      const intensity = event.intensity ?? 0.7;
      const emotionPad = EMOTION_PAD[emotion];

      if (emotionPad) {
        // Blend new emotion into target
        state.targetPad = clampPad({
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          pleasure: state.targetPad.pleasure + emotionPad.pleasure * intensity * config.reactivity,
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          arousal: state.targetPad.arousal + emotionPad.arousal * intensity * config.reactivity,
          dominance:
            // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
            state.targetPad.dominance + emotionPad.dominance * intensity * config.reactivity,
        });
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        state.blendSpeed = intensity * 2;
      }
    } else if (event.type === 'emotion_stimulus') {
      // External stimulus with PAD values
      const pad = event.pad as PAD;
      const intensity = event.intensity ?? 0.5;
      state.targetPad = clampPad({
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        pleasure: state.targetPad.pleasure + pad.pleasure * intensity,
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        arousal: state.targetPad.arousal + pad.arousal * intensity,
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        dominance: state.targetPad.dominance + pad.dominance * intensity,
      });
    } else if (event.type === 'emotion_broadcast' && event.source !== node) {
      // Receive contagion from another entity
      if (!config.social_contagion) return;
      const emotion = event.emotion as EmotionName;
      const emotionPad = EMOTION_PAD[emotion];
      if (emotionPad) {
        const contagionStrength = (event.intensity as number) * 0.3;
        state.targetPad = clampPad({
          pleasure: state.targetPad.pleasure + emotionPad.pleasure * contagionStrength,
          arousal: state.targetPad.arousal + emotionPad.arousal * contagionStrength,
          dominance: state.targetPad.dominance + emotionPad.dominance * contagionStrength,
        });
      }
    }
  },
};

export default emotionHandler;
