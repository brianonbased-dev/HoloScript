/**
 * Mood Trait (starter for Emotion & Mood category, p3 board task)
 *
 * High-value missing from 2026-03 audit (0% coverage for 20+ emotion moods).
 * Now emotion-mood.ts constants declare the moods; this provides the runtime handler.
 *
 * Supports mood state, intensity decay, and set_mood events.
 * Simple, observable, fits TraitHandler contract.
 *
 * @version 1.0.0-starter
 */

import type { TraitEvent, TraitHandler } from './TraitTypes';

export const SUPPORTED_MOODS = [
  'happy',
  'sad',
  'angry',
  'scared',
  'surprised',
  'disgusted',
  'calm',
  'excited',
  'bored',
  'nostalgic',
  'eerie',
  'serene',
  'chaotic',
  'melancholic',
  'triumphant',
  'ominous',
  'whimsical',
  'cozy',
  'desolate',
  'majestic',
] as const;

export type SupportedMood = (typeof SUPPORTED_MOODS)[number];

function isSupportedMood(value: unknown): value is SupportedMood {
  return typeof value === 'string' && (SUPPORTED_MOODS as readonly string[]).includes(value);
}

function getMoodPayload(event: TraitEvent): { mood: SupportedMood; intensity?: number } | null {
  if (event.type !== 'set_mood' || !isSupportedMood(event.mood)) return null;
  return {
    mood: event.mood,
    intensity: typeof event.intensity === 'number' ? event.intensity : undefined,
  };
}

interface MoodState {
  current: SupportedMood;
  intensity: number; // 0-1
  lastChanged: number;
}

export interface MoodConfig {
  initial?: SupportedMood;
  intensity?: number;
}

export const moodHandler: TraitHandler<MoodConfig> = {
  name: 'mood' as const,

  defaultConfig: {
    initial: 'calm',
    intensity: 0.7,
  },

  onAttach(node, config, context) {
    const state: MoodState = {
      current: config.initial || 'calm',
      intensity: config.intensity ?? 0.7,
      lastChanged: Date.now(),
    };
    node.__moodState = state;

    context.emit?.('mood_attached', {
      node,
      mood: state.current,
      intensity: state.intensity,
    });
  },

  onDetach(node, _config, context) {
    context.emit?.('mood_detached', { node });
    delete node.__moodState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__moodState as MoodState | undefined;
    if (!state) return;

    // Demo: gentle decay toward neutral intensity floor
    if (state.intensity > 0.25) {
      state.intensity = Math.max(0.25, state.intensity - 0.0008);
    }
  },

  onEvent(node, _config, context, event) {
    const payload = getMoodPayload(event);
    if (!payload) return;

    const state = node.__moodState as MoodState | undefined;
    if (state) {
      state.current = payload.mood;
      state.intensity = payload.intensity ?? 0.85;
      state.lastChanged = Date.now();
      context.emit?.('mood_changed', {
        node,
        mood: state.current,
        intensity: state.intensity,
      });
    }
  },
};

export default moodHandler;
