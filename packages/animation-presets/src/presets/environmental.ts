/**
 * Environmental Presets — Ambient states and passive character behaviors.
 *
 * Includes: idle, sit, sleep
 *
 * These presets represent resting, waiting, and stationary character states.
 * Each maps to a canonical Mixamo animation clip for seamless integration.
 */

import type { AnimationPreset } from '../types.js';

// ---------------------------------------------------------------------------
// Idle
// ---------------------------------------------------------------------------

export const idlePreset: AnimationPreset = {
  name: 'idle',
  description:
    'Relaxed standing idle with subtle weight shift and breathing. The default resting state for all characters.',
  category: 'environmental',
  timing: {
    duration: 4.0,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Idle',
    pack: 'Basic',
    alternatives: [
      'Happy Idle',
      'Bored Idle',
      'Looking Around',
      'Weight Shift Idle',
      'Breathing Idle',
    ],
  },
  tags: ['environmental', 'resting', 'default', 'ambient', 'cycle'],
};

// ---------------------------------------------------------------------------
// Sit
// ---------------------------------------------------------------------------

export const sitPreset: AnimationPreset = {
  name: 'sit',
  description:
    'Seated position on a surface. Transitions from standing to seated and holds. Clamped loop to maintain final seated pose.',
  category: 'environmental',
  timing: {
    duration: 1.8,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'clamp',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Sitting Down',
    pack: 'Basic',
    alternatives: [
      'Sit Cross Legged',
      'Sitting Idle',
      'Sit On Chair',
      'Sitting Clap',
    ],
  },
  tags: ['environmental', 'resting', 'seated', 'transition'],
};

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

export const sleepPreset: AnimationPreset = {
  name: 'sleep',
  description:
    'Sleeping pose with gentle breathing motion. Very slow cycle, low speed multiplier for a calm ambient state.',
  category: 'environmental',
  timing: {
    duration: 6.0,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 0.5,
  mixamoClip: {
    clipName: 'Sleeping',
    pack: 'Basic',
    alternatives: [
      'Sleeping Idle',
      'Lying Down',
      'Resting',
      'Unconscious',
    ],
  },
  tags: ['environmental', 'resting', 'ambient', 'slow', 'passive'],
};

// ---------------------------------------------------------------------------
// All Environmental Presets
// ---------------------------------------------------------------------------

export const environmentalPresets: AnimationPreset[] = [
  idlePreset,
  sitPreset,
  sleepPreset,
];
