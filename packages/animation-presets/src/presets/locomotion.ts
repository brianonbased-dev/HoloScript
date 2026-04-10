/**
 * Locomotion Presets — Movement-based character behaviors.
 *
 * Includes: walk, run, jump, crouch, swim, fly, climb
 *
 * Each preset maps to a canonical Mixamo animation clip and provides
 * production-ready timing, loop, blend, and speed parameters.
 */

import type { AnimationPreset } from '../types.js';

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

export const walkPreset: AnimationPreset = {
  name: 'walk',
  description: 'Standard bipedal walking cycle. Loops continuously with natural stride cadence.',
  category: 'locomotion',
  timing: {
    duration: 1.0,
    delay: 0,
    easing: 'linear',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Walking',
    pack: 'Locomotion',
    alternatives: ['Slow Walk', 'Walk With Briefcase', 'Sneaking Walk', 'Confident Walk'],
  },
  tags: ['locomotion', 'movement', 'bipedal', 'cycle'],
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export const runPreset: AnimationPreset = {
  name: 'run',
  description: 'Fast bipedal running cycle. Higher speed multiplier, tighter timing than walk.',
  category: 'locomotion',
  timing: {
    duration: 0.7,
    delay: 0,
    easing: 'linear',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 1.4,
  mixamoClip: {
    clipName: 'Running',
    pack: 'Locomotion',
    alternatives: ['Fast Run', 'Sprint', 'Jog', 'Run Forward'],
  },
  tags: ['locomotion', 'movement', 'fast', 'bipedal', 'cycle'],
};

// ---------------------------------------------------------------------------
// Jump
// ---------------------------------------------------------------------------

export const jumpPreset: AnimationPreset = {
  name: 'jump',
  description:
    'Vertical jump with anticipation crouch, airborne phase, and landing recovery. Plays once.',
  category: 'locomotion',
  timing: {
    duration: 1.2,
    delay: 0,
    easing: 'ease-out',
  },
  loopMode: 'once',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Jump',
    pack: 'Locomotion',
    alternatives: ['Standing Jump', 'Running Jump', 'Jump Up', 'Jump Forward'],
  },
  tags: ['locomotion', 'movement', 'aerial', 'one-shot'],
};

// ---------------------------------------------------------------------------
// Crouch
// ---------------------------------------------------------------------------

export const crouchPreset: AnimationPreset = {
  name: 'crouch',
  description:
    'Lowered crouch stance with knees bent. Blends smoothly from standing to crouched position.',
  category: 'locomotion',
  timing: {
    duration: 0.6,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'clamp',
  blendWeight: 1.0,
  speedMultiplier: 1.0,
  mixamoClip: {
    clipName: 'Crouching Idle',
    pack: 'Locomotion',
    alternatives: ['Crouch Walk', 'Crouch To Stand', 'Stand To Crouch', 'Sneaking Idle'],
  },
  tags: ['locomotion', 'stance', 'stealth', 'low'],
};

// ---------------------------------------------------------------------------
// Swim
// ---------------------------------------------------------------------------

export const swimPreset: AnimationPreset = {
  name: 'swim',
  description: 'Forward crawl swimming cycle. Continuous arm-over-arm stroke with body undulation.',
  category: 'locomotion',
  timing: {
    duration: 1.8,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 0.9,
  mixamoClip: {
    clipName: 'Swimming',
    pack: 'Aquatic',
    alternatives: ['Treading Water', 'Breaststroke', 'Backstroke', 'Float Idle'],
  },
  tags: ['locomotion', 'movement', 'aquatic', 'cycle'],
};

// ---------------------------------------------------------------------------
// Fly
// ---------------------------------------------------------------------------

export const flyPreset: AnimationPreset = {
  name: 'fly',
  description:
    'Aerial flight pose with arms spread. Smooth looping glide suitable for superhero or winged characters.',
  category: 'locomotion',
  timing: {
    duration: 2.0,
    delay: 0,
    easing: 'ease-in-out',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 0.8,
  mixamoClip: {
    clipName: 'Flying',
    pack: 'Aerial',
    alternatives: ['Hovering', 'Fly Forward', 'Fly Idle', 'Glide'],
  },
  tags: ['locomotion', 'movement', 'aerial', 'cycle', 'superhero'],
};

// ---------------------------------------------------------------------------
// Climb
// ---------------------------------------------------------------------------

export const climbPreset: AnimationPreset = {
  name: 'climb',
  description: 'Vertical climbing cycle with alternating hand-over-hand grip and leg push.',
  category: 'locomotion',
  timing: {
    duration: 1.5,
    delay: 0,
    easing: 'linear',
  },
  loopMode: 'loop',
  blendWeight: 1.0,
  speedMultiplier: 0.8,
  mixamoClip: {
    clipName: 'Climbing',
    pack: 'Locomotion',
    alternatives: ['Wall Climb', 'Ladder Climb', 'Rock Climbing', 'Hang Idle'],
  },
  tags: ['locomotion', 'movement', 'vertical', 'cycle', 'traversal'],
};

// ---------------------------------------------------------------------------
// All Locomotion Presets
// ---------------------------------------------------------------------------

export const locomotionPresets: AnimationPreset[] = [
  walkPreset,
  runPreset,
  jumpPreset,
  crouchPreset,
  swimPreset,
  flyPreset,
  climbPreset,
];
