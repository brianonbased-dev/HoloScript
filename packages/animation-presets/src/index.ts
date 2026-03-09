/**
 * @holoscript/animation-presets
 *
 * Pre-configured @animated trait parameter sets for common character behaviors.
 * Includes 15 canonical presets (walk, idle, attack, speak, dance, run, jump,
 * wave, sit, sleep, crouch, swim, fly, climb, emote) with timing, loop mode,
 * blend weight, speed multiplier, and Mixamo animation clip name mapping.
 *
 * Pattern P.012: Behavior Presets Over Keyframing
 *
 * @example
 * ```ts
 * import { resolvePreset, PresetRegistry } from '@holoscript/animation-presets';
 *
 * // Quick resolve
 * const walk = resolvePreset('walk');
 * console.log(walk.fullOutput);
 *
 * // Registry lookup
 * const registry = new PresetRegistry();
 * const locomotion = registry.getByCategory('locomotion');
 * const aerial = registry.searchByTag('aerial');
 *
 * // Resolve with overrides
 * const fastWalk = resolvePreset('walk', { speedMultiplier: 1.8 });
 *
 * // Resolve multiple presets into a single character definition
 * const charAnimations = resolveMultiple(['idle', 'walk', 'run', 'jump']);
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  AnimationPreset,
  AnimationTiming,
  EasingFunction,
  LoopMode,
  MixamoClipMapping,
  PresetCategory,
  PresetName,
  PresetOverrides,
  ResolvedAnimatedTrait,
} from './types.js';

// Individual presets
export {
  // Locomotion
  walkPreset,
  runPreset,
  jumpPreset,
  crouchPreset,
  swimPreset,
  flyPreset,
  climbPreset,
  locomotionPresets,
  // Combat
  attackPreset,
  combatPresets,
  // Social
  speakPreset,
  wavePreset,
  socialPresets,
  // Emote
  dancePreset,
  emotePreset,
  emotePresets,
  // Environmental
  idlePreset,
  sitPreset,
  sleepPreset,
  environmentalPresets,
  // All
  allPresets,
} from './presets/index.js';

// Registry
export { PresetRegistry } from './registry.js';
export type { CategoryInfo } from './registry.js';

// Resolver
export {
  resolvePreset,
  resolveMultiple,
  getDefaultRegistry,
} from './resolver.js';
