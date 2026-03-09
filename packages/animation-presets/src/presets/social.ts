/**
 * Social Presets — Communication and interpersonal character behaviors.
 *
 * Includes: speak, wave
 *
 * Each preset maps to a canonical Mixamo animation clip suited for
 * NPC dialogue, greetings, and social interaction scenarios.
 */

import type { AnimationPreset } from '../types.js';

// ---------------------------------------------------------------------------
// Speak
// ---------------------------------------------------------------------------

export const speakPreset: AnimationPreset = {
  name: 'speak',
  description:
    'Conversational gesturing while speaking. Subtle upper body movement with natural hand gestures. Loops for continuous dialogue.',
  category: 'social',
  timing: {
    duration: 2.5,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'loop',
  blendWeight: 0.8,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Talking',
    pack: 'Conversation',
    alternatives: [
      'Arguing',
      'Explaining',
      'Storytelling',
      'Talking On Phone',
    ],
  },
  tags: ['social', 'dialogue', 'gesture', 'npc', 'upper-body'],
};

// ---------------------------------------------------------------------------
// Wave
// ---------------------------------------------------------------------------

export const wavePreset: AnimationPreset = {
  name: 'wave',
  description:
    'Friendly hand wave greeting. Single right arm raise with wrist motion. Plays once as a greeting gesture.',
  category: 'social',
  timing: {
    duration: 1.5,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'once',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Waving',
    pack: 'Greeting',
    alternatives: [
      'Happy Hand Wave',
      'Quick Wave',
      'Salute',
      'Nod Yes',
    ],
  },
  tags: ['social', 'greeting', 'gesture', 'one-shot', 'friendly'],
};

// ---------------------------------------------------------------------------
// All Social Presets
// ---------------------------------------------------------------------------

export const socialPresets: AnimationPreset[] = [
  speakPreset,
  wavePreset,
];
