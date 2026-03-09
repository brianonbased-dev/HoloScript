/**
 * Presets Barrel Export
 *
 * Re-exports all 15 animation presets organized by category,
 * plus a combined `allPresets` array.
 */

// Category exports
export {
  walkPreset,
  runPreset,
  jumpPreset,
  crouchPreset,
  swimPreset,
  flyPreset,
  climbPreset,
  locomotionPresets,
} from './locomotion.js';

export { attackPreset, combatPresets } from './combat.js';

export { speakPreset, wavePreset, socialPresets } from './social.js';

export { dancePreset, emotePreset, emotePresets } from './emote.js';

export {
  idlePreset,
  sitPreset,
  sleepPreset,
  environmentalPresets,
} from './environmental.js';

// Combined
import { locomotionPresets } from './locomotion.js';
import { combatPresets } from './combat.js';
import { socialPresets } from './social.js';
import { emotePresets } from './emote.js';
import { environmentalPresets } from './environmental.js';

import type { AnimationPreset } from '../types.js';

/**
 * All 15 animation presets in a single flat array.
 */
export const allPresets: AnimationPreset[] = [
  ...locomotionPresets,
  ...combatPresets,
  ...socialPresets,
  ...emotePresets,
  ...environmentalPresets,
];
