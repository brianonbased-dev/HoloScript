/**
 * Emote Presets — Expressive performances and emotional displays.
 *
 * Includes: dance, emote
 *
 * Each preset maps to a canonical Mixamo animation clip for
 * character expressiveness in social VR and multiplayer environments.
 */

import type { AnimationPreset } from '../types.js';

// ---------------------------------------------------------------------------
// Dance
// ---------------------------------------------------------------------------

export const dancePreset: AnimationPreset = {
  name: 'dance',
  description:
    'Rhythmic full-body dance. Continuous looping performance suitable for social environments and celebrations.',
  category: 'emote',
  timing: {
    duration: 3.0,
    delay: 0,
    easing: 'linear',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Hip Hop Dancing',
    pack: 'Dance',
    alternatives: [
      'Macarena Dance',
      'Samba Dancing',
      'Swing Dancing',
      'Breakdance',
      'Thriller Dance',
    ],
  },
  tags: ['emote', 'performance', 'social', 'full-body', 'cycle'],
};

// ---------------------------------------------------------------------------
// Emote (Generic)
// ---------------------------------------------------------------------------

export const emotePreset: AnimationPreset = {
  name: 'emote',
  description:
    'General-purpose expressive emote. Celebratory fist pump with full body engagement. Plays once as a reaction gesture.',
  category: 'emote',
  timing: {
    duration: 2.0,
    delay: 0,
    easing: 'ease-out',
  },
  loopMode: 'once',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Victory',
    pack: 'Emotes',
    alternatives: [
      'Clapping',
      'Cheering',
      'Laughing',
      'Shrug',
      'Fist Pump',
    ],
  },
  tags: ['emote', 'expression', 'reaction', 'one-shot', 'celebration'],
};

// ---------------------------------------------------------------------------
// All Emote Presets
// ---------------------------------------------------------------------------

export const emotePresets: AnimationPreset[] = [
  dancePreset,
  emotePreset,
];
