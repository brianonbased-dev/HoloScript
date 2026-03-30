/**
 * Combat Presets — Attack and combat-related character behaviors.
 *
 * Includes: attack
 *
 * Each preset maps to a canonical Mixamo animation clip with
 * production-ready timing for responsive combat feedback.
 */

import type { AnimationPreset } from '../types.js';

// ---------------------------------------------------------------------------
// Attack
// ---------------------------------------------------------------------------

export const attackPreset: AnimationPreset = {
  name: 'attack',
  description:
    'Melee attack swing. Fast wind-up, strike, and recovery. Plays once with no loop for responsive combat feel.',
  category: 'combat',
  timing: {
    duration: 0.8,
    delay: 0,
    easing: 'ease-out',
  },
  loopMode: 'once',
  blendWeight: 1.0,
  speedMultiplier: 1.2,
  mixamoClip: {
    clipName: 'Sword And Shield Attack',
    pack: 'Combat',
    alternatives: ['Punch', 'Kick', 'Slash', 'Great Sword Slash', 'Standing Melee Attack Downward'],
  },
  tags: ['combat', 'melee', 'one-shot', 'action'],
};

// ---------------------------------------------------------------------------
// All Combat Presets
// ---------------------------------------------------------------------------

export const combatPresets: AnimationPreset[] = [attackPreset];
